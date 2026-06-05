//! WebSocket connection and upgrade route.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Router, response::Response};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

use crate::error::ApiError;
use crate::middleware::auth::Claims;
use crate::AppState;

#[derive(serde::Deserialize)]
pub struct WsQuery {
    pub token: String,
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(board_id): Path<Uuid>,
    Query(query): Query<WsQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Response, ApiError> {
    // 1. Authenticate user from token query param
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 30;

    let claims = decode::<Claims>(
        &query.token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| ApiError::Auth("invalid token".to_string()))?;

    let user_id = Uuid::parse_str(&claims.claims.sub)
        .map_err(|_| ApiError::Auth("invalid token subject".to_string()))?;

    // 2. Verify membership in the board's team
    let board_row = sqlx::query("SELECT team_id FROM boards WHERE id = $1")
        .bind(board_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("board not found".to_string()))?;

    use sqlx::Row;
    let board_team_id: Uuid = board_row.get("team_id");

    let _ = crate::services::team_service::check_membership(&state.db, user_id, board_team_id).await?;

    // Upgrade connection
    Ok(ws.on_upgrade(move |socket| handle_socket(socket, board_id, user_id, state)))
}

async fn handle_socket(socket: WebSocket, board_id: Uuid, user_id: Uuid, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Register our channel with the ws_hub room
    state.ws_hub.join(board_id, tx.clone());

    // Task to forward messages from the channel to the WebSocket client
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Task to receive messages from the WebSocket client
    let ws_hub_clone = state.ws_hub.clone();
    let tx_clone = tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(msg_res) = receiver.next().await {
            match msg_res {
                Ok(msg) => {
                    if let Message::Close(_) = msg {
                        break;
                    }
                    // We discard other inbound client messages (they use REST API for operations)
                }
                Err(_) => break,
            }
        }
    });

    // Wait until either task terminates (e.g. client disconnects or network drops)
    tokio::select! {
        _ = &mut send_task => {
            tracing::debug!("sender task closed for user {} on board {}", user_id, board_id);
        }
        _ = &mut recv_task => {
            tracing::debug!("receiver task closed for user {} on board {}", user_id, board_id);
        }
    }

    // Clean up connection from the hub
    ws_hub_clone.leave(board_id, &tx_clone);
}

/// Mount WebSocket route.
pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/boards/{board_id}", get(ws_handler))
}
