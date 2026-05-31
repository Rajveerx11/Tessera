# Tessera — Project Audit & Feature Roadmap

> Audited: 2026-05-31 | Version: v0.1 | Codebase: ~28K LOC

---

## Project Rating

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | ⭐⭐⭐⭐⭐ | Clean layering (commands→services→repos), trait-based providers, factory pattern |
| **Features** | ⭐⭐⭐⭐ | 5 artifact types, 5 LLM providers, RAG pipeline, streaming — but single-user, no collab |
| **Stability** | ⭐⭐⭐⭐ | 339 tests, typed errors, Clippy pedantic — but E2E minimal (1 spec), no coverage tracking |
| **Security** | ⭐⭐⭐⭐⭐ | AES-256-GCM key storage, Argon2 passwords, JWT auth, Zod+JSON-Schema validation everywhere |
| **DX / Onboarding** | ⭐⭐⭐⭐ | First-run wizard, `pnpm bootstrap:ollama`, good CLAUDE.md — missing API docs & schema diagrams |
| **CI/CD** | ⭐⭐⭐⭐⭐ | 5-gate CI, pre-push hooks, cross-platform release, concurrency control, branch protection |
| **Frontend Polish** | ⭐⭐⭐½ | Functional UI with shadcn + Monaco — but limited views, no rich visualizations |

### Overall: 4.2 / 5

Production-quality foundation, needs feature breadth for market impact.

---

## Codebase Statistics

| Component | Files | Lines | Purpose |
|-----------|-------|-------|---------|
| Rust backend | 68 | 15,655 | Commands, services, providers, repos |
| React frontend | 69 | 8,096 | Components, stores, IPC client |
| Shared (Zod) | 30+ | 2,377 | Schemas + inferred TS types |
| Tests | 14 | 1,979 | Unit + integration + E2E |
| Migrations | 3 | 281 | Schema evolution |
| CI/CD | 3 | ~350 | GitHub Actions workflows |

### Test Coverage

| Category | Count |
|----------|-------|
| Rust unit tests | 218 |
| TypeScript unit tests | 43 |
| Zod schema tests | 78 |
| Integration tests | 2 (live Ollama) |
| E2E tests | 1 (Playwright) |
| Snapshot tests | 6 (Insta) |
| **Total** | **339+** |

---

## Feature Inventory

### Artifact Types (5)

- **Context** — architectural summary (project memory for downstream artifacts)
- **Test Plan** — scope, objectives, strategy, risk matrix, entry/exit criteria
- **Test Cases** — individual cases with steps, expected results, priority, traceability
- **Defect Report** — static analysis findings: severity, category, location, fix suggestions
- **Bug Report** — runtime issue tracking formatted for JIRA/Linear/GitHub

### LLM Providers (5)

| Provider | Stream | Custom Base URL | Auth |
|----------|--------|-----------------|------|
| Ollama (default) | Yes | Yes | None |
| OpenAI | Yes | Yes (Azure compatible) | API key |
| Anthropic | Yes | No | API key |
| OpenRouter | Yes | No | API key |
| OpenAI-Compatible | Yes | Yes | API key |

### Embedding Providers

- Ollama embeddings (nomic-embed-text, 768-dim, Apache 2.0)

---

## Weak Points & Long-term Solutions

| # | Weakness | Impact | Long-term Solution |
|---|----------|--------|-------------------|
| 1 | **Single-user only** — no team collaboration, sharing, or multi-user workspace | Limits enterprise adoption | Add workspace sync via CRDTs (Yjs/Automerge) + optional cloud relay. Keep local-first core |
| 2 | **No test execution** — generates test artifacts but can't RUN them | Users must copy-paste tests elsewhere | Sandboxed test runner (Docker/Wasm) that executes generated test cases and reports pass/fail |
| 3 | **Embedding provider lock-in** — only Ollama embeddings, no cloud fallback | RAG quality bottleneck for users without local GPU | Add OpenAI/Voyage AI/Cohere embedding providers behind existing `EmbeddingProvider` trait |
| 4 | **Minimal E2E tests** — 1 Playwright spec, no error-path coverage | Regressions in UI flows go undetected | Expand to 10-15 E2E specs covering: generation flow, provider switching, error states, export |
| 5 | **No export integrations** — artifacts live in local SQLite only | Can't push to JIRA, Linear, GitHub Issues | Build export adapters per platform + clipboard-friendly markdown export |
| 6 | **No observability** — no coverage reports, no perf metrics, no usage analytics | Hard to track quality over time | LCOV in CI, optional telemetry (PostHog/Plausible), bundle-size tracking |
| 7 | **Static prompts** — v1 prompts hardcoded, no user customization | Power users can't tune generation behavior | User-editable prompt templates with variable substitution + prompt version A/B testing |

---

## 5 Proposed Standout Features

### 1. Live Test Runner with Coverage Overlay

Generate test cases → execute them in sandboxed environment → show pass/fail + line coverage ON the Monaco editor. No other AI testing tool closes the generate→run→measure loop. Use Docker containers or Wasm sandboxes per language.

**Why it stands out:** Closes the full loop from generation to execution to measurement in one tool.

### 2. Mutation Testing Integration

After generating tests, automatically mutate source code (flip operators, remove conditions) and check if tests catch mutations. Reports a **mutation score** alongside coverage. This is the gold standard for test quality — no AI testing tool does this today.

**Why it stands out:** Proves test quality objectively, not just coverage percentage.

### 3. Diff-Aware Incremental Generation

Watch git diffs (pre-commit hook or file watcher). When code changes, re-generate only AFFECTED test cases, not full suite. Show "stale tests" badge on cases that reference modified functions. Keeps test artifacts in sync with live code.

**Why it stands out:** Solves the biggest pain point in manual testing — keeping tests current with code changes.

### 4. Multi-Model Consensus Panel

Run same prompt against 2-3 models simultaneously (Ollama + OpenAI + Anthropic). Show side-by-side comparison of generated artifacts. Let user cherry-pick best sections from each. Highlights where models disagree (= likely edge cases worth extra attention).

**Why it stands out:** No competitor offers multi-model consensus for test generation.

### 5. Test Impact Graph

Build call-graph from AST (tree-sitter already in place). Visualize which test cases cover which functions. When a function is modified, instantly highlight which tests need re-review. Interactive force-directed graph in UI.

**Why it stands out:** Transforms Tessera from "test generator" into "test intelligence platform."

---

## Quality Scorecard

| Dimension | Grade | Detail |
|-----------|-------|--------|
| Architecture | A+ | Layered, trait-based, clear separation of concerns |
| Type Safety | A+ | Strict TypeScript, full Rust safety, Zod at boundaries |
| Error Handling | A+ | Typed errors with stable codes, graceful degradation |
| Testing | A | 339 tests, live integration; gaps in E2E and coverage reporting |
| Documentation | A- | Excellent rules.md + ADRs; missing API docs, schema diagrams |
| Security | A+ | AES-GCM, Argon2, JWT, local-first default |
| CI/CD | A+ | Multi-stage guards, cross-platform release, branch protection |
| Accessibility | B+ | 84+ aria labels; no automated audits in CI |
| Code Cleanliness | A+ | Zero TODO/FIXME in production, Clippy clean, no dead code |
| Onboarding | A | First-run wizard, env docs, clear quickstart |
