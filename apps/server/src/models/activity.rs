//! Activity log entity (audit trail on issues).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// An activity log entry recording a change on an issue.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLog {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub user_id: Uuid,
    pub action: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Payload for creating an activity log entry.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivity {
    pub issue_id: Uuid,
    pub user_id: Uuid,
    pub action: String,
    pub field: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
}

