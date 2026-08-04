#!/usr/bin/env node

/**
 * Brief Signal — Signal Digest
 *
 * Deterministic view of what the week's knowledge bases actually contained,
 * and which of it reached the draft. No LLM, no dependencies, no judgment:
 * everything here is grep and set membership, so it cannot talk itself out of
 * surfacing a story the way a model can.
 *
 * Why it exists: the lineup can tell you what it *rejected*. Only the KB can
 * tell you what it never considered. Edition #24's biggest misses were never
 * candidates, so no cut list could have shown their absence.
 *
 *   Tier 0 — Google & competitors (advisory). First-party announcements and
 *            Google-specific mentions, flagged when they never reached the draft.
 *   Tier 1 — graded HIGH items.  (pending Step 3a: only podcasts carry grades today)
 *   Tier 2 — per-story depth.    (pending)
 *   Tier 3 — dropped figures.    (pending)
 *
 * Run: npm run signal            (newest KBs vs the latest briefing)
 *      npm run signal -- --date 2026-08-03
 */

const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(process.env.HOME, "skills");
const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const MAX_AGE_DAYS = 14;

// Must match EMPTY_MARKER in the extractors and EMPTY_MARKER_RE in
// generate-briefing.js — one convention, read by every consumer.
const EMPTY_MARKER_RE = /^>\s*\*\*Status:\*\*\s*EMPTY\b/m;

// ORDER IS LOAD-BEARING. generate-briefing.js builds its prompt by concatenating
// KBs in this order, and lab news goes first on purpose: it is the smallest KB
// and the only one added to close a verified miss, so burying it at the end of a
// ~136k-token prompt would defeat the point of adding it.
const KB_KINDS = [
  { prefix: "labnews-knowledge-base-", label: "Lab news", kind: "labnews" },
  { prefix: "bookmarks-knowledge-base-", label: "Bookmarks", kind: "bookmarks" },
  { prefix: "podcasts-knowledge-base-", label: "Podcasts", kind: "podcasts" },
  { prefix: "playlist-knowledge-base-", label: "Playlist", kind: "playlist" },
];

// Tier 0 lane A — the entry ORIGINATES from Google or a named competitor.
// First-party product news is never "one story among many" for this audience,
// so it gets surfaced on provenance alone, before anything weighs its interest.
// Competitor list set with Simon 2026-08-03: AWS, Azure/Microsoft, the frontier
// labs (OpenAI, Anthropic, Meta, Mistral, xAI) and the Chinese open-weight labs.
const FIRST_PARTY_HANDLE =
  /\*\*\[@(Google|GoogleAI|GoogleCloud|GoogleDeepMind|OpenAI|AnthropicAI|Microsoft|MSFT|Azure|AzureAI|AWS|awscloud|MistralAI|xai|Meta|AIatMeta|deepseek_ai|Alibaba_Qwen|Qwen|Kimi_Moonshot|MoonshotAI)\b/i;

const FIRST_PARTY_DOMAIN =
  /https?:\/\/(?:www\.)?(?:blog\.google|ai\.google|cloud\.google\.com|deepmind\.google|openai\.com|anthropic\.com|ai\.meta\.com|mistral\.ai|x\.ai|aws\.amazon\.com|azure\.microsoft\.com|deepseek\.com|qwen\.ai|moonshot\.(?:ai|cn))/i;

// Tier 0 lane B — anything naming Google's own surface area, whoever said it.
// Narrower than the full competitor set on purpose: Google is the employer, so
// its mentions matter disproportionately and the volume stays scannable.
const GOOGLE_MENTION = /\bgemini\b|\bTPUs?\b|\bvertex\b|agent platform|\bdeepmind\b|google cloud|\bGCP\b/i;

// Tier 0 lane C — competitor product names. High volume (~23% of entries in a
// typical week), so titles only. Present for sweep, not for reading closely.
// Trailing \d* matters: model names carry version suffixes with no separator
// (Qwen3.7, GPT-5.6, Llama4), and a plain \b after the name fails to match them
// because a digit is itself a word character.
const COMPETITOR_MENTION =
  /\b(claude|llama|mistral|grok|deepseek|qwen|kimi)[\d.]*\b|\bGPT-?\d|\bazure\b|\bbedrock\b|\bsagemaker\b|\bcopilot\b/i;

function parseArgs(argv) {
  const args = { date: null };
  const i = argv.indexOf("--date");
  if (i !== -1 && argv[i + 1]) args.date = argv[i + 1];
  return args;
}

// Newest file of each kind within the freshness window, mirroring
// findKnowledgeBaseFiles() in generate-briefing.js so the digest reports on the
// same files the generator would actually read.
function findKnowledgeBases() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const files = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(SKILLS_DIR, f)).mtimeMs }))
    .filter((f) => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);

  return KB_KINDS.map((k) => {
    const hit = files.find((f) => f.name.startsWith(k.prefix));
    if (!hit) return null;
    return { ...k, name: hit.name, content: fs.readFileSync(path.join(SKILLS_DIR, hit.name), "utf-8") };
  }).filter(Boolean);
}

// Each KB kind delimits entries differently. Podcasts and the playlist use
// headings; bookmarks use a bold markdown link at line start.
function splitEntries(kb) {
  const raw =
    kb.kind === "bookmarks"
      ? kb.content.split(/\n(?=\*\*\[)/).filter((e) => e.startsWith("**["))
      : kb.kind === "playlist"
        ? kb.content.split(/\n(?=### #\d)/).filter((e) => e.startsWith("### #"))
        : kb.content.split(/\n(?=## )/).filter((e) => /^## .+\(\d{4}-\d{2}-\d{2}\)/.test(e));

  return raw.map((text) => {
    const header = text.split("\n")[0];
    const link = header.match(/\]\((https?:\/\/[^)\s]+)\)/);
    const bare = text.match(/(https?:\/\/[^\s)\]]+)/);
    const grade = text.match(/\*\*GCP Relevance:\*\*\s*(HIGH|MEDIUM|LOW)/i);
    return {
      source: kb.label,
      header: header.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim(),
      url: link ? link[1] : bare ? bare[1] : null,
      grade: grade ? grade[1].toUpperCase() : null,
      text,
    };
  });
}

// A story counts as "reached the draft" when the draft cites its permalink.
// Deliberately strict: a story can be alluded to without being cited, but for
// an advisory sweep an uncited source is exactly what's worth a second look.
function draftUrls(draftPath) {
  if (!draftPath || !fs.existsSync(draftPath)) return null;
  const text = fs.readFileSync(draftPath, "utf-8");
  return new Set((text.match(/https?:\/\/[^\s)\]"']+/g) || []).map(normalizeUrl));
}

// Strip trailing punctuation and tracking params, but KEEP meaningful query
// params. Dropping the query entirely collapses every https://youtube.com/watch
// ?v=<id> to the same string, so one cited video would mark every video cited.
const TRACKING_PARAMS = /^(utm_[a-z]+|si|feature|ab_channel|t|s|ref|ref_src|fbclid|gclid)$/i;

function normalizeUrl(u) {
  const clean = u.replace(/[.,;)]+$/, "").toLowerCase();
  const [base, query] = clean.split("?");
  const trimmed = base.replace(/\/+$/, "");
  if (!query) return trimmed;
  const kept = query
    .split("&")
    .filter((p) => p && !TRACKING_PARAMS.test(p.split("=")[0]))
    .sort();
  return kept.length ? `${trimmed}?${kept.join("&")}` : trimmed;
}

function latestBriefing() {
  if (!fs.existsSync(BRIEFINGS_DIR)) return null;
  const files = fs
    .readdirSync(BRIEFINGS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  return files.length ? files[0].replace(".md", "") : null;
}

function cited(entry, urls) {
  if (!urls || !entry.url) return null;
  return urls.has(normalizeUrl(entry.url));
}

function mark(entry, urls) {
  const hit = cited(entry, urls);
  if (hit === null) return "";
  return hit ? "  ✓ cited" : "  ⚠ NOT CITED";
}

function line(entry, urls) {
  const grade = entry.grade ? `[${entry.grade}] ` : "";
  return `- ${grade}${entry.header}${mark(entry, urls)}\n  ${entry.source}${entry.url ? ` · ${entry.url}` : ""}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const kbs = findKnowledgeBases();
  if (kbs.length === 0) {
    console.error(`No knowledge base files found in ${SKILLS_DIR} from the last ${MAX_AGE_DAYS} days.`);
    process.exit(1);
  }

  const date = args.date || latestBriefing();
  const draftPath = date ? path.join(BRIEFINGS_DIR, `${date}.md`) : null;
  const urls = draftUrls(draftPath);
  const entries = kbs.flatMap(splitEntries);

  const out = [];
  out.push(`## Signal digest${date ? ` — ${date}` : ""}`);
  out.push("");

  out.push("**Sources read**");
  for (const kb of kbs) {
    const mine = splitEntries(kb);
    const graded = mine.filter((e) => e.grade).length;
    const high = mine.filter((e) => e.grade === "HIGH").length;
    const gradeNote = graded ? `${graded} graded, ${high} HIGH` : "**ungraded**";
    // A source that ran and found nothing is healthy. Say so explicitly —
    // otherwise "0 entries" reads identically to a stale or failed extraction,
    // which is the ambiguity that let a dry playlist masquerade as a failure.
    if (EMPTY_MARKER_RE.test(kb.content)) {
      out.push(`- ${kb.label}: \`${kb.name}\` — _ran, no new items this week_`);
    } else {
      out.push(`- ${kb.label}: \`${kb.name}\` — ${mine.length} entries, ${gradeNote}`);
    }
  }
  if (!urls) {
    out.push("");
    out.push(`_No draft found${draftPath ? ` at ${path.relative(process.cwd(), draftPath)}` : ""} — coverage marks omitted._`);
  }
  out.push("");

  // Lane A is provenance, so it is never suppressed — a first-party announcement
  // surfaces whatever the extractor thought of it. Lanes B and C are mere
  // mentions, so an explicit LOW grade (a judgment made with that one item in
  // full context) is allowed to filter them out; otherwise a 90-minute episode
  // that says "Google" once floods the lane. Ungraded entries always show —
  // which is why Step 3a matters: today that means every bookmark.
  // Lab news is excluded from every lane and reported separately. Lane A exists
  // to FIND first-party items hiding among curated sources; every lab-news entry
  // is first-party by construction, so folding them in would add 30-50 rows a
  // week and make the closing advisory read "38 items are not cited" every time
  // — destroying the signal the lane exists to produce.
  const isLabNews = (e) => e.source === "Lab news";
  const curated = entries.filter((e) => !isLabNews(e));
  const labNews = entries.filter(isLabNews);

  const isLow = (e) => e.grade === "LOW";
  const laneA = curated.filter((e) => FIRST_PARTY_HANDLE.test(e.text) || FIRST_PARTY_DOMAIN.test(e.text));
  const laneB = curated.filter((e) => !laneA.includes(e) && !isLow(e) && GOOGLE_MENTION.test(e.text));
  const laneC = curated.filter(
    (e) => !laneA.includes(e) && !laneB.includes(e) && !isLow(e) && COMPETITOR_MENTION.test(e.text)
  );

  out.push("### Tier 0 — Google & competitors (advisory)");
  out.push("");
  out.push("**First-party announcements** — from Google or a named competitor's own account");
  out.push(laneA.length ? laneA.map((e) => line(e, urls)).join("\n") : "_none this week_");
  out.push("");
  out.push("**Google-specific** — Gemini, TPU, Agent Platform, DeepMind, Google Cloud");
  out.push(laneB.length ? laneB.map((e) => line(e, urls)).join("\n") : "_none this week_");
  out.push("");
  out.push(`**Competitor products** — ${laneC.length} entries, titles only`);
  out.push(
    laneC.length
      ? laneC.map((e) => `- ${e.header}${mark(e, urls)}`).join("\n")
      : "_none this week_"
  );
  out.push("");

  // Lab news gets its own section for the reason given above: it is uniformly
  // first-party, so the useful question is not "is this first-party?" but
  // "did the labs announce something we never covered?".
  if (labNews.length) {
    const uncited = labNews.filter((e) => cited(e, urls) === false);
    out.push(`### Lab news — announcements straight from the labs (advisory)`);
    out.push("");
    out.push(
      urls && uncited.length
        ? `${uncited.length} of ${labNews.length} not cited in the draft:\n` +
            uncited.map((e) => `- ${e.header}${mark(e, urls)}\n  ${e.url || ""}`).join("\n")
        : urls
          ? `All ${labNews.length} cited in the draft.`
          : `${labNews.length} this week — no draft to check against.`
    );
    out.push("");
  }

  if (urls) {
    const missed = [...laneA, ...laneB].filter((e) => cited(e, urls) === false);
    out.push(
      missed.length
        ? `> **${missed.length} first-party or Google-specific item(s) are not cited in the draft.** Advisory only — check whether that was deliberate.`
        : "> All first-party and Google-specific items are cited in the draft."
    );
  }

  console.log(out.join("\n"));
}

if (require.main === module) main();

module.exports = {
  splitEntries,
  EMPTY_MARKER_RE,
  normalizeUrl,
  parseArgs,
  FIRST_PARTY_HANDLE,
  FIRST_PARTY_DOMAIN,
  GOOGLE_MENTION,
  COMPETITOR_MENTION,
  KB_KINDS,
};
