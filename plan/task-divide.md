Student 1 — Frontend Owner
Domain: All UI, user interaction, client-side state.
Tasks:

Vite + React + TypeScript + TailwindCSS setup
Three-panel layout (react-resizable-panels)
File explorer (react-arborist) — tree, search, file icons
Monaco editor integration — read-only source, markdown preview, tab system
AI Action Panel — generate buttons, progress indicator, review queue
Settings → AI Provider page — provider radio buttons, API key input, connection test
First-run wizard — hardware detection display, Ollama install prompt, model picker
Folder upload component — drag/drop, file picker, progress bar
Review workflow UI — approve/reject/regenerate buttons, feedback textarea
Markdown export download button
Zustand stores (project state, AI state)
API client layer (fetch wrappers, SSE consumer)
Loading states + error boundaries
Deliverable: Polished UI consuming mocked API → swap to real endpoints when backend ready.
Skills needed: React, TypeScript, Tailwind, Monaco basics.
Tools: Cursor / Claude Code for component generation.




Student 2 — Backend + AI Pipeline Owner
Domain: Server, LLM integration, code analysis, RAG.
Tasks:

Express + TypeScript server scaffold
Drizzle ORM schema (users, projects, files, chunks, artifacts, provider_configs)
Migrations setup
File upload endpoint (multipart, validation, storage)
File tree builder + .gitignore respect
Tree-sitter WASM integration (JS/TS/Python grammars)
AST extraction service (functions, classes, imports, exports)
Semantic chunking (function/class boundaries)
Embedding service — Ollama nomic-embed-text default
pgvector queries + HNSW index
LLMProvider abstraction interface
Provider implementations: OllamaProvider, OpenAIProvider, AnthropicProvider, OpenRouterProvider
Prompt templates (system prompts for each artifact type)
context.md generation pipeline
Test Plan / Test Cases / Defect Report generation services
SSE streaming endpoints
API key encryption (AES-256 at rest)
Deliverable: REST + SSE API, all artifact types generating against real Ollama and at least one cloud provider.
Skills needed: Node.js, TypeScript, PostgreSQL, LLM APIs, prompt engineering.
Tools: Claude Code for service scaffolding, prompt iteration.




Student 3 — Infra + Glue + QA Owner
Domain: DevOps, integration, testing, shared types, polish.
Tasks:

Monorepo setup (pnpm + Turborepo workspace config)
packages/shared/— TypeScript types + Zod schemas (API contracts between FE/BE)
Docker Compose — postgres (pgvector image) + ollama service
.env.example+ typed env loading
Ollama bootstrap script (auto-pull qwen2.5-coder:7b + nomic-embed-text on first run)
Auth — JWT register/login/refresh endpoints + middleware
Hardware detection utility (RAM, GPU info → recommend model size)
Provider config CRUD (encrypted storage, connection test endpoint)
README with setup instructions
ESLint + Prettier config (shared across workspaces)
Vitest setup for both client + server
Integration tests against Ollama (no API credit needed)
Golden file tests for prompt outputs (schema validation)
E2E test (Playwright): upload → analyze → generate → approve → export
GitHub Actions CI (lint, type check, test)
Final deployment scripts (Railway/VPS)
Bug bash + integration polish (fixes API mismatches between FE/BE)
Deliverable: Working full-stack environment, CI green, shared contracts defined, deployment ready.
Skills needed: TypeScript, Docker, testing frameworks, GitHub Actions, integration debugging.
Tools: Claude Code for boilerplate, infra config generation.[7:36 PM]Build desktop-first with Tauri. Web later if needed.
Code stays local. Ollama works natively. Real IDE feel. Cheaper to run (no hosting). Better aligned with privacy-conscious QA/dev users.