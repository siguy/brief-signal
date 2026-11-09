/**
 * The week's source material, parsed for fact-checking a draft.
 *
 * The draft already cites every claim with a link — "[Jamin Ball on Latent
 * Space (103 min watch, 01:18:20)](url)" — and every one of those URLs appears
 * verbatim in that week's knowledge-base (KB) files. So a claim can be checked
 * by following its link back to the KB entry and asking: is this number (or
 * quote) in what the source actually SAID?
 *
 * The key distinction is PRIMARY vs SUMMARY text inside an entry:
 *
 *   primary — words the source itself produced: podcast quote lines
 *             ('- "..." — Speaker (hh:mm)' and deep-dive 'Speaker: "..." (hh:mm)'),
 *             a bookmark's post/article body, a lab-news item's body, the
 *             playlist write-up's prose.
 *   summary — lines an LLM wrote ABOUT the source during extraction: Takeaway,
 *             Budget, Consensus, Debate, Intent Signal, GCP Relevance, Key
 *             Numbers, Key Takeaways. Edition #38's Texas "470 GW" and Lemkin's
 *             "$20–$40" existed only in lines like these.
 *
 * A claim backed only by summary text is not backed.
 */

const fs = require("fs");
const path = require("path");
const { KB_KINDS } = require("./signal-digest.js");

const SKILLS_DIR = path.join(process.env.HOME || "", "skills");
const PLAYBOOK_PATH = path.join(__dirname, "..", "content", "gcp-playbook.md");
const PRODUCTS_PATH = path.join(__dirname, "..", "config", "gcp-products.txt");
// A briefing dated D (a Monday) is drafted from KBs extracted D-1 (Sunday).
// The window is a week wide so a manual mid-week run, or the UTC/local date
// split between podcast KB files, still finds its sources.
const KB_WINDOW_DAYS = 7;

// --- line classification ----------------------------------------------------

// Labels an LLM writes during extraction. Anything carrying one is SUMMARY.
const SUMMARY_LABEL =
  /^\s*(?:-\s*)?\*\*(?:Takeaway|Budget|Consensus|Debate|Intent Signal|GCP Relevance|Key Numbers?|Key Takeaways?|Pain point|Competitive|Open decision|Seller angle|Why it matters|Provenance warning|Type|Channel|Duration|Editorial Signal|Source|Link)\b[^*]*\*\*/i;
const SUMMARY_PREFIX =
  /^\s*-\s*(?:Takeaway|Budget|Consensus|Debate|Intent Signal|GCP Relevance|Pain point|Competitive|Open decision|Key number|Seller angle)\s*:/i;

// '- "quote text" — Speaker Name (00:12:30)'  (Notable Quotes)
const NOTABLE_QUOTE = /^\s*-\s*["“](.+)["”]\s*[—–-]\s*([^()]+?)\s*\(([^)]*)\)\s*$/;
// '  - Speaker Name: "quote text" (00:07:45)'  (Deep Dive segments)
const SEGMENT_QUOTE = /^\s*-\s*([A-Z][^:"“]{1,60}):\s*["“](.+)["”]\s*\(([^)]*)\)\s*$/;

function parseTimestamp(s) {
  const m = String(s || "").match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (!m) return null;
  if (m[3] !== undefined) return +m[1] * 60 + +m[2] + +m[3] / 60;
  return +m[1] + +m[2] / 60;
}

// --- entry parsing ------------------------------------------------------------

function firstUrl(text) {
  const m = text.match(/\]\((https?:\/\/[^)\s]+)\)/);
  return m ? m[1] : null;
}

// Split one KB file into entries. Each kind delimits entries differently:
// podcasts and lab news use "## " headings, bookmarks "### [@handle ...](url)",
// the playlist "### #N — Title".
function splitEntries(content, kind) {
  const re = kind === "podcasts" || kind === "labnews" ? /\n(?=## )/ : /\n(?=### )/;
  return content
    .split(re)
    .filter((chunk) => (kind === "podcasts" || kind === "labnews" ? /^## /.test(chunk) : /^### /.test(chunk)))
    .filter((chunk) => !/^## (Table of Contents|Source:)/.test(chunk));
}

function parseEntry(chunk, kind, file) {
  const lines = chunk.split("\n");
  const heading = lines[0];
  let url = null;
  let author = null;
  if (kind === "bookmarks") {
    url = firstUrl(heading);
    const h = heading.match(/^###\s+\[(@[A-Za-z0-9_]+)/);
    author = h ? h[1] : null;
  } else {
    const src = lines.find((l) => /^\*\*(Source|Link):\*\*/.test(l));
    url = src ? firstUrl(src) : firstUrl(chunk);
    if (kind === "labnews") {
      const h = heading.match(/^##\s+(.+?)\s+[—–-]\s/);
      author = h ? h[1] : null;
    }
  }

  const quotes = []; // { text, speaker, ts }
  const primary = []; // primary prose lines (bookmark/lab-news/playlist bodies)
  const summary = []; // LLM-written lines
  // The entry's title is the source's own words (an episode or post title):
  // "$1M to $100M ARR in 4 Quarters" is the show's claim, not the extractor's.
  const title = heading.replace(/^#+\s*/, "").replace(/^\[|\]\(.*$/g, "");
  quotes.push({ text: title, speaker: "", ts: null, body: true, title: true });
  // "**Key Numbers:**" blocks look like quotes ('- "$20 to $40+" — ... (Speaker, 23:00)')
  // but are the extractor's paraphrase — Lemkin's "$20 to $40+" lived in one.
  let inKeyNumbers = false;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    if (/^\*\*[^*]+:\*\*\s*$/.test(line.trim()) || /^#{2,4}\s/.test(line)) {
      inKeyNumbers = /^\*\*Key Numbers?:\*\*/i.test(line.trim());
    }
    let m;
    if (inKeyNumbers) {
      summary.push(line);
    } else if ((m = line.match(NOTABLE_QUOTE))) {
      quotes.push({ text: m[1], speaker: m[2].trim(), ts: parseTimestamp(m[3]) });
    } else if ((m = line.match(SEGMENT_QUOTE)) && !SUMMARY_PREFIX.test(line)) {
      quotes.push({ text: m[2], speaker: m[1].trim(), ts: parseTimestamp(m[3]) });
    } else if (SUMMARY_LABEL.test(line) || SUMMARY_PREFIX.test(line) || /^#{2,4}\s/.test(line)) {
      summary.push(line);
    } else if (kind === "podcasts") {
      // Podcast prose outside a quote line is LLM narration (debate positions,
      // segment titles) — never primary.
      summary.push(line);
    } else if (kind === "playlist" && (/^\s*-\s+/.test(line) || /\(narrator/i.test(line))) {
      // Playlist bullets live under "Key Takeaways" — the extractor's spin.
      summary.push(line);
    } else {
      primary.push(line);
    }
  }
  // A bookmark's author speaks in their post body; a lab-news item is the lab
  // speaking. Represent both as one long quote so the same matcher handles them.
  if (primary.length && kind !== "podcasts") {
    quotes.push({ text: primary.join("\n"), speaker: author || "", ts: null, body: true });
  }
  return { kind, file, heading, url, author, quotes, summary };
}

function parseKb(content, kind, file) {
  return splitEntries(content, kind).map((c) => parseEntry(c, kind, file));
}

// --- loading --------------------------------------------------------------------

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Every KB file for the week ending on `date`, all kinds.
function weekKbFiles(date, skillsDir = SKILLS_DIR) {
  if (!fs.existsSync(skillsDir)) return [];
  const from = addDays(date, -KB_WINDOW_DAYS);
  const out = [];
  for (const f of fs.readdirSync(skillsDir)) {
    const k = KB_KINDS.find((kk) => f.startsWith(kk.prefix));
    const m = f.match(/(\d{4}-\d{2}-\d{2})\.md$/);
    if (!k || !m) continue;
    if (m[1] > from && m[1] <= date) out.push({ name: f, kind: k.kind });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Hand-kept names for real launches the feeds missed (config/gcp-products.txt).
// "Name | first-party URL | date added" per line; "#" starts a comment.
function readProductList(p = PRODUCTS_PATH) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf-8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const [name, url] = l.split("|").map((s) => s.trim());
      return { name, url: url || null };
    })
    .filter((p) => p.name);
}

/**
 * Everything the fact checks need for one edition.
 * Returns { date, files, entries, byUrl, playbook, products, problems }.
 * `problems` lists setup failures (missing playbook, no KBs) — the caller
 * must surface them, never treat them as a clean pass.
 */
function loadSources(date, opts = {}) {
  const skillsDir = opts.skillsDir || SKILLS_DIR;
  const playbookPath = opts.playbookPath || PLAYBOOK_PATH;
  const problems = [];
  const files = weekKbFiles(date, skillsDir);
  if (!files.length) problems.push(`No knowledge-base files in ${skillsDir} for the week ending ${date}`);
  const entries = [];
  const kbTexts = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(skillsDir, f.name), "utf-8");
    kbTexts.push(content);
    entries.push(...parseKb(content, f.kind, f.name));
  }
  let playbook = "";
  if (fs.existsSync(playbookPath)) playbook = fs.readFileSync(playbookPath, "utf-8");
  else problems.push(`GCP playbook missing at ${playbookPath} — product names cannot be checked (run scripts/bootstrap-worktree.sh)`);
  return buildIndex({
    date,
    files: files.map((f) => f.name),
    entries,
    kbText: kbTexts.join("\n"),
    playbook,
    products: readProductList(opts.productsPath),
    problems,
  });
}

// Index entries by URL. Also index by any URL inside the entry, so a citation
// of a bookmark's linked article resolves to that bookmark.
function buildIndex(src) {
  const byUrl = new Map();
  const add = (u, e) => {
    const key = normalizeUrl(u);
    if (!byUrl.has(key)) byUrl.set(key, []);
    if (!byUrl.get(key).includes(e)) byUrl.get(key).push(e);
  };
  for (const e of src.entries) if (e.url) add(e.url, e);
  return { ...src, byUrl };
}

// Query params that never identify the content: YouTube timestamps, share
// trackers, and subscriber tokens (Sharp Tech's KB URL carries ?access_token=,
// which the draft rightly strips — see project_subscriber_feeds_rssurlenv).
const IGNORED_PARAMS = /^(t|si|s|access_token|utm_.*|ref|feature)$/i;

function normalizeUrl(u) {
  const raw = String(u || "").trim();
  try {
    const url = new URL(raw);
    for (const k of [...url.searchParams.keys()]) if (IGNORED_PARAMS.test(k)) url.searchParams.delete(k);
    url.hash = "";
    const q = url.searchParams.toString();
    return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${q ? `?${q}` : ""}`.toLowerCase();
  } catch (_) {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function entriesForUrl(sources, url) {
  return sources.byUrl.get(normalizeUrl(url)) || [];
}

module.exports = {
  loadSources,
  buildIndex,
  parseKb,
  parseEntry,
  parseTimestamp,
  weekKbFiles,
  readProductList,
  entriesForUrl,
  normalizeUrl,
  PLAYBOOK_PATH,
  PRODUCTS_PATH,
};
