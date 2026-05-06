import { z } from 'zod';

import { LlmProviderIdSchema } from './llm-provider.schema';

/**
 * Arguments accepted by `test_provider_connection` — mirrors
 * `ConnectionTestArgs` in `commands/providers.rs`. The `apiKey` is held
 * in renderer memory only for the duration of the call; it is never
 * persisted by this command (`save_provider_config` does that, with
 * AES-GCM at rest).
 */
export const ProviderConnectionTestArgsSchema = z.object({
  provider: LlmProviderIdSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export type ProviderConnectionTestArgs = z.infer<typeof ProviderConnectionTestArgsSchema>;

/**
 * Result of `test_provider_connection` — mirrors `ConnectionTestResult`
 * in `commands/providers.rs`.
 */
export const ProviderConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().int().nonnegative(),
});

export type ProviderConnectionTestResult = z.infer<typeof ProviderConnectionTestResultSchema>;
