//! Server configuration loaded from environment variables.

/// Application configuration.
#[derive(Debug, Clone)]
pub struct Config {
    /// PostgreSQL connection string.
    pub database_url: String,
    /// Secret key for signing JWTs (minimum 32 bytes).
    pub jwt_secret: String,
    /// Port to bind the HTTP server on.
    pub port: u16,
    /// Allowed CORS origins.
    pub cors_origins: Vec<String>,
}

impl Config {
    /// Load configuration from environment variables.
    ///
    /// # Panics
    ///
    /// Panics when `DATABASE_URL` or `JWT_SECRET` is missing, or when
    /// `JWT_SECRET` is shorter than 32 bytes.
    pub fn from_env() -> Self {
        let database_url =
            std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let jwt_secret =
            std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");

        assert!(
            jwt_secret.len() >= 32,
            "JWT_SECRET must be at least 32 bytes"
        );

        let port = std::env::var("SERVER_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(3001);

        let cors_origins = std::env::var("CORS_ORIGINS")
            .ok()
            .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
            .unwrap_or_else(|| vec!["http://localhost:1420".to_string()]);

        Self {
            database_url,
            jwt_secret,
            port,
            cors_origins,
        }
    }
}
