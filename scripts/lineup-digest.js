#!/usr/bin/env node

/**
 * Brief Signal — Lineup Digest
 *
 * Renders the editorial half of the PR body: the themes ↔ stories mapping and
 * the full proposed theme registry, both pulled out of the Stage 4a lineup.
 *
 * Why it exists: the lineup and the registry diff are what Simon actually
 * reviews, but until now the PR body led with ~270 lines of ratings table and
 * put the registry update at line 329. His verdict on Edition #25: "I just see
 * the ratings." The registry was there; it was simply unreachable. This script
 * renders the editorial layer so generate-weekly.sh can put it FIRST.
 *
 * The themes ↔ stories mapping never existed in the PR body at all — it lives
 * as an `advances:` line per story inside the committed lineup file. Inlining it
 * is what makes "which story is driving this registry change?" answerable
 * without opening a second file.
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

// Big Picture stories are numbered `1. **Title**`, with indented `- key: value`
// detail lines beneath. We want the title plus the two fields that carry the
// editorial argument: which arcs it advances, and how much corroboration it has.
function parseStories(lineup) {
  const stories = [];
  let current = null;
  for (const raw of lineup.split("\n")) {
    const head = raw.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*$/);
    if (head) {
      if (current) stories.push(current);
      current = { n: head[1], title: head[2], advances: null, gravity: null };
      continue;
    }
    if (!current) continue;
    // A blank line or a new top-level bold block ends the story list.
    if (/^\*\*/.test(raw)) {
      stories.push(current);
      current = null;
      continue;
    }
    // Bullet char and indent both vary run to run — Gemini writes `   - advances:`
    // on some editions and `    *   advances:` on others. Matching only "-" cost
    // the entire mapping on the first live run: titles rendered, every Advances
    // and Gravity line silently vanished.
    const field = raw.match(/^\s*[-*+]\s*(advances|gravity):\s*(.+)$/i);
    if (field) current[field[1].toLowerCase()] = field[2].trim();
  }
  if (current) stories.push(current);
  return stories;
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

function render({ lineup, themes, themesPath }) {
  const stories = parseStories(lineup);
  const diff = parseRegistryDiff(lineup);
  if (!stories.length && !diff) return "";

  const out = ["## 🗺️ Themes ↔ stories — read this first", ""];

  if (stories.length) {
    out.push("**This edition's Big Picture stories and the arcs they advance:**");
    out.push("");
    for (const s of stories) {
      out.push(`**${s.n}. ${s.title}**`);
      if (s.advances) out.push(`- *Advances:* ${s.advances}`);
      if (s.gravity) out.push(`- *Gravity:* ${s.gravity}`);
      out.push("");
    }
  }

  if (diff) {
    const fresh = newThemes(diff);
    if (fresh.length) {
      out.push(`> **New theme proposed:** ${fresh.join(" · ")}`);
      out.push("> A new arc is a bigger call than a wording change — worth a deliberate yes or no.");
      out.push("");
    }
    out.push("**Proposed registry update:**");
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

  return out.join("\n");
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

module.exports = { parseArgs, parseStories, parseRegistryDiff, newThemes, render };
