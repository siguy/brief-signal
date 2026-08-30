#!/usr/bin/env node

/**
 * Brief Signal — Braid Ledger
 *
 * Compares Stage 4a's PLAN against Stage 4b's PROSE.
 *
 * Why it exists: the lineup's `braids in:` field is the one place the pipeline
 * writes down what it intends to do — which bookmarks each Big Picture story
 * should weave in alongside its anchor. Nothing downstream ever checks whether
 * they arrived. lint-briefing.js grades the finished draft against mechanical
 * rules; signal-digest.js asks what the KBs held that the draft never cited.
 * Neither asks the question this file asks: *did we do what we said we'd do?*
 *
 * On Edition #28 the answer was 7 of 10. Two braids vanished between plan and
 * prose (@mardehaym's agentic-org maturity model, @quxiaoyin's 75x task-cost
 * spread), and a third — @SemiAnalysis_'s Jalapeño benchmark — ran as a story
 * but was credited to OpenAI's own announcement instead of to the analysis that
 * made the claim.
 *
 * That third case is why this is not a yes/no check. Three outcomes:
 *
 *   landed       the braid's permalink appears in the draft
 *   substituted  the permalink is absent, but the subject matter is present —
 *                so the story survived and only the attribution changed
 *   dropped      neither the permalink nor the subject reached the draft
 *
 * ADVISORY, and deliberately so. A story legitimately tightens during drafting
 * and a planned citation can stop earning its place. This reports the delta for
 * a human to judge; it never fails a run and always exits 0.
 *
 * No LLM and no dependencies — string matching over two files the pipeline has
 * already written, so it cannot talk itself out of a finding.
 *
 * Run: npm run braids                  (latest lineup vs its briefing)
 *      npm run braids -- --date 2026-08-31
 */

const fs = require("fs");
const path = require("path");

const BRIEFINGS_DIR = path.join(__dirname, "..", "content", "briefings");
const DRAFTS_DIR = path.join(BRIEFINGS_DIR, "drafts");

// Capitalised tokens that carry no identifying weight. Without this, sentence
// openers and generic nouns read as proper nouns and every braid looks present.
const STOPWORDS = new Set([
  "the", "this", "that", "and", "for", "with", "from", "into", "his", "her",
  "their", "its", "our", "new", "how", "why", "what", "when", "who", "over",
  "under", "after", "before", "about", "across", "against", "between",
  "summary", "analysis", "paper", "report", "post", "thread", "piece",
  "story", "take", "note", "update", "launch", "week", "weekly", "day",
  "first", "second", "third", "one", "two", "three", "seven",
]);

/**
 * Split a `braids in:` body into one segment per planned braid.
 *
 * Stage 4a has emitted three different shapes across five editions, so this
 * cannot assume one:
 *   2026-08-31  @handle (what it carries), @handle (what it carries)
 *   2026-08-17  [@handle (1 min read)](url), [@handle (1 min read)](url)
 *   2026-08-24  Show's (date) point about X; Show (date) on Y   ← prose, no handles
 *
 * Semicolons only ever separate braids (the prose form). Commas appear inside
 * descriptions too, so the comma split requires a following @ or [@.
 */
function splitSegments(body) {
  const s = String(body);
  if (s.includes(";")) return s.split(";").map((x) => x.trim()).filter(Boolean);
  return s.split(/,\s*(?=\[?@)/).map((x) => x.trim()).filter(Boolean);
}

/**
 * A parenthetical is only a description if it says something about content.
 * The markdown-link form puts a read time there, and the prose form puts a
 * date — neither is evidence of anything, and treating "1 min read" as a
 * description would make every braid look keyword-checkable when it isn't.
 */
function cleanDescription(raw) {
  const d = String(raw || "").trim();
  if (/^\d+\s*min\s*(read|watch|listen)$/i.test(d)) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return d;
}

/**
 * Pull `braids in:` entries out of a lineup file.
 *
 * Returns { braids, unparsed }. A segment naming no @handle cannot be checked
 * against the draft — the 2026-08-24 lineup wrote its braids as prose naming
 * shows ("Hard Fork (2026-08-21) on ..."), with nothing to match a permalink
 * against. Those are counted and surfaced rather than dropped: a checker that
 * silently reports 1 planned braid where the lineup planned 9 is worse than one
 * that admits it cannot read the line.
 */
function parseBraids(lineupText) {
  const braids = [];
  const unparsed = [];
  let story = 0;
  for (const line of String(lineupText).split("\n")) {
    // Numbered story headings look like "1. **Title...". Track which story the
    // following braid line belongs to.
    const heading = line.match(/^\s*(\d+)\.\s+\*\*/);
    if (heading) story = Number(heading[1]);
    if (!/braids in:/i.test(line)) continue;

    const body = line.slice(line.toLowerCase().indexOf("braids in:") + 10);
    for (const seg of splitSegments(body)) {
      const m = seg.match(/@([A-Za-z0-9_]+)\s*(?:\(([^)]*)\))?/);
      if (!m) {
        unparsed.push({ story: story || null, text: seg.replace(/\s+/g, " ").trim() });
        continue;
      }
      braids.push({
        story: story || null,
        handle: m[1],
        description: cleanDescription(m[2]),
      });
    }
  }
  return { braids, unparsed };
}

/**
 * Distinctive terms from a braid description, used only when the permalink is
 * absent — they answer "did the SUBJECT reach the draft even though the source
 * did not?".
 *
 * Two kinds, both chosen because they survive rewriting:
 *   proper nouns  Jalapeño, Blackwell, AgentSky, WikiSkill
 *   figures       $12.9B, 75x, $11/mo, 100+
 *
 * Ordinary prose words are deliberately NOT collected. "adoption" or "agents"
 * appear all over a briefing about agents, and matching on them would report
 * every dropped braid as substituted.
 */
function keywords(description) {
  const text = String(description || "");
  const out = new Set();

  // Proper nouns: initial capital, 3+ chars, accents allowed (Jalapeño).
  for (const tok of text.match(/\b[A-ZÀ-Þ][A-Za-zÀ-ÿ0-9._-]{2,}\b/g) || []) {
    if (!STOPWORDS.has(tok.toLowerCase())) out.add(tok);
  }
  // Figures: $12.9B, 75x, 100+, $11/mo, 90%.
  for (const tok of text.match(/\$?\d[\d.,]*\s?(?:[BMK]\b|x\b|%|\+|\/mo\b)/gi) || []) {
    out.add(tok.replace(/\s+/g, ""));
  }
  return [...out];
}

/** A draft cites a braid when the handle's permalink is present. */
function cited(handle, draftText) {
  return new RegExp(`x\\.com/${handle}/`, "i").test(String(draftText));
}

/**
 * How many times a term occurs in the draft. Used to rank matched keywords by
 * rarity: the rarest term localises best.
 *
 * This is not a micro-optimisation. @SemiAnalysis_'s description is "OpenAI
 * Jalapeño ASIC vs. Nvidia Blackwell", and "OpenAI" appears throughout a
 * briefing about OpenAI. Reporting the first match sent the reader to Story 1's
 * paragraph and blamed the wrong citation (@grosen). "Jalapeño" occurs once, on
 * the Quick Hit that actually carries the story.
 */
function occurrences(draftText, term) {
  const hay = String(draftText).toLowerCase();
  const needle = String(term).toLowerCase();
  if (!needle) return 0;
  let count = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    count++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return count;
}

/** Markdown link targets on the line where a keyword surfaced. */
function urlsNear(draftText, keyword) {
  const lines = String(draftText).split("\n");
  const needle = keyword.toLowerCase();
  for (const line of lines) {
    if (!line.toLowerCase().includes(needle)) continue;
    const urls = (line.match(/\]\((https?:\/\/[^)\s]+)\)/g) || [])
      .map((u) => u.replace(/^\]\(/, "").replace(/\)$/, ""));
    if (urls.length) return urls;
  }
  return [];
}

/**
 * Classify one planned braid against the draft.
 *
 * `checkable` is not decoration. When a description yields no proper nouns and
 * no figures (e.g. "seven steps from tool adoption to agentic org") there is
 * nothing distinctive to search for, so "dropped" is an inference rather than a
 * finding. Saying so keeps the report honest instead of overclaiming.
 */
function classify(braid, draftText) {
  if (cited(braid.handle, draftText)) {
    return { ...braid, status: "landed", checkable: true, matched: [], urls: [] };
  }
  const terms = keywords(braid.description);
  // Rarest first — the least common matching term points at the one passage
  // actually carrying this braid's subject, not at every mention of "OpenAI".
  const matched = terms
    .filter((t) => occurrences(draftText, t) > 0)
    .sort((a, b) => occurrences(draftText, a) - occurrences(draftText, b));
  if (matched.length) {
    return {
      ...braid,
      status: "substituted",
      checkable: true,
      matched,
      urls: urlsNear(draftText, matched[0]),
    };
  }
  return {
    ...braid,
    status: "dropped",
    checkable: terms.length > 0,
    matched: [],
    urls: [],
  };
}

function ledger(lineupText, draftText) {
  const { braids, unparsed } = parseBraids(lineupText);
  return { rows: braids.map((b) => classify(b, draftText)), unparsed };
}

function render(result, date) {
  const rows = Array.isArray(result) ? result : result.rows;
  const unparsed = Array.isArray(result) ? [] : result.unparsed || [];
  if (!rows.length && !unparsed.length) return "";
  const n = (s) => rows.filter((r) => r.status === s).length;
  const landed = n("landed");
  const sub = n("substituted");
  const dropped = n("dropped");

  const out = [];
  out.push(`## 🧵 Braid ledger — ${date}`);
  out.push("");
  out.push(
    `Stage 4a planned **${rows.length + unparsed.length}** braids. ` +
      `**${landed} landed**, **${sub} substituted**, **${dropped} dropped**` +
      (unparsed.length ? `, **${unparsed.length} unreadable**` : "") +
      "."
  );
  out.push("");
  out.push(
    "_Advisory. A story legitimately tightens while drafting, so a dropped " +
      "braid is a judgment call, not a failure._"
  );
  out.push("");
  out.push("| Story | Braid | Carries | Outcome |");
  out.push("|---|---|---|---|");
  const mark = { landed: "✅ landed", substituted: "🔀 substituted", dropped: "⚠️ dropped" };
  for (const r of rows) {
    let note = mark[r.status];
    if (r.status === "substituted" && r.urls.length) {
      note += `<br>cited to \`${r.urls[0]}\``;
    } else if (r.status === "dropped" && !r.checkable) {
      note += "<br>_no distinctive terms — verify by hand_";
    }
    const carries = r.description ? r.description.replace(/\|/g, "\\|") : "—";
    out.push(`| ${r.story ?? "—"} | \`@${r.handle}\` | ${carries} | ${note} |`);
  }

  if (unparsed.length) {
    out.push("");
    out.push(
      `**${unparsed.length} braid${unparsed.length === 1 ? "" : "s"} could not be checked.** ` +
        "These segments name a show or article in prose without an `@handle` or " +
        "permalink, so there is nothing to match against the draft. Pinning the " +
        "`braids in:` format in `scripts/briefing-prompt.md` would make them checkable."
    );
    out.push("");
    for (const u of unparsed) {
      out.push(`- _story ${u.story ?? "—"}_ — ${u.text.slice(0, 150)}`);
    }
  }

  if (sub) {
    out.push("");
    out.push(
      "**Substituted** means the subject reached the edition but the planned " +
        "source did not — the story ran, credited elsewhere. Worth checking the " +
        "citation points at whoever actually made the claim."
    );
  }
  return out.join("\n");
}

function parseArgs(argv) {
  const args = { date: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--date" && argv[i + 1]) args.date = argv[++i];
  }
  return args;
}

function latestDate() {
  if (!fs.existsSync(DRAFTS_DIR)) return null;
  const dates = fs
    .readdirSync(DRAFTS_DIR)
    .map((f) => (f.match(/^(\d{4}-\d{2}-\d{2})-lineup\.md$/) || [])[1])
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function main() {
  const date = parseArgs(process.argv.slice(2)).date || latestDate();
  if (!date) {
    console.error("No lineup files found — nothing to check.");
    return;
  }
  const lineupPath = path.join(DRAFTS_DIR, `${date}-lineup.md`);
  const draftPath = path.join(BRIEFINGS_DIR, `${date}.md`);

  // Missing inputs are normal, not errors: a lineup-gated run has no draft, and
  // pre-2026-08-03 lineups predate the `braids in:` field. Say so and exit 0 —
  // an advisory check must never be the reason a PR does not open.
  for (const [label, p] of [["lineup", lineupPath], ["briefing", draftPath]]) {
    if (!fs.existsSync(p)) {
      console.error(`No ${label} at ${p} — skipping braid ledger.`);
      return;
    }
  }

  const result = ledger(
    fs.readFileSync(lineupPath, "utf8"),
    fs.readFileSync(draftPath, "utf8")
  );
  if (!result.rows.length && !result.unparsed.length) {
    console.error(`Lineup ${date} carries no 'braids in:' lines — nothing to check.`);
    return;
  }
  console.log(render(result, date));
}

if (require.main === module) main();

module.exports = { parseBraids, splitSegments, cleanDescription, keywords, cited, occurrences, urlsNear, classify, ledger, render, parseArgs };
