import { z } from 'zod';

import {
  ConnectionTestResultSchema,
  ConnectionTestSchema,
} from './provider.schema';

/**
 * Legacy alias kept for compatibility with older imports.
 *
 * Canonical source of truth lives in `provider.schema.ts` because provider
 * connection testing belongs to the provider-config contract surface.
 */
export const ProviderConnectionTestArgsSchema = ConnectionTestSchema;

export type ProviderConnectionTestArgs = z.infer<typeof ProviderConnectionTestArgsSchema>;

/**
 * Legacy alias kept for compatibility with older imports.
 */
export const ProviderConnectionTestResultSchema = ConnectionTestResultSchema;

export type ProviderConnectionTestResult = z.infer<typeof ProviderConnectionTestResultSchema>;
