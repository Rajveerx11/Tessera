/**
 * Zod schema for the OllamaStatus value returned by the
 * `check_ollama_status` Tauri IPC command.
 *
 * Per rules.md §12.3.1: the Rust struct `OllamaStatus` in
 * `src/services/ollama_health_service.rs` is the source of truth.
 * This schema *mirrors* its serde representation — field names and
 * optionality must stay in sync.
 */
import { z } from 'zod';

/** Mirrors `OllamaStatus` in `ollama_health_service.rs`. */
export const OllamaStatusSchema = z.object({
  /** Whether the `ollama` binary was found in PATH. */
  installed: z.boolean(),
  /** Whether Ollama's HTTP API responded with 200 on `/api/version`. */
  running: z.boolean(),
  /** Names of currently installed models (e.g. `"qwen2.5-coder:7b"`). */
  models: z.array(z.string()),
});

export type OllamaStatus = z.infer<typeof OllamaStatusSchema>;

/**
 * The two models required for full Testing IDE functionality.
 * - `qwen2.5-coder:7b` — default code LLM (Apache 2.0, runs on 16 GB RAM).
 * - `nomic-embed-text` — local embedding model (MIT, zero API cost).
 *
 * Per initial-plan.md §"Model Strategy": these are the only models needed
 * for local-first, zero-API-credit development and testing.
 */
export const REQUIRED_MODELS = [
  'qwen2.5-coder:7b',
  'nomic-embed-text',
] as const;

export type RequiredModel = (typeof REQUIRED_MODELS)[number];

/**
 * Returns the subset of required models that are absent from the provided
 * model list.
 *
 * Defaults to checking `REQUIRED_MODELS` (the baseline for all users), but
 * can also check additional models (e.g. the hardware-recommended tier).
 *
 * An empty array means all specified models are present.
 */
export function findMissingModels(
  installedModels: readonly string[],
  additionalRequired: readonly string[] = [],
): string[] {
  const allRequired = [...new Set([...REQUIRED_MODELS, ...additionalRequired])];

  return allRequired.filter(
    (required) => !installedModels.some((m) => m.startsWith(required)),
  );
}
