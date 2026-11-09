#!/usr/bin/env node

/**
 * Tests for sources.js (KB parsing) and claims.js (fact checks), plus the
 * lint rules moved over from the LLM critique.
 * Run: node scripts/claims.test.js
 *
 * The fixtures mirror Edition #38's real errors, so each test names the
 * mistake it would have caught.
 */

const assert = require("assert");
const { parseKb, buildIndex, normalizeUrl } = require("./sources.js");
const {
  extractNumbers,
  checkClaimsDetailed,
  checkProducts,
  parseLabel,
  splitSentences,
} = require("./claims.js");
const {
  checkRepeatedStats,
  checkQuickHitSentences,
  checkSellersEdgeStandalone,
  checkCapacityOverclaim,
} = require("./lint-briefing.js");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

// --- fixtures -------------------------------------------------------------------

const PODCASTS = `# Podcast Knowledge Base

## Latent Space (2026-11-07) — "Why Would Anthropic Go Public Now? — Jamin Ball, Altimeter"
**Source:** [Latent Space (YouTube)](https://www.youtube.com/watch?v=P735f1xlpL0)
**Duration:** 103 min | **Editorial Signal:** HIGH

### Notable Quotes
- "Right now, you want to go raise multi-billion dollar debt for GPUs? No bid. No bid." — Jamin Ball (01:18:20)
- "I think it's like 40 something percent of the revenue comes from cloud partners... 48%" — Swyx (01:26:10)

### Signal Analysis
- **GCP Relevance:** HIGH — covers things.
  - Budget: Anthropic generates 48% of total revenue via cloud partners.

**Key Numbers:**
- "$20 to $40+" — Persistent VM cost per user (Jamin Ball, 23:00)

---

## Invest Like the Best (2026-11-06) — "Martin Casado on the state of AI"
**Source:** [Invest Like the Best](https://colossus.com/episode/the-productive-investor/)
**Duration:** 66 min | **Editorial Signal:** HIGH

### Notable Quotes
- "We're running out of available debt for non-IG borrowers." — Martin Casado (37:45)

---

## AI Daily Brief (2026-11-04) — "How the Midterm Results Change AI"
**Source:** [AI Daily Brief](https://podcasters.spotify.com/pod/show/nlw/episodes/midterms)
**Duration:** 25 min | **Editorial Signal:** MEDIUM

### Notable Quotes
- "Texas is implementing a regulatory pause and review." — Nathaniel Whittemore (11:10)

### Signal Analysis
  - Budget: 470 gigawatts in proposed data center projects halted in Texas.

---

## Sharp Tech (Stratechery) (2026-11-06) — "America Votes Against Data Centers"
**Source:** [Sharp Tech (RSS)](https://sharptech.fm/member/episode/america-votes?access_token=SECRET)
**Duration:** 102 min | **Editorial Signal:** HIGH

### Notable Quotes
- "Google is spending 15 billion for a data center in Malaysia." — Ben Thompson (28:30)
`;

const BOOKMARKS = `# Bookmarks

### [@RaoulGMI (2026-11-03) — Hyperscaler backlog](https://x.com/RaoulGMI/status/1)

The four big clouds hold $2.49trn of signed contracts.

- **GCP Relevance:** HIGH — backlog.
`;

const PLAYBOOK = `# GCP Playbook
- **Agent Runtime** keeps state in Sessions and Memory Bank.
- **Cloud Run** scales to zero.
- **AlloyDB Express** is a preview Postgres option.
`;

function sources() {
  const entries = [...parseKb(PODCASTS, "podcasts", "p.md"), ...parseKb(BOOKMARKS, "bookmarks", "b.md")];
  return buildIndex({
    date: "2026-11-09",
    files: ["p.md", "b.md"],
    entries,
    kbText: PODCASTS + BOOKMARKS,
    playbook: PLAYBOOK,
    products: [{ name: "Agent Substrate", url: "https://cloud.google.com/blog/agent-substrate/" }],
    problems: [],
  });
}

function draft({ story = "", angle = "", tldr = "- **Hook:** fine.", quick = "", ourPlay = "", edge = "" } = {}) {
  return `---
title: "t"
date: "2026-11-09"
---

## TLDR

${tldr}

## The Big Picture: Things

### Story One

${story}
${angle ? `\n**Your angle with founders**\n\n${angle}\n` : ""}
## Quick Hits

${quick}

## Seller's Edge: A Teach

${edge}

## Our Play

${ourPlay}
`;
}

const claims = (md) => checkClaimsDetailed(md, sources());

// --- sources.js -----------------------------------------------------------------

test("quote lines are primary; Budget and Key Numbers lines are summary", () => {
  const e = parseKb(PODCASTS, "podcasts", "p.md")[0];
  assert.ok(e.quotes.some((q) => q.speaker === "Jamin Ball" && /No bid/.test(q.text)));
  assert.ok(e.summary.some((l) => /Budget: Anthropic generates 48%/.test(l)));
  assert.ok(e.summary.some((l) => /\$20 to \$40\+/.test(l)), "Key Numbers line must be summary");
  assert.ok(!e.quotes.some((q) => /\$20 to \$40/.test(q.text)));
});

test("bookmark body is primary text credited to its author", () => {
  const e = parseKb(BOOKMARKS, "bookmarks", "b.md")[0];
  assert.strictEqual(e.author, "@RaoulGMI");
  assert.ok(e.quotes.some((q) => q.body && /2\.49trn/.test(q.text)));
});

test("normalizeUrl drops subscriber tokens and YouTube timestamps", () => {
  assert.strictEqual(
    normalizeUrl("https://sharptech.fm/member/episode/america-votes?access_token=SECRET"),
    normalizeUrl("https://sharptech.fm/member/episode/america-votes")
  );
  assert.strictEqual(
    normalizeUrl("https://www.youtube.com/watch?v=P735f1xlpL0&t=4700s"),
    normalizeUrl("https://youtube.com/watch?v=P735f1xlpL0")
  );
});

// --- numbers ----------------------------------------------------------------------

test("extractNumbers normalises magnitudes and skips noise", () => {
  const raw = (t) => extractNumbers(t, { strict: true }).map((n) => n.value);
  assert.deepStrictEqual(raw("$1.2M in tokens"), [1.2e6]);
  assert.deepStrictEqual(raw("between $417 and $431 billion"), [417e9, 431e9]);
  assert.deepStrictEqual(raw("$10–20k a month"), [10e3, 20e3]);
  assert.deepStrictEqual(raw("costs $5/month"), [5]);
  assert.deepStrictEqual(raw("GPT-6 Cyber on November 6 in 2026, 24/7"), []);
  assert.deepStrictEqual(raw("Qwen 3.8 and llm-d 1.0, a 400-page S-1, Chapter 11"), []);
  assert.deepStrictEqual(raw("74% below Fable 5.1 and 67% below Opus 5.5"), [74, 67]);
});

test("parseLabel reads speaker and timestamp from a citation", () => {
  assert.deepStrictEqual(parseLabel("Jason Lemkin on 20VC (69 min watch, 23:45)"), { speaker: "Jason Lemkin", ts: 23.75 });
  assert.strictEqual(parseLabel("@hosun_chung (1 min read)").speaker, "@hosun_chung");
  assert.strictEqual(parseLabel("AI Daily Brief (25 min listen, 11:10)").speaker, null);
});

test("splitSentences never splits inside a quotation", () => {
  const s = splitSentences(`"You want to go raise debt for GPUs? No bid," Jamin Ball said. Next one.`);
  assert.strictEqual(s.length, 2);
});

// --- claims (each test = one Edition #38 error) ---------------------------------------

test('#38: "no bid" credited to Casado on ILTB → wrong source, fix names Jamin Ball', () => {
  const f = claims(draft({
    story: 'Credit desks are "no bid" on GPU debt [Martin Casado on Invest Like the Best (66 min listen, 37:45)](https://colossus.com/episode/the-productive-investor/).',
  }));
  const hit = f.find((x) => x.claim === '"no bid"');
  assert.ok(hit, JSON.stringify(f));
  assert.strictEqual(hit.reason, "wrong-source");
  assert.strictEqual(hit.fix.speaker, "Jamin Ball");
  assert.strictEqual(hit.fix.url, "https://www.youtube.com/watch?v=P735f1xlpL0");
});

test("#38: Texas 470 GW existed only in a Budget line → summary-only", () => {
  const f = claims(draft({
    story: "Texas halted 470 gigawatts of projects [AI Daily Brief (25 min listen, 11:10)](https://podcasters.spotify.com/pod/show/nlw/episodes/midterms).",
  }));
  assert.ok(f.some((x) => x.claim === "470 gigawatts" && x.reason === "summary-only"), JSON.stringify(f));
});

test("#38: Malaysia $15B linked to @RaoulGMI → wrong source, fix names Ben Thompson", () => {
  const f = claims(draft({ story: "Google committed $15B in Malaysia [@RaoulGMI (5 min read)](https://x.com/RaoulGMI/status/1)." }));
  const hit = f.find((x) => x.claim === "$15B");
  assert.ok(hit && hit.reason === "wrong-source", JSON.stringify(f));
  assert.strictEqual(hit.fix.speaker, "Ben Thompson");
});

test("#38: Swyx's 48% credited to Jamin Ball → misattributed", () => {
  const f = claims(draft({
    story: "Jamin Ball said 48% of revenue flows through cloud partners [Jamin Ball on Latent Space (103 min watch, 01:26:10)](https://www.youtube.com/watch?v=P735f1xlpL0).",
  }));
  const hit = f.find((x) => x.claim === "48%");
  assert.ok(hit && hit.reason === "misattributed", JSON.stringify(f));
  assert.strictEqual(hit.fix.speaker, "Swyx");
});

test("a correctly sourced quote and figure pass, even via a subscriber URL", () => {
  const f = claims(draft({
    story:
      '"No bid. No bid," Jamin Ball said [Jamin Ball on Latent Space (103 min watch, 01:18:20)](https://www.youtube.com/watch?v=P735f1xlpL0). ' +
      "Google is spending $15B in Malaysia [Ben Thompson on Sharp Tech (102 min listen, 28:30)](https://sharptech.fm/member/episode/america-votes). " +
      "The clouds hold $2.49T of contracts [@RaoulGMI (5 min read)](https://x.com/RaoulGMI/status/1).",
  }));
  assert.deepStrictEqual(f, []);
});

test("a citation timestamp far from the quote is flagged", () => {
  const f = claims(draft({ story: '"No bid," Ball said [Jamin Ball on Latent Space (103 min watch, 00:05:00)](https://www.youtube.com/watch?v=P735f1xlpL0).' }));
  assert.ok(f.some((x) => x.reason === "timestamp"), JSON.stringify(f));
});

test("#38: the draft's own arithmetic ($1,265 per bug) is not in any source", () => {
  const f = claims(draft({ story: "That is roughly $1,265 per bug [@RaoulGMI (5 min read)](https://x.com/RaoulGMI/status/1)." }));
  assert.ok(f.some((x) => x.claim === "$1,265" && x.reason === "not-found"), JSON.stringify(f));
});

test("#37: a cited URL in none of the week's sources is flagged as invented", () => {
  const f = claims(draft({ story: "A teardown says so [Teardown (3 min read)](https://www.linkedin.com/pulse/made-up-2026)." }));
  assert.ok(f.some((x) => x.reason === "unknown-url"), JSON.stringify(f));
});

test("a curated first-party URL from gcp-products.txt is accepted", () => {
  const f = claims(draft({ story: "Idle agents restore in under 500 milliseconds [Agent Substrate on GKE (6 min read)](https://cloud.google.com/blog/agent-substrate/)." }));
  assert.deepStrictEqual(f, []);
});

test("#38: AlloyDB '<$5/month' after 'Where GCP wins' needs playbook backing", () => {
  const f = claims(draft({
    story: "Ephemeral VMs at Replit cost $5 a month [Jamin Ball on Latent Space (103 min watch)](https://www.youtube.com/watch?v=P735f1xlpL0).",
    angle: "- **Where GCP wins:** AlloyDB Express scales to zero, dropping per-agent costs below $5/month.",
  }));
  assert.ok(f.some((x) => x.reason === "product-number" && x.claim === "$5"), JSON.stringify(f));
});

test("a founder question's hypothetical number is allowed", () => {
  const f = claims(draft({ angle: '- **The question:** "If users 10x to 40,000 next month, does your margin hold?"' }));
  assert.ok(!f.some((x) => x.claim === "40,000"), JSON.stringify(f));
});

test("a TLDR figure must appear in the body", () => {
  const f = claims(draft({ tldr: "- **Big:** OpenAI found 948 bugs.", story: "Nothing numeric here." }));
  assert.ok(f.some((x) => x.reason === "tldr-not-in-body" && x.claim === "948"), JSON.stringify(f));
});

test("a period inside the closing quote still matches the source", () => {
  const f = claims(draft({ story: '"No bid. No bid." Jamin Ball said [Jamin Ball on Latent Space (103 min watch, 01:18:20)](https://www.youtube.com/watch?v=P735f1xlpL0).' }));
  assert.deepStrictEqual(f, []);
});

test("a scare-quote in a paragraph that cites nothing is not checked as a quote", () => {
  const f = claims(draft({ story: 'The pitch is commitment terms, never "we have more."' }));
  assert.deepStrictEqual(f, []);
});

// --- products -------------------------------------------------------------------------

test('#38: invented "Cloud Run Sandboxes" is flagged; real names pass', () => {
  const hits = checkProducts(
    draft({ story: "Use Cloud Run Sandboxes. Cloud Run scales. Agent Runtime Sessions hold state. Agent Substrate is GA. Google Cloud's backlog grew." }),
    sources()
  ).map((h) => h.claim);
  assert.deepStrictEqual(hits, ["Cloud Run Sandboxes"]);
});

test("a link label never glues onto the product name before it", () => {
  const hits = checkProducts(draft({ story: "Cloud Run [Martin Casado on Invest Like the Best (66 min listen)](https://colossus.com/episode/the-productive-investor/) scales." }), sources());
  assert.deepStrictEqual(hits, []);
});

// --- rules moved from the critique ------------------------------------------------------

test("a figure in two places is flagged; TLDR and Seller's Edge re-use are exempt", () => {
  const md = draft({
    tldr: "- **Hook:** $2.49T of contracts.",
    story: "The clouds hold $2.49T [@RaoulGMI (5 min read)](https://x.com/RaoulGMI/status/1).",
    edge: "Worked example: $2.49T of backlog.",
    ourPlay: "Lean on the $2.49T backlog.",
  });
  const r = checkRepeatedStats(md).hard;
  assert.strictEqual(r.length, 1, r.join("\n"));
  assert.ok(/Our Play/.test(r[0]) && !/Seller/.test(r[0]));
});

test("a Quick Hit with two sentences after the bold claim is flagged", () => {
  const md = draft({ quick: "- **[Claim (1 min read)](https://x.com/a/status/1)** — One sentence. Two sentences." });
  assert.strictEqual(checkQuickHitSentences(md).hard.length, 1);
  assert.strictEqual(checkQuickHitSentences(draft({ quick: "- **[Claim (1 min read)](https://x.com/a/status/1)** — Just one." })).hard.length, 0);
});

test("Seller's Edge may not point at a past edition", () => {
  assert.strictEqual(checkSellersEdgeStandalone(draft({ edge: "As Edition #23 taught, the invoice is architecture." })).hard.length, 1);
  assert.strictEqual(checkSellersEdgeStandalone(draft({ edge: "The invoice is architecture." })).hard.length, 0);
});

test("capacity overclaim is flagged, but not when the sentence negates it", () => {
  assert.strictEqual(checkCapacityOverclaim(draft({ ourPlay: "GCP has spare capacity for you." })).hard.length, 1);
  assert.strictEqual(checkCapacityOverclaim(draft({ ourPlay: "Never pretend GCP has unlimited spare capacity." })).hard.length, 0);
});

// --- wording check: AI suggests, code confirms -------------------------------------------

const { verifyWording, wordingRequest } = require("./check-wording.js");

test("wording: support must be verbatim in the cited source, or the phrase is flagged", () => {
  const md = draft({
    story: "Former Facebook CSO Alex Stamos said credit is tight, and debt is \"no bid\" [Jamin Ball on Latent Space (103 min watch, 01:18:20)](https://www.youtube.com/watch?v=P735f1xlpL0).",
  });
  const items = wordingRequest(md, sources());
  assert.strictEqual(items.length, 1);
  const answers = [
    {
      claims: [
        { phrase: "Former Facebook CSO", support: null }, // no source gives the title
        { phrase: "credit is tight", support: "the credit markets are totally frozen" }, // invented support
        { phrase: "\"no bid\"", support: "No bid. No bid." }, // real support
        { phrase: "not in the draft at all", support: null }, // model misquoted the draft: ignored
      ],
    },
  ];
  const f = verifyWording(items, answers).map((x) => x.claim);
  assert.deepStrictEqual(f, ["Former Facebook CSO", "credit is tight"]);
});

test("wording: a failed model call yields no findings, never a false pass of everything", () => {
  const md = draft({ story: "Debt is \"no bid\" [Jamin Ball on Latent Space (103 min watch)](https://www.youtube.com/watch?v=P735f1xlpL0)." });
  assert.deepStrictEqual(verifyWording(wordingRequest(md, sources()), [null]), []);
});

// --- name and show said twice ----------------------------------------------------------

const { findDoubleAttributions, fixDoubleAttributions } = require("./attribution.js");
const { checkStoryTakeaway } = require("./lint-briefing.js");

test("#38: 'noted on *Show* [Speaker on Show (...)]' is found and the link moves onto the show name", () => {
  const md = "Nathan Labenz and Pash Nin noted on *The Cognitive Revolution* [Nathan Labenz on The Cognitive Revolution (87 min watch, 31:40)](https://www.youtube.com/watch?v=ZZwrUPxU1GY), and more.";
  assert.strictEqual(findDoubleAttributions(md).length, 1);
  const { md: out } = fixDoubleAttributions(md);
  assert.strictEqual(
    out,
    "Nathan Labenz and Pash Nin noted on [*The Cognitive Revolution* (87 min watch, 31:40)](https://www.youtube.com/watch?v=ZZwrUPxU1GY), and more."
  );
  assert.strictEqual(findDoubleAttributions(out).length, 0);
});

test("a citation whose sentence doesn't name the speaker is left alone", () => {
  const md = "Credit desks went quiet [Jamin Ball on Latent Space (103 min watch, 01:18:20)](https://www.youtube.com/watch?v=P735f1xlpL0).";
  assert.strictEqual(findDoubleAttributions(md).length, 0);
  assert.strictEqual(fixDoubleAttributions(md).md, md);
});

test("every Big Picture story needs a takeaway sentence", () => {
  assert.strictEqual(checkStoryTakeaway(draft({ story: "Facts only." })).hard.length, 1);
  assert.strictEqual(checkStoryTakeaway(draft({ story: "Facts. The takeaway: it matters for GCP." })).hard.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
