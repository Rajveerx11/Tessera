# Changelog

All notable changes to the **Tessera** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Tessera follows [Conventional Commits](https://www.conventionalcommits.org/) for
commit messages and [Semantic Versioning](https://semver.org/) for releases.

---

## [Unreleased]

### 🚀 Added (merged to master 2026-06-05/06)

- **Tessera Boards** (#33, hardened in #40) — Jira-style project management inside
  the IDE: new `apps/server` (Rust/Axum + WebSocket), teams → boards → sprints →
  issues with drag-drop kanban, Supabase/Postgres backend with RLS migrations.
- **Google Gemini provider** (#42) — `providers/llm/gemini.rs` behind the existing
  `LlmProvider` trait; provider config, base-url handling, and connection test wired
  through factory + settings UI.
- **Artifact output harness** (#43) — hardened structured-output extraction:
  forced single-tool `tool_choice` on OpenAI-compatible payloads, JS-string
  normalization (`\'` escapes) in the salvage path, actionable API error messages
  (Ollama OOM hint), narrower pseudo-tool-call detection.
- **Playwright E2E in CI** — e2e suite runs as a CI gate alongside the 5 existing gates.

### 📋 Planned

- **Artifact Quality v2** — industry-grade artifact schemas (IEEE 829 /
  ISO 29119-3 / ISTQB aligned), 3-phase plan in
  [`plan/ARTIFACT_QUALITY_V2.md`](plan/ARTIFACT_QUALITY_V2.md).

---

## Sandbox Test Runner — merged 2026-06-05 (#31, #41)

### 🚀 Added — Sandbox Test Runner (Phases 1–6, JS/TS)

The **flagship feature** of this cycle — a closed-loop sandboxed test runner that
completes the **generate → run → measure** loop for the first time. Generated JS/TS
test cases can now be executed in an isolated Docker container, with pass/fail results
and line-level coverage painted directly onto the Monaco editor gutters.

#### Backend (Rust)
- **`TestRunner` async trait** (`providers/runners/mod.rs`, 748 lines) — pluggable
  runner abstraction mirroring the `LlmProvider` pattern. Includes `RunInput`,
  `RunResult`, `CancelToken`, `RunnerError`, resource limits, and path-traversal
  guards. 18 unit tests.
- **Docker JS/TS runner** (`providers/runners/docker_js.rs`, 793 lines) — builds a
  per-run temporary workspace, launches a hardened Docker container (`--network none`,
  `--cap-drop ALL`, `--read-only`, non-root, CPU/memory/PID/file-size caps), runs
  `vitest` with istanbul coverage, parses results. `WorkspaceGuard` RAII ensures
  cleanup on every exit path. 10 unit tests + 1 gated integration test.
- **Sandbox service** (`services/sandbox_service.rs`, 742 lines) — sole entry point
  for test execution. `RunRegistry` maps in-flight runs to cancel tokens. Opt-in
  gate rejects when disabled (defence in depth). 6 unit tests with `ScriptedRunner`
  and `BlockingRunner` mocks.
- **Sandbox IPC commands** (`commands/sandbox.rs`, 61 lines) — thin Tauri handlers
  for `run_test_sandbox` and `cancel_test_sandbox`.
- **Test run repository** (`repositories/test_run_repo.rs`, 541 lines) — batch
  inserts for `test_runs`, `test_run_cases`, `test_run_coverage` tables. 5 unit
  tests.
- **Migration `0004_test_runs.sql`** (84 lines) — 3 new tables with indexes and
  cascade deletes.
- **Prompt update** — `test_cases_v1` prompt now emits an optional `files[]` array
  (source-under-test + vitest spec per file) so generated artifacts are runnable
  end-to-end. `files[]` stays optional; descriptive-only generations remain valid.
- **Token budget** — `RESPONSE_RESERVE_TOKENS` bumped from 4K → 6K to accommodate
  `files[]` output alongside descriptive cases.
- **Tracing spans** added around sandbox build/run/parse stages.

#### Frontend (React/TypeScript)
- **Sandbox run panel** (`components/ai-panel/sandbox-run-panel.tsx`, 164 lines) —
  Run/Stop controls with results display. Shows pass/fail badge, per-test rows with
  failure messages and source lines, and coverage stats.
- **Sandbox store** (`stores/sandbox-store.ts`, 79 lines) — Zustand store keyed by
  artifact ID. Tracks `idle | running | done` phase, `clientRunId`, results, errors,
  and coverage lines for gutter painting.
- **Sandbox IPC** (`lib/ipc/sandbox.ts`, 38 lines) — Zod-validated typed wrapper
  for `runTestSandbox` and `cancelTestSandbox` commands.
- **Monaco coverage gutters** — green = covered, amber = uncovered, matched by path
  suffix to the open file.
- **Editor panel** — enhanced with coverage gutter rendering.
- **File explorer** — enhanced with per-file test status indicators.
- **Toolbar** — added sandbox Run/Stop button.
- **Settings sheet** — added sandbox opt-in toggle (off by default, persisted in
  localStorage).
- **UI store** — new `sandboxOptIn` state.
- **Workspace store** — expanded to handle runnable `files[]` and analysis results.

#### Shared Contract
- **`test-run.schema.ts`** (103 lines) — Zod schemas mirroring Rust serde structs:
  `RunStatus`, `TestStatus`, `RunRequest`, `TestResult`, `CoverageLine`,
  `RunResult`. Round-trip contract test added.

#### Security (10-point checklist, all passed)
- Execution off by default; backend rejects runs when opt-in flag is off.
- `--network none` verified end-to-end.
- CPU / memory / PIDs / timeout / file-size limits enforced.
- `--cap-drop ALL`, `no-new-privileges`, non-root, read-only rootfs.
- Temp workspace always cleaned up (even on error/cancel).
- No path traversal — file-count + total-size caps.
- Runner output truncated; test names / failure messages capped before DB storage.
- Security review clean — findings + resolutions in ADR-0004.

### 🧪 Added — E2E Testing

- **Playwright E2E suite** now runs in CI (new `e2e-test` job).
- **Sandbox E2E spec** — opt-in → generate test-cases → run in sandbox → verify
  results panel shows pass/fail breakdown.
- **App flow spec** — updated and scoped assertions to the results panel; fixed
  stale assertions vs rendered UI.
- CI installs Playwright browsers into `node_modules` path.

### 📝 Added — Documentation

- **`docs/FEATURE_REVIEW.md`** (155 lines) — feature-by-feature scorecard with
  22 features rated, quality grades (Architecture A+, Security A+, CI/CD A+),
  improvement priorities, and 5 production-grade feature recommendations.
- **`docs/AGENT_WORKFLOW.md`** (292 lines) — change-management contract for AI
  agents and humans. Core invariant, change loop, 10 hard rules for AI agents,
  common failure modes with resolution steps.
- **`plan/SANDBOX_TEST_RUNNER.md`** (268 lines) — 6-phase implementation plan with
  architecture, data model, Docker runner design, security checklist.
- **`plan/JIRA_INTEGRATION.md`** (408 lines) — planned Jira-like boards feature
  with server architecture, data model, 5 implementation phases.

### 🔧 Changed

- `generation_service.rs` — expanded salvage path for non-tool-trained models
  (Gemma `tool_code`, Llama function-call tags, Qwen `<tool_call>` tags).
- All prompt templates refactored to use `max_completion_tokens` and structured
  token budget control.
- `e2e-tauri-mocks.ts` — expanded with sandbox IPC mock scripting for
  `run_test_sandbox` and `cancel_test_sandbox`.

### 🐛 Fixed

- `fix(sandbox): address Greptile review findings` — code review fixes.
- `fix(integration): widen token budget for runnable files[] payload`.
- `fix(integration): stop golden test-cases probe truncating model output`.

---

## [0.1.1] — 2026-06-04

### 📝 Changed — Documentation & Housekeeping

- `CLAUDE.md` updated with pre-push commands and Tauri IPC guidelines (#29).
- Untracked `website/` marketing directory, kept it local-only (#17).
- README updated with live deployment link ([tesseraide.vercel.app](https://tesseraide.vercel.app/)) (#16).
- Streamlined documentation + CI Node 24 action bump (#15).
- Added project audit and feature roadmap.
- Added Tessera logo to README header.
- Bumped version to 0.1.1 and fixed README workflow diagram.

### ♻️ Refactored

- **Backend**: Centralized provider base-URL normalization (#14).
- **Frontend**: Extracted `toArtifactSummary` and `pickActiveProvider` helpers.
- **Frontend**: Extracted `getErrorMessage` helper for IPC error handling.

### 🐛 Fixed

- Kept pre-push Rust-optional locally (#27) — allows frontend-only contributors.
- Resolved project analyzing failure (#30).
- Resolved generating artifacts issue (#32).

---

## [0.1.0] — 2026-05-31

### 🎉 Initial Release

- **5 artifact types**: Context, Test Plan, Test Cases, Defect Report, Bug Report.
- **5 LLM providers**: Ollama Local, Ollama Cloud, OpenAI, OpenRouter, Anthropic.
- **RAG pipeline**: Tree-sitter AST (JS/TS/Python) + Ollama embeddings + SQLite.
- **Streaming generation** with partial-JSON preview and blinking caret.
- **Prompt versioning** with JSON-Schema tool calls and insta snapshots.
- **AES-256-GCM** encrypted API key storage.
- **First-run wizard** with hardware probe, Ollama connectivity test, model-pull.
- **Cross-platform** signed releases (Windows, macOS, Linux) via GitHub Actions.
- **339+ tests**: 218 Rust unit, 43 TS unit, 78 Zod schema, 2 integration, 6 snapshot.
- **CI/CD**: 5-gate CI, pre-push gauntlet, Husky hooks, branch protection.
- MIT licensed.

---

## Contributors

| Name | Areas |
|------|-------|
| **Rajveer Vadnal** (@Rajveerx11) | Architecture, backend, frontend, CI/CD, sandbox runner |
| **Yuvraj Gandhmal** | Bug fixes, artifact generation |
| **ded-furby** | CI tooling, pre-push Rust-optional fix |

---

[Unreleased]: https://github.com/Rajveerx11/Tessera/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Rajveerx11/Tessera/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Rajveerx11/Tessera/releases/tag/v0.1.0
