//! Authentication routes.

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::sync::Arc;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use crate::error::{ApiError, ApiResult};
use crate::AppState;
use crate::middleware::auth::{AuthUser, Claims};
use crate::models::user::{CreateUser, UserProfile};
use crate::services::auth_service::{self, TokenResponse};

/// Login request payload.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Token refresh request payload.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Register a new user.
async fn register(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateUser>,
) -> ApiResult<(StatusCode, Json<TokenResponse>)> {
    let response = auth_service::register(&state.db, &state.config, payload).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

/// Log in with email and password.
async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> ApiResult<Json<TokenResponse>> {
    let response = auth_service::login(&state.db, &state.config, &payload.email, &payload.password).await?;
    Ok(Json(response))
}

/// Refresh the access and refresh tokens.
async fn refresh(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<RefreshRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    // Decode and validate refresh token
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 30;

    let data = decode::<Claims>(
        &payload.refresh_token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| ApiError::Auth("invalid or expired refresh token".into()))?;

    if data.claims.kind.as_deref() != Some("refresh") {
        return Err(ApiError::Auth("expected refresh token".into()));
    }

    let user_id = uuid::Uuid::parse_str(&data.claims.sub)
        .map_err(|_| ApiError::Auth("invalid token subject".into()))?;

    // Fetch user profile
    let user = auth_service::get_user_profile(&state.db, user_id).await?;

    // Generate new tokens
    let (access_token, refresh_token) = auth_service::generate_tokens(user_id, &state.config)?;

    Ok(Json(serde_json::json!({
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "user": user,
    })))
}

/// Get the current authenticated user profile.
async fn me(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> ApiResult<Json<UserProfile>> {
    let profile = auth_service::get_user_profile(&state.db, auth.user_id).await?;
    Ok(Json(profile))
}

/// Mount auth routes.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/me", get(me))
}
