#!/bin/bash
set -euo pipefail

# Brief Signal — prepare a git worktree to actually run the pipeline.
#
# Why this exists: `git worktree add` copies only TRACKED files. Everything the
# pipeline needs that is gitignored stays behind in the main checkout, so a fresh
# worktree looks complete but fails in ways that are individually confusing:
#
#   .env                     → "ERROR: GOOGLE_API_KEY not set" and the run aborts
#   content/gcp-playbook.md  → Stage 4b drafts "Our Play" with no ground truth,
#                              and the staleness check warns about a missing file
#   node_modules/            → Stage 4 dies on `Cannot find module '@google/genai'`
#
# Each is a symlink back to the main checkout rather than a copy, so there is one
# .env and one playbook to keep current — edit either in the main checkout and
# every worktree sees it. Safe to re-run: existing files are never overwritten.
#
# Run: bash scripts/bootstrap-worktree.sh   (or `npm run bootstrap`)

# `pwd -P` throughout: git reports PHYSICAL paths (/private/var/...) while a bare
# `pwd` reports the logical one (/var/...). On macOS both /tmp and /var are
# symlinks, so mixing the two makes the main-checkout comparison below compare
# unequal strings for the same directory — and the script would then treat the
# main checkout as a worktree and try to link .env on top of itself.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
cd "$REPO_ROOT"

# The shared .git directory lives in the MAIN checkout. In a linked worktree
# --git-common-dir points there (…/main/.git) while --git-dir points at
# …/main/.git/worktrees/<name>, so comparing them tells us which we are in.
GIT_COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_CHECKOUT="$(cd "$(dirname "$GIT_COMMON")" && pwd -P)"

if [ "$MAIN_CHECKOUT" = "$REPO_ROOT" ]; then
  echo "This IS the main checkout ($REPO_ROOT) — nothing to link."
else
  echo "Worktree:      $REPO_ROOT"
  echo "Main checkout: $MAIN_CHECKOUT"
  echo

  # Gitignored paths the pipeline reads. Add to this list, not to the loop.
  LINKED_PATHS=(
    ".env"
    "content/gcp-playbook.md"
  )

  for rel in "${LINKED_PATHS[@]}"; do
    src="$MAIN_CHECKOUT/$rel"
    dest="$REPO_ROOT/$rel"
    if [ -e "$dest" ] || [ -L "$dest" ]; then
      echo "  = $rel already present — left alone"
    elif [ ! -e "$src" ]; then
      echo "  ! $rel MISSING from the main checkout too — skipped"
    else
      mkdir -p "$(dirname "$dest")"
      ln -s "$src" "$dest"
      echo "  + $rel linked"
    fi
  done
fi

echo
if [ -d "$REPO_ROOT/node_modules" ]; then
  echo "  = node_modules already present — skipping npm install"
else
  echo "  + installing dependencies (npm install)..."
  npm install --silent
  echo "  + dependencies installed"
fi

echo
echo "Ready. Note: content runs belong in the MAIN checkout — see docs/branching.md."
