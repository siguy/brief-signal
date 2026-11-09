#!/usr/bin/env node

/**
 * The top of the weekly PR body: the three calls the editor makes on Monday,
 * and nothing else.
 *
 *   1. Story selection   — which stories lead (the lineup section follows this)
 *   2. Which voices      — HIGH-signal episodes the edition left out
 *   3. How plays read    — every "Where GCP wins" line and Our Play motion,
 *                          pulled out so they can be read in one pass
 *
 * Facts, links, product names, length and the other mechanical rules are the
 * pipeline's job (lint-briefing.js + repair-briefing.js). This page states
 * whether they all passed, so review never starts with a punch list.
 *
 * Usage: node scripts/review-brief.js --date YYYY-MM-DD
 */

const fs = require("fs");
const path = require("path");
const { lint, briefingDate } = require("./lint-briefing.js");
const { loadSources, normalizeUrl } = require("./sources.js");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
}

// "Where GCP wins:" lines from each angle block, and Our Play's motions.
function plays(md) {
  const out = [];
  const stories = md.split(/^###\s+/m).slice(1);
  for (const st of stories) {
    const title = st.split("\n")[0].trim();
    const win = st.split("\n").find((l) => /\*\*Where (?:GCP wins|the GCP opportunity is):?\*\*/.test(l));
    if (win) out.push({ where: title, text: win.replace(/^\s*-\s*/, "").trim() });
  }
  const ourPlay = md.split(/^##\s+Our Play\s*$/m)[1];
  if (ourPlay) {
    for (const l of ourPlay.split("\n").filter((x) => /^\s*-\s+\*\*/.test(x))) {
      out.push({ where: "Our Play", text: l.replace(/^\s*-\s*/, "").trim() });
    }
  }
  return out;
}

// HIGH editorial-signal podcast episodes whose link never reached the edition.
function voicesLeftOut(md, sources) {
  const cited = new Set([...md.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => normalizeUrl(m[1])));
  return sources.entries
    .filter((e) => e.kind === "podcasts" && e.summary.some((l) => /\*\*Editorial Signal:\*\*\s*HIGH/i.test(l)))
    .filter((e) => !cited.has(normalizeUrl(e.url)))
    .map((e) => ({ title: e.heading.replace(/^##\s*/, ""), url: e.url.replace(/[?&]access_token=[^&]+/, "") }));
}

function render(md, sources) {
  const { hard } = lint(md, sources);
  const lines = ["## Your three calls this week", ""];
  lines.push(
    hard.length
      ? `⚠️ **${hard.length} automated check(s) still failing** after repair — listed at the bottom under "Pipeline checks". Everything else below is editorial.`
      : "✅ **Every fact, link, product-name and structure check passes.** What follows is editorial only.",
    ""
  );

  lines.push("### 1. Story selection", "", "The lineup and how each story maps to a theme are in the next section.", "");

  lines.push("### 2. Which voices", "");
  const left = voicesLeftOut(md, sources);
  if (left.length) {
    lines.push(`HIGH-signal episodes this edition does not cite (${left.length}) — include any that should be heard:`, "");
    for (const v of left) lines.push(`- [${v.title}](${v.url})`);
  } else {
    lines.push("Every HIGH-signal episode this week is cited.");
  }
  lines.push("", "The braid ledger below shows which planned bookmarks made it into each story.", "");

  lines.push("### 3. How each play reads", "");
  const p = plays(md);
  if (p.length) for (const x of p) lines.push(`- _${x.where}_ — ${x.text}`);
  else lines.push("_No plays found — check the angle blocks and Our Play._");
  lines.push("");

  if (hard.length) {
    lines.push("<details><summary><b>Pipeline checks still failing</b></summary>", "", ...hard.map((h) => `- ${h}`), "", "</details>");
  }
  return lines.join("\n");
}

function main() {
  const date = arg("date");
  const file = date ? path.join(BRIEFINGS_DIR, `${date}.md`) : null;
  if (!file || !fs.existsSync(file)) {
    console.error(`review-brief: no briefing for --date ${date}`);
    process.exit(1);
  }
  const md = fs.readFileSync(file, "utf-8");
  console.log(render(md, loadSources(briefingDate(md, file))));
}

if (require.main === module) main();

module.exports = { plays, voicesLeftOut, render };
