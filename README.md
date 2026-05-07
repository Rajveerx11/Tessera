# Testing IDE

Desktop-first, local-first AI testing workspace built with Tauri, React, Rust, SQLite, and Ollama.

The happy path for a new developer is:

1. Clone the repo
2. Install workspace dependencies
3. Bootstrap Ollama models
4. Run the Tauri desktop app

If your machine already has Rust, Node, and Ollama installed, you can get to a working app in well under 10 minutes.

## Prerequisites

Install these before you start:

- `Rust 1.81+` via [rustup](https://rustup.rs/)
- `Node.js 20+`
- `pnpm 10+` via `corepack enable`
- `Ollama` via [ollama.com](https://ollama.com/)
- `Docker` if you want the optional shared `postgres + ollama` services

Platform notes:

- Windows: supported out of the box
- macOS: install Xcode Command Line Tools
- Ubuntu/Debian: install Tauri system packages:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  build-essential \
  curl \
  wget \
  file
```

## Quick Start

```bash
git clone https://github.com/Rajveerx11/Testing-IDE.git
cd Testing-IDE
corepack enable
corepack pnpm install
cp .env.example .env
pnpm bootstrap:ollama
pnpm --filter @testing-ide/desktop run dev
```

What that does:

- `corepack pnpm install` installs the monorepo
- `pnpm bootstrap:ollama` checks for `ollama`, starts it if needed, and pulls:
  - `qwen2.5-coder:7b`
  - `nomic-embed-text`
- `pnpm --filter @testing-ide/desktop run dev` starts the Vite frontend and Tauri desktop shell

Optional shared services:

```bash
pnpm services:up
```

That starts the root-level Docker Compose stack in [docker-compose.yml](./docker-compose.yml):

- `postgres` using `pgvector/pgvector:pg16`
- `ollama` using `ollama/ollama:latest`

Stop it with:

```bash
pnpm services:down
```

## Environment Setup

The desktop app reads environment variables from [`apps/desktop/.env.example`](./apps/desktop/.env.example).

Create your local desktop env file:

```bash
cp apps/desktop/.env.example apps/desktop/.env
```

There is also a root [.env.example](./.env.example) for Docker Compose and shared local service values.

Useful variables:

- `OLLAMA_BASE_URL=http://localhost:11434`
- `LOG_LEVEL=info`
- `JWT_SECRET=...` for anything beyond local-only dev
- `SENTRY_DSN=...` enables native Rust/Tauri error reporting
- `VITE_SENTRY_DSN=...` enables React/browser-side error reporting

Notes:

- `SENTRY_DSN` stays on the Rust side and is not bundled into the frontend
- `VITE_SENTRY_DSN` is public by design and safe to expose to the client bundle
- If either Sentry DSN is omitted, that side of the app stays offline and does not report events

## Running the App

Desktop development:

```bash
pnpm --filter @testing-ide/desktop run dev
```

Frontend-only build:

```bash
pnpm --filter @testing-ide/desktop run build
```

## Test Commands

Run the whole monorepo test pipeline:

```bash
pnpm test
```

Common day-to-day commands:

```bash
pnpm lint
pnpm typecheck
pnpm --filter @testing-ide/desktop run test
pnpm --filter @testing-ide/desktop run test:integration
pnpm --filter @testing-ide/desktop run e2e:install
pnpm --filter @testing-ide/desktop run test:e2e
```

What they cover:

- `pnpm lint`: workspace ESLint plus Rust clippy in CI
- `pnpm typecheck`: TypeScript checks across the monorepo
- `pnpm --filter @testing-ide/desktop run test`: frontend Vitest + Rust unit tests
- `pnpm --filter @testing-ide/desktop run test:integration`: live Ollama integration tests
- `pnpm --filter @testing-ide/desktop run test:e2e`: Playwright desktop flow using the test harness

## Release Build

To build a local desktop release bundle:

```bash
bash tools/scripts/deploy.sh
```

On Windows, run that from Git Bash.

The deploy script:

- verifies required tooling
- installs dependencies if `node_modules/` is missing
- runs the Tauri production build
- lets Tauri sign artifacts when signing credentials are present
- copies release bundles into `dist/desktop/`

Signing behavior:

- if signing-related env vars are present, the script leaves signing enabled for Tauri
- if not, it still builds unsigned bundles so local release testing is not blocked

The script lives at [`tools/scripts/deploy.sh`](./tools/scripts/deploy.sh).

## GitHub Releases

Tag pushes trigger the Tauri release workflow in [`.github/workflows/release.yml`](./.github/workflows/release.yml).

That workflow uses `tauri-apps/tauri-action` and publishes a draft GitHub Release with platform bundles attached.

Typical release flow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

After the tag push:

1. GitHub Actions runs the release workflow
2. Tauri builds bundles for Windows, macOS, and Linux
3. A draft GitHub Release is created with the artifacts attached
4. Maintainer reviews the draft notes and publishes it

## Repo Layout

Main directories:

- [`apps/desktop`](./apps/desktop): Tauri desktop app
- [`apps/desktop/src-tauri`](./apps/desktop/src-tauri): Rust backend
- [`packages/shared`](./packages/shared): shared Zod schemas and types
- [`packages/ui`](./packages/ui): shared UI package
- [`tools/scripts`](./tools/scripts): repo automation scripts
- [`plan`](./plan): planning docs
- [`rules`](./rules): engineering rules

## Sentry

Sentry is now initialized in both runtimes:

- React entrypoint: [`apps/desktop/src/lib/sentry.ts`](./apps/desktop/src/lib/sentry.ts)
- Rust/Tauri startup: [`apps/desktop/src-tauri/src/utils/telemetry.rs`](./apps/desktop/src-tauri/src/utils/telemetry.rs)

Both are opt-in and remain disabled until you set the matching DSN.

## Development Rules

Before changing code, read:

- [`plan/initial-plan.md`](./plan/initial-plan.md)
- [`rules/rules.md`](./rules/rules.md)

The repo follows:

- strict TypeScript
- Rust `clippy` as a gate
- Zod validation at trust boundaries
- local-first AI workflows
- Ollama-backed integration coverage

## License

License is still pending. Until then, treat the repository as all-rights-reserved.
