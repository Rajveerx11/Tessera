# @testing-ide/tsconfig

Shared TypeScript configuration presets for the [Tessera](../../README.md) monorepo.

## Presets

| Entry | Use for |
|-------|---------|
| `@testing-ide/tsconfig/base` | Pure TypeScript / Node packages — strict mode, ES2022 target, isolated modules |
| `@testing-ide/tsconfig/desktop` | Desktop app (`apps/desktop`) — adds DOM + `vite/client` types and JSX runtime |

## Usage

In a consuming workspace `tsconfig.json`:

```json
{
  "extends": "@testing-ide/tsconfig/desktop",
  "include": ["src", "vite.config.ts"]
}
```

Both presets emit no JS (`"noEmit": true`) — building is delegated to Vite (frontend) and `tauri build` (Rust + bundle). They exist purely to make `tsc --noEmit` and editor IntelliSense agree across the workspace.
