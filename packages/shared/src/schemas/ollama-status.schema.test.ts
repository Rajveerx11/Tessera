/**
 * Contract tests for OllamaStatusSchema.
 *
 * Per rules.md §6: tests live next to the module they cover. Tests
 * validate the schema contract (shape + edge cases), not internal
 * implementation details.
 */
import { describe, expect, it } from 'vitest';

import {
  findMissingModels,
  OllamaStatusSchema,
  REQUIRED_MODELS,
} from './ollama-status.schema';

describe('OllamaStatusSchema', () => {
  it('should accept a fully-populated valid status', () => {
    const result = OllamaStatusSchema.safeParse({
      installed: true,
      running: true,
      models: ['qwen2.5-coder:7b', 'nomic-embed-text'],
    });
    expect(result.success).toBe(true);
  });

  it('should accept a minimal status with no models and no version', () => {
    const result = OllamaStatusSchema.safeParse({
      installed: false,
      running: false,
      models: [],
    });
    expect(result.success).toBe(true);
  });

  it('should reject status with missing required boolean fields', () => {
    const result = OllamaStatusSchema.safeParse({
      installed: true,
      // running is missing
      models: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-string entries in the models array', () => {
    const result = OllamaStatusSchema.safeParse({
      installed: true,
      running: true,
      models: [42, 'nomic-embed-text'],
    });
    expect(result.success).toBe(false);
  });
});

describe('REQUIRED_MODELS', () => {
  it('should include qwen2.5-coder:7b and nomic-embed-text', () => {
    expect(REQUIRED_MODELS).toContain('qwen2.5-coder:7b');
    expect(REQUIRED_MODELS).toContain('nomic-embed-text');
    expect(REQUIRED_MODELS).toHaveLength(2);
  });
});

describe('findMissingModels', () => {
  it('should return empty array when all required models are present', () => {
    const installed = ['qwen2.5-coder:7b', 'nomic-embed-text', 'llama3.1:8b'];
    expect(findMissingModels(installed)).toHaveLength(0);
  });

  it('should detect a missing chat model', () => {
    const installed = ['nomic-embed-text'];
    const missing = findMissingModels(installed);
    expect(missing).toContain('qwen2.5-coder:7b');
    expect(missing).toHaveLength(1);
  });

  it('should detect a missing embedding model', () => {
    const installed = ['qwen2.5-coder:7b'];
    const missing = findMissingModels(installed);
    expect(missing).toContain('nomic-embed-text');
    expect(missing).toHaveLength(1);
  });

  it('should detect both models missing when no models installed', () => {
    const missing = findMissingModels([]);
    expect(missing).toHaveLength(2);
  });

  it('should match by prefix so tagged variants are accepted', () => {
    // e.g. Ollama may report "qwen2.5-coder:7b-instruct-q4_K_M"
    const installed = ['qwen2.5-coder:7b-instruct-q4_K_M', 'nomic-embed-text:latest'];
    expect(findMissingModels(installed)).toHaveLength(0);
  });
});
