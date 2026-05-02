#![deny(clippy::all)]
#![warn(clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]

//! Testing IDE — Tauri backend library.
//!
//! Layered architecture per `rules.md` §4.2 (adapted for Rust/Tauri):
//! `commands` (Tauri IPC, replaces routes) → `services` → `repositories` → `db`.
//! Cross-cutting: `providers` (LLM/embeddings), `workers`, `prompts`, `utils`.

pub mod commands;
pub mod config;
pub mod db;
pub mod error;
pub mod prompts;
pub mod providers;
pub mod repositories;
pub mod services;
pub mod utils;
pub mod workers;

/// Entry point invoked from `main.rs`. Loads configuration, initializes
/// structured logging, then builds and runs the Tauri application.
///
/// # Panics
///
/// Panics if configuration loading, logging init, or the Tauri runtime
/// fails to start. This is acceptable per `rules.md` §2.2 (panic only on
/// invariant violations — a failed startup is unrecoverable; the panic
/// message is the only useful signal because logging may not yet be live).
pub fn run() {
    let cfg = config::AppConfig::from_env().expect("failed to load configuration");
    utils::telemetry::init(&cfg.log_level).expect("failed to initialize tracing");

    tracing::info!(
        ollama_base_url = %cfg.ollama_base_url,
        db_path = %cfg.db_path.display(),
        "starting Testing IDE backend"
    );

    tauri::Builder::default()
        .manage(cfg)
        .run(tauri::generate_context!())
        .expect("failed to start Tauri application");
}
