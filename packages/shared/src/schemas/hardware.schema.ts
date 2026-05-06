/**
 * Zod schema for hardware detection results.
 *
 * Per rules.md section 12.3.1: the Rust struct `HardwareInfo` in
 * `src/services/hardware_service.rs` is the source of truth.
 * This schema mirrors its serde representation.
 */
import { z } from 'zod';

export const RecommendedHardwareModelSchema = z.union([
  z.literal('qwen2.5-coder:7b'),
  z.literal('qwen2.5-coder:14b'),
  z.literal('qwen2.5-coder:32b'),
]);

/** Mirrors `HardwareInfo` in `hardware_service.rs`. */
export const HardwareInfoSchema = z.object({
  /** Total system RAM in gigabytes. */
  ramGb: z.number().int().nonnegative(),
  /** Dedicated GPU VRAM in gigabytes. `null` if no NVIDIA GPU detected. */
  gpuVramGb: z.number().int().nonnegative().nullable(),
  /** Human-readable GPU name (e.g., "NVIDIA GeForce RTX 4090"). */
  gpuName: z.string().nullable(),
  /**
   * The recommended Ollama model tag based on detected hardware.
   * - `32GB+ RAM` + `24GB+ VRAM` -> `qwen2.5-coder:32b`
   * - `32GB+ RAM` + `12GB+ VRAM` -> `qwen2.5-coder:14b`
   * - otherwise -> `qwen2.5-coder:7b`
   */
  recommendedModel: RecommendedHardwareModelSchema,
});

export type HardwareInfo = z.infer<typeof HardwareInfoSchema>;
