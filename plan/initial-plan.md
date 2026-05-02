# AI-Powered Testing IDE — Implementation Plan

## Context

Building a VS Code-like IDE focused exclusively on AI-powered software testing. Users upload project folders; AI analyzes code structure, data flows, architecture, then generates structured test artifacts (test plans, test cases, defect reports, bug reports, test summaries). Human reviews and approves. No existing code — clean slate at `C:\Testing IDE`.

**Differentiation**: No tool currently owns the "static code analysis → full test strategy" space. Copilot/Cursor generate test code snippets. Mabl/TestRigor need running apps. This IDE bridges the gap — architecture-aware, structured output, no execution required.

**Team**: Small team (2-3 people). No fixed deadline — quality over speed, ship incrementally. Backend language and deployment decisions deferred to implementation time.

---

## System Architecture

```
Frontend (React+Vite)  <-- REST + SSE -->  Backend (Express/Node)  <-->  PostgreSQL + pgvector
     |                                          |
  Monaco Editor                          Tree-sitter (AST)
  File Tree                              Claude API (LLM)
  AI Action Panel                        Voyage AI (embeddings, V1+)
  Markdown Preview                       Redis + BullMQ (V1+)
```

### MVP Simplification
- No Redis, no job queue, no vector DB
- Direct Claude API streaming calls
- 200K context window handles most projects without RAG
- Single Railway service

---

## Tech Stack

| Layer | Technology | Reasoning |
|-------|-----------|-----------|
| Monorepo | pnpm + Turborepo | Fast installs, build caching |
| Frontend | React 19 + TypeScript + Vite + TailwindCSS v4 | Standard, fast DX |
| Editor | @monaco-editor/react | VS Code parity for free |
| File Tree | react-arborist | Virtualized, full-featured |
| Layout | react-resizable-panels | Three-panel IDE layout |
| State | Zustand | Minimal boilerplate |
| Backend | Node.js + Express + TS **OR** Python + FastAPI | Node: same lang as frontend, great streaming. Python: better ML libs, mature AST tooling. Decide at impl time. |
| ORM | Drizzle (Node) or SQLAlchemy (Python) | Both excellent, match backend choice |
| Database | PostgreSQL 16 + pgvector | Relational + vector in one DB |
| AST Parsing | web-tree-sitter (WASM) | 305 languages, incremental |
| LLM | Claude API (Anthropic) | 200K context, prompt caching, structured output |
| Embeddings | Voyage AI voyage-code-3 (V1+) | Purpose-built for code |
| Auth | Clerk or email/password JWT | Fast for solo dev |
| Deploy | Vercel + Railway **OR** VPS (Hetzner/DO) **OR** local-only initially | Decide based on when you want users. Cloud = zero ops. VPS = cheaper at scale. |
| Desktop | Tauri 2.0 (V2+) | <3MB binary vs 150MB Electron |

---

## Monorepo Structure

```
testing-ide/
  package.json
  pnpm-workspace.yaml
  turbo.json
  docker-compose.yml
  .env.example
  plan/                   -- Planning documents (this file lives here)
  packages/
    shared/               -- Shared TS types + Zod schemas
  apps/
    client/               -- React frontend (Vite)
      src/components/
      src/stores/
      src/hooks/
      src/pages/
      src/lib/
    server/               -- Express backend
      src/routes/
      src/services/
      src/workers/
      src/db/
      src/utils/
  tools/scripts/
```

---

## Frontend Layout

```
+----------------------------------------------------------+
| Toolbar: [Upload Project] [New Analysis] [Export] [Auth]  |
+------------+-------------------------+-------------------+
| File       | Editor Pane             | AI Panel          |
| Explorer   | (Monaco read-only src,  | - Generate        |
| - Tree     |  editable for .md)      | - Review Queue    |
| - Search   |                         | - Progress        |
+------------+-------------------------+-------------------+
| Status Bar: [Project Stats] [Analysis Progress]          |
+----------------------------------------------------------+
```

---

## AI Pipeline (5 Stages)

1. **File Discovery** — walk dir, classify (source/config/test/docs), skip node_modules/vendor/binary
2. **AST Parsing** — Tree-sitter extracts functions, classes, imports, exports per file
3. **Semantic Chunking** — split at function/class boundaries, 500-1500 tokens per chunk
4. **Embedding + Indexing** — Voyage AI → pgvector HNSW index (V1+, skipped in MVP)
5. **Hierarchical Summarization** — bottom-up LLM summarization → generates context.md

### Generation Flow
- User picks artifact type + scope (full project / module / file)
- System assembles: context.md + relevant code + dependency info
- Claude generates with structured output (tool_use schema)
- Stream result to frontend via SSE
- User reviews → approve / reject with feedback / regenerate

---

## Artifact Types

| Type | What It Generates |
|------|------------------|
| Test Plan | Scope, objectives, strategy, environments, risk matrix, entry/exit criteria |
| Test Cases | Individual cases with steps, expected results, priority, traceability to source |
| Defect Report | Static analysis findings with severity, category, location, suggested fix |
| Bug Report | Potential runtime issues formatted for tracking (steps to reproduce, root cause) |
| Test Summary | Executive-level coverage assessment, risk areas, recommendations |

MVP ships: Test Plan + Test Cases only. Others in V1.

---

## Database Schema (Core Tables)

- **users** — id, email, name, password_hash, plan, timestamps
- **projects** — id, user_id, name, file_count, total_size, status, language_breakdown (JSONB)
- **project_files** — id, project_id, path, language, size, file_type, hash (SHA-256)
- **ast_analyses** — id, file_id, functions/classes/imports (JSONB)
- **code_chunks** — id, file_id, chunk_type, name, content, embedding VECTOR(1024), metadata
- **artifacts** — id, project_id, type, title, content (MD), structured_data (JSONB), status, version
- **jobs** — id, project_id, type, status, progress, result (JSONB)

---

## Security (Critical Constraints)

- **NEVER execute uploaded code** — static analysis only, Tree-sitter parses as text
- File extension whitelist + magic bytes validation
- Size limits: 50MB/file, 500MB/project, 10K files max
- Secret scanning before LLM submission (redact API keys, passwords, tokens)
- JWT auth with 15-min access + 7-day refresh
- API keys server-side only
- Path traversal prevention on file access
- HTTPS + CORS + Helmet security headers

---

## API Endpoints (Key)

- POST /api/projects — upload/create project
- GET /api/projects/:id/tree — file tree
- GET /api/projects/:id/files/:path — file content
- POST /api/projects/:id/analyze — trigger analysis
- POST /api/projects/:id/generate — generate artifact (type, scope, targets)
- GET /api/artifacts/:id — get artifact
- POST /api/artifacts/:id/approve — approve
- POST /api/artifacts/:id/regenerate — regenerate with feedback
- POST /api/artifacts/:id/export — export (markdown/json/pdf/jira)

---

## Output Formats

| Format | When | Implementation |
|--------|------|----------------|
| Markdown | Default, human review | Native |
| JSON | CI/CD integration | Custom schema |
| JIRA ADF | Enterprise ticket creation | Convert MD → Atlassian Document Format |
| PDF | Executive reports | Puppeteer headless rendering |

MVP: Markdown download only. Others in V1.

---

## Phased Roadmap

### Phase 1: MVP (Weeks 1-8)

**Week 1-2: Foundation**
- Monorepo setup (pnpm + Turborepo)
- React + Vite + Tailwind scaffold
- Express + TypeScript server
- PostgreSQL schema (Drizzle)
- JWT auth
- Docker Compose for local dev

**Week 3-4: Core UI**
- Three-panel layout
- File upload (folder picker)
- File tree (react-arborist)
- Monaco editor (read-only source)
- Markdown preview pane
- Tab system

**Week 5-6: AI Pipeline**
- Tree-sitter WASM (JS/TS/Python)
- File classification
- AST extraction
- Context.md generation (Claude streaming)
- Test Plan generation
- Test Cases generation
- SSE progress to frontend

**Week 7-8: Polish + Deploy**
- Review workflow (approve/reject/regenerate)
- Markdown export download
- Error handling + loading states
- Deploy (Railway + Vercel)
- Sentry monitoring
- Beta launch

### Phase 2: V1 (Weeks 9-16)
- pgvector + RAG pipeline
- Defect reports, bug reports, test summaries
- Multi-language (Java, Go, Rust, C#)
- PDF/JIRA/JSON export
- BullMQ job queue
- Redis caching
- Multi-project support
- Billing (Stripe)

### Phase 3: V2 (Weeks 17-24)
- Team workspaces + collaboration
- Tauri desktop app
- Custom prompt templates
- Offline mode (Ollama)
- SSO enterprise auth
- CI/CD REST API
- Self-hosted option

---

## Cost Estimate (MVP, ~100 users)

| Service | Monthly |
|---------|---------|
| Railway (API + DB) | $20-50 |
| Vercel (Frontend) | $0-20 |
| Claude API | $100-500 (main cost) |
| Sentry | $0 (free tier) |
| **Total** | **~$150-600/month** |

Cost controls: Prompt caching (90% savings on repeated context), model tiering, per-user limits, batch API for bulk.

---

## Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM output inconsistency | Schema validation via tool_use, golden file tests, human review gate |
| API costs exceed budget | Prompt caching, model tiering, usage caps, batch API |
| Large projects exceed context | RAG in V1, hierarchical summarization, scope-limited generation |
| Solo dev burnout | Ruthless MVP scoping, defer non-essentials, ship incrementally |
| LLM hallucinations | Confidence scores, source code references with line numbers, mandatory review |
| Security (uploaded code) | Never execute, whitelist extensions, secret scanning, sandboxed storage |

---

## Verification Plan

After each phase:
1. **Upload a real project** (e.g., a small Express API repo) into the IDE
2. Verify file tree renders correctly with proper file type icons
3. Click source files → verify Monaco displays with syntax highlighting
4. Trigger analysis → verify context.md generates with accurate project summary
5. Generate Test Plan → verify structured output with real test scenarios
6. Generate Test Cases → verify each case references actual functions/endpoints
7. Approve/reject artifacts → verify status persists
8. Export markdown → verify download contains correct content
9. Test with large project (1000+ files) → verify no crashes, reasonable performance
10. Security: upload .env file → verify blocked; upload binary → verify rejected

---

## Team Workflow (2-3 People)

**Suggested split:**
- **Person 1 (Frontend)**: React UI, Monaco integration, file tree, layout, state management
- **Person 2 (Backend + AI)**: API routes, Claude integration, AST pipeline, streaming
- **Person 3 (or shared)**: Database schema, auth, deployment, CI/CD, testing

**Interface contracts matter**: Define API types in `packages/shared/` first. Frontend and backend develop against shared types independently. Mock API responses for frontend dev while backend catches up.

**Parallel workstreams (Week 1-2)**:
- Frontend: layout + Monaco + file tree with mock data
- Backend: upload endpoint + Tree-sitter parsing + Claude streaming
- Shared: types, Docker Compose, DB schema

---

## First Day Actions

1. `pnpm init` + workspace config
2. Scaffold Vite React app + Express/FastAPI server
3. Docker Compose (PostgreSQL pgvector)
4. DB schema (users, projects, artifacts)
5. Define shared types in `packages/shared/`
6. Monaco "hello world" in browser
7. Claude API streaming "hello world" from server
8. Connect: button → API → streamed markdown in editor

Proves full stack end-to-end in ~2-3 days. Then team parallelizes.
