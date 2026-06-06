import { type OllamaStatus, OllamaStatusSchema } from '@testing-ide/shared';

import { invokeAndParse, invokeString } from './invoke';

/** Phase 7 status command for the local Ollama runtime. */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  return invokeAndParse('check_ollama_status', OllamaStatusSchema);
}

/** Starts the local Ollama server process and returns the resolved base URL. */
export async function startOllamaServer(): Promise<string> {
  return invokeString('start_ollama_server');
}

