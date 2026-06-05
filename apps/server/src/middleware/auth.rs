//! JWT-based authentication extractor for Axum.
//!
//! Usage: add `AuthUser` as a handler parameter to require a valid bearer
//! token. The user ID is extracted from the `sub` claim.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::config::Config;

/// JWT claims stored in access tokens.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject — user id (UUID string).
    pub sub: String,
    /// Issued-at (UNIX time, seconds).
    pub iat: i64,
    /// Expiry (UNIX time, seconds).
    pub exp: i64,
    /// Optional token kind; access tokens omit this.
    #[serde(rename = "kind", skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

/// Authenticated user extracted from a valid Bearer token.
///
/// Inject this into any handler that requires authentication:
///
/// ```ignore
/// async fn handler(auth: AuthUser) -> impl IntoResponse { ... }
/// ```
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
}

/// Rejection type when authentication fails.
pub struct AuthError(String);

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let body = json!({ "error": self.0 });
        (StatusCode::UNAUTHORIZED, axum::Json(body)).into_response()
    }
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        // Retrieve the Config from extensions (added as a layer).
        let config = parts
            .extensions
            .get::<Config>()
            .ok_or_else(|| AuthError("server misconfiguration".into()))?;

        // Extract the Authorization header.
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AuthError("missing authorization header".into()))?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AuthError("invalid authorization scheme".into()))?;

        // Decode and validate.
        let mut validation = Validation::new(Algorithm::HS256);
        validation.leeway = 30;

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(config.jwt_secret.as_bytes()),
            &validation,
        )
        .map_err(|_| AuthError("invalid or expired token".into()))?;

        // Reject refresh tokens used as access tokens.
        if data.claims.kind.as_deref() == Some("refresh") {
            return Err(AuthError("expected access token".into()));
        }

        let user_id = Uuid::parse_str(&data.claims.sub)
            .map_err(|_| AuthError("invalid token subject".into()))?;

        Ok(AuthUser { user_id })
    }
}
