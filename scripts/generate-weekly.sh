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

# Monday's date (Sunday + 1 day)
MONDAY_DATE=$(date -v+1d +%Y-%m-%d)
BRANCH="briefing/${MONDAY_DATE}"
PLAYLIST_URL="https://www.youtube.com/playlist?list=PL1FeClOi-gXpoHHLPfOgeGltGMNWY9Wjk"

REPO="siguy/brief-signal"
INFO_AGG_DIR="$HOME/info-agg"
BRIEF_SIGNAL_DIR="$HOME/brief-signal"

log "=== Brief Signal Weekly Generation ==="
log "Target date: ${MONDAY_DATE}"
log "Branch: ${BRANCH}"

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

if [ -n "$STALE_KBS" ]; then
  log "ERROR: Refusing to generate briefing with stale KB(s):${STALE_KBS}"
  log "       Manually re-run the failed extraction(s) (e.g. via /extract-bookmarks or /extract-playlist) and re-run this script."
  log "       See feedback_briefing_kb_freshness_check.md and feedback_parallel_claude_p_race.md in project memory."
  exit 1
fi

# ---------------------------------------------------------------------------
# Stage 4: Generate briefing (~5-10 min)
# ---------------------------------------------------------------------------
log "--- Stage 4: Generating briefing ---"
cd "$BRIEF_SIGNAL_DIR"
git checkout main
git pull origin main
git checkout -b "$BRANCH"

if node scripts/generate-briefing.js >> "$LOG_FILE" 2>&1; then
  log "Stage 4 complete: briefing generated."
else
  log "ERROR: Stage 4 failed (briefing generation). Cleaning up."
  git checkout main
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
BRIEFING_FILE=$(ls -t content/briefings/*.md 2>/dev/null | grep -v '/drafts/' | head -1)
if [ -n "$BRIEFING_FILE" ] && [ -f "$BRIEFING_FILE" ]; then
  TODAY=$(basename "$BRIEFING_FILE" .md)
  DRAFT_FILE="content/briefings/drafts/${TODAY}-v0-stage4.md"
  mkdir -p content/briefings/drafts
  cp "$BRIEFING_FILE" "$DRAFT_FILE"
  log "Stage 4 draft snapshot: $DRAFT_FILE"
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
CRITIQUE_STATUS="unknown"
if node scripts/critique-briefing.js >> "$LOG_FILE" 2>&1; then
  CRITIQUE_STATUS="pass"
  log "Stage 4b critique: no hard failures."
else
  CRITIQUE_EXIT=$?
  if [ $CRITIQUE_EXIT -eq 2 ]; then
    CRITIQUE_STATUS="hard_failures"
    log "Stage 4b critique: HARD failures detected — see $CRITIQUE_MD"
  else
    CRITIQUE_STATUS="error"
    log "WARN: Critique pass errored (exit $CRITIQUE_EXIT). Continuing without quality review."
  fi
fi

# ---------------------------------------------------------------------------
# Stage 5: Fetch OG images, commit, push, open PR
# ---------------------------------------------------------------------------
log "--- Stage 5: Committing and opening PR ---"
npm run fetch-images >> "$LOG_FILE" 2>&1 || log "WARN: Some OG images failed to fetch."

git add content/briefings/
git commit -m "Add briefing: ${MONDAY_DATE}"
git push -u origin "$BRANCH"

# Read critique markdown if it exists so we can inline it in the PR body
CRITIQUE_SECTION=""
if [ -f "$CRITIQUE_MD" ]; then
  CRITIQUE_SECTION=$'\n\n'"$(cat "$CRITIQUE_MD")"
elif [ "$CRITIQUE_STATUS" = "error" ]; then
  CRITIQUE_SECTION=$'\n\n## 🤖 Automated Quality Review\n\n_Critique pass errored — review manually against the checklist in scripts/briefing-prompt.md._'
fi

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
- **Critique:** ${CRITIQUE_STATUS}

### Learning loop
A copy of the unedited first draft is committed at \`${DRAFT_FILE}\`. After you edit and merge, \`git diff ${DRAFT_FILE} ${BRIEFING_FILE}\` shows exactly what was corrected — the corpus we use to improve the prompt over time.

### After merging
Run \`npm run audio:pr\` to generate the audio script and open a PR.
Subscriber email is sent when the audio PR is merged.${CRITIQUE_SECTION}
PREOF
)"

gh pr create \
  --repo "$REPO" \
  --title "Briefing: Week of ${MONDAY_DATE}" \
  --body "$PR_BODY"

log "PR created. Returning to main."
git checkout main
log "=== Done ==="
