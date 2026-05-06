//! Ollama status IPC command.
//!
//! Per `rules.md` section 4.2.1: commands parse input, delegate to a service,
//! and format the IPC boundary. No business logic lives here.

use tauri::State;

use crate::config::AppConfig;
use crate::services::ollama_health_service::{self, OllamaStatus};

/// Return whether Ollama is installed, whether its daemon is running, and the
/// set of locally available models.
#[tauri::command]
pub async fn check_ollama_status(cfg: State<'_, AppConfig>) -> Result<OllamaStatus, String> {
    ollama_health_service::check_status(&cfg.ollama_base_url)
        .await
        .map_err(|error| error.to_string())
}
