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
**Last updated:** Edition #38 (2026-11-09)

---

## Compute Scarcity & the Physical Buildout
- **Status:** 🟢 active
- **Led editions:** #7, #10, #12, #16 · **First seen:** #7 · **Last led:** #16
- **Where it stands:** 40+ local ballot measures passed banning data centers; Texas enacted a permitting
  freeze; neocloud debt yields spiked to 15% with credit syndicates "no bid" on GPU debt; hyperscalers with
  self-funded balance sheets and international sites (e.g. Google Malaysia) absorb scarcity. Appeared as a
  Big Picture story in #38.

## Sovereignty / Who Owns the Model & the Alpha
- **Status:** 🟢 hot
- **Led editions:** #18, #19, #21, #22 · **First seen:** #18 · **Last led:** #22
- **Where it stands:** Enterprises fighting to own their model + data layer ("alpha leakage"); Anthropic
  repositioning as "ecosystem, not walled garden" vs. Microsoft's "trust us" Frontier Tuning; the Karp
  "alpha transfer" thread. Tightly coupled with Open Weights (see note).

## Open Weights Closing / Leapfrogging the Frontier
- **Status:** 🟢 hot, accelerating
- **Led editions:** #19, #22, #34 · **First seen:** #19 · **Last led:** #34
- **Where it stands:** Kimi K3 became the first open model to top *every* proprietary model on Vercel's
  web-engineering benchmark; Revolut moved 2,000 engineers to self-hosted GLM on 56 B200s, but Theory Ventures
  builder survey shows startups migrating back to managed APIs due to open-weight engineering thrash.

## Token / AI-Spend Economics (cost & value migration)
- **Status:** 🟢 active
- **Led editions:** #5, #15, #17, #20, #35 · **First seen:** #5 · **Last led:** #35
- **Where it stands:** Enterprises slashing AI spend; open-weight pricing converging up (Kimi ~$5.40/1M
  tokens); "wasted tokens = the new headcount bloat"; value migrating from the model layer to infra/data.

## Agent Infrastructure Maturing (harnesses, stateful agents, reliability)
- **Status:** 🟢 hot
- **Led editions:** #1, #2, #4, #8, #14, #38 · **First seen:** #1 · **Last led:** #38
- **Where it stands:** The battle shifted from prompt-level harnesses to cloud runtime environments;
  Antigravity Cloud Remote Agents, DeepSeek's Super-agent architecture (separating stateless compute from state),
  and persistent VM costs ($20–$40/user/mo vs $4–$5 for ephemeral) forced agent fleets into event-driven cloud containers.

## AI Security & Autonomous Cyber (agent exploits, containment, zero-days)
- **Status:** 🟢 active
- **Led editions:** #25, #36 · **First seen:** #25 · **Last led:** #36
- **Where it stands:** Machine-speed vulnerability discovery (OpenAI 948 Linux kernel zero-days patched for $1.2M)
  and cascading developer supply-chain key breaches (Fireworks to Cursor compromising 5,000 companies) broke
  responsible disclosure, making kernel isolation (gVisor) and per-agent non-human identity mandatory.

## SaaS → Agent-Native Flip (build-vs-buy)
- **Status:** 🟢 active
- **Led editions:** #6, #9 · **First seen:** #6 · **Last led:** #9
- **Where it stands:** Enterprises replacing seven-figure SaaS with internal agents — Curative canceled a
  $600K Salesforce contract; Replit's "self-driving company." Carried #22 as Quick Hits.

## The Org Restructuring / Who Builds (solo founders, self-driving companies)
- **Status:** ⚪ dormant
- **Led editions:** #3, #15 · **First seen:** #3 · **Last led:** #15
- **Where it stands:** One-person million-dollar companies; staff going from "doers to directors." Hasn't led
  in 23 editions; recurs primarily as supporting signal in Quick Hits.

## AI Economy / Market Structure (capex vs ROI, IPOs, the $1T theses)
- **Status:** 🟡 active
- **Led editions:** #8, #9, #16, #37 · **First seen:** #8 · **Last led:** #37
- **Where it stands:** Anthropic S-1 prospectus revealed $16.3B H1 run-rate, $430B non-cancellable compute
  commitments, and 48% cloud partner distribution; debt market liquidity tightening for pure-play AI labs.

---

## Notes & open judgment calls

- **Open Weights ↔ Sovereignty are tightly coupled** (#19, #21, #22 all blend them: "open weights
  *fueling* sovereign AI"). Kept **separate** on purpose: Open Weights is a *capability* story (models
  got good enough to own), Sovereignty is a *control/ownership* story (enterprises want to own model +
  data). They move on different clocks; when both fire, let the lead sit at their intersection (as #22
  did). Revisit if they stop diverging.
- **AI Security & Autonomous Cyber** added in #38 after recurring high-gravity events in #25 (agent security breach),
  #28 (Hugging Face swarm), #36 (Black October PHP2Shell), and #38 (OpenAI 948 Linux kernel zero-days / Fireworks breach).
- This registry was seeded from the 22-edition lead history and is a **living document** — boundaries are
  meant to be redrawn as the arcs evolve. Updates are proposed per edition and approved on review.