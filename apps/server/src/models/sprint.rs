//! Sprint entity (time-boxed iteration for scrum boards).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A sprint on a scrum board.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Sprint {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub goal: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

/// Payload for creating a sprint.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSprint {
    pub name: String,
    pub goal: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
}

/// Payload for updating a sprint.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSprint {
    pub name: Option<String>,
    pub goal: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
}

