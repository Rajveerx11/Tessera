# @testing-ide/shared

Shared **Zod-first** API contracts and inferred TypeScript types for the [Tessera](../../README.md) monorepo.

This package is the single source of truth for every IPC, form, and persisted-payload shape consumed by the React renderer. Schemas are authored in Zod; TypeScript types are inferred via `z.infer<typeof X>`. The Rust backend mirrors the same shapes through `serde` derives.

## Usage

Import from the package root:

```ts
import { UserSchema, type User, RegisterSchema } from '@testing-ide/shared';
```

- Schemas live in `src/schemas/`.
- `src/types/` re-exports the same symbols for grouped imports.
- `src/index.ts` exports the public surface from `src/types/*` only — no duplicate exports.

## Layout

```
src/
├── schemas/       # Zod schema definitions
├── types/         # grouped re-exports (one file per domain)
└── index.ts       # public entry — re-exports types/* only
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | `tsc --noEmit` — verify the public types compile cleanly |
| `npm test` | Vitest contract tests (`schema-validity-catalog.test.ts` and friends) |

When using pnpm at the repo root, prefer:

```bash
pnpm --filter @testing-ide/shared typecheck
pnpm --filter @testing-ide/shared test
```
