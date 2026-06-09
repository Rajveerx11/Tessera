# Branch protection — admin runbook

`master` is protected by a **repository ruleset** named **`Protect master`**
(id `17259460`), not by a classic branch-protection rule. This is the canonical
"how master stays green" reference for admins.

> **Why this exists.** Master has been broken by direct merges and
> conflict-marker commits. The ruleset makes those impossible: PR-only, squash-only,
> linear history, and a set of required status checks that must pass before the
> merge button unlocks.

---

## 1. Current ruleset state

GitHub UI path: **Settings → Rules → Rulesets → Protect master**.
Inspect from the CLI:

```bash
gh api repos/Rajveerx11/Tessera/rulesets/17259460 \
  --jq '{name, enforcement, conditions, rules: [.rules[].type]}'
```

The active rules are:

| Rule | Effect |
|------|--------|
| `deletion` | `master` cannot be deleted |
| `non_fast_forward` | linear history only — no force-push, no merge commits |
| `pull_request` | PR required; **squash is the only allowed merge method**; `required_approving_review_count: 0` |
| `required_status_checks` | the six checks below must pass; `strict` policy **off** |

### Required status checks

These six job names must report success before merge (type them exactly — they
appear in the UI dropdown after the first CI run on a branch):

- `conflict-marker-check`
- `frontend-checks`
- `lint-and-test`
- `server-check`
- `e2e-test`
- `sandbox-runner-test`

`integration-test (ubuntu)` is **intentionally excluded** — it is
`continue-on-error` (live-Ollama smoke test, flaky on free runners) and must
never block a merge. See [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md) §3.5
for what each job asserts and [`plan/CI_JOB_CONSOLIDATION.md`](plan/CI_JOB_CONSOLIDATION.md)
for why `lint-and-test` / `frontend-checks` are merged jobs.

---

## 2. Editing the ruleset

Prefer the UI for one-off toggles. For reproducible changes, `PUT` the full
ruleset body (the API replaces the whole `rules` array — re-send every rule, not
just the changed one):

```bash
# 1. fetch current state first, diff your change against it
gh api repos/Rajveerx11/Tessera/rulesets/17259460 > ruleset.json
# 2. edit ruleset.json, then PUT it back
gh api --method PUT repos/Rajveerx11/Tessera/rulesets/17259460 --input ruleset.json
```

**Common changes as the team grows:**

- **Require reviews** — set `pull_request.parameters.required_approving_review_count`
  to `1` (raise to `2` past ~5 people); optionally enable
  `require_code_owner_review` and `required_review_thread_resolution`.
- **Require up-to-date branches** — set
  `required_status_checks.parameters.strict_required_status_checks_policy` to
  `true`. (Off today to avoid serialized update-merge-rerun churn on a
  solo-maintainer repo.)
- **Add a new required check** — append `{ "context": "<job-name>" }` to
  `required_status_checks.parameters.required_status_checks`. The context string
  must match the job's `name:` in `ci.yml` exactly, or the check waits forever.

If a check context never appears in the UI dropdown, run CI once on a throwaway
PR so GitHub indexes the job name, then refresh.

---

## 3. Repository settings (one-time)

GitHub UI path: **Settings → General → Pull Requests**:

- [x] Allow squash merging — commit message **"Pull request title and description"**
- [ ] Allow merge commits — **OFF** (linear history)
- [ ] Allow rebase merging — **OFF** (squash is the only way in)
- [x] Always suggest updating pull request branches
- [x] Automatically delete head branches

**Settings → Actions → General**:

- [x] Allow GitHub Actions to create and approve pull requests
      (required for the `auto-merge` workflow's `gh pr merge --auto`)

No new secrets are required for the gating itself. `release.yml` already uses
`GITHUB_TOKEN` and `TAURI_*` signing secrets; nothing here touches them.

---

## 4. Verify

Open a one-line throwaway PR and confirm:

- The PR template auto-fills.
- The "Merge" button is greyed out until the six required checks are green.
- Direct `git push origin master` from the CLI is rejected (non-fast-forward /
  ruleset violation).

To prove the status-check gate actually bites, push a commit with a deliberately
failing test and confirm the merge button stays locked until it is fixed.

---

## 5. Local hooks

Per-developer hook setup is automatic on `pnpm install` and is a contributor
concern, not an admin one — see [`CONTRIBUTING.md`](./CONTRIBUTING.md). The
ruleset makes a `--no-verify` bypass useless anyway: the PR is still gated by CI.
