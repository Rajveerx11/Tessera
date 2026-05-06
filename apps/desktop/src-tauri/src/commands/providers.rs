//! Provider configuration IPC commands.
//!
//! Per `rules.md` §4.2.1 + §9: manages encrypted API key storage.
//! API keys are encrypted before persistence and never returned in
//! plaintext over IPC.

use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

<<<<<<< HEAD
use crate::config::AppConfig;
=======
use crate::providers::factory::{self, ProviderConfig, ProviderKind};
>>>>>>> 2c616a1c9c3a27b5a267ef3d09cbc02b439d3cff
use crate::services::provider_config_service::{self, ProviderConfigView};
use crate::services::provider_connection_service::{self, ProviderConnectionTestResult};
use crate::utils::crypto::CryptoKey;

/// IPC payload for `save_provider_config`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderArgs {
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

/// IPC payload for `test_provider_connection`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestProviderConnectionArgs {
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub default_model: Option<String>,
}

fn default_true() -> bool {
    true
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn save_provider_config(
    pool: State<'_, SqlitePool>,
    crypto: State<'_, CryptoKey>,
    args: SaveProviderArgs,
) -> Result<String, String> {
    provider_config_service::save_config(
        &pool,
        &crypto,
        args.provider,
        args.api_key,
        args.base_url,
        args.default_model,
        args.is_active,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_provider_configs(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ProviderConfigView>, String> {
    provider_config_service::list_configs(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn delete_provider_config(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    provider_config_service::delete_config(&pool, &id)
        .await
        .map_err(|e| e.to_string())
}

<<<<<<< HEAD
/// Probe a provider endpoint and return latency plus any accessible models.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri IPC requires owned argument types.
pub async fn test_provider_connection(
    pool: State<'_, SqlitePool>,
    crypto: State<'_, CryptoKey>,
    cfg: State<'_, AppConfig>,
    args: TestProviderConnectionArgs,
) -> Result<ProviderConnectionTestResult, String> {
    provider_connection_service::test_connection(
        &pool,
        &crypto,
        &cfg,
        provider_connection_service::ProviderConnectionTestArgs {
            provider: args.provider,
            api_key: args.api_key,
            base_url: args.base_url,
            default_model: args.default_model,
        },
    )
    .await
    .map_err(|error| error.to_string())
=======
/// Connection-test arguments. Mirrors `SaveProviderArgs` minus `is_active`
/// because tests do not touch the DB.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestArgs {
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

/// Result of a connection test. `ok = true` only when the configuration
/// constructed cleanly (and, for Ollama, the daemon responded). The
/// message is a human-readable hint — never the underlying API key.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub latency_ms: u32,
}

/// Probe a provider configuration without persisting it.
///
/// Security: the input `args.api_key` is **only** held for the lifetime
/// of this call and never logged. Provider build errors propagate as
/// short strings (`provider misconfigured`) rather than raw `LlmError`
/// debug formatting so misconfigured base URLs don't surface tokens
/// they happen to contain.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn test_provider_connection(
    args: ConnectionTestArgs,
) -> Result<ConnectionTestResult, String> {
    let kind = parse_provider_kind(&args.provider).map_err(|e| e.to_string())?;
    let cfg = ProviderConfig {
        kind,
        base_url: args.base_url.clone(),
        api_key: args.api_key,
    };

    let started = Instant::now();

    // Construct provider — validates URL parsing, header building, and
    // (for cloud providers) presence of an API key.
    factory::build_llm_provider(&cfg)
        .map_err(|_| "provider misconfigured (could not build client)".to_string())?;

    // Live probe only for Ollama (local, free, fast). Cloud providers
    // are stamped "saved" without a live call so we never burn a paid
    // quota or echo any auth header into a 4xx response body.
    if kind == ProviderKind::Ollama {
        match probe_ollama(args.base_url.as_deref()).await {
            Ok(latency_ms) => Ok(ConnectionTestResult {
                ok: true,
                message: "Ollama reachable".to_string(),
                latency_ms,
            }),
            Err(message) => Ok(ConnectionTestResult {
                ok: false,
                message,
                latency_ms: u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX),
            }),
        }
    } else {
        Ok(ConnectionTestResult {
            ok: true,
            message: "credentials accepted (live test deferred for cloud providers)".to_string(),
            latency_ms: u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX),
        })
    }
}

async fn probe_ollama(base_url: Option<&str>) -> Result<u32, String> {
    let base = base_url.unwrap_or("http://localhost:11434");
    let url = format!("{}/api/tags", base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "could not build HTTP client".to_string())?;

    let started = Instant::now();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|_| "Ollama unreachable (is `ollama serve` running?)".to_string())?;

    if !resp.status().is_success() {
        return Err(format!(
            "Ollama responded with HTTP {} (expected 200)",
            resp.status().as_u16()
        ));
    }
    Ok(u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX))
}

fn parse_provider_kind(s: &str) -> Result<ProviderKind, crate::error::AppError> {
    let json = format!("\"{s}\"");
    serde_json::from_str::<ProviderKind>(&json)
        .map_err(|_| crate::error::AppError::InvalidInput(format!("unknown provider kind `{s}`")))
>>>>>>> 2c616a1c9c3a27b5a267ef3d09cbc02b439d3cff
}
