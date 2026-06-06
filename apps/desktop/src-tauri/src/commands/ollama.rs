//! Ollama status and control IPC commands.
//!
//! Per `rules.md` section 4.2.1: commands parse input, delegate to a service,
//! and format the IPC boundary. No business logic lives here.

use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

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

/// Spawns the Ollama server process detached and returns the resolved base URL
/// where the server is expected to run based on the `OLLAMA_HOST` env variable.
#[tauri::command]
pub async fn start_ollama_server() -> Result<String, String> {
    let host_env = std::env::var("OLLAMA_HOST").unwrap_or_default();
    let resolved_url = parse_ollama_host(&host_env);

    let mut cmd = Command::new("ollama");
    cmd.arg("serve");

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW (0x0800_0000) - run in background without console window
        // DETACHED_PROCESS (0x0000_0008) - run independently of parent process
        // CREATE_NEW_PROCESS_GROUP (0x0000_0200) - process group leader for signal isolation
        cmd.creation_flags(0x0800_0000 | 0x0000_0008 | 0x0000_0200);
    }

    match cmd.spawn() {
        Ok(_) => Ok(resolved_url),
        Err(error) => Err(format!(
            "Failed to start Ollama server (verify it is installed and in PATH): {error}"
        )),
    }
}

/// Helper function to parse `OLLAMA_HOST` environment variable.
/// Ollama host formats:
/// - empty / not set: <http://127.0.0.1:11434>
/// - "12345": <http://127.0.0.1:12345>
/// - "host:port": <http://host:port>
/// - ":port": <http://127.0.0.1:port>
/// - "http://host:port": <http://host:port>
fn parse_ollama_host(host: &str) -> String {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return "http://127.0.0.1:11434".to_string();
    }

    if trimmed.chars().all(|c| c.is_ascii_digit()) {
        return format!("http://127.0.0.1:{trimmed}");
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }

    if trimmed.contains(':') {
        if trimmed.starts_with(':') {
            return format!("http://127.0.0.1{trimmed}");
        }
        return format!("http://{trimmed}");
    }

    format!("http://{trimmed}:11434")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ollama_host() {
        assert_eq!(parse_ollama_host(""), "http://127.0.0.1:11434");
        assert_eq!(parse_ollama_host("   "), "http://127.0.0.1:11434");
        assert_eq!(parse_ollama_host("11435"), "http://127.0.0.1:11435");
        assert_eq!(parse_ollama_host("http://localhost:11434"), "http://localhost:11434");
        assert_eq!(parse_ollama_host("https://remote-ollama:11434"), "https://remote-ollama:11434");
        assert_eq!(parse_ollama_host(":11435"), "http://127.0.0.1:11435");
        assert_eq!(parse_ollama_host("localhost:11435"), "http://localhost:11435");
        assert_eq!(parse_ollama_host("my-custom-host"), "http://my-custom-host:11434");
    }
}

