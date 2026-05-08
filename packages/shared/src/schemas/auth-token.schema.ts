import { z } from 'zod';

/**
 * Token pair returned by `register` / `login` / `refresh_token` —
 * mirrors `TokenPair` in
 * `apps/desktop/src-tauri/src/services/auth_service.rs`.
 *
 * `tokenType` is always `"Bearer"` per OAuth2; we keep the schema
 * permissive so a future additional scheme does not crash the
 * renderer.
 */
export const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.string().min(1),
});

export type TokenPair = z.infer<typeof TokenPairSchema>;

/**
 * Session snapshot returned by `auth_me` — mirrors `SessionUser`.
 */
export const SessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
});

export type SessionUser = z.infer<typeof SessionUserSchema>;

/**
 * Body shape for the `refresh_token` IPC command.
 */
export const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenInputSchema>;
