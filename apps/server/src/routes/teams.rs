//! Team routes.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use std::sync::Arc;
use uuid::Uuid;

use crate::error::ApiResult;
use crate::AppState;
use crate::middleware::auth::AuthUser;
use crate::models::team::{CreateTeam, Team};
use crate::services::team_service::{self, TeamMemberInfo};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinRequest {
    invite_code: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RoleUpdateRequest {
    role: String,
}

async fn list_teams(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<Team>>> {
    let teams = team_service::list_teams(&state.db, auth.user_id).await?;
    Ok(Json(teams))
}

async fn create_team(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(payload): Json<CreateTeam>,
) -> ApiResult<(StatusCode, Json<Team>)> {
    let team = team_service::create_team(&state.db, auth.user_id, payload).await?;
    Ok((StatusCode::CREATED, Json(team)))
}

async fn join_team(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(payload): Json<JoinRequest>,
) -> ApiResult<Json<Team>> {
    let team = team_service::join_team(&state.db, auth.user_id, &payload.invite_code).await?;
    Ok(Json(team))
}

async fn get_team(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(team_id): Path<Uuid>,
) -> ApiResult<Json<Team>> {
    let team = team_service::get_team(&state.db, auth.user_id, team_id).await?;
    Ok(Json(team))
}

async fn list_members(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path(team_id): Path<Uuid>,
) -> ApiResult<Json<Vec<TeamMemberInfo>>> {
    let members = team_service::list_members(&state.db, auth.user_id, team_id).await?;
    Ok(Json(members))
}

async fn remove_member(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path((team_id, user_id_to_remove)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    team_service::remove_member(&state.db, auth.user_id, team_id, user_id_to_remove).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn update_member_role(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Path((team_id, user_id_to_update)): Path<(Uuid, Uuid)>,
    Json(payload): Json<RoleUpdateRequest>,
) -> ApiResult<StatusCode> {
    team_service::update_member_role(&state.db, auth.user_id, team_id, user_id_to_update, &payload.role).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Mount team routes.
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/teams", get(list_teams).post(create_team))
        .route("/teams/join", post(join_team))
        .route("/teams/{id}", get(get_team))
        .route("/teams/{id}/members", get(list_members))
        .route("/teams/{id}/members/{member_id}", delete(remove_member).patch(update_member_role))
}
