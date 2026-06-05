//! Label entities (board-scoped tags for issues).

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A label attached to a board.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub color: String,
}

/// Payload for creating a label.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLabel {
    pub name: String,
    #[serde(default = "default_color")]
    pub color: String,
}

fn default_color() -> String {
    "#3b82f6".to_string()
}

