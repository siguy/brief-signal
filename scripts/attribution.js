/**
 * "Name and show said twice" — detect and fix.
 *
 * Edition #38 did this seven times:
 *   Nathan Labenz and Pash Nin noted on *The Cognitive Revolution*
 *   [Nathan Labenz on The Cognitive Revolution (87 min watch, 31:40)](url)
 *
 * When the sentence already credits the speaker and names the show, the
 * citation should wrap the show name instead:
 *   Nathan Labenz and Pash Nin noted on [*The Cognitive Revolution* (87 min watch, 31:40)](url)
 *
 * It's a mechanical fix, so it's applied by code (repair-briefing.js), never
 * handed to the editor.
 */

// "[Speaker on Show (meta)](url)"
const CITE = /\[([^\]]+?) on ([^\]()]+?) \(([^)]*)\)\]\((https?:\/\/[^)\s]+)\)/g;
const LOOKBACK = 300;

const strip = (t) => t.replace(/[*_]/g, "");

// Find each citation whose own sentence already names its speaker (by last
// name) and its show.
function findDoubleAttributions(md) {
  const out = [];
  for (const m of md.matchAll(CITE)) {
    const [whole, speaker, show, meta, url] = m;
    const before = md.slice(Math.max(0, m.index - LOOKBACK), m.index);
    const sentence = before.split(/(?<=[.!?])\s+(?=[A-Z*"“[])|\n/).pop();
    const last = speaker.trim().split(/\s+/).pop();
    if (!last || !sentence.includes(last)) continue;
    if (!strip(sentence).includes(show.trim())) continue;
    out.push({ index: m.index, whole, speaker: speaker.trim(), show: show.trim(), meta, url, sentence });
  }
  return out;
}

function checkDoubleAttribution(md) {
  return {
    hard: findDoubleAttributions(md).map(
      (d) => `Name and show said twice: "${d.speaker}" and "${d.show}" are already in the sentence, then repeated in the link "${d.whole.slice(0, 80)}…" — wrap the show name instead`
    ),
    warn: [],
  };
}

/**
 * Rewrite each double attribution so the link wraps the show name already in
 * the sentence. If the show name can't be found as written, fall back to a
 * label without the repeated speaker and show: "[87 min watch, 31:40](url)".
 */
function fixDoubleAttributions(md) {
  let out = md;
  const fixes = [];
  // Work from the end so earlier indexes stay valid.
  for (const d of findDoubleAttributions(md).reverse()) {
    const start = d.index - d.sentence.length;
    const head = out.slice(start, d.index);
    const showRe = new RegExp(`(\\*{1,2}|_)?${d.show.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1?`);
    const hit = head.match(showRe);
    let replacement;
    if (hit && !/\[[^\]]*$/.test(head.slice(0, hit.index))) {
      const shown = hit[0].startsWith("*") || hit[0].startsWith("_") ? hit[0] : `*${hit[0]}*`;
      const newHead = head.slice(0, hit.index) + `[${shown} (${d.meta})](${d.url})` + head.slice(hit.index + hit[0].length);
      replacement = newHead.replace(/\s+$/, "");
      out = out.slice(0, start) + replacement + out.slice(d.index + d.whole.length).replace(/^\s+(?=[,.;:)])/, "");
    } else {
      out = out.slice(0, d.index) + `[${d.meta}](${d.url})` + out.slice(d.index + d.whole.length);
    }
    fixes.push({ speaker: d.speaker, show: d.show });
  }
  return { md: out, fixes };
}

module.exports = { findDoubleAttributions, checkDoubleAttribution, fixDoubleAttributions };
