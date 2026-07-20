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

### Feedback from Edition #22 review (2026-07-20)

- **Before locking story selection, scan the podcast KB's HIGH-signal AND deep-dive episodes for major
  model releases — don't let the bookmark-lead theme crowd out a bigger podcast-sourced story.** Edition
  #22 led with Inkling (bookmark-driven) and *missed Kimi K3 entirely*, even though the podcast KB had a
  full deep-dive episode ("Is Kimi K3 Really Fable Class?") on it. Kimi K3 — the first open model to top
  *every* proprietary model on a real benchmark (Vercel) — was the sharper story. Simon: *"are these truly
  the biggest stories right now? What about the recent Kimi release? how can we miss that?"* **Rule:** a
  major frontier/open model release (new SOTA, first-to-beat-proprietary, big benchmark movement) is almost
  always a lead candidate. `grep -i` the podcast + bookmark KBs for model names (Kimi/Moonshot, Qwen, GLM,
  DeepSeek, Llama, Gemini, GPT, Claude/Fable, Grok, Inkling, etc.) and check the deep-dive episodes before
  finalizing the lineup.
- **Related releases belong in ONE story, not scattered or dropped.** Simon: *"how is the kimi story not
  part of the thinking machines situation? It is related."* Inkling (US open) + Kimi K3 (China open) are the
  same "open weights surge" beat — merge them and use the tension (Inkling pitched escaping Chinese open
  weights; Kimi K3 shows those weights just leapfrogged the frontier). When two items share a thesis, one
  synthesized story beats two thin ones.
- **A Founder Watch item is a short story with NO "Your angle with founders" block.** Simon moved Curative
  from Big Picture to Founder Watch: *"Curative — is a shorter founder watch story — cut the Your angle with
  founders."* Big Picture stories get the full angle treatment; Founder Watch is a tight 3–5 sentence
  vignette (what happened + why founders care), no angle block. Pair thematically-linked founder stories
  (Replit + Curative = both "self-driving company / SaaS-replacement").
- **"Our Play" must be strong AND short — one sharp framing + a few concrete GCP motions, not two padded
  sub-sections.** Simon: *"Our play is very weak. Need to strengthen and shorten that."* Each bullet names a
  specific play (e.g. "Lead with Model Garden, not a single model"), the actual product surface, and the
  seller motion. Cut generic capability lists and anything that risks a capacity/energy overclaim.

### Feedback from Edition #21 review (2026-07-06)

- **Not every Big Picture story earns a "Your angle with founders" block — only ones with genuine
  seller relevance.** Simon on the nuclear/energy story: *"we dont sell power. there is no 'power
  angle' with founders. This is important market information, but you need to decide if there is any
  relevance for the story to a cloud hyperscaler OR a seller at a frontier AI lab. There is not here
  therefore you should [not] have this 'Your angle with founders'. Remember this!"* **The test:**
  before writing an angle block, ask whether a GCP hyperscaler rep OR a frontier-lab seller can
  actually *do* something with this story in a founder meeting. If it's important context but there's
  no seller play (energy/power supply is the canonical example — neither a cloud nor a lab sells
  power), keep the story as market context and DROP the angle block entirely. Never manufacture a
  founder angle just to fill the template. Composes with [[feedback_angle_structure_for_sales]]
  (which governs the angle's structure *when there is one*). See
  [[feedback_angle_only_when_seller_relevant]].

- **Cut interesting-but-not-actionable stories on review.** Simon removed "Prompting Fable 5" and the
  YC "40-year-old solo founder / Ploy" item — both engaging, neither giving a GCP seller something to
  use. Reinforces the Edition #20 rule below about demoting/cutting pure-trend items.

- **Verify video/source IDs — the podcast KB can transpose them.** The No Priors Valor Atomics episode
  was stored as `5Xvbq_zvO4Q` (all thumbnails 404); the real ID is `5Xvbq_zvOQ4` (last 3 chars
  transposed). That broke every citation link in the story AND the OG image. `yt-dlp "ytsearch:<title>"`
  recovers the real ID. When an OG image falls back to a placeholder, the underlying source link is
  probably dead too — fix both, don't just swap the image.

### Feedback from Edition #20 review (2026-06-29) — the recurring failure modes

Simon's point-by-point review exposed the same root problem repeatedly: **content that
doesn't survive the "what does this actually mean / why are we saying this?" test.**
Concrete rules:

- **Never name a specific GCP product or SKU to sound concrete unless you can justify
  why THAT one and why it's relevant.** The generator reached for "Cloud TPU v5e/A3 VMs"
  repeatedly — Simon: "Why are you talking about the fifth generation of TPUs here and
  throughout? Not exactly relevant." Naming a specific generation/SKU you can't defend
  reads as filler and is often wrong or off-strategy. Default to the strategic play;
  only name a product when the source or the customer's actual situation makes it the
  obvious fit. See [[feedback_no_unjustified_product_specificity]].

- **Every founder-facing question must be answerable BY the founder and about decisions
  THEY control.** Banned: asking a startup founder about supply-chain dynamics they don't
  influence — "how many GPUs short are you next quarter?", "what's your strategy for
  securing scarce HBM?" Founders don't buy HBM or allocate GPU fabs. Ask about what they
  decide: model strategy, cost/burn, capacity commitments, where their context lives.
  See [[feedback_founder_question_quality]].

- **One question = one idea.** Don't mash two unrelated asks together (token-spend-as-%-
  of-budget AND GPU shortage in one breath). Pick the sharper one.

- **No undefined jargon or cutesy coinages.** "Slack scar tissue" meant nothing to Simon.
  Say the plain thing: the undocumented decisions, exceptions, and tribal knowledge living
  in chat history. Extends [[feedback_sales_grade_concreteness]].

- **Define every acronym on first use.** "HBM" must be spelled out (High Bandwidth Memory)
  the first time it appears. Don't write "HBM memory" (redundant).

- **Verify implausible/garbled claims against the KB before shipping; fix from source or
  cut — don't ship nonsense.** "GLM 5.2 surpassed GPT-5.4 in every Gemini model" was a
  generation error (no "GPT-5.4" in the source). Real claim: GLM 5.2 surpasses Google's
  Gemini models in specific areas, top open-weight score, trails Claude Opus 4.8 by <1pt,
  ~85% cheaper than GPT 5.5. (Companion to the hallucination rule above — that one says
  don't delete true claims; this one says don't ship garbled ones, fix them from source.)

- **Cut low-value tack-on CTAs.** Generic "Conversation starter:" lines and the "Try This
  Week" share-prompt add no signal — Simon removed them. If a section needs a prompt, it
  must be specific and earn its place.

- **"Our Play" must give concrete GCP execution detail — HOW you'd actually build/run it —
  not market-reaction quotes.** Worse, the FOMO/20VC "verticalize and own our infra to
  avoid paying AWS/Google Cloud" quote argued AGAINST using cloud, undercutting the pitch.
  Cut market-reaction tangents; spend the words on the architecture and the motion.
  See [[feedback_our_play_execution_detail]].

- **Cut sections that don't earn their length — especially dev-trend stories with no
  seller action.** Simon cut the whole "Spaghetti Code / Meta-Cognition" Builder's Corner
  item ("doesn't add to this one, and it's already long") and demoted "Continual Learning
  & KV Cache" to a one-line Quick Hit. Dev-workflow/research-trend stories are interesting
  but often give a GCP rep nothing to *use* in a founder meeting. Default: lead with
  seller-actionable stories; demote or cut pure-trend items, and a long edition is a signal
  to trim, not to keep everything. Reinforces [[feedback_edition_story_selection_and_framing]].

## Pipeline

- **The freshness gate false-positives on Monday manual runs.** When the Sunday auto-run
  already extracted everything and Monday finds nothing new, the bookmark/playlist KBs
  carry Sunday's date and the mtime-based gate flags them as stale. They're current. Run
  Stage 4+ by hand (see `feedback_pipeline_empty_playlist_manual_run`). Possible real fix:
  compare KB mtime to the *last edition's* date, not this run's start.

- **The two podcast stages write different-dated KB files and only one reaches the briefing.**
  `extract-podcasts.js` (YouTube) names its KB with the **UTC** date
  (`getTodayDate()` = `new Date().toISOString()`), while `extract-rss-podcasts.py` (RSS)
  uses the **local** date (`datetime.now()`). The RSS script is *designed to append to the
  same-dated file the YouTube stage created* (it checks `if kb_path.exists(): append`), so
  on the same date they merge into one combined `podcasts-knowledge-base-<date>.md`. But the
  Sunday 9 PM launchd run is always past midnight UTC, so YouTube writes `<Monday>.md` and
  RSS writes `<Sunday>.md` — two separate files. `generate-briefing.js` reads only the
  single newest-by-mtime podcasts file, so whichever stage finishes LAST wins and the other
  podcast source is silently dropped. Seen 2026-06-28: YouTube (26 eps, 8 HIGH, 3 deep
  dives) was dropped in favor of the RSS-only file. **Workaround for a run:** merge the two
  files into the newest one before generating (append RSS episode bodies onto the YouTube
  KB, move the standalone RSS file aside). **Durable fix:** make both scripts compute the
  date the same way — change `extract-podcasts.js` `getTodayDate()` to use the LOCAL date so
  it matches the RSS script, so they always converge on one file. (Flag to Simon before
  changing pipeline code.)

- **The bookmark KB was truncating full post text and never reading linked articles.**
  Fixed 2026-06-15: `scripts/enrich-bookmarks.py` fetches linked-article bodies; the
  `extract-bookmarks` skill now forbids truncation and requires surfacing
  `external_content`. See `project_bookmark_article_enrichment` in memory.

- **Commits must use the GitHub noreply email or pushes are rejected.** The repo had
  no local git identity, so manual commits fell back to `simon.brief@gmail.com` and
  GitHub rejected the push ("email privacy restrictions"). Use
  `1133450+siguy@users.noreply.github.com` for author + committer. Fixed 2026-06-22 by
  setting `git config user.email` locally in the repo; if it recurs, amend with
  `git -c user.email=<noreply> commit --amend --reset-author --no-edit`.

- **Expired Claude CLI OAuth silently kills Stages 1 & 2 (bookmarks + playlist).**
  Both stages run `claude -p "Run /extract-..."`. The headless CLI uses the OAuth
  token in the macOS Keychain (`Claude Code-credentials`), and when it expires
  `claude -p` returns `401 Invalid authentication credentials` and the stages log a
  WARN and continue — so the run looks healthy until the freshness gate fails on two
  sources. Seen 2026-06-28: token expired 2026-06-22 and headless mode did not
  auto-refresh. **Fix (only Simon can do):** re-login from an interactive terminal
  (`claude` → `/login`). **Workaround for a given run:** these extractions don't need
  `claude -p` — run the `/extract-bookmarks` and `/extract-playlist` skills as Agent
  subagents inside an already-authenticated session (they just call
  `fetch-bookmarks.py` / `yt-dlp` + format the KB), then finish Stage 4+ by hand.
  Check token expiry with: `security find-generic-password -s "Claude Code-credentials" -w`.

- **`npm run audio:generate` writes the MP3 but does NOT commit or PR it.** The script
  lives only on the `audio/<date>` branch (audio:pr returns you to main after creating
  it). To generate the MP3: checkout `audio/<date>`, `source .env`, run
  `npm run audio:generate`, then commit + push the `.mp3` onto that same branch so it
  joins the existing audio PR. Merging that PR ships script + MP3 and the new `.mp3`
  triggers the subscriber email.

- **Always proofread the audio script for acronym mispronunciations before generating the
  MP3.** The `audio:pr` generator expanded "GEAP" to the phonetic **"Jeep"** (the car) —
  "or Jeep, internally", "store on Jeep", "Jeep's Model Garden", "Bedrock to Jeep
  migrations" (Edition #20). The TTS reads the script verbatim, so this would have shipped
  as audio saying "Jeep." Fix: spell new/ambiguous acronyms letter-by-letter the way the
  script already does for others (A-I, H-B-M, A-I-U-C, L-L-M) — i.e. `G-E-A-P` — or after
  first mention just say "the platform." Durable fix worth doing: add a rule to
  `scripts/audio-script-prompt.md` to render GEAP as "G-E-A-P" (never "Jeep") and to spell
  unfamiliar acronyms as letters. Scan every script for the brand/product names of the week
  before running `audio:generate`.

- **A thin-bookmark week is a red flag to check the raw JSON, NOT proof the week was quiet.**
  `fetch-bookmarks.py` dedups against the last `DEDUP_WEEKS=4` of `bookmarks-raw-*.json` files.
  If a prior run (e.g. Sunday's cron) fetched the week's bookmarks into `bookmarks-raw-<date>.json`
  but the KB-markdown build step failed (so no `bookmarks-knowledge-base-<date>.md` was written),
  the NEXT fetch sees all those entries as dupes and reports "New bookmarks: 2" — silently masking
  ~100 stranded entries. Seen 2026-07-06: 107 new bookmarks (06-29→07-05), including the **Alex
  Karp / Palantir "alpha transfer" sovereignty cluster that was THE lead story**, sat unused in
  `bookmarks-raw-2026-07-05.json` while I built the KB from today's 2-entry fetch and shipped a
  draft that buried the story. Simon caught it. **Rules:** (1) When bookmarks look implausibly thin,
  `ls -lt ~/info-agg/prompts/bookmarks-raw-*.json` and inspect the most recent file's entry count
  and date span before trusting "N new." (2) Rebuild the KB from whichever raw file actually holds
  the week's entries (filter to the current-week date window), not just today's fetch output.
  (3) Durable fix worth doing: make Stage 1 fail loudly when a raw file has fresh entries but no
  same-week KB markdown exists. See [[feedback_bookmark_dedup_masks_failed_kb_build]].

- **The GitHub Pages deploy flakes intermittently — re-running is safe and won't double-email.**
  Seen twice on 2026-07-06: the "Deploy to GitHub Pages" workflow built a valid artifact but the
  deploy step failed with `syncing_files → ##[error]Deployment failed, try again later.` (a
  GitHub-side transient, not a build break). Fix: `gh run rerun <id>` and re-watch. **Safe because
  the "Notify subscribers via Buttondown" step is idempotent** — `scripts/send-email.js` calls
  `alreadySent(title)` and skips if an email for that edition already exists in Buttondown, so a
  re-run does NOT send a second subscriber email. (Confirmed: the failed run sent email id
  `db717f9f`; the rerun's notify step found it and skipped.) Note the notify step is NOT gated on
  deploy success, so the email can go out even if the Pages deploy step later fails — a failed
  deploy still means subscribers were emailed; just re-run the deploy to get the site live.

- **Merged fixes to extraction scripts don't take effect until the cron machine's local
  `main` is fast-forwarded.** Stages 1–3 (bookmarks/playlist/podcasts) run from whatever is
  checked out in the working copy — the `git pull origin main` only happens later, inside
  Stage 4. Seen 2026-07-06: PR #55's podcast-date fix (align to local date) was merged to
  origin but the local `main` was 2 commits behind, so the Sunday 07-05 cron still ran the
  old UTC-dated `extract-podcasts.js` and the podcast KBs diverged again (07-05 RSS vs 07-06
  YouTube), needing a manual merge. Fixed for next run by fast-forwarding local main. **Rule:**
  before relying on a merged pipeline fix, confirm the pipeline machine's `main` is in sync
  with origin (`git rev-list --left-right --count main...origin/main` → `0  0`). Consider
  moving the `git pull` to the very top of `generate-weekly.sh`, before Stages 1–3.

- **`generate-briefing.js` (gemini-2.5-flash) can emit the whole briefing 2–3× in one
  response — a runaway repetition loop.** Seen 2026-07-20 (Edition #22): the model produced a
  complete briefing (frontmatter → body → `*Sources:*` line) and then RESTARTED from `---`
  frontmatter twice more, yielding a 5,518-word file with every `## ` heading appearing 3×. The
  script does no post-processing (`stripCodeFences` only) so the loop lands verbatim in
  `content/briefings/<date>.md`. **Detection:** after Stage 4, `grep -c '^## TLDR'` should be 1;
  a word count >~2,800 or repeated headings = a loop. **Fix for a run:** the FIRST copy is a
  complete, valid briefing — truncate the file to end at the first `*Sources: ...*` line (delete
  the restarted `---` frontmatter and everything after). Then re-run critique. **Durable fix worth
  doing:** add a de-dup guard to `generate-briefing.js` — after `stripCodeFences`, if a second
  `^---\ntitle:` or a duplicate `## TLDR` appears, cut everything from the first `*Sources:*` line
  onward; and/or set a `maxOutputTokens` cap. (Flag to Simon before changing pipeline code.)

- **`fetch-bookmarks.py` "New bookmarks: N" is the WHOLE-account not-recently-seen count, NOT
  this week's count.** Seen 2026-07-20: reported 2,292 "new" — it pulls the entire bookmark list
  and only dedups against the last 4 weeks of raw JSON, so N ≈ everything older than the raw-file
  history. The actual weekly set comes from filtering the raw by the `date` field at KB-build time
  (74 of 2,292 fell in the 2-week window). Don't mistake a big N for a big week; always date-filter.

- **`extract-podcasts.js` / `extract-rss-podcasts.py` `LOOKBACK_DAYS` is now env-overridable
  (default 7).** For gap-recovery (a skipped week) run both with `LOOKBACK_DAYS=14` so the podcast
  pull covers the full span. Change was minimal + backward-compatible; left uncommitted 2026-07-20
  pending Simon's review.
