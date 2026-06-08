//! Tracker integration errors.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum TrackerError {
    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Rate limited: {0}")]
    RateLimited(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Transport error: {0}")]
    Transport(String),
}

impl TrackerError {
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::AuthFailed(_) => "TRACKER_AUTH_FAILED",
            Self::RateLimited(_) => "TRACKER_RATE_LIMITED",
            Self::NotFound(_) => "TRACKER_NOT_FOUND",
            Self::InvalidRequest(_) => "TRACKER_INVALID_REQUEST",
            Self::Transport(_) => "TRACKER_TRANSPORT",
        }
    }

    #[must_use]
    pub fn from_http_status(status: reqwest::StatusCode, message: &str) -> Self {
        match status.as_u16() {
            401 | 403 => Self::AuthFailed(message.to_string()),
            404 => Self::NotFound(message.to_string()),
            429 => Self::RateLimited(message.to_string()),
            400 => Self::InvalidRequest(message.to_string()),
            _ => Self::Transport(format!("HTTP {status}: {message}")),
        }
    }
}
