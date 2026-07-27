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

function checkAngleBlocks(md) {
  const hard = [];
  for (const s of bigPictureStories(md)) {
    if (s.body.includes("**Your angle with founders:**")) {
      if (!s.body.includes("Where the GCP opportunity is")) {
        hard.push(
          `Story "${s.title}" has a "Your angle" block but no "Where the GCP opportunity is" line`
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
  labelTimestamps,
  checkUrls,
  checkTldrHooks,
  checkAngleBlocks,
  checkSourceOverlap,
  checkBannedWords,
  checkNaming,
  checkImages,
};
