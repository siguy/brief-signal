#!/bin/bash
# Tests for the status-setting functions in generate-weekly.sh.
#
# Why this file exists: run_lint()/run_critique() run once a week, unattended,
# and their FAILURE paths are the ones that had never executed in a live run.
# A `[ cond ] && log` as a function's last statement returns 1 when cond is
# false, and under `set -euo pipefail` a bare call to that function aborts the
# whole pipeline — silently turning "lint found problems, surface them in the
# PR" into "no PR at all". That shipped and went unnoticed because the happy
# path returns 0.
#
# These tests extract the function text from generate-weekly.sh rather than
# copying it, so they fail if the real implementation regresses.
#
# Run: bash scripts/generate-weekly.test.sh   (also wired into `npm test`)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIPELINE="$SCRIPT_DIR/generate-weekly.sh"

passed=0
failed=0

# Pull one shell function out of the pipeline script by name, from its
# `name() {` line to the first line that is exactly `}`.
extract_function() {
  awk "/^$1\(\) \{/{flag=1} flag{print} flag && /^\}\$/{exit}" "$PIPELINE"
}

# Runs an extracted function under the same shell options as the real pipeline,
# with `node` stubbed to exit with the given code. Echoes the value of the
# status variable, then a sentinel proving execution continued past the call —
# the sentinel is the whole point, since the bug was an early exit.
run_case() {
  local fn="$1" status_var="$2" node_exit="$3"
  # Variables the extracted functions reference. They are set earlier in the
  # real script; `set -u` turns any we forget into a visible failure here.
  bash -c "
    set -euo pipefail
    LOG_FILE=/dev/null
    TODAY=2026-08-09
    CRITIQUE_MD=/dev/null
    log() { :; }
    node() { return $node_exit; }
    $(extract_function "$fn")
    $fn
    echo \"STATUS=\${$status_var}\"
    echo 'CONTINUED'
  " 2>&1
}

assert_contains() {
  local name="$1" haystack="$2" needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "  ✓ $name"
    passed=$((passed + 1))
  else
    echo "  ✗ $name"
    echo "      expected to contain: $needle"
    echo "      got: ${haystack:-<empty>}"
    failed=$((failed + 1))
  fi
}

echo "generate-weekly.sh"

# The regression. Exit 2 = hard failures found. The pipeline MUST continue so
# Stage 4c can repair and Stage 5 can open the PR.
out="$(run_case run_lint LINT_STATUS 2)"
assert_contains "run_lint continues the pipeline on HARD failures" "$out" "CONTINUED"
assert_contains "run_lint reports hard_failures" "$out" "STATUS=hard_failures"

# Any other non-zero exit = the linter itself broke. Advisory: warn and carry on.
out="$(run_case run_lint LINT_STATUS 1)"
assert_contains "run_lint continues the pipeline on linter error" "$out" "CONTINUED"
assert_contains "run_lint reports error" "$out" "STATUS=error"

out="$(run_case run_lint LINT_STATUS 0)"
assert_contains "run_lint continues the pipeline on a clean lint" "$out" "CONTINUED"
assert_contains "run_lint reports pass" "$out" "STATUS=pass"

# run_critique has the same shape and the same stakes. It is currently written
# as if/else (which is safe), and this pins that.
out="$(run_case run_critique CRITIQUE_STATUS 2)"
assert_contains "run_critique continues the pipeline on HARD failures" "$out" "CONTINUED"
assert_contains "run_critique reports hard_failures" "$out" "STATUS=hard_failures"

out="$(run_case run_critique CRITIQUE_STATUS 1)"
assert_contains "run_critique continues the pipeline on critique error" "$out" "CONTINUED"
assert_contains "run_critique reports error" "$out" "STATUS=error"

# Stage 4c's guard is `[ "$LINT_STATUS" = "hard_failures" ]`. Confirm the state
# run_lint actually produces is the state that guard matches — the two drifting
# apart is what made the repair pass unreachable in the first place.
guard=$(grep -c 'if \[ "\$LINT_STATUS" = "hard_failures" \]; then' "$PIPELINE")
assert_contains "Stage 4c guard matches run_lint's hard-failure state" "$guard" "1"

# --- Lineup gate -----------------------------------------------------------
# The gate's risk is not that it fails loudly — it is that it half-runs. With no
# draft on disk, `ls -t content/briefings/*.md` returns the PREVIOUSLY published
# edition, and every downstream stage would then snapshot, critique and lint last
# week's file under this week's name. These pin the guards that prevent that.

assert_contains "LINEUP_GATE defaults to off" \
  "$(grep -c 'LINEUP_GATE=${LINEUP_GATE:-0}' "$PIPELINE")" "1"

assert_contains "gate passes --lineup-only to the generator" \
  "$(grep -c 'generate-briefing.js --lineup-only' "$PIPELINE")" "1"

# BRIEFING_FILE must be assigned with ${VAR-default} (unset-only), NOT
# ${VAR:-default}: the gate sets it to the empty string on purpose, and the
# colon form would helpfully overwrite that with last week's edition.
assert_contains "gate's empty BRIEFING_FILE survives the ls -t fallback" \
  "$(grep -c 'BRIEFING_FILE=${BRIEFING_FILE-\$(ls -t' "$PIPELINE")" "1"

# The draft-only checks are skipped as one block. If this guard is ever removed,
# a gated run would lint the previous edition and report its result as this week's.
assert_contains "draft-only checks are skipped under the gate" \
  "$(grep -c 'Lineup gate: skipping images, critique, lint and repair' "$PIPELINE")" "1"

assert_contains "gate sweeps the digest against the lineup, not a draft" \
  "$(grep -c 'SIGNAL_ARGS=(--date "\$MONDAY_DATE" --lineup "\$LINEUP_FILE")' "$PIPELINE")" "1"

# The editorial section must precede the critique and the digest in the PR body.
# This is the whole point of the reorder; an accidental swap restores the bug.
body_order=$(grep -o '${THEME_SECTION}${CRITIQUE_SECTION}${SIGNAL_SECTION}' "$PIPELINE" | head -1)
assert_contains "PR body leads with themes, ends with the digest" \
  "$body_order" '${THEME_SECTION}${CRITIQUE_SECTION}${SIGNAL_SECTION}'

assert_contains "signal digest is collapsed behind a details block" \
  "$(grep -c '<summary><b>📊 Signal digest</b>' "$PIPELINE")" "1"

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "generate-weekly.test.sh: $failed FAILED, $passed passed"
  exit 1
fi
echo ""
echo "generate-weekly.test.sh: all $passed tests passed"
