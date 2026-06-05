//! WebSocket broadcast hub for real-time collaboration.

use std::sync::Arc;
use dashmap::DashMap;
use tokio::sync::mpsc;
use axum::extract::ws::Message;
use serde::Serialize;
use uuid::Uuid;

/// A WebSocket event pushed to clients.
#[derive(Debug, Clone, Serialize)]
pub struct WsEvent {
    pub r#type: String,
    pub board_id: Uuid,
    pub payload: serde_json::Value,
    pub user_id: Uuid,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// The WebSocket hub managing connected clients per board.
#[derive(Debug, Default)]
pub struct WsHub {
    // board_id -> list of active client senders
    rooms: DashMap<Uuid, Vec<mpsc::UnboundedSender<Message>>>,
}

impl WsHub {
    /// Create a new WebSocket hub.
    pub fn new() -> Self {
        Self {
            rooms: DashMap::new(),
        }
    }

    /// Add a client's sender to a board's room.
    pub fn join(&self, board_id: Uuid, tx: mpsc::UnboundedSender<Message>) {
        self.rooms.entry(board_id).or_default().push(tx);
        tracing::debug!("client joined WebSocket room for board {}", board_id);
    }

    /// Remove disconnected/stale client senders.
    pub fn leave(&self, board_id: Uuid, tx_to_remove: &mpsc::UnboundedSender<Message>) {
        if let Some(mut senders) = self.rooms.get_mut(&board_id) {
            senders.retain(|tx| !tx.same_channel(tx_to_remove));
        }
        // Cleanup empty rooms
        self.rooms.retain(|_, v| !v.is_empty());
        tracing::debug!("client left WebSocket room for board {}", board_id);
    }

    /// Broadcast an event to all clients in a room.
    pub fn broadcast(&self, board_id: Uuid, event_type: &str, user_id: Uuid, payload: serde_json::Value) {
        let event = WsEvent {
            r#type: event_type.to_string(),
            board_id,
            payload,
            user_id,
            timestamp: chrono::Utc::now(),
        };

        let message_str = match serde_json::to_string(&event) {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("failed to serialize WsEvent: {e}");
                return;
            }
        };

        if let Some(senders) = self.rooms.get(&board_id) {
            tracing::debug!("broadcasting {} to {} clients on board {}", event_type, senders.len(), board_id);
            for tx in senders.iter() {
                let _ = tx.send(Message::Text(axum::extract::ws::Utf8Bytes::from(message_str.clone())));
            }
        }
    }
}

pub type SharedWsHub = Arc<WsHub>;
