#!/usr/bin/env bash
# Pre-push hook: refuse to push if any tracked file contains unresolved
# Git conflict markers.
#
# Install:
#   ln -s ../../tools/scripts/pre-push-no-markers.sh .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push
#
# Master has been broken three times by merge commits that committed
# `<<<<<<<` / `=======` / `>>>>>>>` markers as file content. This hook
# is the local belt to the CI suspenders.

set -euo pipefail

if git grep -nE '^(<{7}|>{7}|={7})( |$)' -- \
    ':(exclude)pnpm-lock.yaml' \
    ':(exclude)*package-lock.json' \
    ':(exclude).github/workflows/ci.yml' \
    ':(exclude)tools/scripts/pre-push-no-markers.sh' \
    ':(exclude)CONTRIBUTING.md' >&2; then
  echo "" >&2
  echo "ERROR: Unresolved Git conflict markers found above." >&2
  echo "Resolve them with 'git status' before pushing." >&2
  echo "If you intentionally want to push these (you don't), bypass with:" >&2
  echo "    git push --no-verify" >&2
  exit 1
fi

exit 0
