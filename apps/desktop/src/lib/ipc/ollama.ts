import { type OllamaStatus, OllamaStatusSchema } from '@testing-ide/shared';

import { invokeAndParse } from './invoke';

/** Phase 7 status command for the local Ollama runtime. */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  return invokeAndParse('check_ollama_status', OllamaStatusSchema);
}
