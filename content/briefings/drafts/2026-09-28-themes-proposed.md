<!-- PROPOSED — do not merge directly. Simon reviews and promotes this to content/themes.md on PR approval. -->
# Brief Signal — Theme Registry

The recurring macro-narratives ("arcs") the briefing tracks over time. These are the
briefing's **long-term memory**: they change slowly, and they're why a reader who follows
every edition understands the market better than someone reading 50 sources cold.

**How this is used (see the Lead-Story Doctrine in `scripts/briefing-prompt.md`):**
a lead = **a fresh event × (a developing theme *or* a genuinely new thread) × a real seller play.**
The registry *informs* selection — it never gates it. New threads may always lead on their own
merits; a strong new thread with staying power earns its way into a *new* theme.

**Discipline (no hard cap — the count is emergent):**
- **Entry bar:** a structural force that has recurred across multiple editions AND is seller-relevant.
  Not a one-off, not a per-story tag. If you're about to add one, first check whether two existing
  themes are really the same arc.
- **Retirement:** an arc that hasn't led in ~4-5 editions goes ⚪ dormant — still tracked, not forced
  into leads — and resurfaces when it moves again.
- Themes **rotate**: each edition's 2-3 Big Picture stories are the arcs that moved most this week,
  plus any new thread. A quiet theme drops to a Quick Hit or sits out; it hasn't died.

**Status legend:** 🟢 active · 🟡 active but quiet · ⚪ dormant
**Last updated:** Edition #32 (2026-09-28)

---

## Compute Scarcity & the Physical Buildout
- **Status:** 🟢 active
- **Led editions:** #7, #10, #12, #16 · **First seen:** #7 · **Last led:** #16
- **Where it stands:** Storage scaling bottlenecks emerge (2.5EB single-cluster requests); power
  densities hit 500kW/rack; neoclouds sold out 18 months forward as compute financializes into $50M/MW
  spot trading. Appeared as Big Picture Story 2 in #32.

## Sovereignty / Who Owns the Model & the Alpha
- **Status:** 🟢 hot
- **Led editions:** #18, #19, #21, #22, #30 · **First seen:** #18 · **Last led:** #30
- **Where it stands:** Regulated enterprises and quant funds (Jane Street $19B) fleeing public APIs
  for private VPCs to protect proprietary logic; vertical AI startups suffering -50% gross margins on
  closed wrappers migrating to fine-tuned open models.

## Open Weights Closing / Leapfrogging the Frontier
- **Status:** 🟢 hot, accelerating
- **Led editions:** #19, #22, #32 · **First seen:** #19 · **Last led:** #32
- **Where it stands:** Vercel telemetry reveals an 80/20 open-vs-closed token volume flip; closed labs
  slash prices 40–50% (Opus 5.5, GPT-6 Sol/Luna) to defend share; TPUv7 outperforms Nvidia GB200 by 56%
  on Kimi K3 inference via Pallas megakernels. Led Edition #32.

## Token / AI-Spend Economics (cost & value migration)
- **Status:** 🟢 active
- **Led editions:** #5, #15, #17, #20 · **First seen:** #5 · **Last led:** #20
- **Where it stands:** Jevons paradox takes hold as token costs fall 50%; fast judgment models (JEV)
  unbundle monolithic LLMs; self-hosted open inference drops under $0.10/1M tokens.

## Agent Infrastructure Maturing (harnesses, stateful agents, reliability)
- **Status:** 🟢 active
- **Led editions:** #1, #2, #4, #8, #14 · **First seen:** #1 · **Last led:** #14
- **Where it stands:** Cloud runtimes formalize around dedicated sandboxed VMs (Meta Muse Secure VM)
  and "shift-left" harness engineering (AGENTS.md, linters, upstream evals); persistent data layers hit
  3M QPS on PostgreSQL. Appeared as Big Picture Story 3 in #32.

## SaaS → Agent-Native Flip (build-vs-buy)
- **Status:** 🟡 active but quiet
- **Led editions:** #6, #9 · **First seen:** #6 · **Last led:** #9
- **Where it stands:** Enterprises replacing seven-figure SaaS with internal agent fleets; headless
  agentic commerce bypassing traditional web storefronts and app store margins.

## The Org Restructuring / Who Builds (solo founders, self-driving companies)
- **Status:** 🟡 recurring
- **Led editions:** #3, #15 · **First seen:** #3 · **Last led:** #15
- **Where it stands:** Engineers shifting from manual coding to systems architecture and verification;
  teams shipping 2,000+ PRs monthly per engineer via autonomous loops.

## AI Economy / Market Structure (capex vs ROI, IPOs, the $1T theses)
- **Status:** 🟡 active
- **Led editions:** #8, #9, #16 · **First seen:** #8 · **Last led:** #16
- **Where it stands:** Hyperscaler capex up 9x in 5 years ($55B/GW all-in); Anthropic and OpenAI IPO
  expectations temper amidst margin scrutiny and massive multi-billion debt backlogs.

---

## Notes & open judgment calls

- **Open Weights ↔ Sovereignty are tightly coupled** (#19, #21, #22, #30, #32 all blend them: "open
  weights *fueling* sovereign AI"). Kept **separate** on purpose: Open Weights is a *capability/market*
  story (models got good enough to self-host), Sovereignty is a *control/ownership* story (enterprises
  protecting IP, data gravity, and unit economics). They move on different clocks; when both fire, let
  the lead sit at their intersection.
- This registry tracks ongoing macro-narratives across editions. Updates are proposed per edition and
  approved on review.