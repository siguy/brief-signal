#!/usr/bin/env node

/**
 * Brief Signal — Lineup Digest
 *
 * Renders the editorial half of the PR body out of the Stage 4a lineup: what
 * got selected and on what grounds, what was recommended as worth reading
 * anyway, what was cut and how good it actually was, and the proposed theme
 * registry.
 *
 * Why it exists: the lineup is what Simon actually reviews, but until now the PR
 * body led with ~270 lines of ratings table and put the registry update at line
 * 329. His verdict on Edition #25: "I just see the ratings." The registry was
 * there; it was simply unreachable. This script renders the editorial layer so
 * generate-weekly.sh can put it FIRST.
 *
 * Why it renders as much as it does: the first version of this file showed only
 * each story's title, `advances:` and `gravity:`. That answered "which arc does
 * this move?" and nothing else. Three things were missing, all of them things
 * the lineup file already contained:
 *
 *   1. WHAT WAS SELECTED, and why. `event`, `changed this week`, `merges` and
 *      `seller play` are the actual argument for a story leading; a title plus
 *      two fields is not enough to agree or disagree with a selection. The Quick
 *      Hits never appeared at all, so half the edition's content was invisible.
 *   2. WHAT WAS EXCLUDED. "Considered but cut (and why)" has always been written
 *      by Stage 4a and never rendered anywhere. The reviewer's most valuable
 *      question — "is anything good in the reject pile?" — had no answer short of
 *      opening the lineup file and reading to the bottom.
 *   3. WHAT'S WORTH READING ANYWAY. Not everything high-value fits a slot: the
 *      strategic argument behind an event, a deep technical piece, a primary
 *      source the edition only cites second-hand. Stage 4a now nominates these
 *      as `Recommended reads` and they render here.
 *
 * On the cut ledger: `quality:` is Stage 4a's own rating, so it is a claim, not
 * a check — a model rating its own rejects is exactly the self-audit shape this
 * repo has been burned by before (see the note above `lineupTask` in
 * generate-briefing.js). It earns its place because it is the ONLY signal
 * available for bookmarks, which carry no grades at all. The independent check
 * is `scripts/signal-digest.js --summary`, which reads the KB's own grades and
 * the lineup's own URLs with no model involved; the two run side by side in the
 * PR body and are labelled so they are never mistaken for each other.
 *
 * Deterministic: parsing and string assembly only, no LLM. Never fatal — a
 * missing or malformed lineup prints nothing and exits 0, because a PR that
 * opens is always better than a PR blocked on its own summary.
 *
 * Run: node scripts/lineup-digest.js --lineup <lineup.md> [--themes <themes-proposed.md>]
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { lineup: null, themes: null };
  const i = argv.indexOf("--lineup");
  if (i !== -1 && argv[i + 1]) args.lineup = argv[i + 1];
  const j = argv.indexOf("--themes");
  if (j !== -1 && argv[j + 1]) args.themes = argv[j + 1];
  return args;
}

// Everything Stage 4a writes per Big Picture story, in the order a reviewer
// needs it: what happened, what's new about it, which arc it moves, how much
// corroboration it has, whether a seller can act, what it absorbed, whose voices
// it weaves. `changed this week` is two words in the lineup and one label here.
const STORY_FIELDS = [
  ["event", "Event"],
  ["changed this week", "New this week"],
  ["advances", "Advances"],
  ["gravity", "Gravity"],
  ["seller play", "Seller play"],
  ["merges", "Merges"],
  ["braids in", "Braids in"],
];

const FIELD_RE = new RegExp(
  `^\\s*[-*+]\\s*(${STORY_FIELDS.map(([k]) => k).join("|")}):\\s*(.+)$`,
  "i"
);

// A line that ends the numbered Big Picture list: the next `**Bold block:**`,
// any markdown heading, a horizontal rule, or a fence. The heading and rule
// cases matter since Stage 4a began closing the selection with `---` followed by
// `## Editorial review notes`.
const BLOCK_BOUNDARY = /^\*\*\S|^#{1,6}\s|^\s*```|^\s*(?:---|___|\*\*\*)\s*$/;

// Big Picture stories are numbered `1. **Title**`, with indented `- key: value`
// detail lines beneath.
function parseStories(lineup) {
  const stories = [];
  let current = null;
  for (const raw of lineup.split("\n")) {
    const head = raw.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*$/);
    if (head) {
      if (current) stories.push(current);
      current = { n: head[1], title: head[2], fields: {} };
      continue;
    }
    if (!current) continue;
    if (BLOCK_BOUNDARY.test(raw)) {
      stories.push(current);
      current = null;
      continue;
    }
    // Bullet char and indent both vary run to run — Gemini writes `   - advances:`
    // on some editions and `    *   advances:` on others. Matching only "-" cost
    // the entire mapping on the first live run: titles rendered, every Advances
    // and Gravity line silently vanished.
    const field = raw.match(FIELD_RE);
    if (field) current.fields[field[1].toLowerCase()] = field[2].trim();
  }
  if (current) stories.push(current);
  // `advances` and `gravity` stay top-level: they predate the fields map and the
  // PR body, the tests and generate-weekly.sh all read them by name.
  return stories.map((s) => ({
    ...s,
    advances: s.fields.advances || null,
    gravity: s.fields.gravity || null,
  }));
}

// Body of a `**Bold label:**` block. Returns the label line's own trailing text
// (Stage 4a writes short answers inline — "**Recommended reads (3-5):** none
// this week") plus every line up to the next block boundary.
//
// Callers match a stable label PREFIX, never the whole line: the parenthetical
// counts drift every run ("Quick Hits (3-6 candidates)" one week, "Quick Hits
// (6)" the next), and anchoring on them would silently drop the section.
function sectionLines(lineup, labelRe) {
  const lines = lineup.split("\n");
  const start = lines.findIndex((l) => labelRe.test(l));
  if (start === -1) return null;
  const inline = lines[start].replace(/^\s*\*\*[^*]+\*\*:?\s*/, "").trim();
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => BLOCK_BOUNDARY.test(l));
  const body = end === -1 ? rest : rest.slice(0, end);
  return inline ? [inline, ...body] : body;
}

// List items out of a block, tolerating `-`, `*`, `+` and `1.` markers at any
// indent. A non-bullet line that follows one is a wrapped continuation and is
// folded back into it — Stage 4a hard-wraps long "worth reading:" clauses, and
// dropping the wrapped half would truncate the reason mid-sentence.
function bullets(lines) {
  if (!lines) return [];
  const out = [];
  for (const raw of lines) {
    const item = raw.match(/^\s*(?:\d+[.)]|[-*+])\s+(.*\S)\s*$/);
    if (item) {
      out.push(item[1].trim());
      continue;
    }
    if (out.length && raw.trim()) out[out.length - 1] += ` ${raw.trim()}`;
  }
  // "none this week" is a real answer from Stage 4a, not a list of one.
  return out.filter((b) => b && !/^_?none\b/i.test(b));
}

// A one-line `**Label:** value` field that is not a list.
function inlineField(lineup, labelRe) {
  const line = lineup.split("\n").find((l) => labelRe.test(l));
  if (!line) return null;
  const value = line.replace(/^\s*\*\*[^*]+\*\*:?\s*/, "").trim();
  return value || null;
}

const QUICK_HITS_RE = /^\*\*Quick Hits\b/i;
const READS_RE = /^\*\*Recommended reads\b/i;
const CUTS_RE = /^\*\*Considered but cut\b/i;
const WHY_LEAD_RE = /^\*\*Why the lead\b/i;
const CONTINUITY_RE = /^\*\*Continuity:?\*\*/i;

// Stage 4a's own rating of a cut item's merit, independent of whether it earned
// a slot. Bold markers are tolerated because the model emits `quality: **HIGH**`
// about as often as the plain form.
const QUALITY_RE = /\bquality:\s*\*{0,2}(HIGH|MEDIUM|LOW)\*{0,2}\*{0,2}/i;

function parseCuts(lineup) {
  return bullets(sectionLines(lineup, CUTS_RE)).map((text) => {
    const q = text.match(QUALITY_RE);
    return { text, quality: q ? q[1].toUpperCase() : null };
  });
}

// The "Proposed registry update:" block runs until whatever ends it. The old awk
// in generate-weekly.sh keyed solely on a "**Full proposed registry:**" marker —
// but Stage 4a does not always emit one. On the first live run it went straight
// from the diff into the ```themes-proposed fence, and the "diff" swallowed the
// entire 77-line registry. So stop at any of three boundaries: that marker, a
// fenced block, or the next top-level bold heading.
function parseRegistryDiff(lineup) {
  const lines = lineup.split("\n");
  const start = lines.findIndex((l) => /^\*\*Proposed registry update:\*\*/.test(l));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(
    (l) => /^\*\*Full proposed registry:\*\*/.test(l) || /^\s*```/.test(l) || /^\*\*\S/.test(l)
  );
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

// A NEW THEME line is the one registry change that isn't an incremental "moved
// to" — it proposes a new arc, which is a bigger decision than the rest and
// deserves to be visible without reading the whole diff.
function newThemes(diff) {
  return diff
    .split("\n")
    .filter((l) => /NEW THEME/i.test(l))
    .map((l) => l.replace(/^\s*-\s*/, "").replace(/^NEW THEME:\s*/i, "").trim());
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function renderStories(out, stories) {
  out.push(`### ✅ Selected — Big Picture (${stories.length})`);
  out.push("");
  for (const s of stories) {
    out.push(`**${s.n}. ${s.title}**`);
    for (const [key, label] of STORY_FIELDS) {
      if (s.fields[key]) out.push(`- *${label}:* ${s.fields[key]}`);
    }
    out.push("");
  }
}

// A recommended read carries two clauses — what the reader gets, and why it lost
// — and both matter, so both get their own line rather than a 300-character
// run-on. Purely additive: this only inserts newlines at markers it finds, and a
// bullet whose shape drifted falls through and renders verbatim. Nothing is ever
// dropped, which is the rule for every transform in this file — a reviewer
// silently losing half a reason is worse than an ugly line.
function formatRead(text) {
  const parts = text.split(/\s+[—–-]+\s*(worth reading|no slot because):\s*/i);
  if (parts.length < 3) return [text];
  const lines = [parts[0].trim()];
  for (let i = 1; i < parts.length; i += 2) {
    const label = parts[i].charAt(0).toUpperCase() + parts[i].slice(1).toLowerCase();
    const value = (parts[i + 1] || "").trim();
    if (value) lines.push(`   - *${label}:* ${value}`);
  }
  return lines;
}

function renderReads(out, reads) {
  out.push(`### 📚 Recommended reads — high value, no slot (${reads.length})`);
  out.push("");
  out.push(
    "_Stage 4a rated these worth a reader's time even though they did not earn a story or a Quick Hit. " +
      "To run one, add it to the lineup's Quick Hits and redraft._"
  );
  out.push("");
  for (const [i, r] of reads.entries()) {
    const [head, ...rest] = formatRead(r);
    out.push(`${i + 1}. ${head}`);
    out.push(...rest);
  }
  out.push("");
}

function renderCuts(out, cuts) {
  const high = cuts.filter((c) => c.quality === "HIGH");
  const graded = cuts.some((c) => c.quality);
  out.push(`### ✂️ Cut — ${plural(cuts.length, "candidate")}`);
  out.push("");

  if (high.length) {
    // The section's whole reason for existing: a HIGH-quality item cut for fit
    // is a normal editorial outcome AND the single most likely place a real miss
    // is hiding. It leads; the rest is a lookup table.
    out.push(`**${plural(high.length, "cut")} Stage 4a still rates HIGH** — the second-look pile:`);
    out.push("");
    // The rating is the heading here, so repeating "quality: HIGH" on every row
    // is noise. Only stripped when the clause carries its own separator, so a
    // differently-shaped line is left exactly as written rather than mangled.
    for (const c of high) out.push(`- ${c.text.replace(/\s*[—–-]+\s*quality:\s*\*{0,2}HIGH\*{0,2}/i, "")}`);
    out.push("");
  } else if (graded) {
    out.push("_Nothing cut this week was rated HIGH on its own merits._");
    out.push("");
  }

  const rest = cuts.filter((c) => c.quality !== "HIGH");
  if (rest.length) {
    const summary = high.length ? `The other ${rest.length}` : `All ${rest.length}`;
    out.push("<details>");
    out.push(`<summary><b>${summary}</b> — full cut ledger, with Stage 4a's reason for each</summary>`);
    out.push("");
    for (const c of rest) out.push(`- ${c.text}`);
    out.push("");
    out.push("</details>");
    out.push("");
  }

  if (!graded) {
    // Lineups written before the `quality:` field existed still render — they
    // just cannot be sorted. Say which it is rather than implying a clean sweep.
    out.push("_This lineup predates per-cut quality ratings, so the ledger is unsorted._");
    out.push("");
  }
}

function render({ lineup, themes, themesPath }) {
  const stories = parseStories(lineup);
  const quickHits = bullets(sectionLines(lineup, QUICK_HITS_RE));
  const readsBlock = sectionLines(lineup, READS_RE);
  const reads = bullets(readsBlock);
  const cuts = parseCuts(lineup);
  const diff = parseRegistryDiff(lineup);
  if (!stories.length && !quickHits.length && !reads.length && !cuts.length && !diff) return "";

  const out = ["## 🗺️ The editorial decision — read this first", ""];

  // One line that says how the week was decided, before any of the detail. The
  // counts are the fastest possible check on a lineup: "1 Big Picture" or
  // "0 cut" is wrong on its face and worth catching before reading a word.
  const counts = [`**${stories.length}** Big Picture`, `**${quickHits.length}** Quick Hits`];
  // An absent block and an empty one are different claims. Stage 4a writing
  // "none this week" is an editorial judgement worth reporting as 0; a lineup
  // from before the block existed never made that judgement, and printing
  // "0 recommended reads" for it would invent one.
  if (readsBlock) counts.push(`**${reads.length}** recommended reads`);
  counts.push(`**${cuts.length}** cut`);
  const highCuts = cuts.filter((c) => c.quality === "HIGH").length;
  if (highCuts) counts[counts.length - 1] += ` (**${highCuts}** rated HIGH)`;
  out.push(counts.join(" · "));
  out.push("");
  out.push(
    "_The lineup is the decision; the draft is only its execution. Correct it by editing " +
      "the lineup file and re-running `npm run redraft` — not by rewriting the prose._"
  );
  out.push("");

  if (diff) {
    const fresh = newThemes(diff);
    if (fresh.length) {
      out.push(`> **New theme proposed:** ${fresh.join(" · ")}`);
      out.push("> A new arc is a bigger call than a wording change — worth a deliberate yes or no.");
      out.push("");
    }
  }

  if (stories.length) renderStories(out, stories);

  const whyLead = inlineField(lineup, WHY_LEAD_RE);
  const continuity = inlineField(lineup, CONTINUITY_RE);
  if (whyLead) {
    out.push(`**Why the lead beats the runner-up:** ${whyLead}`);
    out.push("");
  }
  if (continuity) {
    out.push(`**Continuity:** ${continuity}`);
    out.push("");
  }

  if (quickHits.length) {
    out.push(`### ✅ Selected — Quick Hits (${quickHits.length})`);
    out.push("");
    for (const q of quickHits) out.push(`- ${q}`);
    out.push("");
  }

  if (reads.length) renderReads(out, reads);
  if (cuts.length) renderCuts(out, cuts);

  if (diff) {
    out.push("### 🧭 Proposed registry update");
    out.push("");
    out.push(diff);
    out.push("");
  }

  if (themes) {
    out.push("<details>");
    out.push("<summary><b>Full proposed registry</b> — the complete themes.md as Stage 4a would rewrite it</summary>");
    out.push("");
    out.push(themes.trim());
    out.push("");
    out.push("</details>");
    out.push("");
    out.push(
      `On approval, copy \`${themesPath}\` over \`content/themes.md\` — it is never auto-updated.`
    );
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.lineup || !fs.existsSync(args.lineup)) return;
  const lineup = fs.readFileSync(args.lineup, "utf-8");
  const themes =
    args.themes && fs.existsSync(args.themes) ? fs.readFileSync(args.themes, "utf-8") : null;
  const output = render({
    lineup,
    themes,
    themesPath: args.themes ? path.relative(process.cwd(), args.themes) : null,
  });
  if (output) console.log(output);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  parseStories,
  parseRegistryDiff,
  newThemes,
  render,
  sectionLines,
  bullets,
  inlineField,
  parseCuts,
  STORY_FIELDS,
};
