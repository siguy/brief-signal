# Brief Signal — Lessons

Specific rules to prevent repeating mistakes. Review at the start of each session.

## Briefing editing

- **Never delete a specific factual claim as a "hallucination" without verifying it.**
  In Edition #18 I removed "Google paying SpaceX ~$920M/mo for NVIDIA GPUs," assuming
  it was a generator error because "SpaceX doesn't sell GPUs." It was true. Rule: if a
  sourced claim looks wrong, **flag it for Simon to verify and keep it (softened if
  needed) — do not silently delete it.** Only remove a claim if I can positively show
  it's false.

- **Simon's documented preferences override the automated critique.** The critique
  flagged "Where the GCP opportunity is" blocks in The Big Picture as a hard failure,
  but `feedback_angle_structure_for_sales` (Simon's standing rule) requires them. Follow
  the memory, and surface the conflict rather than obeying the critique blindly.

- **Don't write GCP's competitive position as a strawman.** I framed Seller's Edge as
  "sell certainty, not capacity / stop competing on cluster size." Simon corrected
  (2026-06-15): reps were never competing on raw cluster size. The real levers are
  **availability/capacity, price, flexibility, and ease of use** — availability IS a
  legitimate lever. The banned move is the raw-capacity *overclaim*, not competing on
  capacity at all. When writing sales framing, describe how GCP actually competes, not a
  caricature to knock down.

- **Single-source news is a review risk, not a publish blocker.** When a headline story
  rests on one source (e.g. AI Daily Brief for the Fable 5 government shutdown), add any
  independent corroboration available in the other KBs and explicitly flag the core claim
  for Simon to verify before merge.

## Pipeline

- **The freshness gate false-positives on Monday manual runs.** When the Sunday auto-run
  already extracted everything and Monday finds nothing new, the bookmark/playlist KBs
  carry Sunday's date and the mtime-based gate flags them as stale. They're current. Run
  Stage 4+ by hand (see `feedback_pipeline_empty_playlist_manual_run`). Possible real fix:
  compare KB mtime to the *last edition's* date, not this run's start.

- **The bookmark KB was truncating full post text and never reading linked articles.**
  Fixed 2026-06-15: `scripts/enrich-bookmarks.py` fetches linked-article bodies; the
  `extract-bookmarks` skill now forbids truncation and requires surfacing
  `external_content`. See `project_bookmark_article_enrichment` in memory.
