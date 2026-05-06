import {
  findMissingModels,
  type OllamaStatus,
} from '@testing-ide/shared';

/**
 * Frontend-friendly view of whether the local Ollama bootstrap flow still
 * needs user attention.
 */
export type OllamaSetupState = {
  installed: boolean;
  running: boolean;
  missingModels: string[];
  needsSetup: boolean;
};

/**
 * Derive whether the first-run wizard should block on Ollama setup.
 *
 * The local-first desktop experience needs all required models available
 * before the default provider path is ready.
 */
export function deriveOllamaSetupState(
  status: OllamaStatus,
  additionalModels: string[] = [],
): OllamaSetupState {
  const missingModels = findMissingModels(status.models, additionalModels);

  return {
    installed: status.installed,
    running: status.running,
    missingModels,
    needsSetup: !status.installed || !status.running || missingModels.length > 0,
  };
}
