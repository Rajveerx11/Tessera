//! Unified API error type with automatic HTTP response mapping.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

/// All errors that can be returned by the API.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// Database query or connection failure.
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    /// Authentication failure (invalid credentials, expired token, etc.).
    #[error("{0}")]
    Auth(String),

    /// Resource not found.
    #[error("{0}")]
    NotFound(String),

    /// Request validation failure.
    #[error("{0}")]
    Validation(String),

    /// Insufficient permissions.
    #[error("{0}")]
    Forbidden(String),

    /// Catch-all internal error.
    #[error("internal error: {0}")]
    Internal(String),
}

impl ApiError {
    /// HTTP status code for this error variant.
    fn status_code(&self) -> StatusCode {
        match self {
            Self::Database(_) | Self::Internal(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
            Self::Auth(_) => StatusCode::UNAUTHORIZED,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();

        // Avoid leaking internal / DB details to clients.
        let message = match &self {
            Self::Database(e) => {
                tracing::error!("database error: {e}");
                "an internal error occurred".to_string()
            }
            Self::Internal(msg) => {
                tracing::error!("internal error: {msg}");
                "an internal error occurred".to_string()
            }
            other => other.to_string(),
        };

        let body = json!({ "error": message });
        (status, axum::Json(body)).into_response()
    }
}

/// Convenience alias used throughout the crate.
pub type ApiResult<T> = Result<T, ApiError>;
