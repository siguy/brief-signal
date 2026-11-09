/**
 * Fact checks for a drafted briefing — plain code, no LLM.
 *
 * Edition #38's first draft shipped to review with a made-up product ("Cloud
 * Run Sandboxes") and 11 numbers or quotes credited to the wrong person or
 * backed only by an AI summary line. A human fact-check found them by doing,
 * by hand, exactly what this file does mechanically:
 *
 *   1. follow each claim's citation link back to the knowledge-base entry
 *   2. look for the number / quoted words in what the source actually SAID
 *      (its quote lines or post body — never the extractor's Takeaway/Budget
 *      lines; see sources.js)
 *   3. check the person the draft credits is the person who said it
 *
 * and, for products: is every Google product name real, i.e. present in the
 * playbook, the week's sources, or the hand-kept config/gcp-products.txt?
 *
 * Every finding carries enough detail for repair-briefing.js to fix it without
 * guessing: the sentence, the claim, and — when the week's sources contain it
 * exactly once — the correct speaker, URL and timestamp.
 */

const { entriesForUrl, normalizeUrl } = require("./sources.js");

// --- markdown structure -------------------------------------------------------

function stripFrontmatter(md) {
  return md.replace(/^---\n[\s\S]*?\n---\n/, "");
}

// Top-level "## " sections, keyed by heading text.
function sections(md) {
  const out = [];
  const lines = stripFrontmatter(md).split("\n");
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      cur = { heading: m[1].trim(), lines: [] };
      out.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return out.map((s) => ({ heading: s.heading, body: s.lines.join("\n") }));
}

const ANGLE_HEADING = /\*\*Your angle with founders:?\*\*/;

// Text units to check, each tagged with the rule set that applies to it.
//   kind: "tldr" | "story" | "angle" | "quickhit" | "ourplay" | "edge"
function units(md) {
  const out = [];
  for (const sec of sections(md)) {
    const h = sec.heading;
    if (/^TLDR/i.test(h)) {
      for (const b of bullets(sec.body)) out.push({ kind: "tldr", section: "TLDR", text: b });
    } else if (/^The Big Picture/i.test(h)) {
      const stories = sec.body.split(/^###\s+/m).slice(1);
      for (const st of stories) {
        const title = st.split("\n")[0].trim();
        const body = st.split("\n").slice(1).join("\n");
        const [prose, ...angle] = body.split(ANGLE_HEADING);
        for (const p of paragraphs(prose)) out.push({ kind: "story", section: title, text: p, story: title });
        for (const a of bullets(angle.join("\n"))) out.push({ kind: "angle", section: `${title} — angle`, text: a, story: title });
      }
    } else if (/^Quick Hits/i.test(h)) {
      for (const b of bullets(sec.body)) out.push({ kind: "quickhit", section: "Quick Hits", text: b });
    } else if (/^Our Play/i.test(h)) {
      for (const p of paragraphs(sec.body)) out.push({ kind: "ourplay", section: "Our Play", text: p });
    } else if (/^Seller'?s Edge/i.test(h)) {
      for (const p of paragraphs(sec.body)) out.push({ kind: "edge", section: "Seller's Edge", text: p });
    }
  }
  return out;
}

function bullets(body) {
  return body
    .split("\n")
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, ""));
}

function paragraphs(body) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^!\[/.test(p) && !/^\*Sources:/.test(p))
    .flatMap((p) => (/^\s*-\s+/m.test(p) ? bullets(p) : [p]));
}

// Replace links with placeholders so sentence splitting ignores URL dots, then
// return sentences with the links each one carries. A label's text stays in the
// prose (minus its "(69 min watch, 23:45)" tail): drafts often make the claim
// the link text itself — "[948 local privilege-escalation zero-days (1 min read)]".
function sentencesWithLinks(text) {
  const links = [];
  const masked = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, url) => {
      links.push({ label, url });
      return ` \u0000${links.length - 1}\u0000 `;
    });
  return splitSentences(masked).map((p) => {
    const own = [...p.matchAll(/\u0000(\d+)\u0000/g)].map((m) => links[+m[1]]);
    const prose = p
      .replace(/\u0000(\d+)\u0000/g, (_, i) => ` | ${labelText(links[+i].label)} | `)
      .replace(/\s+/g, " ")
      .trim();
    return { prose, links: own };
  });
}

function labelText(label) {
  return label.replace(/\s*\([^)]*\)\s*$/, "").replace(/\*\*/g, "");
}

// Sentence boundaries: ". " / "? " / "! " before a capital — but never inside
// a quotation ("...for GPUs? No bid," Jamin Ball said — is ONE sentence).
function splitSentences(text) {
  const out = [];
  let start = 0;
  let inStraight = false;
  let curlyDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inStraight = !inStraight;
    else if (c === "“") curlyDepth++;
    else if (c === "”") curlyDepth = Math.max(0, curlyDepth - 1);
    else if (/[.!?]/.test(c) && !inStraight && curlyDepth === 0 && /^\s+[A-Z0-9"“*\u0000(]/.test(text.slice(i + 1, i + 3))) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

// --- numbers --------------------------------------------------------------------

const MULT = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mn: 1e6, million: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9,
  t: 1e12, trn: 1e12, tn: 1e12, trillion: 1e12,
};
const SUFFIX =
  "(?:%|\\s?percent|x|×|k|K|M|B|T|b|m|t|bn|mn|trn|tn|\\s?thousand|\\s?million|\\s?billion|\\s?trillion|\\s?GW|\\s?MW|\\s?gigawatts?|\\s?megawatts?)";
const LABEL_WORDS = /\b(?:Chapter|Section|Series|Edition|Episode|EP|Ep|No|Phase|Gen|Version|Title|Rule|Article|Item|Form|#)\.?\s*$/;
const MONTHS = /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*$/;

function suffixInfo(suffix) {
  const s = (suffix || "").trim().toLowerCase();
  if (!s) return { mult: 1, pct: false, unit: "" };
  if (s === "%" || s === "percent") return { mult: 1, pct: true, unit: "%" };
  if (s === "x" || s === "×") return { mult: 1, pct: false, unit: "x" };
  if (/^(gw|gigawatts?)$/.test(s)) return { mult: 1, pct: false, unit: "gw" };
  if (/^(mw|megawatts?)$/.test(s)) return { mult: 1, pct: false, unit: "mw" };
  return { mult: MULT[s] || 1, pct: false, unit: "" };
}

/**
 * Numbers in prose, normalised so "$1.2M", "1.2 million" and "1,200,000"
 * compare equal. `strict` (used on the DRAFT) skips noise: years, dates,
 * model/version numbers (GPT-6, B200, Q3) and bare small integers (one-ten
 * without a unit are counts like "3 motions", not citable figures).
 */
function extractNumbers(text, { strict = false } = {}) {
  const out = [];
  const re = new RegExp(
    `(?<![A-Za-z0-9.#/'’])(?<![A-Za-z0-9]-)(\\$?)(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)(${SUFFIX})?(?![A-Za-z0-9]|\\/\\d)`,
    "g"
  );
  let m;
  while ((m = re.exec(text)) !== null) {
    const [raw, dollar, digits] = m;
    let suffix = m[3];
    // "$10–20k", "$417 and $431 billion": the second number's magnitude applies
    // to the first. With "and"/"to" only for dollar amounts and a magnitude —
    // "Fable 5.1 and 67%" is two separate figures, not a percent range.
    if (!suffix) {
      const rest = text.slice(m.index + raw.length);
      const dash = rest.match(new RegExp(`^\\s?[–-]\\s?\\$?\\d[\\d,]*(?:\\.\\d+)?(${SUFFIX})`));
      const word = dollar && rest.match(new RegExp(`^\\s(?:and|to)\\s\\$?\\d[\\d,]*(?:\\.\\d+)?(${SUFFIX})`));
      if (dash) suffix = dash[1];
      else if (word && suffixInfo(word[1]).mult > 1) suffix = word[1];
    }
    const base = parseFloat(digits.replace(/,/g, ""));
    if (!isFinite(base)) continue;
    const { mult, pct, unit } = suffixInfo(suffix);
    if (strict) {
      const before = text.slice(0, m.index);
      const hasUnit = Boolean(dollar || suffix);
      if (!hasUnit && /^(19|20)\d\d$/.test(digits)) continue; // year
      if (MONTHS.test(before)) continue; // "November 6"
      if (LABEL_WORDS.test(before)) continue; // "Chapter 11", "Episode 499"
      if (!hasUnit && !digits.includes(".") && base <= 10) continue;
      if (!hasUnit && digits.includes(".") && /(?:^|\s)[\w-]*[A-Z-][\w-]*\s$/.test(before)) continue; // "Qwen 3.8", "llm-d 1.0"
      if (/^[-‐]?(?:page|year|day|week|month|hour|minute|person)\b/i.test(text.slice(m.index + raw.length))) continue; // "400-page"
    }
    out.push({ raw: raw.trim(), value: base * mult, pct, unit, index: m.index });
  }
  return out;
}

// "41" turns up in a dozen unrelated quotes; "$15B" or "470 gigawatts" in one.
// Only a distinctive number is worth naming as "the correct source".
function isDistinctive(n) {
  return n.pct || n.unit || /[$.]/.test(n.raw) || n.value >= 1000;
}

function sameNumber(a, b) {
  if (a.pct !== b.pct) return false;
  if (a.value === b.value) return true;
  const rel = Math.abs(a.value - b.value) / Math.max(Math.abs(a.value), Math.abs(b.value));
  return rel < 0.005;
}

// Speakers say "four to five bucks" and "30 cents"; drafts write "$4–5" and
// "$0.30". Rewrite the spoken forms before comparing (source side only).
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};
function spokenToDigits(text) {
  return String(text)
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b/gi, (w) => String(WORD_NUM[w.toLowerCase()]))
    .replace(/\b(\d+(?:\.\d+)?)\s*cents?\b/gi, (_, n) => `$${(parseFloat(n) / 100).toFixed(2)}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:times|-fold|fold)\b/gi, "$1x");
}

function containsNumber(text, n) {
  return extractNumbers(spokenToDigits(text)).some((x) => sameNumber(x, n));
}

// --- quoted words -----------------------------------------------------------------

function normWords(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9$%'.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Phrases the draft puts in quotation marks: claims of what someone SAID.
// One-word scare quotes ("super-agent") are labels, not quotes.
function extractQuotes(prose) {
  const out = [];
  for (const m of prose.matchAll(/["“]([^"”]{3,300})["”]/g)) {
    if (m[1].trim().split(/\s+/).length >= 2) out.push(m[1].trim());
  }
  return out;
}

function containsQuote(text, q) {
  return normWords(text).includes(normWords(q));
}

// --- citations ----------------------------------------------------------------------

// "Jason Lemkin on 20VC (69 min watch, 23:45)" -> { speaker: "Jason Lemkin", ts: 23.75 }
// "@hosun_chung (1 min read)"                    -> { speaker: "@hosun_chung" }
// "AI Daily Brief (25 min listen, 11:10)"         -> { speaker: null }
function parseLabel(label) {
  const clean = label.replace(/\([^)]*\)\s*$/, "").trim();
  const tsm = label.match(/\(([^)]*)\)\s*$/);
  const ts = tsm ? require("./sources.js").parseTimestamp(tsm[1].split(",").slice(1).join(",")) : null;
  let speaker = null;
  const on = clean.match(/^(.+?)\s+on\s+\S/);
  if (on) speaker = on[1].trim();
  else if (/^@\w+$/.test(clean)) speaker = clean;
  return { speaker, ts };
}

function sameSpeaker(labelSpeaker, quoteSpeaker) {
  if (!labelSpeaker) return true;
  const a = labelSpeaker.toLowerCase().replace(/^@/, "");
  const b = String(quoteSpeaker || "").toLowerCase().replace(/^@/, "");
  if (!b) return false;
  if (a === b) return true;
  const last = (s) => s.split(/[\s&,]+/).filter(Boolean).pop();
  // "Martin Casado and Jamin Ball" credits either.
  const names = a.split(/\s+(?:and|&)\s+|,\s*/);
  return names.some((n) => b.includes(last(n)) || n.includes(last(b)));
}

// Who does this sentence credit? The citation label's speaker plus any of the
// entry's own speakers the prose names ("Nathan Labenz and Pash Nin noted").
// null = nobody is credited, so any speaker in the entry may back the claim.
// Edition #38 credited a Latent Space host's GitHub stat to guest Jay Parikh
// in a link label with no "X on Show" form — the prose named him, so this
// catches it.
function creditedSpeakers(labelSpeaker, prose, entry) {
  const names = [];
  if (labelSpeaker) names.push(labelSpeaker);
  const p = prose.toLowerCase();
  for (const q of entry.quotes) {
    if (!q.speaker || q.body) continue;
    for (const part of q.speaker.split(/\s+(?:and|&)\s+|,\s*/)) {
      const last = part.trim().split(/\s+/).pop();
      if (last && last.length > 2 && new RegExp(`\\b${last.toLowerCase().replace(/[^a-z0-9]/g, "")}\\b`).test(p)) {
        names.push(part.trim());
      }
    }
  }
  return names.length ? [...new Set(names)] : null;
}

function fmtTs(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const mm = Math.floor(min % 60);
  const ss = Math.round((min * 60) % 60);
  const p = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

const TS_TOLERANCE_MIN = 3;

/**
 * Look for `matches(text)` across the cited entries, then the whole week.
 * Returns { ok, reason, fix } where reason is one of
 *   ok | misattributed | timestamp | summary-only | wrong-source | not-found | no-link
 */
function verify(matches, links, sources, paragraphLinks, prose = "", distinctive = true) {
  const cited = (links.length ? links : paragraphLinks).filter((l) => /^https?:\/\//.test(l.url));
  if (!cited.length) return { ok: false, reason: "no-link" };

  let otherSpeaker = null;
  let tsMiss = null;
  let summaryOnly = false;
  let unverifiable = false;
  for (const link of cited) {
    const { speaker, ts } = parseLabel(link.label);
    // A hand-curated first-party page (gcp-products.txt) was read by a human
    // when it was added; the KB holds at most a 400-char excerpt of it.
    if (isCuratedUrl(link.url, sources)) {
      unverifiable = true;
      continue;
    }
    const entries = entriesForUrl(sources, link.url);
    if (!entries.length) continue;
    for (const e of entries) {
      const hits = e.quotes.filter((q) => matches(q.text));
      const allowed = creditedSpeakers(speaker, prose, e);
      const bySpeaker = hits.filter((q) => q.body || allowed === null || allowed.some((a) => sameSpeaker(a, q.speaker)));
      if (bySpeaker.length) {
        if (ts == null || bySpeaker.some((q) => q.ts == null || Math.abs(q.ts - ts) <= TS_TOLERANCE_MIN)) {
          return { ok: true };
        }
        tsMiss = tsMiss || { link, quote: bySpeaker[0], entry: e };
        continue;
      }
      if (hits.length) otherSpeaker = otherSpeaker || { link, quote: hits[0], entry: e };
      if (e.summary.some((l) => matches(l))) summaryOnly = true;
    }
  }
  // A hand-curated first-party link (gcp-products.txt) is accepted: the page
  // was checked by a human when it was added, and its text is not in the KBs.
  if (unverifiable) return { ok: true };
  if (tsMiss) {
    return {
      ok: false,
      reason: "timestamp",
      fix: fixFrom(tsMiss.entry, tsMiss.quote),
    };
  }
  if (otherSpeaker) return { ok: false, reason: "misattributed", fix: fixFrom(otherSpeaker.entry, otherSpeaker.quote) };

  // Not in what the cited source said. Is it anywhere in the week's primary text?
  const elsewhere = [];
  for (const e of sources.entries) {
    for (const q of e.quotes) if (matches(q.text)) elsewhere.push({ entry: e, quote: q });
  }
  const distinct = [...new Map(elsewhere.map((x) => [normalizeUrl(x.entry.url), x])).values()];
  if (distinct.length === 1 && distinctive) return { ok: false, reason: "wrong-source", fix: fixFrom(distinct[0].entry, distinct[0].quote) };
  if (summaryOnly) return { ok: false, reason: "summary-only" };
  return { ok: false, reason: "not-found", candidates: distinct.length };
}

function fixFrom(entry, quote) {
  return {
    speaker: quote.speaker || entry.author || null,
    url: entry.url,
    ts: quote.ts != null ? fmtTs(quote.ts) : null,
    show: entry.heading.replace(/^#+\s*/, "").replace(/\s*\(\d{4}-\d{2}-\d{2}\).*$/, "").replace(/^\[/, ""),
    quote: quote.text.length > 280 ? `${quote.text.slice(0, 280)}…` : quote.text,
  };
}

function isCuratedUrl(url, sources) {
  const n = normalizeUrl(url);
  return (sources.products || []).some((p) => p.url && normalizeUrl(p.url) === n);
}

const REASON_TEXT = {
  "no-link": "has no source link in its sentence or paragraph",
  misattributed: "is in the cited source, but said by someone else",
  timestamp: "is said by that speaker, but not near the cited timestamp",
  "summary-only": "appears only in an AI summary line (Takeaway/Budget/Consensus), not in anything the source said",
  "wrong-source": "is not in the cited source — it comes from a different source this week",
  "not-found": "is not in anything the cited source said",
};

function describeFix(f) {
  if (!f) return "";
  const who = f.speaker ? `${f.speaker}` : "the source";
  return ` Correct source: ${who}, ${f.show}${f.ts ? ` at ${f.ts}` : ""} (${f.url}) — "${f.quote}"`;
}

// --- products -------------------------------------------------------------------------

// Words that start a Google product name. A candidate is one of these followed
// by more Capitalised words ("Cloud Run Sandboxes", "Agent Platform"). One-word
// mentions are not checked: an invented product is always a compound name.
const PRODUCT_PREFIXES = [
  "Google", "Cloud", "Gemini", "Gemma", "Agent", "Agents", "Vertex", "GKE", "BigQuery", "AlloyDB",
  "Spanner", "Firestore", "Firebase", "Looker", "Model", "Security", "Chronicle", "Mandiant",
  "Wiz", "TPU", "Antigravity", "Jules", "Workspace", "NotebookLM", "Imagen", "Veo", "Apigee",
  "Dataflow", "Dataproc", "Memorystore", "Bigtable", "Colab", "Kaggle", "Compute", "Anthos",
];
// Trailing words that make a real product generic ("Google Cloud customers").
const GENERIC_TAIL = new Set([
  "TPUs", "TPU", "GPUs", "GPU", "Credits", "Customers", "Sales", "Team", "Teams", "Blog", "Next",
  "Account", "Accounts", "Rep", "Reps", "Sellers", "Seller", "Users", "Pricing", "Region", "Regions",
  "Capacity", "Revenue", "Business", "Console", "Docs", "Partners", "Partner", "Free", "Tier", "Sessions",
  "Tech", "Podcast", "Channel", "Community", "Events", "Event",
]);
const STOP_AFTER = new Set(["The", "This", "That", "These", "Those", "If", "When", "And", "Or", "But", "A", "An", "In", "On", "For", "To", "With", "At", "By", "As", "Is", "Are", "Our", "Your", "Their", "It", "Where", "While"]);

function productCandidates(prose) {
  const tokens = prose.split(/\s+/);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t0 = tokens[i].replace(/^[("“*_]+/, "");
    const w0 = t0.replace(/[)"”*_.,;:!?]+$/, "");
    if (!PRODUCT_PREFIXES.includes(w0) || /[.,;:!?)]$/.test(t0)) continue;
    const words = [w0];
    for (let j = i + 1; j < tokens.length && words.length < 6; j++) {
      const raw = tokens[j];
      const possessive = /['’]s\b/.test(raw);
      const w = raw.replace(/['’]s\b.*$/, "").replace(/[)"”*_.,;:!?]+$/, "");
      if (!/^([A-Z][A-Za-z0-9]*|\d+(\.\d+)?|AI|ML)$/.test(w) || STOP_AFTER.has(w)) break;
      words.push(w);
      if (possessive || /[.,;:!?)]$/.test(raw.replace(/[*_"”]+$/, ""))) break;
    }
    if (words.length >= 2) {
      out.push(words);
      i += words.length - 1;
    }
  }
  return out;
}

function productKnown(words, corpus) {
  const tryName = (ws) => corpus.includes(` ${ws.join(" ").toLowerCase()}`);
  let ws = words.slice();
  while (ws.length >= 2) {
    if (COMPANY_NAMES.has(ws.join(" ")) || tryName(ws)) return true;
    if (GENERIC_TAIL.has(ws[ws.length - 1])) ws = ws.slice(0, -1);
    else return false;
  }
  return ws.length < 2; // trimmed down to one word: generic use of a brand
}

function productCorpus(sources) {
  const names = (sources.products || []).map((p) => p.name).join("\n");
  return ` ${`${sources.playbook}\n${sources.kbText}\n${names}`.replace(/[*_`"“”()[\]]/g, " ").replace(/\s+/g, " ").toLowerCase()}`;
}

function checkProducts(md, sources) {
  const hard = [];
  const corpus = productCorpus(sources);
  const seen = new Set();
  for (const u of units(md)) {
    for (const s of sentencesWithLinks(u.text)) {
      for (const words of productCandidates(s.prose)) {
        const name = words.join(" ");
        if (seen.has(name) || productKnown(words, corpus)) continue;
        seen.add(name);
        hard.push({
          check: "products",
          section: u.section,
          sentence: s.prose,
          claim: name,
          message: `Product "${name}" (${u.section}) is not in the GCP playbook, this week's sources, or config/gcp-products.txt — likely invented. Use a real product from the playbook, or cut the sentence.`,
        });
      }
    }
  }
  return hard;
}

function productsIn(prose, sources) {
  const corpus = productCorpus(sources);
  return productCandidates(prose).filter((w) => productKnown(w, corpus)).map((w) => w.join(" "));
}

// --- the claim check ------------------------------------------------------------------

const COMPANY_NAMES = new Set(["Google Cloud", "Google", "Google DeepMind"]);
const GCP_CLAIM_MARKER = /(Where GCP wins|Why GCP wins|Where the GCP opportunity is|The move)\b/;

// Playbook lines within a few lines of a mention of `product`: a number backs a
// product claim only if the playbook states it about THAT product.
const PLAYBOOK_WINDOW = 3;
function playbookNear(playbook, product) {
  const lines = String(playbook || "").split("\n");
  const needle = product.toLowerCase();
  const out = [];
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(needle)) {
      out.push(lines.slice(Math.max(0, i - PLAYBOOK_WINDOW), i + PLAYBOOK_WINDOW + 1).join("\n"));
    }
  });
  return out;
}

function inQuotedSpan(prose, index) {
  const before = prose.slice(0, index);
  const straight = (before.match(/"/g) || []).length;
  const opens = (before.match(/“/g) || []).length;
  const closes = (before.match(/”/g) || []).length;
  return straight % 2 === 1 || opens > closes;
}

/**
 * Returns an array of findings: { check, section, sentence, claim, reason, fix, message }.
 */
function checkClaimsDetailed(md, sources) {
  const findings = [];
  const all = units(md);
  const bodyNumbers = all
    .filter((u) => u.kind === "story" || u.kind === "quickhit")
    .flatMap((u) => sentencesWithLinks(u.text).flatMap((s) => extractNumbers(s.prose)));
  const storyNumbers = new Map();
  const productFacts = []; // { product, number } from story sentences that name the product
  for (const u of all.filter((x) => x.kind === "story" || x.kind === "quickhit")) {
    for (const s of sentencesWithLinks(u.text)) {
      const nums = extractNumbers(s.prose);
      if (u.story) storyNumbers.set(u.story, [...(storyNumbers.get(u.story) || []), ...nums]);
      for (const prod of productsIn(s.prose, sources)) for (const n of nums) productFacts.push({ prod, n });
    }
  }
  const push = (u, s, claim, reason, fix, message) =>
    findings.push({ check: "claims", section: u.section, sentence: s.prose, claim, reason, fix: fix || null, message });

  for (const u of all) {
    if (u.kind === "edge") continue; // worked examples are illustrative by design
    const sents = sentencesWithLinks(u.text);
    const paraLinks = sents.flatMap((s) => s.links);
    let gcpClause = false;
    for (const s of sents) {
      const nums = extractNumbers(spokenToDigits(s.prose), { strict: true });

      if (u.kind === "tldr") {
        for (const n of nums) {
          if (!bodyNumbers.some((b) => sameNumber(b, n))) {
            push(u, s, n.raw, "tldr-not-in-body", null, `TLDR figure "${n.raw}" does not appear in the body — the TLDR may only summarise sourced body claims.`);
          }
        }
        continue;
      }

      if (u.kind === "angle" || u.kind === "ourplay") {
        // After "Where GCP wins:" / "Why GCP wins:" / "The move:" the draft is
        // making PRODUCT claims, and the playbook is their only ground truth.
        // Edition #38: "AlloyDB Express ... dropping per-agent costs below
        // $5/month" — the $5 was Replit's price from the story, re-used as a
        // Google product property. Before the marker, a number may restate the
        // story ("Signal: paying $20–$40/user/month").
        const marker = s.prose.search(GCP_CLAIM_MARKER);
        // "Google Cloud's $561B backlog" is a company fact, not a product spec:
        // anywhere in the playbook backs it.
        const products = productsIn(s.prose, sources).filter((p) => !COMPANY_NAMES.has(p));
        for (const n of nums) {
          if (inQuotedSpan(s.prose, n.index)) continue; // a founder question's hypothetical
          const isGcpClaim = (marker !== -1 && n.index > marker) || gcpClause;
          if (isGcpClaim) {
            const nearProduct = products.some((p) => playbookNear(sources.playbook, p).some((t) => containsNumber(t, n)));
            const inStory = productFacts.some((f) => products.includes(f.prod) && sameNumber(f.n, n));
            const cited = s.links.length && verify((t) => containsNumber(t, n), s.links, sources, []).ok;
            const plain = !products.length && containsNumber(sources.playbook || "", n);
            if (!nearProduct && !inStory && !cited && !plain) {
              push(u, s, n.raw, "product-number", null, `"${n.raw}" is a GCP product claim${products.length ? ` about ${products.join(", ")}` : ""} (${u.section}) with no backing in the GCP playbook or a cited source — cut the number.`);
            }
            continue;
          }
          const pool = u.kind === "angle" ? storyNumbers.get(u.story) || [] : bodyNumbers;
          const ownCite = s.links.length && verify((t) => containsNumber(t, n), s.links, sources, [], s.prose).ok;
          if (!ownCite && !containsNumber(sources.playbook || "", n) && !pool.some((b) => sameNumber(b, n))) {
            push(u, s, n.raw, "unsourced", null, `"${n.raw}" (${u.section}) is not in the story, the GCP playbook, or a founder question — cut it or tie it to a sourced figure.`);
          }
        }
        if (marker !== -1) gcpClause = true; // later sentences of this bullet stay product claims
        continue;
      }

      // story prose and Quick Hits: every number and quote must trace to a source
      for (const n of nums) {
        const v = verify((t) => containsNumber(t, n), s.links, sources, paraLinks, s.prose, isDistinctive(n));
        if (!v.ok) push(u, s, n.raw, v.reason, v.fix, `"${n.raw}" (${u.section}) ${REASON_TEXT[v.reason]}.${describeFix(v.fix)}`);
      }
      for (const q of extractQuotes(s.prose)) {
        const v = verify((t) => containsQuote(t, q), s.links, sources, paraLinks, s.prose);
        if (!v.ok) push(u, s, `"${q}"`, v.reason, v.fix, `Quote "${q}" (${u.section}) ${REASON_TEXT[v.reason]}.${describeFix(v.fix)}`);
      }
      // A cited URL that is in none of the week's sources was invented: the
      // drafter only ever sees the KBs. Curated first-party URLs are allowed.
      for (const l of s.links) {
        if (!/^https?:\/\//.test(l.url)) continue;
        if (!entriesForUrl(sources, l.url).length && !isCuratedUrl(l.url, sources) && !(sources.playbook || "").includes(l.url)) {
          push(u, s, l.url, "unknown-url", null, `Cited URL is not in any of this week's sources (${u.section}): ${l.url}`);
        }
      }
    }
  }
  return dedupe(findings);
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const k = `${f.section}|${f.claim}|${f.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Lint-shaped wrappers ({ hard, warn }) for lint-briefing.js.
function checkClaims(md, sources) {
  return { hard: checkClaimsDetailed(md, sources).map((f) => f.message), warn: [] };
}
function checkProductNames(md, sources) {
  return { hard: checkProducts(md, sources).map((f) => f.message), warn: [] };
}

module.exports = {
  units,
  sentencesWithLinks,
  splitSentences,
  isDistinctive,
  spokenToDigits,
  GCP_CLAIM_MARKER,
  extractNumbers,
  sameNumber,
  extractQuotes,
  parseLabel,
  sameSpeaker,
  productCandidates,
  productKnown,
  productCorpus,
  checkProducts,
  checkClaimsDetailed,
  checkClaims,
  checkProductNames,
};
