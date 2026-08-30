#!/bin/bash
# Tests for scripts/bootstrap-worktree.sh.
#
# Why this file exists: the whole point of the script is a situation that only
# occurs in a real linked worktree — `git worktree add` copies tracked files and
# silently leaves gitignored ones behind. Asserting on the script's text would
# not catch the failure that matters (linking the wrong direction, or clobbering
# a real .env). So this builds a throwaway repo, adds a real worktree, and runs
# the real script against it.
#
# The npm-install branch is deliberately not exercised — it needs the network,
# and the test pre-creates node_modules so that branch is skipped.
#
# Run: bash scripts/bootstrap-worktree.test.sh   (also wired into `npm test`)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap-worktree.sh"

passed=0
failed=0
assert() {
  local name="$1" cond="$2"
  if [ "$cond" = "1" ]; then echo "  ✓ $name"; passed=$((passed+1))
  else echo "  ✗ $name"; failed=$((failed+1)); fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

MAIN="$TMP/main"
mkdir -p "$MAIN/scripts" "$MAIN/content"
cd "$MAIN"
git init -q -b main
git config user.email t@t.t; git config user.name t
printf '.env\ncontent/gcp-playbook.md\nnode_modules/\n' > .gitignore
cp "$BOOTSTRAP" scripts/bootstrap-worktree.sh
git add -A && git commit -qm init

# The gitignored files that exist ONLY in the main checkout — the whole problem.
printf 'GOOGLE_API_KEY=real-key\n' > .env
printf '# playbook\nLast verified: 2026-08-30.\n' > content/gcp-playbook.md

# Compare against the PHYSICAL path: the script resolves with `pwd -P`, and on
# macOS $TMP is under the /var -> /private/var symlink, so the logical path
# would not match the (correct) link the script writes.
MAIN_P="$(cd "$MAIN" && pwd -P)"

git worktree add -q "$TMP/wt" -b feat/x
mkdir -p "$TMP/wt/node_modules"   # skip the npm branch

echo "bootstrap-worktree.sh"

# Precondition: git really did leave the gitignored files behind.
[ ! -e "$TMP/wt/.env" ] && a=1 || a=0
assert "precondition: worktree starts with no .env" "$a"

out="$(bash "$TMP/wt/scripts/bootstrap-worktree.sh" 2>&1)"

[ -L "$TMP/wt/.env" ] && a=1 || a=0
assert ".env is created as a symlink (not a copy)" "$a"

[ "$(readlink "$TMP/wt/.env")" = "$MAIN_P/.env" ] && a=1 || a=0
assert ".env points back at the main checkout" "$a"

[ "$(cat "$TMP/wt/.env")" = "GOOGLE_API_KEY=real-key" ] && a=1 || a=0
assert ".env resolves to the real secret" "$a"

[ -L "$TMP/wt/content/gcp-playbook.md" ] && a=1 || a=0
assert "gcp-playbook.md is linked" "$a"

grep -q "already present — skipping npm install" <<<"$out" && a=1 || a=0
assert "npm install skipped when node_modules exists" "$a"

# Idempotence: a second run must not clobber or double-link.
out2="$(bash "$TMP/wt/scripts/bootstrap-worktree.sh" 2>&1)"
grep -q "already present — left alone" <<<"$out2" && a=1 || a=0
assert "re-running leaves existing files alone" "$a"
[ "$(cat "$TMP/wt/.env")" = "GOOGLE_API_KEY=real-key" ] && a=1 || a=0
assert "re-running does not corrupt .env" "$a"

# A REAL .env in the worktree must never be replaced by a link.
rm "$TMP/wt/.env"; printf 'GOOGLE_API_KEY=worktree-local\n' > "$TMP/wt/.env"
bash "$TMP/wt/scripts/bootstrap-worktree.sh" >/dev/null 2>&1
[ "$(cat "$TMP/wt/.env")" = "GOOGLE_API_KEY=worktree-local" ] && a=1 || a=0
assert "a real local .env is never overwritten" "$a"

# In the main checkout the script must be a no-op, not link a file to itself.
outm="$(bash "$MAIN/scripts/bootstrap-worktree.sh" 2>&1)"
grep -q "This IS the main checkout" <<<"$outm" && a=1 || a=0
assert "main checkout is detected and skipped" "$a"
[ ! -L "$MAIN/.env" ] && a=1 || a=0
assert "main checkout .env is left a real file" "$a"

# A path missing from the main checkout must warn, not create a broken link.
rm "$MAIN/content/gcp-playbook.md" "$TMP/wt/content/gcp-playbook.md"
outp="$(bash "$TMP/wt/scripts/bootstrap-worktree.sh" 2>&1)"
grep -q "MISSING from the main checkout too" <<<"$outp" && a=1 || a=0
assert "missing source warns instead of linking" "$a"
[ ! -L "$TMP/wt/content/gcp-playbook.md" ] && a=1 || a=0
assert "no broken symlink is left behind" "$a"

echo
echo "  $passed passed, $failed failed"
[ "$failed" -eq 0 ] || exit 1
