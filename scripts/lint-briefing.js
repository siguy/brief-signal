#!/usr/bin/env node

/**
 * Deterministic briefing linter — mechanical checks only, no LLM.
 *
 * The LLM critique (critique-briefing.js) judges editorial quality; this
 * linter catches the structural defects the critique detects inconsistently
 * (it has scored the same defect "soft" on one run and "hard" on the next).
 * String checks are the right tool for string rules.
 *
 * Usage: node scripts/lint-briefing.js [YYYY-MM-DD]
 *   (defaults to the most recent briefing in content/briefings/)
 *
 * Exit codes (mirrors critique-briefing.js):
 *   0 — clean (warnings may still print)
 *   1 — linter itself errored
 *   2 — at least one hard failure
 */

const fs = require("fs");
const path = require("path");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const LOG_FILE = path.join(__dirname, "logs", "lint-briefing.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] lint-briefing: ${msg}`;
  console.log(msg);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {
    /* logging must never break linting */
  }
}

// --- helpers ---------------------------------------------------------------

// All markdown links: [label](url)
function extractLinks(md) {
  const links = [];
  const re = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    links.push({ label: m[1], url: m[2], index: m.index });
  }
  return links;
}

// Section slice between a heading and the next same-or-higher-level heading.
function sectionBody(md, headingRe) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return null;
  const level = (lines[start].match(/^#+/) || ["##"])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

// Split the Big Picture section into its ### stories.
function bigPictureStories(md) {
  const body = sectionBody(md, /^##\s+The Big Picture/);
  if (body === null) return [];
  const stories = [];
  const parts = body.split(/^###\s+/m).slice(1);
  for (const p of parts) {
    const title = p.split("\n")[0].trim();
    stories.push({ title, body: p });
  }
  return stories;
}

// Frontmatter date ("2026-07-26"), falling back to the filename stem.
function briefingDate(md, file) {
  const m = md.match(/^date:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
  if (m) return m[1];
  return file ? path.basename(file, ".md") : null;
}

// Parse "16:15" / "0:37:25" out of a link label into minutes (float), or null.
function labelTimestamps(label) {
  const out = [];
  const re = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
  let m;
  while ((m = re.exec(label)) !== null) {
    if (m[3] !== undefined) {
      out.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3], 10) / 60);
    } else {
      out.push(parseInt(m[1], 10) + parseInt(m[2], 10) / 60);
    }
  }
  return out;
}

// --- checks ----------------------------------------------------------------
// Each returns { hard: [...], warn: [...] } message arrays.

function checkUrls(md) {
  const hard = [];
  for (const { url } of extractLinks(md)) {
    if (url.includes("...")) {
      hard.push(`Truncated/placeholder URL: ${url}`);
    } else if (!/^(https?:\/\/|\/|\.\/|#)/.test(url)) {
      hard.push(`Malformed URL (no protocol or path): ${url}`);
    }
  }
  return { hard, warn: [] };
}

function checkTldrHooks(md) {
  const hard = [];
  const body = sectionBody(md, /^##\s+TLDR/);
  if (body === null) return { hard: ["No TLDR section found"], warn: [] };
  const bullets = body.split("\n").filter((l) => /^\s*-\s+/.test(l));
  if (bullets.length < 4 || bullets.length > 5) {
    hard.push(`TLDR has ${bullets.length} bullets (must be 4-5)`);
  }
  for (const b of bullets) {
    if (!/^\s*-\s+\*\*[^*]+\*\*/.test(b)) {
      hard.push(`TLDR bullet lacks a bold hook: "${b.trim().slice(0, 60)}..."`);
    }
  }
  return { hard, warn: [] };
}

// An angle block must close with the one line where GCP positioning is allowed.
//
// The heading matched with a trailing colon only, which silently disabled this
// entire check the moment the format changed: Edition #23 shipped
// "**Your angle with founders:**" and was checked; Edition #24 shipped
// "**Your angle with founders**" (no colon) and was NOT — nothing verified its
// closing line. Match the heading with the colon optional so a punctuation
// change can never switch a lint rule off again.
//
// Both labels are accepted: "Where GCP wins:" is the current format (see the
// Section Voice Guide), "Where the GCP opportunity is" is what editions up to
// #23 used. Either satisfies the rule — what matters is that the block ends by
// naming the deal motion, not which words introduce it.
const ANGLE_HEADING = /\*\*Your angle with founders:?\*\*/;
const ANGLE_CLOSER = /Where GCP wins|Where the GCP opportunity is/;

function checkAngleBlocks(md) {
  const hard = [];
  for (const s of bigPictureStories(md)) {
    if (ANGLE_HEADING.test(s.body)) {
      if (!ANGLE_CLOSER.test(s.body)) {
        hard.push(
          `Story "${s.title}" has a "Your angle" block but no closing "Where GCP wins:" line`
        );
      }
    }
  }
  return { hard, warn: [] };
}

// Same exact URL anchoring two Big Picture stories: hard-fail when parsed
// timestamps are under 30 minutes apart; warn when we can't parse timestamps
// (the 30-min judgment then belongs to the human/critique).
function checkSourceOverlap(md) {
  const hard = [];
  const warn = [];
  const stories = bigPictureStories(md);
  const byUrl = new Map();
  stories.forEach((s, i) => {
    for (const link of extractLinks(s.body)) {
      if (!/^https?:\/\//.test(link.url)) continue;
      if (!byUrl.has(link.url)) byUrl.set(link.url, []);
      byUrl.get(link.url).push({ story: i, title: s.title, ts: labelTimestamps(link.label) });
    }
  });
  for (const [url, uses] of byUrl) {
    const storyIdxs = [...new Set(uses.map((u) => u.story))];
    if (storyIdxs.length < 2) continue;
    const allTs = uses.flatMap((u) => u.ts);
    if (allTs.length < 2) {
      warn.push(`URL anchors ${storyIdxs.length} Big Picture stories (timestamps unparseable — verify 30-min rule by hand): ${url}`);
      continue;
    }
    // Min gap between any timestamp in one story and any in another
    let minGap = Infinity;
    for (const a of uses) {
      for (const b of uses) {
        if (a.story === b.story) continue;
        for (const t1 of a.ts) for (const t2 of b.ts) minGap = Math.min(minGap, Math.abs(t1 - t2));
      }
    }
    if (minGap < 30) {
      hard.push(
        `Same URL anchors stories ${storyIdxs.map((i) => `"${stories[i].title}"`).join(" and ")} with citations only ${Math.round(minGap)} min apart (rule: 30+): ${url}`
      );
    }
  }
  return { hard, warn };
}

// Patterns cover inflections (leverage/leverages/leveraged/leveraging, synergies).
const BANNED_WORDS = [
  /\bleverag(?:e[sd]?|ing)\b/i,
  /\bsynerg(?:y|ies|istic)\b/i,
  /\bbest-in-class\b/i,
  /\bdigital transformation\b/i,
];

function checkBannedWords(md) {
  const hard = [];
  // Strip URLs so "leverage" inside a link target doesn't false-positive
  const prose = md.replace(/\(([^)\s]+)\)/g, "()");
  for (const re of BANNED_WORDS) {
    const m = prose.match(re);
    if (m) hard.push(`Banned word "${m[0]}" (marketing-speak per prompt anti-patterns)`);
  }
  return { hard, warn: [] };
}

function checkNaming(md) {
  const hard = [];
  if (/\bGEAP\b/.test(md)) hard.push(`"GEAP" is retired — use "Agent Platform"`);
  // Bare "Vertex AI" allowed only inside the "(FKA Vertex AI)" first-mention form
  const stripped = md.replace(/\(FKA Vertex AI\)/g, "");
  if (/\bVertex AI\b/.test(stripped)) {
    hard.push(`Bare "Vertex AI" — only "(FKA Vertex AI)" on first mention is allowed`);
  }
  return { hard, warn: [] };
}

// Image references must point at real, valid raster files. Catches the
// Edition #23 failure class: fetch-og's old placeholder fallback wrote SVG
// markup into the .jpg path, which Pages served as image/jpeg -> broken
// image on the live site. Magic-byte + size checks are the only reliable
// tell (the file "existed" and had the right extension).
function checkImages(md, baseDir = BRIEFINGS_DIR) {
  const hard = [];
  const re = /!\[[^\]]*\]\((\.\/[^)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const rel = m[1];
    const file = path.join(baseDir, rel);
    if (!fs.existsSync(file)) {
      hard.push(`Referenced image missing: ${rel} (fetch-og failed? fix the source or drop the image)`);
      continue;
    }
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    if (buf.length < 2048) {
      hard.push(`Image suspiciously small (${buf.length} bytes — placeholder?): ${rel}`);
      continue;
    }
    const head = buf.slice(0, 8);
    const isJpg = head[0] === 0xff && head[1] === 0xd8;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const looksText = head.toString("utf8").trimStart().startsWith("<");
    if ((ext === ".jpg" || ext === ".jpeg") && !isJpg) {
      hard.push(`Not JPEG data in ${rel}${looksText ? " (SVG/HTML markup in a .jpg — the fetch-og placeholder bug)" : ""}`);
    } else if (ext === ".png" && !isPng) {
      hard.push(`Not PNG data in ${rel}`);
    }
  }
  return { hard, warn: [] };
}

// Cross-edition repetition of the LEAD story. Edition #24's first draft re-led
// with Edition #23's lead (OpenAI's agent hacking Hugging Face / the "guardrail
// lockout" / GLM 5.2 forensics) and nothing caught it: every other rule only
// looks inside a single edition. A lead may only repeat if the story genuinely
// advanced — a verbatim re-lead is a wasted week for the reader.
//
// Signal: Jaccard overlap of distinctive terms (unigrams + adjacent-pair
// bigrams) between the current lead and each recent prior lead. Full-text
// diffing is useless here — consecutive editions always share AI vocabulary —
// so the stoplist below strips both ordinary English and the industry nouns
// that appear in every edition, leaving the entities and phrases that actually
// identify a story ("hugging face", "guardrail lockout", "glm 5.2").
const LEAD_LOOKBACK_EDITIONS = 3;
const LEAD_OVERLAP_THRESHOLD = 0.15;
// Below this many shared terms, Jaccard is too jumpy on short leads to trust.
const LEAD_OVERLAP_MIN_SHARED = 8;

const LEAD_STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at
   be because been before being below between both but by can cannot could did
   do does doing down during each few for from further had has have having he
   her here hers him his how i if in into is it its itself just me more most my
   no nor not now of off on once only or other our ours out over own same she
   should so some such than that the their theirs them then there these they
   this those through to too under until up very was we were what when where
   which while who whom why will with would you your yours
   already another around back become becomes becoming best better big bring
   build building built call called come comes coming day days early even ever
   every first get gets getting give gives go goes going good great half hand
   help high keep keeps kind know known large last late later least less let
   like likely little long look looks made make makes making many may mean
   means might much must near need needs never new next old one part parts past
   place put real really right run runs running said say says see seen set sets
   show shows side since small start started still take takes taking tell thing
   things think three time times today two use used uses using want way week
   weeks well went whether within without work working world year years yet
   ai model models ml llm llms frontier lab labs open source open-weight weights
   compute inference training token tokens agentic agent agents enterprise
   enterprises founder founders customer customers seller sellers team teams
   startup startups company companies market markets industry price pricing
   cost costs cheap cheaper data platform platforms cloud clouds infra
   infrastructure stack workload workloads api apis chip chips gpu gpus system
   systems tech technology product products developer developers user users
   google gcp openai anthropic gemini claude meta microsoft aws azure nvidia
   deepmind capability capabilities performance benchmark benchmarks scale
   scaling shift shifts shifting question questions answer answers control
   access story briefing edition angle opportunity
   hurts hedging`
    .split(/\s+/)
    .filter(Boolean)
);

function isLeadTerm(t) {
  return t.length >= 3 && !LEAD_STOPWORDS.has(t) && !/^\d+$/.test(t);
}

// Distinctive terms in a lead story: link labels are stripped (they are source
// names like "AI Daily Brief", which recur every week regardless of topic).
function leadTerms(storyBody) {
  const prose = storyBody
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[^A-Za-z0-9.\-]+/g, " ")
    .toLowerCase();
  const tokens = (prose.match(/[a-z0-9][a-z0-9.\-]*/g) || []).map((t) =>
    t.replace(/[.\-]+$/, "")
  );
  const terms = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (!isLeadTerm(tokens[i])) continue;
    terms.add(tokens[i]);
    if (isLeadTerm(tokens[i + 1] || "")) terms.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return terms;
}

function leadOverlap(a, b) {
  const shared = [...a].filter((t) => b.has(t));
  const union = a.size + b.size - shared.length;
  return { shared, score: union === 0 ? 0 : shared.length / union };
}

function checkCrossEditionLead(md, baseDir = BRIEFINGS_DIR) {
  const hard = [];
  const warn = [];
  const stories = bigPictureStories(md);
  if (!stories.length) return { hard, warn };
  const current = leadTerms(stories[0].body);
  const date = briefingDate(md);
  // Never fail silently: without a date we cannot tell which editions precede
  // this one, so say the check was skipped rather than reporting it clean.
  if (!date) {
    warn.push("No frontmatter date — cannot order editions, cross-edition lead check skipped");
    return { hard, warn };
  }

  const priors = fs
    .readdirSync(baseDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map((f) => {
      const prior = fs.readFileSync(path.join(baseDir, f), "utf-8");
      return { file: f, date: briefingDate(prior, f), md: prior };
    })
    .filter((p) => p.date && p.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-LEAD_LOOKBACK_EDITIONS);

  for (const prior of priors) {
    const priorStories = bigPictureStories(prior.md);
    if (!priorStories.length) continue;
    const { shared, score } = leadOverlap(current, leadTerms(priorStories[0].body));
    if (score < LEAD_OVERLAP_THRESHOLD || shared.length < LEAD_OVERLAP_MIN_SHARED) continue;
    const edition = (prior.md.match(/^edition:\s*(\d+)/m) || [])[1];
    hard.push(
      `Lead story "${stories[0].title}" strongly overlaps the lead of ${prior.file}` +
        `${edition ? ` (Edition #${edition})` : ""} (overlap ${score.toFixed(2)}, threshold ${LEAD_OVERLAP_THRESHOLD}): ` +
        `shared terms: ${shared.slice(0, 10).join(", ")}. ` +
        `A lead may only repeat if it genuinely advanced — otherwise demote it.`
    );
  }
  return { hard, warn };
}

// --- main ------------------------------------------------------------------

function lint(md) {
  const checks = [
    ["urls", checkUrls],
    ["tldr", checkTldrHooks],
    ["angle-blocks", checkAngleBlocks],
    ["source-overlap", checkSourceOverlap],
    ["banned-words", checkBannedWords],
    ["naming", checkNaming],
    ["images", checkImages],
    ["cross-edition-lead", checkCrossEditionLead],
  ];
  const hard = [];
  const warn = [];
  for (const [name, fn] of checks) {
    const r = fn(md);
    r.hard.forEach((m) => hard.push(`[${name}] ${m}`));
    r.warn.forEach((m) => warn.push(`[${name}] ${m}`));
  }
  return { hard, warn };
}

function main() {
  const dateArg = process.argv[2];
  let file;
  if (dateArg) {
    file = path.join(BRIEFINGS_DIR, `${dateArg}.md`);
  } else {
    const candidates = fs
      .readdirSync(BRIEFINGS_DIR)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort();
    file = path.join(BRIEFINGS_DIR, candidates[candidates.length - 1]);
  }
  if (!fs.existsSync(file)) {
    log(`ERROR: briefing not found: ${file}`);
    process.exit(1);
  }
  log(`Linting ${path.basename(file)}...`);
  const { hard, warn } = lint(fs.readFileSync(file, "utf-8"));
  warn.forEach((w) => log(`  WARN  ${w}`));
  hard.forEach((h) => log(`  HARD  ${h}`));
  if (hard.length) {
    log(`${hard.length} hard failure(s).`);
    process.exit(2);
  }
  log(`Clean (${warn.length} warning(s)).`);
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  lint,
  extractLinks,
  bigPictureStories,
  briefingDate,
  labelTimestamps,
  leadTerms,
  leadOverlap,
  checkUrls,
  checkTldrHooks,
  checkAngleBlocks,
  checkSourceOverlap,
  checkBannedWords,
  checkNaming,
  checkImages,
  checkCrossEditionLead,
};
