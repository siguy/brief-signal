/**
 * Wording check: the claims a number check can't see.
 *
 * Edition #38 also said "former Facebook CSO" (no source gives that title),
 * "nationwide" (the measures were local), "patched" (the source says
 * "generated patches for"), and "uncollateralized" (in no source at all).
 *
 * The AI SUGGESTS, code CONFIRMS: one model call lists every title or role,
 * scope word, status verb and mechanism claim in each story, each with the
 * exact source text that backs it, copied from the entries the story cites.
 * Code then checks that text appears word-for-word in those entries' primary
 * text (quote lines, post bodies — never summary lines). A phrase whose
 * support is missing or can't be found becomes a finding for the repair pass.
 * The model can point at evidence; it can never vouch for a claim on its own.
 *
 * Runs only inside repair-briefing.js (it costs a model call); lint stays
 * deterministic.
 */

const { TEXT_MODEL } = require("./models.js");
const { entriesForUrl } = require("./sources.js");
const { units, sentencesWithLinks } = require("./claims.js");

const MAX_ENTRY_CHARS = 20000;
// Short modifiers only. On the #38 replay, letting the model return whole
// clauses produced 34 "unsupported" phrases — most of them supported — and the
// repair stripped ~250 words of true text. A title, a scope word or a status
// verb is what this check can judge reliably; numbers belong to claims.js.
const MAX_PHRASE_WORDS = 5;

const SYSTEM = `You audit a news briefing against its sources. For each story you get the draft text and the
source text for every link it cites. List ONLY these short wording claims (at most 5 words each, never containing a number):
  - a title or role attached to a person ("former Facebook CSO", "CEO")
  - a scope word ("nationwide", "all", "every", "first", "only", "global")
  - a status verb about a product, fix or ruling ("patched", "launched", "generally available", "banned", "halted")
Copy each phrase exactly as it appears in the draft. For each, copy the SHORTEST exact passage from the source
text that supports it, character for character (you may join two exact pieces with "…"). Read all the source
text before deciding. Set "support" to null only if no source passage supports it.
Return JSON: {"claims":[{"phrase":"<exact words from the draft>","support":"<exact source passage>"|null}]}`;

function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function primaryText(entry) {
  return entry.quotes.map((q) => (q.speaker && !q.body ? `${q.speaker}: ${q.text}` : q.text)).join("\n");
}

// One request item per Big Picture story / Quick Hit / TLDR block, with the
// primary text of every entry its links resolve to.
function wordingRequest(md, sources) {
  const groups = new Map();
  for (const u of units(md)) {
    if (u.kind === "edge" || u.kind === "ourplay" || u.kind === "angle") continue;
    const key = u.story || u.section;
    if (!groups.has(key)) groups.set(key, { key, units: [], entries: new Map() });
    const g = groups.get(key);
    g.units.push(u);
    for (const s of sentencesWithLinks(u.text)) {
      for (const l of s.links) for (const e of entriesForUrl(sources, l.url)) g.entries.set(e.url, e);
    }
  }
  return [...groups.values()]
    .filter((g) => g.entries.size)
    .map((g) => ({
      story: g.key,
      draft: g.units.map((u) => u.text).join("\n\n"),
      sources: [...g.entries.values()].map((e) => ({ url: e.url, text: primaryText(e).slice(0, MAX_ENTRY_CHARS) })),
      _units: g.units,
      _entries: [...g.entries.values()],
    }));
}

/**
 * Turn the model's answer into findings, keeping only what code can confirm:
 * the phrase must be in the draft, and if support is given it must be in the
 * cited entries' primary text. Unsupported phrases are findings.
 */
function verifyWording(items, answers) {
  const findings = [];
  items.forEach((item, i) => {
    const claims = (answers[i] && answers[i].claims) || [];
    const corpus = norm(item._entries.map(primaryText).join("\n"));
    for (const c of claims) {
      if (!c || typeof c.phrase !== "string") continue;
      const words = c.phrase.trim().split(/\s+/).length;
      if (words < 1 || words > MAX_PHRASE_WORDS || /\d/.test(c.phrase)) continue;
      const unit = item._units.find((u) => u.text.includes(c.phrase));
      if (!unit) continue; // the model quoted the draft inexactly — nothing to act on
      const pieces = typeof c.support === "string" ? c.support.split(/…|\.\.\./).map(norm).filter((p) => p.length >= 4) : [];
      const supported = pieces.length > 0 && pieces.every((p) => corpus.includes(p));
      if (supported) continue;
      const sentence = sentencesWithLinks(unit.text).find((s) => s.prose.includes(c.phrase.replace(/\[|\]\([^)]*\)/g, "")));
      findings.push({
        check: "wording",
        section: unit.section,
        kind: unit.kind,
        unit: unit.text,
        sentence: sentence ? sentence.prose : "",
        claim: c.phrase,
        reason: "unsupported-wording",
        fix: null,
        message: `Wording "${c.phrase}" (${unit.section}) is not supported by the sources it cites${c.support ? " — the passage offered as support is not in them" : ""}. Use the source's own wording or drop it.`,
      });
    }
  });
  return findings;
}

async function checkWording(md, sources, ai, log = () => {}) {
  if (!ai) return [];
  const items = wordingRequest(md, sources);
  if (!items.length) return [];
  const answers = await Promise.all(
    items.map(async (item) => {
      try {
        const response = await ai.models.generateContent({
          model: TEXT_MODEL,
          contents: JSON.stringify({ story: item.story, draft: item.draft, sources: item.sources }, null, 2),
          config: { systemInstruction: SYSTEM, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "MEDIUM" } },
        });
        const text = (response.text || "").trim().replace(/^```(?:json)?\s*\n|\n```\s*$/g, "");
        return JSON.parse(text);
      } catch (err) {
        log(`  WARN: wording check failed for "${item.story}" (${err.message || err})`);
        return null;
      }
    })
  );
  return verifyWording(items, answers);
}

module.exports = { checkWording, verifyWording, wordingRequest, primaryText, SYSTEM };
