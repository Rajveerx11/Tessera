# Tech Stack — Testing IDE

## Desktop App (the product)
- Shell: Tauri 2.0 (Rust backend)
- Frontend: React 19 + TypeScript
- Build: Vite 6
- Styling: Tailwind v4 + shadcn/ui (Radix)
- Editor: Monaco
- State: Zustand + TanStack Query v5
- Forms: React Hook Form + Zod
- Routing: TanStack Router

## Rust Side (Tauri backend)
- Runtime: Tokio
- HTTP: reqwest
- DB: SQLite + sqlx + sqlite-vec
- AST: tree-sitter (Rust bindings)
- Logging: tracing
- Errors: thiserror + anyhow

## Marketing + Docs Site (SEO)
- Framework: Next.js 15 (App Router + RSC)
- Hosting: Vercel (edge SSR)
- Content: MDX + Contentlayer
- Search: Algolia DocSearch
- Styling: Tailwind v4 + shadcn (shared with app)
- SEO: Next Metadata API + JSON-LD + next-sitemap
- Analytics: Vercel Analytics + PostHog

## Shared / Infra
- Monorepo: pnpm + Turborepo
- Lint: ESLint + clippy
- Format: Prettier + rustfmt
- Test: Vitest (TS) + cargo test (Rust) + Playwright (E2E)
- CI: GitHub Actions (Win/Mac/Linux matrix)
- Releases: tauri-action → GitHub Releases
- Errors: Sentry
- Pre-commit: Husky + lint-staged

## AI / LLM
- Providers: OpenAI / Anthropic / OpenRouter / Ollama (Cloud + Local)
- Default: Ollama Local (qwen2.5-coder:7b)
- Embeddings: nomic-embed-text (Ollama, free)
- Vector store: sqlite-vec (embedded)

## Why This Stack
- Industry-standard (React/Next/TS/Tailwind = top hireable skills)
- Tauri = 3MB binary, native fs access, secure
- Next.js = best SEO + RSC + Vercel edge
- All TypeScript end-to-end (shared types via packages/shared)
- Local-first: zero API cost for dev, privacy-first for users

## Monorepo Layout

```
testing-ide/
  apps/
    desktop/          -- Tauri app (Rust + React)
      src-tauri/      -- Rust backend
      src/            -- React frontend
    web/              -- Next.js marketing + docs (SEO)
    docs/             -- MDX content
  packages/
    shared/           -- TS types + Zod schemas
    ui/               -- Shared shadcn components
    eslint-config/
    tsconfig/
  pnpm-workspace.yaml
  turbo.json
```
