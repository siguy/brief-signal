#!/usr/bin/env node

/**
 * Brief Signal — Gemini-powered briefing generator
 *
 * Reads knowledge base files from ~/skills/, loads the system prompt from
 * scripts/briefing-prompt.md, and calls Gemini to generate a weekly briefing.
 *
 * Requires: GOOGLE_API_KEY environment variable
 */

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
// One list of KB kinds, shared with the digest. Previously the prefixes were
// hardcoded in three places in this file alone, so adding a source meant three
// edits and missing one meant the file was filtered in but never selected.
const { KB_KINDS } = require("./signal-digest.js");

const SKILLS_DIR = path.join(process.env.HOME, "skills");
const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const PROMPT_PATH = path.join(__dirname, "briefing-prompt.md");
const THEMES_PATH = path.join(__dirname, "..", "content", "themes.md");
const MAX_AGE_DAYS = 14;

// Newest file of each kind within the freshness window.
//
// Return ORDER is prompt order (see the KB concatenation in buildPrompt), and
// KB_KINDS puts lab news first deliberately: it is by far the smallest KB and
// the only one whose entire justification is "this must get noticed". Last
// position in a ~136k-token prompt is the worst place for recall.
function findKnowledgeBaseFiles() {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const files = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => KB_KINDS.some((k) => f.startsWith(k.prefix)))
    .filter((f) => fs.statSync(path.join(SKILLS_DIR, f)).mtimeMs >= cutoff)
    // Newest first, so the `find` below picks the most recent of each kind.
    .sort(
      (a, b) =>
        fs.statSync(path.join(SKILLS_DIR, b)).mtimeMs -
        fs.statSync(path.join(SKILLS_DIR, a)).mtimeMs
    );

  return KB_KINDS.map((k) => files.find((f) => f.startsWith(k.prefix))).filter(Boolean);
}

// `--from-lineup <file>` runs Stage 4b ONLY, expanding a lineup you have already
// reviewed — and possibly edited by hand — into prose. This is the editorial
// approval gate: the lineup IS the decision, the draft is only its execution.
// Stage 4b already treats the lineup as an "Approved Story Lineup"; this flag is
// what finally lets a human do the approving.
//
// `--lineup-only` is the other half of that gate: it runs Stage 4a and STOPS,
// so the selection can be reviewed before any prose exists. Together the two
// flags make a stop/resume loop — `npm run lineup`, read it, edit it, then
// `npm run redraft -- <file>`. Without the stop, 4b expands the lineup moments
// after 4a writes it and the review necessarily happens after the fact.
function parseArgs(argv) {
  const args = { fromLineup: null, lineupOnly: argv.includes("--lineup-only") };
  const i = argv.indexOf("--from-lineup");
  if (i !== -1) {
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      console.error("ERROR: --from-lineup requires a path to a lineup file.");
      console.error("  Usage: npm run redraft -- content/briefings/drafts/YYYY-MM-DD-lineup.md");
      process.exit(1);
    }
    args.fromLineup = value;
  }
  // The two are opposites: one skips 4a, the other skips 4b. Asking for both is
  // a mistake worth catching loudly rather than silently honouring one.
  if (args.fromLineup && args.lineupOnly) {
    console.error("ERROR: --lineup-only and --from-lineup are mutually exclusive.");
    console.error("  --lineup-only plans a lineup; --from-lineup expands one that already exists.");
    process.exit(1);
  }
  return args;
}

// A lineup filename carries the edition date it belongs to
// (content/briefings/drafts/2026-08-03-lineup.md -> 2026-08-03). Deriving the
// target from the file itself — rather than from today's date or an env var — is
// what makes a redraft safe: it can only ever land on the edition its lineup
// names, so a stray re-run cannot overwrite a different week's briefing.
function targetDateFromLineup(lineupPath) {
  const match = path.basename(lineupPath).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// Written into a KB header by an extractor that ran successfully and found
// nothing (see EMPTY_MARKER in extract-podcasts.js / extract-rss-podcasts.py).
// A quiet source is not a failed source: the run proceeds with N-1, but the
// briefing must not imply it drew on a source that had nothing in it.
const EMPTY_MARKER_RE = /^>\s*\*\*Status:\*\*\s*EMPTY\b/m;

function isEmptyKb(content) {
  return EMPTY_MARKER_RE.test(content);
}

// excludeName skips one filename — used in redraft mode so the edition being
// rewritten isn't treated as its own predecessor.
function getLatestBriefing(excludeName) {
  if (!fs.existsSync(BRIEFINGS_DIR)) return null;
  const files = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f !== excludeName)
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return {
    name: files[0],
    content: fs.readFileSync(path.join(BRIEFINGS_DIR, files[0]), "utf-8"),
  };
}

function getNextEdition(latestBriefing) {
  if (!latestBriefing) return 1;
  const match = latestBriefing.content.match(/^edition:\s*(\d+)/m);
  return match ? parseInt(match[1], 10) + 1 : 1;
}

// Compact digest of the last few editions' leads so the generator can see the
// running macro-narrative arc (compute scarcity, open weights, SaaS→agents) and
// deliberately ADVANCE it rather than recycle or dodge it. See Repeat Prevention.
function getRecentLeads(n, excludeName) {
  if (!fs.existsSync(BRIEFINGS_DIR)) return "";
  const files = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f !== excludeName)
    .sort()
    .reverse()
    .slice(0, n);
  return files
    .map((f) => {
      const c = fs.readFileSync(path.join(BRIEFINGS_DIR, f), "utf-8");
      const ed = (c.match(/^edition:\s*(\d+)/m) || [])[1] || "?";
      const title = (c.match(/^title:\s*"(.+)"/m) || [])[1] || "(untitled)";
      const lead = (c.match(/^###\s+(.+)$/m) || [])[1] || "";
      return `- #${ed} (${f.replace(".md", "")}): ${title}${lead ? ` — lead: ${lead}` : ""}`;
    })
    .join("\n");
}

// Living Theme Registry (content/themes.md) — the curated set of recurring
// macro-narrative arcs (compute scarcity, open weights, sovereignty, etc).
// Fed to the Stage 4a lineup pass only, so the lineup can tag each candidate
// to the arc it advances and propose registry updates. Stage 4b just expands
// the approved lineup, so it doesn't need the raw registry itself.
function readThemeRegistry() {
  if (!fs.existsSync(THEMES_PATH)) return "";
  return fs.readFileSync(THEMES_PATH, "utf-8");
}

// Ground truth for product positioning ("Our Play" + "Where the GCP
// opportunity is" lines). Stage 4b-only, like the registry is 4a-only:
// the lineup pass writes rough seller-play one-liners that 4b re-derives,
// so feeding the playbook twice would just double the token cost.
const PLAYBOOK_PATH = path.join(__dirname, "..", "content", "gcp-playbook.md");

function readGcpPlaybook() {
  if (!fs.existsSync(PLAYBOOK_PATH)) return "";
  return fs.readFileSync(PLAYBOOK_PATH, "utf-8");
}

function getTodayDate() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function stripCodeFences(text) {
  // Gemini sometimes wraps the whole response in ```markdown ... ```
  return text.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

// stripCodeFences's trailing rule is anchored to end-of-string and can't tell a
// Gemini-added *outer* wrap apart from our own internal ```themes-proposed fence
// — which is often the literal last thing in the lineup response. Running it
// unconditionally silently eats that fence's closing marker (confirmed in a live
// dry run: the saved lineup file rendered as a dangling code block). Skip the
// trailing-strip whenever our marker is present; the leading strip (Gemini
// sometimes wraps the whole response in ```markdown) is still safe either way.
function stripLineupFences(rawLineup) {
  return rawLineup.includes("```themes-proposed")
    ? rawLineup.replace(/^```(?:markdown)?\s*\n?/i, "").trim()
    : stripCodeFences(rawLineup).trim();
}

// Stage 4a task: ask the model to plan the lineup before writing prose. This
// forces the Lead-Story Doctrine to run as an explicit selection step, and the
// lineup file that lands in the PR lets the reviewer check "is this the right
// set of stories?" before line-editing.
//
// REMOVED (2026-08-03): a "**HIGH-signal disposition:**" instruction that asked
// the model to list every HIGH podcast episode and where it landed. Do not
// reinstate it. A model auditing its own selection is not a check — in the
// 2026-08-03 baseline it listed 19 of the KB's 20 HIGH episodes and nothing
// caught the gap. It also cost ~35 lines per run TWICE over: stripRegistryFooter
// only strips from "**Proposed registry update:**" onward, so the block rode
// into Stage 4b as input as well.
//
// `npm run signal` now answers the same question deterministically — it reads
// the KB's grades and the draft's URLs and reports HIGH episodes that never got
// cited. generate-weekly.sh puts that output in the PR body, which is where the
// reviewer actually reads it.
function lineupTask(edition) {
  return `---

# YOUR TASK RIGHT NOW: produce a STORY LINEUP, not the briefing prose.

Apply the Lead-Story Doctrine from your instructions: model-release scan across ALL knowledge bases first; a lead is a datable EVENT, not a theme; merge same-thesis items and name the tension; count gravity; apply the seller-relevance test at selection time; and check what genuinely changed this week. Output ONLY the markdown below — no briefing, no preamble:

## Proposed Lineup — Edition #${edition}

**The Big Picture (exactly 2-3 stories, lead first):**
For each story:
1. **{story title}**
   - event: {the specific datable thing that happened this week — not a theme}
   - gravity: {N distinct KBs × M distinct shows/authors that surface it}
   - changed this week: {the new development, esp. vs. any prior edition on this theme}
   - merges: {what's merged + the tension, or "single"}
   - seller play: {one line, or "context-only — no angle"}
   - advances: {the Theme Registry arc this story moves forward, by name} OR NEW THREAD — candidate theme? {a name, or "one-off, no arc"}
   - braids in: {the bookmark handles/items from the X KB this story will weave in alongside its podcast anchors — or "none available in KB"}

**Why the lead beats the runner-up:** {one line}

**Continuity:** {which recurring arc from the recent-edition leads this edition advances and how it moves forward — or "new thread"}

**Quick Hits (3-6 candidates):**
- {one-liner} — {source}

**Considered but cut (and why):**
- {story} — {no seller play / no new development / too old / thin / already led a prior edition}

**Model-release coverage self-check:** list EVERY major model release or benchmark milestone found anywhere in the KBs, and where each landed (lead / big picture / quick hit / cut). Nothing major may be silently dropped — this is how we avoid missing a release like Kimi K3.

**Proposed registry update:** if no "## Theme Registry" section was provided to you above, write "No registry provided this run" and skip straight to your Quick Hits — do not fabricate one. Otherwise: the registry informs selection — it never gates it (a new thread or standalone one-off may always lead on its own merits). For each Theme Registry arc that led or advanced this edition, one line: {theme name} — moved to: {new one-line "where it stands"}. Then, only where earned, list births and retirements:
- NEW THEME: {name} — {why it earns a slot: gravity across ≥2 sources AND plausible staying power, not a one-off}
- RETIRE (→ dormant): {name} — {hasn't led in ~4-5 editions}
If nothing changed, write "No registry changes this edition."

**Full proposed registry:** skip this entirely if no registry was provided above. Otherwise, immediately after, output the ENTIRE updated file byte-for-byte as given to you above, changed only where earned — not just the theme entries. This means: reproduce the header/intro, the discipline rules, the status legend, EVERY existing theme (edited only if it led or advanced this edition, otherwise unchanged verbatim), any new births, AND any trailing notes/appendix section (e.g. "Notes & open judgment calls") — all unchanged unless this edition's news specifically bears on them. Do not drop a section just because it isn't a theme entry. Wrap the whole thing EXACTLY like this, with nothing else inside the fence:

\`\`\`themes-proposed
<!-- PROPOSED — do not merge directly. Simon reviews and promotes this to content/themes.md on PR approval. -->
{full registry markdown, same structure as the current content/themes.md}
\`\`\``;
}

// Stage 4b only needs the story selection to expand into prose — never the
// registry admin footer (proposed update + the full themes.md block, which can
// run several KB and has its own "## " headings right before "generate a
// complete briefing"). The saved lineup file keeps the footer for the reviewer.
function stripRegistryFooter(lineupText) {
  return lineupText.replace(/\n\*\*Proposed registry update:\*\*[\s\S]*$/, "").trimEnd();
}

// Pulls the fenced ```themes-proposed block out of a raw Stage 4a lineup
// response. Must run on the RAW response, before stripCodeFences — that
// function's trailing-fence regex is anchored to end-of-string and would eat
// this block's closing fence if it runs first, since the registry block is
// the last thing in the lineup output.
//
// Returns "" (skip, non-fatal) if the fence is missing, unclosed, or looks
// truncated (no theme heading inside) rather than writing a partial file.
function extractProposedThemes(lineupText) {
  const match = lineupText.match(/```themes-proposed[ \t]*\r?\n([\s\S]*?)```/);
  if (!match) return "";
  const content = match[1].trim();
  if (!content || !/^##\s+/m.test(content)) return "";
  return content;
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Guard against a Gemini repetition loop.
 *
 * A single briefing is: frontmatter (`---\ntitle: ...`) -> body -> a trailing
 * `*Sources: ...*` line. On 2026-07-20 (Edition #22) the model produced one
 * complete briefing and then RESTARTED from the frontmatter two more times,
 * yielding a 5,518-word file where every `## ` heading appeared 3x.
 *
 * Detection: anchor on the FIRST `*Sources: ...*` line (the end of the first
 * complete copy). If a second frontmatter block (`---\ntitle:`) OR a duplicate
 * `## TLDR` heading appears anywhere after it, the response looped — truncate
 * to end at that first `*Sources:` line (inclusive). Logs a WARN with pre/post
 * word counts so the loop is visible in generate-weekly.sh's run log.
 */
function truncateRepetition(text) {
  // First `*Sources: ...*` line = end of the first complete briefing.
  const sources = text.match(/^\*Sources:.*$/m);
  if (!sources) return text; // No sources line: can't safely locate a copy boundary.

  const firstCopyEnd = sources.index + sources[0].length;
  const after = text.slice(firstCopyEnd);

  const dupFrontmatter = /^---\s*\r?\ntitle:/m.test(after);
  const dupTldr = /^##\s+TLDR\b/im.test(after);
  if (!dupFrontmatter && !dupTldr) return text; // No duplication: leave as-is.

  const truncated = text.slice(0, firstCopyEnd).replace(/\s+$/, "") + "\n";
  const preWords = countWords(text);
  const postWords = countWords(truncated);
  const trigger = dupFrontmatter ? "duplicate frontmatter block" : "duplicate ## TLDR heading";
  console.warn(
    `WARN: Repetition loop detected (${trigger}) after the first *Sources:* line — ` +
      `truncated to the first complete briefing. ` +
      `Word count: ${preWords} -> ${postWords} (removed ${preWords - postWords}).`
  );
  return truncated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const redraft = Boolean(args.fromLineup);

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GOOGLE_API_KEY environment variable is not set.");
    process.exit(1);
  }

  if (redraft && !fs.existsSync(args.fromLineup)) {
    console.error(`ERROR: Lineup file not found: ${args.fromLineup}`);
    process.exit(1);
  }

  // 1. Load system prompt
  if (!fs.existsSync(PROMPT_PATH)) {
    console.error(`ERROR: System prompt not found at ${PROMPT_PATH}`);
    process.exit(1);
  }
  const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");

  // 2. Find knowledge base files
  const kbFiles = findKnowledgeBaseFiles();
  if (kbFiles.length === 0) {
    console.error(
      `ERROR: No knowledge base files found in ${SKILLS_DIR} from the last ${MAX_AGE_DAYS} days.`
    );
    process.exit(1);
  }
  // 3. Read knowledge base content, separating sources that ran but found
  //    nothing. Those still count as healthy — the run proceeds with N-1 —
  //    but the briefing must not imply it drew on an empty source.
  const kbRead = kbFiles.map((f) => {
    const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
    return { name: f, content, empty: isEmptyKb(content) };
  });
  const emptyKbs = kbRead.filter((k) => k.empty).map((k) => k.name);
  const liveKbs = kbRead.filter((k) => !k.empty);

  console.log(`Found ${kbFiles.length} knowledge base file(s):`);
  kbRead.forEach((k) => console.log(`  - ${k.name}${k.empty ? "  (EMPTY — ran, nothing new)" : ""}`));
  if (emptyKbs.length) {
    console.log(
      `NOTE: ${emptyKbs.length} source(s) ran with nothing new; drafting from ${liveKbs.length}.`
    );
  }
  if (liveKbs.length === 0) {
    console.error("ERROR: Every knowledge base is empty — nothing to write a briefing from.");
    process.exit(1);
  }

  const kbContent = liveKbs
    .map((k) => `## Source: ${k.name}\n\n${k.content}`)
    .join("\n\n---\n\n");

  // Named in the Stage 4b user message so the trailing *Sources:* line the
  // model writes (parsed by build.js into the site footer) reflects the
  // sources that actually contributed, not the ones that merely ran.
  const emptySourceNote = emptyKbs.length
    ? `\n\n## Sources with nothing new this week\n\nThese ran successfully but had no new items, so nothing below draws on them. Do NOT list them in the trailing *Sources:* line:\n${emptyKbs.map((f) => `- ${f}`).join("\n")}`
    : "";

  // 4. Get previous briefing for context
  const today = getTodayDate();
  // Filename uses the TARGET edition date (BRIEFING_DATE — generate-weekly.sh sets it
  // to MONDAY_DATE), not the run date, so a run never files under the wrong date.
  // In redraft mode the date comes from the lineup filename instead, so a redraft
  // can only ever land on the edition its own lineup names.
  const targetDate = redraft
    ? targetDateFromLineup(args.fromLineup) || process.env.BRIEFING_DATE
    : process.env.BRIEFING_DATE || today;
  if (!targetDate) {
    console.error(
      `ERROR: Could not determine the target date. Lineup filename must start with YYYY-MM-DD ` +
        `(got "${path.basename(args.fromLineup)}"), or set BRIEFING_DATE explicitly.`
    );
    process.exit(1);
  }
  const targetName = `${targetDate}.md`;
  const outputPath = path.join(BRIEFINGS_DIR, targetName);

  // A redraft regenerates an edition that already exists, so that edition must be
  // EXCLUDED from "previous briefing" context — otherwise the model is told not to
  // repeat the very edition it is rewriting, and the edition counter advances. That
  // is exactly how the 2026-08-03 re-run produced a lineup headed "Edition #25" for
  // the briefing shipped as #24.
  const latest = getLatestBriefing(redraft ? targetName : null);
  const existingEdition = fs.existsSync(outputPath)
    ? (fs.readFileSync(outputPath, "utf-8").match(/^edition:\s*(\d+)/m) || [])[1]
    : null;
  const edition =
    redraft && existingEdition ? parseInt(existingEdition, 10) : getNextEdition(latest);

  // Guard: never clobber a published edition. A stray or scheduled re-run landing on a
  // shipped edition's date would otherwise overwrite it — as happened when a v2 re-run
  // wrote Edition #23 over the shipped #22 in 2026-07-20.md. Fail fast, before any
  // Gemini calls. FORCE_OVERWRITE=1 to deliberately regenerate the same edition in place.
  // A redraft is exempt because replacing that exact edition is its whole purpose — and
  // it is safe for a different reason: its target comes from the lineup filename, not
  // from today's date, and the version it replaces is preserved in drafts/ (step 8).
  // Lineup-only is exempt for the simplest reason: it never writes outputPath, so
  // there is nothing to clobber. Planning next week's lineup must not be blocked by
  // the presence of a briefing it cannot touch.
  if (fs.existsSync(outputPath) && !redraft && !args.lineupOnly && !process.env.FORCE_OVERWRITE) {
    console.error(
      `ERROR: content/briefings/${targetDate}.md already exists (Edition #${existingEdition || "?"}). ` +
        `Refusing to overwrite it with Edition #${edition}.`
    );
    console.error(
      `  Set BRIEFING_DATE=<target Monday date> to file this edition, or FORCE_OVERWRITE=1 to regenerate ${targetDate} in place.`
    );
    process.exit(1);
  }

  let previousContext = "";
  if (latest) {
    console.log(`Previous briefing: ${latest.name} (Edition #${edition - 1})`);
    previousContext = `\n\n## Previous Briefing (do not repeat a story unless it genuinely advanced)\n\n${latest.content}`;
  } else {
    console.log("No previous briefing found. This will be Edition #1.");
  }

  const recentLeads = getRecentLeads(4, redraft ? targetName : null);
  if (recentLeads) {
    previousContext += `\n\n## Recent edition leads (the running arc — advance it, don't recycle or dodge it)\n\n${recentLeads}`;
  }

  // Theme Registry context is Stage 4a-only (the lineup pass), not previousContext —
  // Stage 4b's userMessage never reads it, since it just expands the approved lineup.
  // A redraft skips 4a entirely, so there is nothing to feed it.
  const themeRegistry = redraft ? "" : readThemeRegistry();
  const themeRegistryContext = themeRegistry
    ? `\n\n## Theme Registry (long-term memory — tag each Big Picture candidate to the arc it advances, or flag NEW THREAD; propose updates)\n\n${themeRegistry}`
    : "";

  const ai = new GoogleGenAI({ apiKey });
  const kbAndContext = `Today is ${today}. Edition #${edition}.\n\n## Knowledge Base Content\n\n${kbContent}${emptySourceNote}${previousContext}${themeRegistryContext}`;

  // 5. Stage 4a — story lineup (planning pass). Runs the Lead-Story Doctrine as
  //    an explicit selection step and drops a lineup file in drafts/ so the PR
  //    reviewer can sanity-check the SELECTION before reading the full draft.
  //    Non-fatal: if it fails, fall back to drafting directly.
  let lineup = "";
  // Stage 4b only needs the story selection (Big Picture / Quick Hits / cuts /
  // coverage self-check) to expand into prose — never the registry admin footer
  // (proposed update + the full themes.md block, which can run several KB and
  // has its own "## " headings right before "generate a complete briefing").
  // Derived from `lineup`, which keeps the registry block for the saved
  // {today}-lineup.md file the PR reviewer reads.
  let lineupForDraft = "";

  // Redraft: the lineup already exists and has been approved (and possibly edited)
  // by a human. Skip the planning pass entirely and expand what's on disk — that is
  // the entire point of the gate. Everything downstream is identical to a normal run.
  if (redraft) {
    lineup = stripLineupFences(fs.readFileSync(args.fromLineup, "utf-8"));
    lineupForDraft = stripRegistryFooter(lineup);
    if (!lineupForDraft.trim()) {
      console.error(`ERROR: Lineup file is empty: ${args.fromLineup}`);
      process.exit(1);
    }
    console.log(`\nRedraft mode — skipping Stage 4a.`);
    console.log(`  Approved lineup: ${args.fromLineup}`);
    console.log(`  Target: ${targetName} (Edition #${edition})`);
  } else {
    try {
      console.log(`\nStage 4a: planning story lineup for Edition #${edition}...`);
      const lineupResp = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: kbAndContext,
        config: { systemInstruction: `${systemPrompt}\n\n${lineupTask(edition)}` },
      });
      const rawLineup = lineupResp.text || "";
      lineup = stripLineupFences(rawLineup);
      lineupForDraft = stripRegistryFooter(lineup);
      const draftsDir = path.join(BRIEFINGS_DIR, "drafts");
      if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
      fs.writeFileSync(path.join(draftsDir, `${targetDate}-lineup.md`), lineup, "utf-8");
      console.log(`  Lineup saved: content/briefings/drafts/${targetDate}-lineup.md`);

      if (themeRegistry) {
        const proposedThemes = extractProposedThemes(rawLineup);
        if (proposedThemes) {
          fs.writeFileSync(
            path.join(draftsDir, `${targetDate}-themes-proposed.md`),
            proposedThemes,
            "utf-8"
          );
          console.log(
            `  Proposed theme registry update saved: content/briefings/drafts/${targetDate}-themes-proposed.md`
          );
        } else {
          console.warn(
            `  WARN: lineup didn't include a valid themes-proposed block; skipping registry update proposal.`
          );
        }
      }
    } catch (err) {
      console.warn(`  WARN: lineup pass failed (${err.message || err}); drafting without it.`);
    }
  }

  // 5b. The editorial gate. Stop here when asked: the lineup and the proposed
  //     registry update are on disk, and nothing has been drafted. A lineup the
  //     planning pass failed to produce is not a gate, it is a silent no-op —
  //     exit non-zero so a caller can tell "nothing to review" from "review this".
  if (args.lineupOnly) {
    if (!lineup.trim()) {
      console.error("\nERROR: Stage 4a produced no lineup — nothing to review.");
      process.exit(1);
    }
    console.log(`\nLineup-only mode — stopping before Stage 4b. No briefing written.`);
    console.log(`  Review:  content/briefings/drafts/${targetDate}-lineup.md`);
    console.log(`  Then:    npm run redraft -- content/briefings/drafts/${targetDate}-lineup.md`);
    return;
  }

  // 6. Stage 4b — draft the briefing, expanding the approved lineup.
  const userMessage = `Today is ${today}. This is Edition #${edition}.

${lineup ? `You already planned this story lineup for this edition. Expand it into the full briefing, following the template and all rules exactly. Keep the selection and merges from the lineup unless a rule forces a change.\n\n## Approved Story Lineup\n\n${lineupForDraft}\n\n` : ""}Generate a complete weekly briefing using the knowledge base content below. Follow the template and all rules from your system instructions exactly.

## Knowledge Base Content

${kbContent}${emptySourceNote}${previousContext}`;

  console.log(`\nStage 4b: drafting Edition #${edition} (gemini-3.7-flash)...`);
  const gcpPlaybook = readGcpPlaybook();
  const stage4bSystem = gcpPlaybook
    ? `${systemPrompt}\n\n## GCP Playbook (ground truth for "Our Play" and "Where the GCP opportunity is" — only claims from this playbook or the week's KBs may appear in product positioning)\n\n${gcpPlaybook}`
    : systemPrompt;
  const response = await ai.models.generateContent({
    model: "gemini-3.7-flash",
    contents: userMessage,
    config: {
      systemInstruction: stage4bSystem,
    },
  });
  let text = response.text;

  // 7. Clean up response
  text = stripCodeFences(text);
  text = truncateRepetition(text);

  // 8. Save briefing (outputPath computed above, guarded against clobbering)
  if (!fs.existsSync(BRIEFINGS_DIR)) {
    fs.mkdirSync(BRIEFINGS_DIR, { recursive: true });
  }
  // A redraft deliberately replaces an existing edition, so keep the version it
  // replaces. Without this the only copy of what the pipeline originally produced
  // is lost — which is exactly how the evidence for the Edition #24 post-mortem
  // disappeared when Stage 4 was re-run over its own output.
  if (redraft && fs.existsSync(outputPath)) {
    const draftsDir = path.join(BRIEFINGS_DIR, "drafts");
    if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
    let n = 1;
    let backupPath;
    do {
      backupPath = path.join(draftsDir, `${targetDate}-pre-redraft-${n}.md`);
      n += 1;
    } while (fs.existsSync(backupPath));
    fs.copyFileSync(outputPath, backupPath);
    console.log(`  Replaced draft preserved: content/briefings/drafts/${path.basename(backupPath)}`);
  }
  fs.writeFileSync(outputPath, text, "utf-8");

  // 9. Report
  const wordCount = text.split(/\s+/).length;
  const title = text.match(/^title:\s*"(.+)"/m)?.[1] || "(no title found)";
  console.log(`\nBriefing generated successfully!`);
  console.log(`  Title: ${title}`);
  console.log(`  Edition: #${edition}`);
  console.log(`  Words: ${wordCount}`);
  console.log(`  Sources: ${kbFiles.join(", ")}`);
  console.log(`  Output: ${outputPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err.message || err);
    process.exit(1);
  });
}

module.exports = {
  stripCodeFences,
  stripLineupFences,
  stripRegistryFooter,
  truncateRepetition,
  countWords,
  readThemeRegistry,
  readGcpPlaybook,
  extractProposedThemes,
  lineupTask,
  parseArgs,
  targetDateFromLineup,
  isEmptyKb,
};
