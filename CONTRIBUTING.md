# Contributing

Short rules. Read once.

## Branch / commit / PR

- Branch from `master`. Name: `feat/<scope>/<short>`, `fix/<scope>/<short>`, `chore/<scope>/<short>`.
- Conventional Commits. Body explains **why**.
- Open a PR against `master`. CI must be green before merge.

## Pre-push checklist

Run **all four** before pushing. CI runs the same gate; failing locally wastes a CI cycle.

```bash
# Frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test

# Backend
cd apps/desktop/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --lib
cargo build --release --lib
```

## Merge conflicts — required reading

Master has been broken **three times** by `git pull`/`git merge` commits that committed unresolved `<<<<<<<` / `=======` / `>>>>>>>` markers as file content. The CI `conflict-marker-check` job exists to catch this; do not bypass it.

**Correct flow when `git pull` reports conflicts:**

```bash
git pull --rebase origin master    # or: git pull origin master

# Conflict reported. Stop. Do NOT git commit / git push yet.
git status                          # lists "both modified" files

# For each unmerged file:
#  - open in editor
#  - delete every <<<<<<< / ======= / >>>>>>> line
#  - keep the resolved content
#  - save

git add <resolved-files>
git commit                          # finishes the merge
# Run pre-push checklist above
git push
```

If you are unsure which side to keep, ask in chat. **Never `git commit -a` while a merge is unresolved** — that ships markers to remote.

A pre-push git hook that scans for markers lives at `tools/scripts/pre-push-no-markers.sh`. Symlink it:

```bash
ln -s ../../tools/scripts/pre-push-no-markers.sh .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

## Don't push directly to master

Even though branch protection isn't enforced server-side yet, treat `master` as PR-only. Direct pushes that skip the gate are how the marker bug recurs.

## Rules

Follow [`rules/rules.md`](./rules/rules.md). Highlights:

- TypeScript strict; no `any`; Zod at every external boundary.
- Rust `#![deny(clippy::all)] + #![warn(clippy::pedantic)]`. No `unwrap()` / `expect()` in production paths.
- All SQL parameterized via `sqlx::bind`. No string concat.
- API keys encrypted at rest (AES-GCM). Never logged.
- LLM output is untrusted. Never feed it to `dangerouslySetInnerHTML` or `rehype-raw`.

## Plan docs

Multi-day work needs a plan in `/plan` first. PR description links the plan. Reviewer reads the plan before the diff.
