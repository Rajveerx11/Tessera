//! Hardware detection IPC command (Phase 8).
//!
//! Per `rules.md` §4.2.1: returns system RAM, GPU info, and a model recommendation.

use crate::services::hardware_service::{self, HardwareInfo};

/// Detect system hardware and return a model recommendation.
///
/// This command is used during the first-run wizard to help the user
/// pick a model tier that fits their hardware.
#[tauri::command]
#[must_use]
pub fn detect_hardware() -> HardwareInfo {
    hardware_service::detect()
}
