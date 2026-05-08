import {
  type LoginInput,
  LoginSchema,
  type RegisterInput,
  RegisterSchema,
  type SessionUser,
  SessionUserSchema,
  type TokenPair,
  TokenPairSchema,
} from '@testing-ide/shared';

import { IpcError } from './error';
import { invokeAndParse } from './invoke';

/**
 * Typed wrappers around the Phase 6 auth IPC commands. Mirrors
 * `apps/desktop/src-tauri/src/commands/auth.rs`.
 *
 * Every wrapper validates the input against the shared schema before
 * sending and validates the response with `invokeAndParse` — backend
 * shape drift surfaces as a single `IpcError` instead of an
 * `unknown`-typed value leaking into the renderer.
 */

export async function register(body: RegisterInput): Promise<TokenPair> {
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    throw new IpcError('register', `invalid arguments: ${parsed.error.message}`);
  }
  return invokeAndParse('register', TokenPairSchema, { body: parsed.data });
}

export async function login(body: LoginInput): Promise<TokenPair> {
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    throw new IpcError('login', `invalid arguments: ${parsed.error.message}`);
  }
  return invokeAndParse('login', TokenPairSchema, { body: parsed.data });
}

export async function refreshToken(currentRefreshToken: string): Promise<TokenPair> {
  if (currentRefreshToken.length === 0) {
    throw new IpcError('refresh_token', 'refresh token is empty');
  }
  return invokeAndParse('refresh_token', TokenPairSchema, {
    body: { refreshToken: currentRefreshToken },
  });
}

export async function authMe(accessToken: string): Promise<SessionUser> {
  if (accessToken.length === 0) {
    throw new IpcError('auth_me', 'access token is empty');
  }
  return invokeAndParse('auth_me', SessionUserSchema, {
    authorization: `Bearer ${accessToken}`,
  });
}
