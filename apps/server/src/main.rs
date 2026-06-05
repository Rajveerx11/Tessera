//! Tessera Boards API server entry point.

use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

pub mod config;
pub mod db;
pub mod error;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;

/// Application state shared across all route handlers.
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: config::Config,
    pub ws_hub: services::ws_hub::SharedWsHub,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Load environment variables
    let _ = dotenvy::dotenv();

    // 2. Initialise tracing/logging
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,tower_http=debug")))
        .init();

    // 3. Load configuration
    let config = config::Config::from_env();
    tracing::info!("starting Tessera Boards server on port {}", config.port);

    // 4. Establish database connection pool & run migrations
    let db_pool = db::init_pool(&config.database_url).await?;

    // 5. Create WebSocket broadcast hub
    let ws_hub = Arc::new(services::ws_hub::WsHub::new());

    // 6. Assemble AppState
    let state = Arc::new(AppState {
        db: db_pool,
        config: config.clone(),
        ws_hub,
    });

    // 7. Configure CORS
    let mut allowed_origins = Vec::new();
    for origin in &config.cors_origins {
        if let Ok(value) = origin.parse::<axum::http::HeaderValue>() {
            allowed_origins.push(value);
        }
    }

    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::PATCH,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ])
        .allow_credentials(true);

    // 8. Build Axum router
    let app = routes::create_router(state)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(cors)
        .layer(axum::Extension(config.clone()));

    // 9. Bind TCP listener and serve
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Tessera Boards API server running on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
