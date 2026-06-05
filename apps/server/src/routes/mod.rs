//! API route definitions and router building.

pub mod auth;
pub mod boards;
pub mod comments;
pub mod issues;
pub mod sprints;
pub mod teams;
pub mod ws;

use axum::Router;
use std::sync::Arc;

use crate::AppState;

/// Combine all handlers into a single Axum application router.
pub fn create_router(state: Arc<AppState>) -> Router {
    let api_routes = Router::new()
        .merge(teams::router())
        .merge(boards::router())
        .merge(sprints::router())
        .merge(issues::router())
        .merge(comments::router());

    Router::new()
        .nest("/api/auth", auth::router())
        .nest("/api", api_routes)
        .nest("/ws", ws::router())
        .with_state(state)
}
