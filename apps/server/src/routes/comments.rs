//! Comment routes.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{delete, get};
use axum::{Json, Router};
use sqlx::Row;
use std::sync::Arc;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::models::comment::{Comment, CreateComment};
use crate::models::user::UserProfile;
use crate::AppState;
use crate::middleware::auth::AuthUser;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DetailedComment {
    id: Uuid,
    issue_id: Uuid,
    author_id: Uuid,
    body: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    author: UserProfile,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommentUpdateInput {
    body: String,
}

async fn list_comments(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(issue_id): Path<Uuid>,
) -> ApiResult<Json<Vec<DetailedComment>>> {
    // Verify user can access the issue's board team
    let board_row = sqlx::query(
        "SELECT b.team_id FROM boards b INNER JOIN issues i ON i.board_id = b.id WHERE i.id = $1"
    )
    .bind(issue_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::NotFound("issue not found".into()))?;

    use sqlx::Row;
    let board_team_id: Uuid = board_row.get("team_id");
    let _ = crate::services::team_service::check_membership(&state.db, auth.user_id, board_team_id).await?;

    #[derive(sqlx::FromRow)]
    struct CommentRow {
        id: Uuid,
        issue_id: Uuid,
        author_id: Uuid,
        body: String,
        created_at: chrono::DateTime<chrono::Utc>,
        updated_at: chrono::DateTime<chrono::Utc>,
        author_user_id: Uuid,
        email: String,
        display_name: String,
        avatar_url: Option<String>,
        author_created: chrono::DateTime<chrono::Utc>,
        author_updated: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, CommentRow>(
        r#"
        SELECT c.id, c.issue_id, c.author_id, c.body, c.created_at, c.updated_at,
               u.id as author_user_id, u.email, u.display_name, u.avatar_url, u.created_at as author_created, u.updated_at as author_updated
        FROM comments c
        INNER JOIN users u ON u.id = c.author_id
        WHERE c.issue_id = $1
        ORDER BY c.created_at ASC
        "#,
    )
    .bind(issue_id)
    .fetch_all(&state.db)
    .await?;

    let comments = rows
        .into_iter()
        .map(|row| DetailedComment {
            id: row.id,
            issue_id: row.issue_id,
            author_id: row.author_id,
            body: row.body,
            created_at: row.created_at,
            updated_at: row.updated_at,
            author: UserProfile {
                id: row.author_user_id,
                email: row.email,
                display_name: row.display_name,
                avatar_url: row.avatar_url,
                created_at: row.author_created,
                updated_at: row.author_updated,
            },
        })
        .collect();

    Ok(Json(comments))
}

async fn create_comment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(issue_id): Path<Uuid>,
    Json(payload): Json<CreateComment>,
) -> ApiResult<(StatusCode, Json<DetailedComment>)> {
    if payload.body.trim().is_empty() {
        return Err(ApiError::Validation("comment body cannot be empty".into()));
    }

    // Verify membership
    let issue_row = sqlx::query("SELECT i.board_id, b.team_id FROM issues i INNER JOIN boards b ON b.id = i.board_id WHERE i.id = $1")
        .bind(issue_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("issue not found".into()))?;

    let issue_board_id: Uuid = issue_row.get("board_id");
    let issue_team_id: Uuid = issue_row.get("team_id");

    let role = crate::services::team_service::check_membership(&state.db, auth.user_id, issue_team_id).await?;
    if role == "viewer" {
        return Err(ApiError::Forbidden("viewers cannot post comments".into()));
    }

    let comment_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let comment = sqlx::query_as::<_, Comment>(
        r#"
        INSERT INTO comments (id, issue_id, author_id, body, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, issue_id, author_id, body, created_at, updated_at
        "#,
    )
    .bind(comment_id)
    .bind(issue_id)
    .bind(auth.user_id)
    .bind(payload.body.trim())
    .bind(now)
    .bind(now)
    .fetch_one(&state.db)
    .await?;

    let author_profile = crate::services::auth_service::get_user_profile(&state.db, auth.user_id).await?;

    let detailed = DetailedComment {
        id: comment.id,
        issue_id: comment.issue_id,
        author_id: comment.author_id,
        body: comment.body,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        author: author_profile,
    };

    // Broadcast WebSocket event comment_added
    let payload_val = serde_json::to_value(&detailed).unwrap_or(serde_json::Value::Null);
    state.ws_hub.broadcast(issue_board_id, "comment_added", auth.user_id, payload_val);

    Ok((StatusCode::CREATED, Json(detailed)))
}

async fn update_comment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(comment_id): Path<Uuid>,
    Json(payload): Json<CommentUpdateInput>,
) -> ApiResult<Json<DetailedComment>> {
    if payload.body.trim().is_empty() {
        return Err(ApiError::Validation("comment body cannot be empty".into()));
    }

    let comment_row = sqlx::query("SELECT author_id, issue_id FROM comments WHERE id = $1")
        .bind(comment_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("comment not found".into()))?;

    let comment_author_id: Uuid = comment_row.get("author_id");
    let comment_issue_id: Uuid = comment_row.get("issue_id");

    // Only author can edit comment
    if comment_author_id != auth.user_id {
        return Err(ApiError::Forbidden("only the author can edit their comment".into()));
    }

    let now = chrono::Utc::now();
    let updated = sqlx::query_as::<_, Comment>(
        r#"
        UPDATE comments
        SET body = $1, updated_at = $2
        WHERE id = $3
        RETURNING id, issue_id, author_id, body, created_at, updated_at
        "#,
    )
    .bind(payload.body.trim())
    .bind(now)
    .bind(comment_id)
    .fetch_one(&state.db)
    .await?;

    let author_profile = crate::services::auth_service::get_user_profile(&state.db, auth.user_id).await?;
    let detailed = DetailedComment {
        id: updated.id,
        issue_id: updated.issue_id,
        author_id: updated.author_id,
        body: updated.body,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        author: author_profile,
    };

    let board_row = sqlx::query("SELECT b.id FROM boards b INNER JOIN issues i ON i.board_id = b.id WHERE i.id = $1")
        .bind(comment_issue_id)
        .fetch_one(&state.db)
        .await?;
    let board_id: Uuid = board_row.get("id");

    // Broadcast WebSocket event comment_updated
    let payload_val = serde_json::to_value(&detailed).unwrap_or(serde_json::Value::Null);
    state.ws_hub.broadcast(board_id, "comment_updated", auth.user_id, payload_val);

    Ok(Json(detailed))
}

async fn delete_comment(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(comment_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let comment_row = sqlx::query("SELECT author_id, issue_id FROM comments WHERE id = $1")
        .bind(comment_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::NotFound("comment not found".into()))?;

    let comment_author_id: Uuid = comment_row.get("author_id");
    let comment_issue_id: Uuid = comment_row.get("issue_id");

    // Author or admin can delete comment
    if comment_author_id != auth.user_id {
        let board_info_row = sqlx::query(
            "SELECT b.team_id, b.id as board_id FROM boards b INNER JOIN issues i ON i.board_id = b.id WHERE i.id = $1"
        )
        .bind(comment_issue_id)
        .fetch_one(&state.db)
        .await?;

        let board_info_team_id: Uuid = board_info_row.get("team_id");

        let role = crate::services::team_service::check_membership(&state.db, auth.user_id, board_info_team_id).await?;
        if role != "admin" {
            return Err(ApiError::Forbidden("only the author or team admins can delete comments".into()));
        }
    }

    sqlx::query("DELETE FROM comments WHERE id = $1")
        .bind(comment_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Mount comment routes.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Issue comments listing and creation
        .route("/issues/{issue_id}/comments", get(list_comments).post(create_comment))
        // Comment CRUD
        .route("/comments/{id}", delete(delete_comment).put(update_comment).patch(update_comment))
}
