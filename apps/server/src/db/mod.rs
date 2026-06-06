//! PostgreSQL connection pool initialisation.
//!
//! Migrations are managed externally (Supabase MCP / dashboard) so we
//! only establish the connection pool and verify connectivity here.

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// Create a connection pool and verify connectivity.
///
/// # Errors
///
/// Returns an error if the connection fails.
pub async fn init_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await?;

    tracing::info!("connected to PostgreSQL");

    // Verify the schema is present by checking for the users table.
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'")
        .fetch_one(&pool)
        .await?;

    if row.0 == 0 {
        tracing::error!("required table 'users' not found — run migrations first");
        return Err(sqlx::Error::Configuration(
            "Database schema not initialised. Apply migrations via Supabase dashboard or MCP.".into(),
        ));
    }

    tracing::info!("database schema verified ({} core table(s) found)", row.0);

    Ok(pool)
}
