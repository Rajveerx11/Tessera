//! Hardware detection service (Phase 8).
//!
//! Per `rules.md` section 4.2: this service contains the business logic for
//! detecting system RAM and GPU VRAM to recommend a local model tier.
//! It uses `sysinfo` for RAM and `nvidia-smi` for GPU detection.

use std::process::Command;

use serde::Serialize;
use sysinfo::System;

/// Hardware detection results and model recommendation.
///
/// Mirrors the `HardwareInfoSchema` Zod schema in
/// `packages/shared/src/schemas/hardware.schema.ts` (rules.md section 12.3.1).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    /// Total system RAM in gigabytes.
    pub ram_gb: u64,
    /// Dedicated GPU VRAM in gigabytes. `None` if no NVIDIA GPU detected.
    pub gpu_vram_gb: Option<u64>,
    /// Human-readable GPU name (e.g. "NVIDIA `GeForce` RTX 4090").
    pub gpu_name: Option<String>,
    /// The recommended Ollama model tag based on hardware constraints.
    pub recommended_model: String,
}

/// Detect system hardware and return a model recommendation.
///
/// This function is infallible; if hardware detection fails (for example
/// `nvidia-smi` is unavailable), it returns a safe baseline recommendation
/// based on whatever information was gathered.
#[must_use]
pub fn detect() -> HardwareInfo {
    let mut sys = System::new();
    sys.refresh_memory();

    // `sysinfo` reports bytes on the pinned crate version.
    let ram_gb = sys.total_memory() / (1024 * 1024 * 1024);
    let (gpu_name, gpu_vram_gb) = detect_nvidia_gpu().unwrap_or((None, None));
    let recommended_model = recommend_model(ram_gb, gpu_vram_gb);

    HardwareInfo {
        ram_gb,
        gpu_vram_gb,
        gpu_name,
        recommended_model,
    }
}

/// Attempt to detect an NVIDIA GPU using the `nvidia-smi` CLI tool.
///
/// Returns the GPU with the highest reported VRAM so multi-GPU workstations
/// are not under-classified by whichever adapter happens to appear first.
fn detect_nvidia_gpu() -> Option<(Option<String>, Option<u64>)> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    parse_nvidia_smi_output(&String::from_utf8_lossy(&output.stdout))
}

fn parse_nvidia_smi_output(stdout: &str) -> Option<(Option<String>, Option<u64>)> {
    let mut best_gpu: Option<(String, u64)> = None;

    for line in stdout.lines() {
        let Some((name, vram_mb)) = parse_nvidia_smi_line(line) else {
            continue;
        };

        match best_gpu {
            Some((_, best_vram_mb)) if best_vram_mb >= vram_mb => {}
            _ => {
                best_gpu = Some((name, vram_mb));
            }
        }
    }

    best_gpu.map(|(name, vram_mb)| (Some(name), Some(vram_mb / 1024)))
}

fn parse_nvidia_smi_line(line: &str) -> Option<(String, u64)> {
    let mut parts = line.splitn(2, ',');
    let name = parts.next()?.trim();
    let vram_mb = parts.next()?.trim().parse::<u64>().ok()?;

    if name.is_empty() {
        return None;
    }

    Some((name.to_string(), vram_mb))
}

/// Map hardware specs to the model tiers in `plan/initial-plan.md`.
///
/// Conservative local-first logic:
/// - `32GB+ RAM` and `24GB+ VRAM` -> `qwen2.5-coder:32b`
/// - `32GB+ RAM` and `12GB+ VRAM` -> `qwen2.5-coder:14b`
/// - everything else -> `qwen2.5-coder:7b`
fn recommend_model(ram_gb: u64, vram_gb: Option<u64>) -> String {
    let detected_vram_gb = vram_gb.unwrap_or(0);

    if ram_gb >= 32 && detected_vram_gb >= 24 {
        "qwen2.5-coder:32b".to_string()
    } else if ram_gb >= 32 && detected_vram_gb >= 12 {
        "qwen2.5-coder:14b".to_string()
    } else {
        "qwen2.5-coder:7b".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recommend_model_tier_logic() {
        // Low RAM
        assert_eq!(recommend_model(8, None), "qwen2.5-coder:7b");
        assert_eq!(recommend_model(12, Some(8)), "qwen2.5-coder:7b");

        // Mid RAM stays on 7b without workstation-class GPU.
        assert_eq!(recommend_model(16, None), "qwen2.5-coder:7b");
        assert_eq!(recommend_model(16, Some(8)), "qwen2.5-coder:7b");
        assert_eq!(recommend_model(31, Some(16)), "qwen2.5-coder:7b");

        // High RAM, mid VRAM
        assert_eq!(recommend_model(32, Some(12)), "qwen2.5-coder:14b");
        assert_eq!(recommend_model(64, Some(16)), "qwen2.5-coder:14b");
        assert_eq!(recommend_model(32, Some(8)), "qwen2.5-coder:7b");
        assert_eq!(recommend_model(64, None), "qwen2.5-coder:7b");

        // High RAM, high VRAM
        assert_eq!(recommend_model(32, Some(24)), "qwen2.5-coder:32b");
        assert_eq!(recommend_model(128, Some(48)), "qwen2.5-coder:32b");
    }

    #[test]
    fn parse_nvidia_smi_output_uses_highest_vram_gpu() {
        let output = "\
NVIDIA GeForce RTX 3060, 12288\n\
NVIDIA GeForce RTX 4090, 24576\n";

        let parsed = parse_nvidia_smi_output(output).expect("gpu must parse");
        assert_eq!(parsed.0.as_deref(), Some("NVIDIA GeForce RTX 4090"));
        assert_eq!(parsed.1, Some(24));
    }

    #[test]
    fn parse_nvidia_smi_output_skips_invalid_lines() {
        let output = "\
bad line\n\
NVIDIA GeForce RTX 4060, 8192\n";

        let parsed = parse_nvidia_smi_output(output).expect("gpu must parse");
        assert_eq!(parsed.0.as_deref(), Some("NVIDIA GeForce RTX 4060"));
        assert_eq!(parsed.1, Some(8));
    }
}
