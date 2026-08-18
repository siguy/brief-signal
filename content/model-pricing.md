---
title: "Model Pricing & Performance"
subtitle: "Verified reference — last checked 2026-08-17"
---

Every figure on this page was read off the vendor's own pricing page or model card on the
date above. Where a number could not be confirmed on a first-party page, it is labelled or
left out. Prices are USD per 1M tokens, standard tier unless stated.

This is a **living page** — it is overwritten at each refresh rather than archived, because a
stale price is worse than no price. Check the date before you use anything here.

**Provenance labels:** **1P** = the vendor's own page · **3P** = a third-party inference
provider · **CHECK** = unverified or sources conflict · **CALC** = arithmetic on verified figures.

## The short version

- **Gemini 3.7 Flash is the cheapest of the three mid-tier models at either of its rates.** $0.75/$3.75 until 31 December 2026, $1.50/$7.50 after. Claude Sonnet 5 is $2.00/$10.00; GPT-5.6 Terra is $2.00/$12.00.
- **On price-performance Flash wins outright.** Terra's edge on the core coding benchmarks is 1.0 to 4.3 points at 3.1× the price. Per blended dollar, Flash beats Terra on **every** benchmark in Google's table — even at the post-January rate. See the points-per-dollar table below.
- **Concede computer use specifically, not agentic coding generally.** Terra's real leads are OSWorld-2.0 (50.2% to 38.1%, +12.1) and Terminal-bench 3.0 (20.8% to 14.9%, +5.9) — 30-40% relative. Everything else is inside a few points.
- **Luna is not in this class.** The widely-repeated "Flash is 8× more expensive" line prices it against GPT-5.6 Luna at $0.20/$1.20 — a budget tier. Against actual mid-tier competitors Flash is the cheapest option on the table.
- **Flash's real win is enterprise automation** — AutomationBench 30.4% against Sonnet 5's 10.7%, nearly 3× — plus long-context retrieval, video and web-dev Elo.
- **The Gemini discount is credits back on net spend**, not a discounted list rate. The invoice shows list with a credit applied, which matters for any commitment calculated off gross spend.
- **Thinking cannot be switched off on 3.7 Flash.** Reasoning bills at the output rate and `MINIMAL` is not a supported `thinking_level` — the largest uncontrolled cost variable on this page.
- **Price per token is not cost per task, and no vendor publishes the latter.** That is why the breakeven column exists, and why the honest answer is an evaluation on the customer's own workload.

## Mid-tier: the class Flash actually competes in

The blended column is input plus output at 1M tokens each — a crude equaliser, useful only for
a first pass, and it weights output heavily. Recompute against a realistic input/output ratio
before quoting it: an agent loop that reads 50K and writes 500 looks nothing like 1M/1M.

| Model | Input | Output | Cached in | Blended (CALC) | Ratio | Src |
|---|---|---|---|---|---|---|
| **Gemini 3.7 Flash** — introductory, to 31 Dec 2026 | $0.75 | $3.75 | $0.075 | $4.50 | 1.00× | 1P |
| **Gemini 3.7 Flash** — standard, from 1 Jan 2027 | $1.50 | $7.50 | $0.15 | $9.00 | 2.00× | 1P |
| Claude Sonnet 5 (`claude-sonnet-5`) | $2.00 | $10.00 | $0.20 | $12.00 | 2.67× | 1P |
| GPT-5.6 Terra (`gpt-5.6-terra`) | $2.00 | $12.00 | $0.20 | $14.00 | 3.11× | 1P |
| GPT-5.3 Codex (`gpt-5.3-codex`) | $1.75 | $14.00 | $0.175 | $15.75 | 3.50× | 1P |
| *GPT-5.6 Sol — frontier reference* | $5.00 | $30.00 | $0.50 | $35.00 | 7.78× | 1P |
| *GPT-5.6 Luna — cheap floor reference* | $0.20 | $1.20 | $0.02 | $1.40 | 0.31× | 1P |

Sonnet 5's $2/$10 was itself introductory through 31 August 2026 and has since been made
permanent — Anthropic cancelled the scheduled rise to $3/$15. Codex is Responses-API only,
with no Batch tier, which matters if a customer's stack is Chat-Completions-based.

## Discount tiers

Nobody at scale pays list, and these levers differ in kind between vendors — the first reason
a list-price comparison misleads.

| Model | Batch | Flex | Priority / Fast | Cache mechanics |
|---|---|---|---|---|
| Gemini 3.7 Flash | $0.375 / $1.875 | $0.375 / $1.875 | $1.35 / $6.75 | Cached input is 10% of input, **plus** storage at $0.50 per 1M tokens per hour |
| Claude Sonnet 5 | $1.00 / $5.00 | — | — | Cache **write** costs a premium first — $2.50 (5 min) or $4.00 (1 hr) — then $0.20 per read |
| GPT-5.6 Terra | $1.00 / $6.00 | $1.00 / $6.00 | $4.00 / $24.00 | Cache write is 1.25× standard input; reads $0.20 |

Gemini also publishes Provisioned Throughput on a shared rate card — $7.14 per GSU-hour on a
one-week commit down to $2.74 on a one-year — with 3.7 Flash burning down at 1 token per input
token, 0.1 cached, and 5 per output token. Grounding with Google Search is 5,000 requests free
per month, then $14 per 1,000.

## Performance

All figures from the DeepMind model card for Gemini 3.7 Flash, results as of August 2026. That
makes the competitor columns first-party-published but **vendor-selected** — Google chose these
benchmarks. Read the losses as the more informative half.

| Benchmark | 3.7 Flash | Sonnet 5 | Terra | Muse Spark 1.2 |
|---|---|---|---|---|
| Artificial Analysis Intelligence Index | 56 | 55 | **57** | **57** |
| FrontierCode 1.1 Main | **43.6%** | 42.7% | 41.3% | — |
| DeepSWE v1.1 | 65.3% | 53.8% | **69.6%** | 54.9% |
| Code Arena (WebDev, Elo) | **1588** | 1541 | 1523 | 1535 |
| Terminal-bench 2.1 | 85.8% | 80.4% | **87.4%** | 82.9% |
| Terminal-bench 3.0 | 14.9% | 14.6% | **20.8%** | — |
| AutomationBench (private set) | **30.4%** | 10.7% | 23.6% | — |
| HLE-Verified | **53.6%** | 31.0% | 51.1% | — |
| Harvey LAB-AA | **90.7%** | 90.1% | 85.2% | — |
| GDM-MRCR v2, 8-needle @128k | **97.0%** | 81.5% | 93.5% | — |
| LVBench | **85.4%** | 68.5% | 78.9% | — |
| GDPVal-AA v2 (Elo) | 1525 | 1598 | 1578 | **1628** |
| Agent's Last Exam (pass rate) | 26.3% | **33.3%** | 28.0% | — |
| OSWorld-2.0 | 38.1% | 39.6% | **50.2%** | — |

### Benchmark points per blended dollar (CALC)

The table above is the raw capability picture. This one is the buying decision. Each cell is the
benchmark score divided by the model's blended price — our arithmetic on verified list prices,
not a vendor figure. Higher is better.

| Benchmark | Flash (promo, $4.50) | Flash (standard, $9.00) | Terra ($14.00) | Sonnet 5 ($12.00) |
|---|---|---|---|---|
| DeepSWE v1.1 | **14.51** | 7.26 | 4.97 | 4.50 |
| Terminal-bench 2.1 | **19.07** | 9.53 | 6.24 | 6.70 |
| FrontierCode 1.1 Main | **9.69** | 4.84 | 2.95 | 3.56 |
| AutomationBench | **6.76** | 3.38 | 1.69 | 0.89 |
| AA Intelligence Index | **12.44** | 6.22 | 4.07 | 4.58 |
| OSWorld-2.0 | **8.47** | 4.23 | 3.59 | 3.30 |
| Terminal-bench 3.0 | **3.31** | 1.66 | 1.49 | 1.22 |

**The honest read:** Terra is ahead in absolute terms on DeepSWE (+4.3), Terminal-bench 2.1
(+1.6) and the AA index (+1.0), and meaningfully ahead on computer use — OSWorld-2.0 (+12.1) and
Terminal-bench 3.0 (+5.9). Sonnet 5 leads GDPVal and Agent's Last Exam. But at 3.1× and 2.7× the
price respectively, neither converts that into value: **Flash returns more points per dollar than
both on every row above, and still does at its post-January standard rate.**

So the argument to have with a founder is not which model tops a leaderboard. It is what a
one-to-four-point delta is worth per accepted unit of work — and whether their workload is the
computer-use case where Terra's lead is actually large.

## Open weights

Prices vary by who serves the model, not only which model it is — the provider column is half
the data, not a footnote. Benchmarks are as each maker publishes them and are not
cross-comparable; see the harness caveat below.

| Model | Params | License | Input | Output | Provider | Published coding score |
|---|---|---|---|---|---|---|
| Gemma 4 26B A4B | 25.2B / 3.8B active | Apache 2.0 | $0.07 | $0.34 | OpenRouter (3P) | LiveCodeBench v6 77.1 |
| MiniMax M2.5 | 230B / 10B active | MIT | $0.22 | $0.90 | OpenRouter (3P) | SWE-bench Verified 80.2 |
| Muse Glimmer 30B (Meta) | 30B dense | Apache 2.0 | $0.35 | $1.50 | Together (3P) | none published |
| Gemma 4 31B Dense | 30.7B | Apache 2.0 | $0.39 | $0.97 | Together (3P) | LiveCodeBench v6 80.0 · CF Elo 2150 |
| DeepSeek V4-Flash | 304B | MIT | $0.44 / $0.22 off-peak | $1.32 / $0.66 | DeepSeek (1P) | Terminal-Bench 2.1 82.7 |
| GLM-5.2 | 753B MoE | MIT | $1.40 (Z.ai) / $0.50 (OpenRouter) | $4.40 / $3.15 | 1P + 3P | SWE-bench Pro 62.1 |
| Inkling | 975B / 41B active | Apache 2.0 | $1.00 | $4.05 | Together (3P) | SWE-bench Verified 77.6 |
| DeepSeek V4-Pro | 1.7T | MIT | $1.32 / $0.66 off-peak | $3.96 / $1.98 | DeepSeek (1P) | TB 2.1 87.9 · DeepSWE 62.7 |
| Qwen3.8-2.4T-A95B | 2.4T / 95B active | Custom, not Apache | $2.50 | $6.25 | Together (3P) | SWE-bench Pro 67.7 |
| Kimi K3 | 2.8T / 104B active | Custom Kimi licence | $3.00 (Moonshot) / $2.60 (OpenRouter) | $15.00 / $13.00 | 1P + 3P | TB 2.1 88.3 · DeepSWE 67.5 |
| Gemma 4 26B, managed on Agent Platform | 25.2B | Apache 2.0 | $0.15 | $0.60 | Google (**CHECK**) | see caveats |

Two licence traps worth knowing before a customer builds on one: **Kimi K3 and Qwen3.8 both
ship under custom licences**, not Apache or MIT, despite sitting inside the "open weights"
conversation. Alibaba's flagship API models — `qwen3.7-plus`, `qwen3-coder-plus` — are
proprietary with no downloadable weights at all. Meta's current open model is Muse Glimmer,
not a Llama; the newest Llama-branded release remains Llama 4 Scout/Maverick under the
restrictive Llama Community License.

## Token efficiency: two calculations that survive the missing data

A true cost-per-task table would need tokens-per-task for every model, and no vendor publishes
it. Anthropic's ~30% figure below compares Claude to *older Claude*, not to Gemini or OpenAI.
So rather than invent the gap, these two calculations work only with what is documented.

### One — what Anthropic's tokenizer note actually costs

Anthropic's pricing page states that Claude 4.7 and later use a newer tokenizer producing
roughly 30% more tokens for the same text. More tokens raises cost, so this does not make
Anthropic cheaper — it makes the headline price cut smaller than it looks.

| Step | Input | Output | Blended | Effect |
|---|---|---|---|---|
| Sonnet 4.6 (prior generation) | $3.00 | $15.00 | $18.00 | baseline |
| Sonnet 5, list price | $2.00 | $10.00 | $12.00 | 33% cheaper on paper |
| **Sonnet 5, × 1.30 tokens per task (CALC)** | — | — | **$15.60** | **13% cheaper in practice** |

The cut is real. It is worth about a third of what the list change implies. A customer
migrating from Sonnet 4.6 who budgeted a 33% saving will come in over plan.

### Two — breakeven verbosity

Instead of guessing how many tokens each model consumes, invert the question: **how many times
more tokens per task would a model have to consume before its price advantage disappears?**
That is pure arithmetic on verified prices, and it is the number an evaluation should be built
to measure. Baseline is Gemini 3.7 Flash at its introductory blended $4.50.

| Model | Blended | Breakeven (CALC) | Reading |
|---|---|---|---|
| Gemma 4 26B A4B | $0.41 | 11.0× | Would need to burn 11× the tokens before Flash matches it |
| MiniMax M2.5 | $1.12 | 4.02× | Large margin, and SWE-bench Verified 80.2 makes it the price-per-point leader |
| GPT-5.6 Luna | $1.40 | 3.21× | The "8× cheaper" claim holds only if Luna is not 3.2× more verbose |
| DeepSeek V4-Flash (peak) | $1.76 | 2.56× | Doubles to 5.1× off-peak |
| Muse Glimmer 30B | $1.85 | 2.43× | Comfortable margin, but no published coding score to justify it |
| GLM-5.2 (OpenRouter) | $3.65 | 1.23× | Thin — 23% more verbose and the saving is gone |
| Inkling (Together) | $5.05 | 1.12× | Effectively a tie; decide on capability, not price |
| DeepSeek V4-Pro (peak) | $5.28 | 1.17× | Also near a tie at peak rates |
| GLM-5.2 (Z.ai direct) | $5.80 | 1.29× | Same model as the row above, different provider, opposite verdict |
| Qwen3.8-2.4T-A95B | $8.75 | 1.94× | Flash could nearly double its token use and still cost less |
| **Claude Sonnet 5** | $12.00 | **2.67×** | 1.33× against Flash's post-January rate |
| **GPT-5.6 Terra** | $14.00 | **3.11×** | 1.56× post-January, while Terra wins on DeepSWE |
| GPT-5.3 Codex | $15.75 | 3.50× | Output-heavy at $14/1M — punishing for verbose agent loops |
| Kimi K3 (Moonshot) | $18.00 | 4.00× | Priced like a frontier model despite the open-weights framing |
| GPT-5.6 Sol | $35.00 | 7.78× | Different class; included to bracket the range |

## Why these numbers are not comparable to each other

Each item below is a documented reason two prices above measure different things. This is the
substance behind "a token is not a token," and it is what turns a price objection into an
evaluation.

1. **Anthropic's tokenizer emits ~30% more tokens for the same text.** Worked through above: a 33% price cut nets out near 13%. The vendor documents this itself.
2. **Thinking cannot be disabled on Gemini 3.7 Flash.** Output pricing includes thinking tokens and `MINIMAL` is not a supported `thinking_level` — only LOW, MEDIUM (default) and HIGH. Two customers on identical prompts can see materially different bills from that one setting.
3. **The Gemini promotion is credits-back, not a lower list rate.** The Agent Platform pricing page footnote reads: "Promotional pricing provided through 50% credits back on net spend on select models within a given period."
4. **The same open model costs up to 2.8× more depending on who serves it.** GLM-5.2 is $1.40 input from Z.ai and $0.50 from OpenRouter. Quoting "the price of GLM-5.2" without naming a provider is quoting nothing.
5. **DeepSeek prices on a clock.** Peak is 01:00–04:00 and 06:00–10:00 UTC; off-peak is half. Any aggregator quoting one DeepSeek number is quoting half a two-tier scheme.
6. **Cache economics differ in kind, not degree.** Google charges 10% of input per read plus hourly storage; Anthropic charges a write premium up front then $0.20 per read; OpenAI charges 1.25× input to write. A high-reuse and a low-reuse workload rank these vendors differently.
7. **Geography adds multipliers.** Anthropic applies 1.1× when `inference_geo` is "us" on Claude 4.6+, and regional or multi-region endpoints on Bedrock and Google Cloud carry a 10% premium over global. A data-residency requirement is a pricing decision.
8. **Long context triggers a different rate card.** OpenAI charges 2× input and 1.5× output above 272K tokens. Gemini 3.1 Pro splits at 200K ($2.00 below, $4.00 above).
9. **The benchmark scores came off different harnesses.** GLM-5.2's Terminal-Bench 82.7 was measured in a Claude Code harness; Qwen3.8's 86.6 is Claude Code at avg@10 with a five-hour timeout. The harness is often doing as much work as the model.
10. **Gemini 3.6 Flash now costs exactly what 3.7 Flash costs.** Both sit on the same introductory schedule. "Half the original 3.6 Flash cost" refers to 3.6's pre-promotional rate, not to a live gap a customer would see today.

## Figures that failed verification — do not quote these

- **Ultrafast mode pricing.** No per-token price is published anywhere reachable; the word "ultrafast" does not appear on OpenAI's pricing page, and the announcement URL returned HTTP 403 to automated fetching. The 750 tokens/sec and 14× figures are preview claims from the announcement title and podcast coverage, not specifications. OpenAI's separate, published **Fast mode** is a different thing, priced at exactly 2× standard.
- **Gemma 4 pricing on Google.** Two independent checks of the same Agent Platform pricing page disagreed — one found $0.15/$0.60 for the managed 26B endpoint, one found no published Gemma rate at all. Verify in a browser before putting a Google price for Gemma in front of a customer. Self-hosted Gemma bills as GPU/TPU compute with no per-token equivalent, and on the Gemini API it is free-tier only.
- **Any tokens-per-second figure.** Effectively no vendor publishes generation speed. Google's 675 tokens/sec is a **provisioned-throughput billing unit per GSU**, not a latency spec, and must not be presented as speed. The 340 tokens/sec figure for 3.7 Flash is an Artificial Analysis measurement relayed on a podcast.
- **Fireworks and MiniMax official rates.** Fireworks publishes only embeddings, training and hourly GPU rates publicly. MiniMax publishes subscription tiers, not per-token pricing. The MiniMax figures above are OpenRouter's.
- **"DeepSeek V4-Pro-Max at 80.6% SWE-bench Verified."** A third-party claim absent from both DeepSeek's pricing page and its Hugging Face organisation listing. Unverified.
- **Claude Sonnet 5 benchmark scores from Anthropic.** Anthropic publishes them only inside a chart image and extraction returned inconsistent values. The Sonnet 5 column above is Google's published view of it, not Anthropic's.
- **Gemini 3.6 Flash DeepSWE v1.1.** Google's blog says 49.0%; the DeepMind model card says 48.6%. Cite one, do not average.
- **OSWorld-2.0 for 3.7 Flash, and Sonnet 5's DeepSWE.** Google's launch comparison chart (posted by Koray Kavukcuoglu, and the image at the head of Edition #26) and the DeepMind model card disagree: the chart shows OSWorld-2.0 at 38.1% for 3.7 Flash with Sonnet 5 at 39.6%, while a model-card read returned 47.9% and no Sonnet figure. The chart also puts Sonnet 5's DeepSWE at 54.0% against the card's 53.8%. The table above follows the launch chart. Both are first-party Google, so treat OSWorld as contested and prefer Terminal-bench or DeepSWE, where the two sources agree.

## Sources

[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Agent Platform pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) · [Gemini 3.7 Flash model card](https://deepmind.google/models/model-cards/gemini-3-7-flash/) · [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) · [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) · [Z.ai pricing](https://docs.z.ai/guides/overview/pricing) · [Kimi K3 pricing](https://platform.kimi.ai/docs/pricing/chat-k3) · [Together pricing](https://www.together.ai/pricing) · [OpenRouter](https://openrouter.ai/)

Vendor pricing pages carry no change log, and three of the rates above have dated expiries.
Re-verify before quoting.
