#!/bin/bash
set -euo pipefail

# Brief Signal — Snapshot the current briefing as the next lineage version.
#
# Usage:
#   ./scripts/snapshot-briefing.sh "short-description"
#   ./scripts/snapshot-briefing.sh "manual-rewrite"
#   ./scripts/snapshot-briefing.sh "post-feedback-iteration"
#
# Behavior:
#   - Finds today's briefing at content/briefings/YYYY-MM-DD.md
#   - Scans content/briefings/drafts/ for existing versions with that date
#   - Copies the current briefing to drafts/YYYY-MM-DD-vN-<description>.md
#     where N is the next available version number
#   - Stage 4's auto-snapshot uses v0; manual snapshots start at v1
#
# Convention:
#   v0 = Stage 4 first-draft output (auto-saved by generate-weekly.sh)
#   v1+ = subsequent iterations (manual rewrite, post-critique, post-feedback)
#
# The "after" version (what ships) is the file at content/briefings/YYYY-MM-DD.md
# at merge time. Diff any draft against that to see what was corrected.

if [ $# -lt 1 ]; then
  echo "Usage: $0 \"short-description-in-kebab-case\"" >&2
  echo "Example: $0 \"post-feedback-iteration\"" >&2
  exit 1
fi

DESCRIPTION="$1"
TODAY=$(date +%Y-%m-%d)
BRIEFING_FILE="content/briefings/${TODAY}.md"
DRAFTS_DIR="content/briefings/drafts"

# Allow override of the date — useful when iterating on a briefing whose
# filename doesn't match today (e.g., on Monday for Sunday's briefing).
if [ -n "${BRIEFING_DATE:-}" ]; then
  TODAY="$BRIEFING_DATE"
  BRIEFING_FILE="content/briefings/${TODAY}.md"
fi

if [ ! -f "$BRIEFING_FILE" ]; then
  echo "ERROR: No briefing found at $BRIEFING_FILE" >&2
  echo "Hint: pass BRIEFING_DATE=YYYY-MM-DD if iterating on a non-today briefing." >&2
  exit 1
fi

mkdir -p "$DRAFTS_DIR"

# Find next version number for this date
NEXT_VERSION=1
while [ -e "$DRAFTS_DIR/${TODAY}-v${NEXT_VERSION}-"*.md ] 2>/dev/null; do
  NEXT_VERSION=$((NEXT_VERSION + 1))
done
# Also count existing versioned files cleanly
EXISTING=$(find "$DRAFTS_DIR" -maxdepth 1 -name "${TODAY}-v*.md" 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXISTING" -gt 0 ]; then
  # Get highest existing version number and increment
  HIGHEST=$(find "$DRAFTS_DIR" -maxdepth 1 -name "${TODAY}-v*.md" -exec basename {} \; 2>/dev/null \
    | sed -n "s/^${TODAY}-v\([0-9]*\)-.*/\1/p" \
    | sort -n \
    | tail -1)
  if [ -n "$HIGHEST" ]; then
    NEXT_VERSION=$((HIGHEST + 1))
  fi
fi

DRAFT_FILE="$DRAFTS_DIR/${TODAY}-v${NEXT_VERSION}-${DESCRIPTION}.md"
cp "$BRIEFING_FILE" "$DRAFT_FILE"

echo "Snapshotted: $DRAFT_FILE"
echo ""
echo "Lineage for $TODAY:"
find "$DRAFTS_DIR" -maxdepth 1 -name "${TODAY}-v*.md" | sort
