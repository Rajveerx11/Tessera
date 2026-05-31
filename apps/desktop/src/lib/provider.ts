import type { ProviderConfigView } from '@testing-ide/shared';

/**
 * Pick the provider to treat as active from a config list: the one flagged
 * `isActive`, else the first entry, else `null` for an empty list.
 *
 * This is the default selection used after (re)loading provider configs.
 * Callers that intentionally want a different fallback (e.g. no first-entry
 * default) should not use this helper.
 */
export function pickActiveProvider(
  list: readonly ProviderConfigView[],
): ProviderConfigView | null {
  return list.find((config) => config.isActive) ?? list[0] ?? null;
}
