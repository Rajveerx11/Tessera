//! Comment entity (on issues).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A comment on an issue.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Payload for creating a comment.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateComment {
    pub body: String,
}

