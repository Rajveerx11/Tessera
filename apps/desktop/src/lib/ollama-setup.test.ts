import { describe, expect, it } from 'vitest';

import { deriveOllamaSetupState } from './ollama-setup';

describe('deriveOllamaSetupState', () => {
  it('requires setup when Ollama is not installed', () => {
    const state = deriveOllamaSetupState({
      installed: false,
      running: false,
      models: [],
    });

    expect(state.needsSetup).toBe(true);
    expect(state.missingModels).toEqual(['qwen2.5-coder:7b', 'nomic-embed-text']);
  });

  it('requires setup when a required model is missing', () => {
    const state = deriveOllamaSetupState({
      installed: true,
      running: true,
      models: ['qwen2.5-coder:7b'],
    });

    expect(state.needsSetup).toBe(true);
    expect(state.missingModels).toEqual(['nomic-embed-text']);
  });

  it('does not require setup when Ollama is running with all required models', () => {
    const state = deriveOllamaSetupState({
      installed: true,
      running: true,
      models: ['qwen2.5-coder:7b', 'nomic-embed-text:latest'],
    });

    expect(state.needsSetup).toBe(false);
    expect(state.missingModels).toHaveLength(0);
  });

  it('requires the hardware-recommended model when it is passed as an extra requirement', () => {
    const state = deriveOllamaSetupState(
      {
        installed: true,
        running: true,
        models: ['qwen2.5-coder:7b', 'nomic-embed-text:latest'],
      },
      ['qwen2.5-coder:14b'],
    );

    expect(state.needsSetup).toBe(true);
    expect(state.missingModels).toContain('qwen2.5-coder:14b');
  });
});
