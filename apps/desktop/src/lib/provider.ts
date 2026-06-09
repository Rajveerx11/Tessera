import type { ProviderConfigView } from '@testing-ide/shared';

/**
 * Pick the provider to treat as active from a config list: the one flagged
 * `isActive`, else `null`.
 *
 * Selection is explicit only — there is **no** first-entry fallback. The active
 * connection is a singleton enforced at save time (see
 * `provider_config_repo::upsert`); when nothing is flagged active, generation is
 * blocked and the user is prompted to pick a connection rather than silently
 * defaulting to the first row.
 */
export function pickActiveProvider(
  list: readonly ProviderConfigView[],
): ProviderConfigView | null {
  return list.find((config) => config.isActive) ?? null;
}
