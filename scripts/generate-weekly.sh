#!/bin/bash
set -euo pipefail

# Brief Signal — Weekly briefing generation pipeline
# Runs Sunday evening; generates briefing for the following Monday.
# Extractions (Stages 1-3) run in parallel and are fault-tolerant.
# Stage 4 (briefing generation) failure is fatal (no PR created).
#
# After merging the briefing PR, run audio separately:
#   npm run audio:pr    → generates audio script + opens PR for review
#   npm run audio:generate → generates MP3 from reviewed script
# Subscriber email is sent when the audio PR is merged (triggers on new .mp3).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${GOOGLE_API_KEY:-}" ]; then
  echo "ERROR: GOOGLE_API_KEY not set (checked $ENV_FILE and environment)." >&2
  exit 1
fi

LOG_DIR="$(dirname "$0")/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/generate-$(date +%Y-%m-%d).log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Monday's date (Sunday + 1 day). Override with the MONDAY_DATE env var when
# running the pipeline manually on a day other than Sunday.
MONDAY_DATE=${MONDAY_DATE:-$(date -v+1d +%Y-%m-%d)}
BRANCH="briefing/${MONDAY_DATE}"
PLAYLIST_URL="https://www.youtube.com/playlist?list=PL1FeClOi-gXpoHHLPfOgeGltGMNWY9Wjk"

# How many days of podcasts to scan. Default 7 (normal weekly run). Bump this for a
# catch-up run after being away: e.g. `LOOKBACK_DAYS=21 ./scripts/generate-weekly.sh`
# after 3 weeks off. Exported so both podcast extractors (Stages 3a/3b) use one setting.
# NOTE: this widens the PODCAST window only. Bookmarks capture everything since the last
# run (dedup-based), and the playlist skill already looks back 14 days.
export LOOKBACK_DAYS=${LOOKBACK_DAYS:-7}

REPO="siguy/brief-signal"
INFO_AGG_DIR="$HOME/info-agg"
# Operate on the checkout this script actually lives in, NOT a hardcoded path.
# When run from a git worktree, the old `$HOME/brief-signal` sent every stage to
# the main checkout instead — so the worktree was silently bypassed, and Stage 4's
# `git checkout main` then failed because the main checkout already held `main`.
# REPO_ROOT is computed from $0 at the top of this file. In the launchd run it
# resolves to $HOME/brief-signal, so scheduled behaviour is unchanged.
BRIEF_SIGNAL_DIR="$REPO_ROOT"

# Return the checkout to a safe base. A branch can only be checked out in ONE
# worktree at a time, so inside a linked worktree `git checkout main` fails with
# "already used by worktree" whenever the main checkout holds main. Detaching at
# origin/main always works and leaves nothing half-switched. In the main checkout
# the first branch succeeds and behaviour is exactly as before.
checkout_base() {
  git checkout main 2>/dev/null || git checkout --detach origin/main
}

log "=== Brief Signal Weekly Generation ==="
log "Target date: ${MONDAY_DATE}"
log "Branch: ${BRANCH}"
log "Podcast lookback: ${LOOKBACK_DAYS} days"

# Guard: skip if PR already exists for this week
EXISTING_PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
if [ -n "$EXISTING_PR" ]; then
  log "PR #${EXISTING_PR} already exists for ${BRANCH}. Skipping."
  exit 0
fi

# ---------------------------------------------------------------------------
# Stages 1-3: Extract all sources.
# Stages 3a/3b run in parallel in background (node + python — no conflict).
# Stages 1/2 run SERIALLY in foreground after launching 3a/3b — when two
# `claude -p` subagents run as parallel bash subshells in the same parent
# script, they silently exit without producing output (cause unclear,
# possibly file-lock contention on ~/.claude/projects/ or settings.
# Verified empirically: serial works, parallel doesn't.) Serial cost is
# negligible because the slower 3a/3b run in parallel underneath.
# ---------------------------------------------------------------------------
log "--- Starting extractions ---"

# Record pipeline start (used by freshness check below)
PIPELINE_START_EPOCH=$(date +%s)

# Stage 3a: Extract YouTube podcasts (background)
(
  log "Stage 3a: Extracting YouTube podcasts..."
  cd "$BRIEF_SIGNAL_DIR"
  if node scripts/extract-podcasts.js >> "$LOG_FILE" 2>&1; then
    log "Stage 3a complete: YouTube podcasts extracted."
  else
    log "WARN: Stage 3a failed (YouTube podcast extraction). Continuing..."
  fi
) &
PID_PODCASTS_YT=$!

# Stage 3b: Extract RSS podcasts (background)
(
  log "Stage 3b: Extracting RSS podcasts (Acquired, mlx-whisper)..."
  cd "$BRIEF_SIGNAL_DIR"
  if python3 scripts/extract-rss-podcasts.py >> "$LOG_FILE" 2>&1; then
    log "Stage 3b complete: RSS podcasts extracted."
  else
    log "WARN: Stage 3b failed (RSS podcast extraction). Continuing..."
  fi
) &
PID_PODCASTS_RSS=$!

# Stage 1: Extract X bookmarks (SERIAL — foreground, do not background)
log "Stage 1: Extracting X bookmarks (foreground, serial)..."
(
  cd "$INFO_AGG_DIR"
  claude -p --dangerously-skip-permissions --no-session-persistence "Run /extract-bookmarks"
) >> "$LOG_FILE" 2>&1 && log "Stage 1 complete: bookmarks extracted." \
                    || log "WARN: Stage 1 failed (bookmark extraction). Continuing..."

# Stage 1b: Enrich bookmarks with linked-article content (deterministic safety
# net — the extract-bookmarks skill also runs this, but the call is idempotent
# so a second run only fetches anything still missing). This fetches the bodies
# of articles that bookmarks LINK OUT to, which fetch-bookmarks.py does not.
log "Stage 1b: Enriching bookmarks with linked-article content..."
(
  cd "$BRIEF_SIGNAL_DIR"
  python3 scripts/enrich-bookmarks.py
) >> "$LOG_FILE" 2>&1 && log "Stage 1b complete: linked articles enriched." \
                    || log "WARN: Stage 1b failed (bookmark enrichment). Continuing..."

# Stage 2: Extract YouTube playlist (SERIAL — foreground, do not background)
log "Stage 2: Extracting YouTube playlist (foreground, serial)..."
(
  cd "$INFO_AGG_DIR"
  claude -p --dangerously-skip-permissions --no-session-persistence "Run /extract-playlist $PLAYLIST_URL"
) >> "$LOG_FILE" 2>&1 && log "Stage 2 complete: playlist extracted." \
                    || log "WARN: Stage 2 failed (playlist extraction). Continuing..."

# Wait for background extractions to finish
log "Waiting for background extractions (Stages 3a/3b) to complete..."
wait $PID_PODCASTS_YT || true
wait $PID_PODCASTS_RSS || true

# Stage 3c: Lab news. Inline rather than backgrounded — it is four HTTP GETs and
# finishes in ~2s, which does not warrant a PID and a `wait`. The `|| log` is not
# decoration: under `set -e` an unwrapped failure here would abort the run before
# Stage 4, and a lab having a bad gateway must never cost us the briefing.
log "Stage 3c: Fetching lab news (Anthropic, OpenAI, DeepMind, Google Cloud)..."
node scripts/fetch-lab-news.js >> "$LOG_FILE" 2>&1 \
  && log "Stage 3c complete: lab news extracted." \
  || log "WARN: Stage 3c failed (lab news). Continuing..."

log "--- All extractions complete ---"

# ---------------------------------------------------------------------------
# Freshness check: refuse to generate a briefing with stale KB files.
# Each KB file must have been written AFTER the pipeline started. If not,
# the corresponding extraction stage silently failed and Stage 4 would
# otherwise produce a partly-stale briefing (last week's data) without
# warning. Fail loudly instead.
# ---------------------------------------------------------------------------
check_kb_fresh() {
  local pattern="$1"
  local latest
  latest=$(ls -t "$HOME/skills/${pattern}"-*.md 2>/dev/null | head -1)
  if [ -z "$latest" ]; then
    log "FRESHNESS FAIL: No ${pattern}-*.md file found in ~/skills/."
    return 1
  fi
  local mtime
  mtime=$(stat -f %m "$latest")
  if [ "$mtime" -lt "$PIPELINE_START_EPOCH" ]; then
    log "FRESHNESS FAIL: $(basename "$latest") is older than pipeline start — extraction stage didn't produce fresh data."
    return 1
  fi
  log "Freshness OK: $(basename "$latest")"
  return 0
}

STALE_KBS=""
check_kb_fresh "bookmarks-knowledge-base" || STALE_KBS="${STALE_KBS} bookmarks"
check_kb_fresh "playlist-knowledge-base"  || STALE_KBS="${STALE_KBS} playlist"
check_kb_fresh "podcasts-knowledge-base"  || STALE_KBS="${STALE_KBS} podcasts"

# Lab news is checked but NEVER gates the run. A week where no lab published
# anything is normal, and gating on it would recreate the bug fixed in PR #99
# (a source that ran and correctly found nothing blocking the pipeline).
#
# The check still runs, warn-only, because "quiet" and "crashed" need to stay
# distinguishable: fetch-lab-news.js always writes a file, so a MISSING or STALE
# one means the stage died — and generate-briefing.js accepts any KB up to 14
# days old, which would silently serve last week's headlines as this week's.
check_kb_fresh "labnews-knowledge-base" || log "WARN: lab news KB is stale or missing — Stage 3c likely failed. Continuing (lab news never gates the run)."

if [ -n "$STALE_KBS" ]; then
  log "ERROR: Refusing to generate briefing with stale KB(s):${STALE_KBS}"
  log "       Manually re-run the failed extraction(s) (e.g. via /extract-bookmarks or /extract-playlist) and re-run this script."
  log "       See feedback_briefing_kb_freshness_check.md and feedback_parallel_claude_p_race.md in project memory."
  exit 1
fi

# ---------------------------------------------------------------------------
# GCP playbook staleness check (warn-only). The playbook is Stage 4b's ground
# truth for product positioning; its claims go stale on a ~quarterly clock
# (Cloud Next renames, earnings-call proof stats). Parses the "Last verified:
# YYYY-MM-DD" line in content/gcp-playbook.md. Refresh procedure:
# ~/.claude/skills/refresh-gcp-playbook/SKILL.md (run /refresh-gcp-playbook).
# ---------------------------------------------------------------------------
PLAYBOOK_FILE="$BRIEF_SIGNAL_DIR/content/gcp-playbook.md"
PLAYBOOK_MAX_AGE_DAYS=90
if [ -f "$PLAYBOOK_FILE" ]; then
  PLAYBOOK_VERIFIED=$(grep -o 'Last verified: [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' "$PLAYBOOK_FILE" | head -1 | cut -d' ' -f3 || true)
  if [ -n "$PLAYBOOK_VERIFIED" ]; then
    VERIFIED_EPOCH=$(date -j -f %Y-%m-%d "$PLAYBOOK_VERIFIED" +%s 2>/dev/null || echo 0)
    AGE_DAYS=$(( ( $(date +%s) - VERIFIED_EPOCH ) / 86400 ))
    if [ "$VERIFIED_EPOCH" -eq 0 ]; then
      log "WARN: Could not parse playbook 'Last verified' date ('$PLAYBOOK_VERIFIED')."
    elif [ "$AGE_DAYS" -gt "$PLAYBOOK_MAX_AGE_DAYS" ]; then
      log "WARN: GCP playbook last verified ${AGE_DAYS} days ago (>${PLAYBOOK_MAX_AGE_DAYS}) — product claims may be stale. Run /refresh-gcp-playbook."
    else
      log "Playbook freshness OK: verified ${AGE_DAYS} days ago (${PLAYBOOK_VERIFIED})."
    fi
  else
    log "WARN: content/gcp-playbook.md has no 'Last verified: YYYY-MM-DD' line — staleness unknown. Run /refresh-gcp-playbook."
  fi
else
  log "WARN: content/gcp-playbook.md not found — Stage 4b will draft Our Play without ground truth."
fi

# ---------------------------------------------------------------------------
# Stage 4: Generate briefing (~5-10 min)
# ---------------------------------------------------------------------------
log "--- Stage 4: Generating briefing ---"
cd "$BRIEF_SIGNAL_DIR"
# Branch straight off the freshly fetched remote tip. The old
# `checkout main && pull && checkout -b` needed `main` checked out here, which a
# linked worktree cannot do while the main checkout holds it.
git fetch origin main
git checkout -b "$BRANCH" origin/main

# LINEUP_GATE=1 stops the run after Stage 4a: the lineup and the proposed theme
# registry are committed and a PR is opened for them, with no briefing written.
# Simon approves or edits the lineup, then expands it himself:
#   npm run redraft -- content/briefings/drafts/<date>-lineup.md
#
# Defaults OFF, deliberately. The gate is the right shape editorially — the
# selection is the decision and it should be reviewed before the prose exists —
# but a gated Sunday produces no edition until a human acts, so a busy Monday
# costs the week's briefing. Off by default means the reordered PR body (below)
# improves every unattended run immediately, while the hard stop stays opt-in
# until it has proven itself on a few weeks Simon chose to run it.
LINEUP_GATE=${LINEUP_GATE:-0}
if [ "$LINEUP_GATE" = "1" ]; then
  log "LINEUP_GATE=1 — Stage 4a only. No briefing will be drafted this run."
  if BRIEFING_DATE="$MONDAY_DATE" node scripts/generate-briefing.js --lineup-only >> "$LOG_FILE" 2>&1; then
    log "Stage 4a complete: lineup generated (no draft)."
  else
    log "ERROR: Stage 4a failed (lineup generation). Cleaning up."
    checkout_base
    git branch -D "$BRANCH"
    exit 1
  fi
elif BRIEFING_DATE="$MONDAY_DATE" node scripts/generate-briefing.js >> "$LOG_FILE" 2>&1; then
  log "Stage 4 complete: briefing generated."
else
  log "ERROR: Stage 4 failed (briefing generation). Cleaning up."
  checkout_base
  git branch -D "$BRANCH"
  exit 1
fi

# Snapshot the first draft before any human or critique-driven edits.
# This preserves the "before" half of every before/after pair so we can
# learn from corrections across editions. Use versioned naming so
# subsequent iterations (manual rewrites, post-feedback fixes) can each
# be snapshotted via scripts/snapshot-briefing.sh without overwriting.
#
# Find the briefing by mtime — NOT by re-computing today's date.
# generate-briefing.js uses Node's UTC date when naming the file; if this
# bash code re-computes the date moments later and UTC has crossed midnight,
# the two disagree and the snapshot looks for a nonexistent path. Reading
# the most-recently-modified .md file is robust to that race.
#
# In gate mode no briefing was written, so `ls -t` would return the PREVIOUSLY
# published edition and every stage below would snapshot, critique and lint last
# week's file under this week's name. Set the date from MONDAY_DATE instead and
# leave BRIEFING_FILE empty — the draft-only stages are skipped wholesale below.
if [ "$LINEUP_GATE" = "1" ]; then
  BRIEFING_FILE=""
  TODAY="$MONDAY_DATE"
  CRITIQUE_STATUS="skipped (lineup gate)"
  LINT_STATUS="skipped"
  DRAFT_FILE=""
fi

BRIEFING_FILE=${BRIEFING_FILE-$(ls -t content/briefings/*.md 2>/dev/null | grep -v '/drafts/' | head -1)}
if [ -n "$BRIEFING_FILE" ] && [ -f "$BRIEFING_FILE" ]; then
  TODAY=$(basename "$BRIEFING_FILE" .md)
  DRAFT_FILE="content/briefings/drafts/${TODAY}-v0-stage4.md"
  mkdir -p content/briefings/drafts
  cp "$BRIEFING_FILE" "$DRAFT_FILE"
  log "Stage 4 draft snapshot: $DRAFT_FILE"
elif [ "$LINEUP_GATE" = "1" ]; then
  log "Lineup gate: no draft to snapshot (expected)."
else
  log "WARN: No briefing file found in content/briefings/ after Stage 4 — skipping draft snapshot."
fi

# Critique pass: ask Gemini to score the draft against the prompt's quality
# rules. Exit 2 = hard rule failures (we still ship, but surface them in the
# PR body so review starts where it should). Exit 1 = critique itself errored.
# Critique-briefing.js defaults to the latest briefing if no date arg given,
# which is what we want — avoids the UTC-midnight date-race that broke this
# in a previous run.
CRITIQUE_MD="scripts/logs/critique-${TODAY:-latest}.md"

# Runs the critique and sets CRITIQUE_STATUS (pass / hard_failures / error).
# A function because the repair loop below re-runs it after a repair pass.
run_critique() {
  CRITIQUE_STATUS="unknown"
  if node scripts/critique-briefing.js >> "$LOG_FILE" 2>&1; then
    CRITIQUE_STATUS="pass"
    log "Critique: no hard failures."
  else
    local exit_code=$?
    if [ $exit_code -eq 2 ]; then
      CRITIQUE_STATUS="hard_failures"
      log "Critique: HARD failures detected — see $CRITIQUE_MD"
    else
      CRITIQUE_STATUS="error"
      log "WARN: Critique pass errored (exit $exit_code). Continuing without quality review."
    fi
  fi
}

# Runs the deterministic linter (mechanical rules, no LLM) and sets
# LINT_STATUS (pass / hard_failures / error).
run_lint() {
  LINT_STATUS="pass"
  node scripts/lint-briefing.js "${TODAY:-}" >> "$LOG_FILE" 2>&1 || {
    local exit_code=$?
    if [ $exit_code -eq 2 ]; then
      LINT_STATUS="hard_failures"
      log "Lint: HARD failures detected — see scripts/logs/lint-briefing.log"
    else
      LINT_STATUS="error"
      log "WARN: Linter errored (exit $exit_code). Continuing without lint."
    fi
  }
  # MUST be an `if`, not `[ ... ] && log`. Under `set -e` an AND-list that
  # evaluates false makes the function return 1, and run_lint is called as a
  # bare command — so a lint HARD FAILURE would abort the whole pipeline here:
  # no repair pass (Stage 4c below is then unreachable), no commit, no PR, and
  # the repo left on the briefing branch. The failure path is the one path that
  # must not be fatal, since surfacing failures in the PR is the entire point.
  if [ "$LINT_STATUS" = "pass" ]; then
    log "Lint: clean."
  fi
}

# Every check below reads a drafted briefing. Under the lineup gate there isn't
# one, so they are skipped as a block rather than each guarding itself — a lint
# run with no draft would grade the previously published edition.
if [ "$LINEUP_GATE" = "1" ]; then
  log "Lineup gate: skipping images, critique, lint and repair (no draft to check)."
else

# Fetch story images BEFORE lint so the image validity checks (magic bytes,
# size, existence) run against real files — and a failed fetch surfaces as a
# lint hard failure instead of a silently broken image on the live site.
npm run fetch-images >> "$LOG_FILE" 2>&1 || log "WARN: Some OG images failed to fetch."

log "Stage 4b: critique + lint..."
run_critique
run_lint

# Stage 4c: ONE repair pass when the DETERMINISTIC linter hard-fails, then
# re-verify. Deliberately not a loop — repeated LLM rewrites drift from the
# reviewed draft; whatever survives one repair goes to the human via the PR body.
#
# The LLM critique is ADVISORY and no longer triggers a repair. It still runs,
# and its full text still lands in the PR body — its coverage check is the most
# useful thing it produces. But it must not be able to fire an automated rewrite,
# for one structural reason and three demonstrated ones.
#
# Structural: an LLM grading an LLM's output, thereby triggering a third LLM to
# rewrite it, is a loop with no ground truth anywhere in it. lint-briefing.js
# checks facts about the file; the critique has opinions. Only one of those
# should be able to edit a draft unattended.
#
# Demonstrated (verified 2026-08-03 across all 12 logs in scripts/logs/):
#   1. Six critiques instruct the model to use "GEAP" (e.g. critique-2026-06-29,
#      critique-2026-05-18). lint-briefing.js:208 HARD-FAILS on that string —
#      the critique was actively directing repairs to produce a lint violation.
#   2. critique-2026-06-22:7-9 flags the "Where the GCP opportunity is" line as
#      product positioning to be removed. briefing-prompt.md:432 states in bold
#      that it is a permitted feature, "NOT a violation" — and :242 calls it
#      required.
#   3. Four critiques demand a "Try This Week" section. That section was retired;
#      it appears nowhere in the current prompt.
#
# In each case the critique grades against a rubric the prompt no longer uses,
# so acting on it moved the draft further from spec, not closer.
if [ "$LINT_STATUS" = "hard_failures" ]; then
  log "Stage 4c: repair pass (one shot)..."
  if node scripts/repair-briefing.js "${TODAY:-}" >> "$LOG_FILE" 2>&1; then
    log "Stage 4c repair applied. Re-verifying..."
    run_critique
    run_lint
  else
    log "WARN: Repair pass failed or was skipped — shipping draft with failures surfaced in PR."
  fi
fi

fi  # end: draft-only checks (skipped under LINEUP_GATE)

# ---------------------------------------------------------------------------
# Stage 5: Fetch OG images, commit, push, open PR
# ---------------------------------------------------------------------------
log "--- Stage 5: Committing and opening PR ---"

git add content/briefings/
if [ "$LINEUP_GATE" = "1" ]; then
  git commit -m "Add lineup for review: ${MONDAY_DATE}"
else
  git commit -m "Add briefing: ${MONDAY_DATE}"
fi
git push -u origin "$BRANCH"

# Read critique markdown if it exists so we can inline it in the PR body
CRITIQUE_SECTION=""
if [ -f "$CRITIQUE_MD" ]; then
  CRITIQUE_SECTION=$'\n\n'"$(cat "$CRITIQUE_MD")"
elif [ "$CRITIQUE_STATUS" = "error" ]; then
  CRITIQUE_SECTION=$'\n\n## 🤖 Automated Quality Review\n\n_Critique pass errored — review manually against the checklist in scripts/briefing-prompt.md._'
fi

# Editorial section — themes ↔ stories mapping + the full proposed registry,
# rendered by scripts/lineup-digest.js from the Stage 4a lineup (already committed
# alongside the draft); no separate log file to keep in sync.
#
# This goes FIRST in the PR body, ahead of the critique and the signal digest.
# It used to go last, behind ~270 lines of ratings table, which made it
# unreachable in practice — Simon's verdict on Edition #25 was "I just see the
# ratings." The ordering below is the fix, and it is the point of the section:
# the editorial decision leads, the mechanical sweeps support it.
#
# Missing lineup/proposed file = no section (the renderer prints nothing).
THEME_SECTION=""
LINEUP_FILE="content/briefings/drafts/${TODAY:-}-lineup.md"
THEMES_PROPOSED_FILE="content/briefings/drafts/${TODAY:-}-themes-proposed.md"
if [ -n "${TODAY:-}" ] && [ -f "$LINEUP_FILE" ]; then
  THEME_ARGS=(--lineup "$LINEUP_FILE")
  [ -f "$THEMES_PROPOSED_FILE" ] && THEME_ARGS+=(--themes "$THEMES_PROPOSED_FILE")
  if THEME_OUT=$(node scripts/lineup-digest.js "${THEME_ARGS[@]}" 2>&1) && [ -n "$THEME_OUT" ]; then
    THEME_SECTION=$'\n\n'"$THEME_OUT"
  else
    log "WARN: Lineup digest produced nothing — PR body will omit the themes section."
  fi
fi

# Braid ledger — did the draft actually weave in the bookmarks the lineup named?
# Stage 4a's `braids in:` field is the only place the pipeline records its own
# intent; nothing else compares that intent to the finished prose. Three
# outcomes: landed, substituted (the subject ran but was credited to a different
# source), and dropped. Advisory and never fatal — a story legitimately tightens
# while drafting, so this prompts a review rather than gating a run.
#
# Sits beside the theme section because both answer editorial questions about the
# lineup; the mechanical sweeps follow.
BRAID_SECTION=""
if [ -n "${TODAY:-}" ] && [ "$LINEUP_GATE" != "1" ]; then
  if BRAID_OUT=$(node scripts/braid-ledger.js --date "$TODAY" 2>/dev/null) && [ -n "$BRAID_OUT" ]; then
    BRAID_SECTION=$'\n\n'"$BRAID_OUT"
  else
    log "WARN: Braid ledger produced nothing — PR body will omit it."
  fi
fi

# Signal digest — the deterministic coverage sweep. It reads the KBs' own
# grades and the draft's own URLs (no model involved) and reports what did not
# get cited: first-party Google/competitor items, and HIGH editorial-signal
# podcast episodes. It replaces the self-audit Stage 4a used to write about
# itself. Advisory, and non-fatal: a digest that fails must not cost us the PR.
#
# Date comes from BRIEFING_FILE's basename, not MONDAY_DATE: generate-briefing.js
# names the file from Node's UTC date, which can differ by a day on a late-evening
# run (see the note above BRIEFING_FILE). BRIEFING_FILE is resolved by `ls -t`, so
# it is the one value guaranteed to name the file that actually got written.
#
# Collapsed behind a <details>. It runs to several hundred lines — long enough
# that inline it buries everything after it, which is exactly what happened to
# the theme registry section before this change. It stays in the PR because it
# is the only place that answers "what did we never even consider?", but it is a
# lookup table, not a read-through.
#
# Under the lineup gate there is no draft, so the sweep runs against the lineup
# instead: "what did Stage 4a leave on the floor?" — which is the whole question
# at the gate, and the one moment where acting on the answer is still cheap.
SIGNAL_SECTION=""
SIGNAL_DATE=$(basename "${BRIEFING_FILE:-}" .md)
if [ "$LINEUP_GATE" = "1" ]; then
  SIGNAL_ARGS=(--date "$MONDAY_DATE" --lineup "$LINEUP_FILE")
else
  SIGNAL_ARGS=(--date "$SIGNAL_DATE")
fi
if SIGNAL_OUT=$(node scripts/signal-digest.js "${SIGNAL_ARGS[@]}" 2>&1); then
  SIGNAL_SECTION=$'\n\n<details>\n<summary><b>📊 Signal digest</b> — every graded item, and whether it reached the edition</summary>\n\n'"$SIGNAL_OUT"$'\n\n</details>'
else
  log "WARN: Signal digest failed. Continuing without it."
  SIGNAL_SECTION=$'\n\n## Signal digest\n\n_Digest failed to run — check the log, then `npm run signal` by hand._'
fi

if [ "$LINEUP_GATE" = "1" ]; then
  PR_TITLE="Lineup for review: Week of ${MONDAY_DATE}"
  PR_BODY="$(cat <<PREOF
## Story lineup for review — ${MONDAY_DATE}

**No briefing has been drafted yet.** Stage 4a planned this lineup and stopped, so
the selection is still cheap to change — that is the entire point of this PR.

### What to do
1. Read the themes ↔ stories section below, then \`${LINEUP_FILE}\`.
2. Check the signal digest for anything HIGH that was left out.
3. Edit the lineup file directly if the selection is wrong — add, cut, or re-merge stories.
4. Expand it into the edition:
   \`\`\`
   npm run redraft -- ${LINEUP_FILE}
   \`\`\`
   The draft lands on this same branch; commit and push it, and this PR becomes the edition PR.

The lineup is the decision; the draft is only its execution. Everything below is here to
inform that one call.${THEME_SECTION}${SIGNAL_SECTION}
PREOF
)"
else
  PR_TITLE="Briefing: Week of ${MONDAY_DATE}"
  PR_BODY="$(cat <<PREOF
## Weekly AI Market Briefing — ${MONDAY_DATE}

Auto-generated by the Brief Signal pipeline.

### Review checklist
- [ ] Read through briefing for accuracy
- [ ] Check source links work
- [ ] Verify OG images loaded
- [ ] Edit any wording/tone issues
- [ ] Address any HARD failures from the automated quality review (below)

### Pipeline stages
- **Bookmarks:** Extracted via twikit (if missing, cookies may have expired — see docs/cookie-refresh.md)
- **Playlist:** Extracted via parallel stage (check log for warnings)
- **Podcasts (YouTube):** Extracted via parallel stage (check log for warnings)
- **Podcasts (RSS):** Acquired scraping + mlx-whisper transcription (check log for warnings)
- **Briefing:** Generated successfully
- **Critique:** ${CRITIQUE_STATUS} _(advisory — read it, but it does not trigger a repair; only deterministic lint does)_

### Learning loop
A copy of the unedited first draft is committed at \`${DRAFT_FILE}\`. After you edit and merge, \`git diff ${DRAFT_FILE} ${BRIEFING_FILE}\` shows exactly what was corrected — the corpus we use to improve the prompt over time.

### After merging
Run \`npm run audio:pr\` to generate the audio script and open a PR.
Subscriber email is sent when the audio PR is merged.${THEME_SECTION}${BRAID_SECTION}${CRITIQUE_SECTION}${SIGNAL_SECTION}
PREOF
)"
fi

gh pr create \
  --repo "$REPO" \
  --title "$PR_TITLE" \
  --body "$PR_BODY"

log "PR created. Returning to base."
checkout_base
log "=== Done ==="
