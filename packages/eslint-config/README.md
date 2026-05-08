# @testing-ide/eslint-config

Shared ESLint + Prettier configuration for the [Tessera](../../README.md) monorepo.

## Exports

| Entry | Use for |
|-------|---------|
| `@testing-ide/eslint-config/base` | Pure TypeScript / Node packages (e.g. `packages/shared`) |
| `@testing-ide/eslint-config/react` | React + JSX packages (e.g. `apps/desktop`, `packages/ui`) |

## Usage

In a consuming workspace `eslint.config.js`:

```js
import config from '@testing-ide/eslint-config/react';

export default config;
```

The base preset enforces strict TypeScript rules and the import order convention used across the repo. The React preset extends base with `react-hooks`, `jsx-a11y`, and `react-refresh` rules tuned for Vite.
