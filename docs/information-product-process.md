# The information-product process

**What this is:** the five stages every information product moves through, what
each one owes, and how to tell which one is broken. Brief Signal is the worked
reference — 27 editions built all five without ever naming them. This doc names
them so the next product inherits the shape deliberately instead of
rediscovering it.

**Who it's for:** anyone building a recurring brief, digest, report or feed —
here, Brief Signal, GSI Signal, and whatever comes next.

---

## The spine

```
sources → [items → events] → ranking → analyzing → presenting → feedback
                                                                    │
              └─────────────────────────────────────────────────────┘
```

Five stages, one bracketed step that only some products need, and a loop that
closes back onto all of them.

The order matters more than it looks. **Every stage can only work on what the
one before it delivered** — which is why a failure in an early stage is usually
misdiagnosed as a failure in a late one.

---

## Sources — what can we see at all?

**Owes:** coverage of everything the product claims to cover, in a form a
machine can read on a schedule.

**Two quality axes**, and the second is the one people miss:

- **Coverage** — is there a feed for every topic the product promises?
- **Primary vs. secondary** — is this the record, or someone describing the
  record? Filings, official datasets, dockets, price APIs and trade statistics
  are primary. News, analysis and press releases are secondary.

A source list made entirely of journalism can look complete and still have
nothing underneath it. GSI Signal built 26 sources before noticing it had zero
primary ones — every number in the product would have arrived as someone else's
paraphrase.

**Failure mode:** the story never enters the funnel. Nothing downstream can
recover it, and nothing downstream reports it as missing.

**How you know it's this stage:** take a finished edition you consider good,
list every source it cites, and check which of your configured feeds would have
surfaced each one. If the answer is "few," you have a sourcing problem no amount
of ranking work will fix. This audit costs an hour and is the cheapest test in
the whole spine.

**Brief Signal:** `config/podcasts.json` (33 shows, each with an `enabled` flag
and a note explaining why), `fetch-bookmarks.py`, `extract-podcasts.js`,
`extract-rss-podcasts.py`, `fetch-lab-news.js`. Source *maintenance* runs as a
bimonthly review that audits every entry for activity and for whether it was
actually cited in the last 12 weeks — a feedback loop pointed at this stage.

---

## Items → events — the step you only need sometimes

**Owes:** one row per *thing that happened*, not per *report of it*.

**Skip this if your sources are human-curated.** When a person picks the items,
each item is already an event and this step is invisible. Brief Signal never
needed it: bookmarks arrive pre-filtered.

**Build it the moment you automate acquisition.** Raw feeds deliver the same
event many times, and the count of reports is not a measure of importance — it
is a measure of wire distribution. Treat one scoop syndicated across five
outlets as five independent confirmations and the product will systematically
lead with whatever got picked up most.

The distinction that fixes it: **echo** (re-reports of one origin) versus
**gravity** (genuinely independent origins, plus original analysis). Count the
second, record the first, never confuse them.

**Failure mode:** silent. The pipeline produces plausible rankings that are
actually ranking syndication.

**How you know it's this stage:** pick the biggest story of the week and count
how many of its items credit the same originating outlet. If your "independent
source count" doesn't drop when you do that by hand, it isn't measuring what you
think.

---

## Ranking — what earns a slot?

**Owes:** a defensible, inspectable ordering, and an explanation for every cut.

Two mechanisms, and keeping them separate is the whole trick:

- **Gates** cut. A pass/fail question about whether an item belongs at all.
- **Scores** order. They sort what survived; they don't decide membership.

Putting a numeric threshold in charge of membership couples two things that
drift independently — model scoring wanders, and a fixed cut line silently
changes how big your edition is. Gates cut, scores sort.

**Ask the gate of the cluster, not only the item.** Some significance is
emergent: one state pausing data-center permits changes nothing, five states in
a month changes what capacity a vendor can credibly promise. Score those
item-by-item and every one fails, so the story never appears.

**Failure mode:** the right story is present but loses to a louder one.

**How you know it's this stage** — and this is the hard part, because **a
coverage failure and a ranking failure look identical in a finished edition**:
the story is simply absent either way. The only way to tell them apart is to
check whether the item reached the ranker at all. Keep the rejected set, with
reasons. A cut you can't inspect is indistinguishable from a story you never had.

**Brief Signal:** the Lead-Story Doctrine and scoring axes in
`scripts/briefing-prompt.md`, the `LINEUP_GATE` that stops the run before any
prose exists, `lineup-digest.js` for the decision, `signal-digest.js` for what
was left on the floor.

---

## Analyzing — what does it mean?

**Owes:** the reading. Not what happened — what it implies for this specific
reader, and what they should do differently.

**This is where the product's value actually lives, and it is the stage most
often left implicit.** Selection is not analysis. A perfectly ranked list of
true things is a news roundup; the difference between that and intelligence is
entirely in this stage.

It is also the stage most easily inherited by accident — you copy a prompt from
a previous product and never redesign it for the new reader, so the analysis
keeps answering the old audience's question.

**A concrete method that works:** hand-write one edition before automating
anything. That artifact is your analysis spec — every analytical move in it is a
move the pipeline has to reproduce. Read it for *what it does*, not just for its
format. The temptation is to mine a hand-drafted sample for section counts and
word budgets and miss that it is the only complete statement of what the product
is for.

**Failure mode:** accurate, well-chosen, and says nothing. Readers can't fault
it and don't need it.

**How you know it's this stage:** ask what a reader should do differently having
read it. If the honest answer is "be aware," analysis is missing regardless of
how good the sourcing and ranking were.

**Brief Signal:** the Section Voice Guide and angle blocks in the briefing
prompt, the Seller's Edge teach that compounds across editions, Our Play
constrained to claims from `content/gcp-playbook.md` with a 90-day staleness
check so the analytical ground truth can't silently rot.

---

## Presenting — will they read it?

**Owes:** the format, length and delivery that fit how the reader actually
lives. Includes the unglamorous parts: it renders, it sends, it has a home.

**Presenting constraints leak upstream, and that's fine as long as it's
deliberate.** A five-minute read cap is a presenting decision that implies an
item cap, which is a ranking rule. Left implicit, that constraint gets
discovered at the wrong stage — you find it when an edition runs four times too
long, and you fix it by tampering with the ranker.

**Failure mode:** good work nobody finishes. Or, more embarrassing: a pipeline
that produces a correct edition and cannot publish it, because the render path
was never anyone's job.

**How you know it's this stage:** the content survives being read aloud but the
artifact doesn't survive contact with an inbox.

**Brief Signal:** `build.js`, `template.html`, the email path, the audio
edition, the archive site with a compounding `/sellers-edge` page.

---

## Feedback — does the system get better?

**Owes:** a mechanism by which each of the four stages above improves. Without
it, the other four are frozen at however good they were on day one.

**This is two loops, not one**, and conflating them is how the second never gets
built — the first is easier and feels like you've done it.

**Reader feedback** — did this land, is it useful, what do they skip? Analytics,
replies, the standing feedback channel.

**System feedback** — is the ranker picking well, are these sources earning
their slot, did the analysis hold up? This one is invisible to readers and is
where compounding actually happens.

**The trap worth naming:** designing a component that explicitly requires
calibration, and never building the thing that would calibrate it. GSI Signal's
rubric deliberately avoids an absolute cut line *because it would need ongoing
calibration* — and shipped with no calibration mechanism at all. The dependency
was stated in the design and still went unbuilt, because it lives in a different
stage from the one being designed.

**Failure mode:** everything works and nothing improves. Year two is as good as
month two.

**How you know it's this stage:** you can't answer "is this better than it was
three months ago?" with evidence.

**Brief Signal** — the most developed stage here, and the reason this doc lives
in this repo:

- `tasks/lessons.md` — 386 lines of correction rules derived from specific real
  mistakes, reviewed at the start of every session. This is the single highest-
  leverage artifact in the project.
- `snapshot-briefing.sh` — preserves the pre-edit draft so every human
  correction leaves a before/after pair to learn from.
- `signal-digest.js` — sweeps what the lineup left on the floor, so misses are
  visible rather than merely absent.
- `fetch-analytics.js` — reader behavior.
- The Monday PR review — the human gate that generates most of the above.
- The bimonthly podcast review — feedback aimed squarely at the sources stage.

---

## Using this as a diagnostic

The stages are useful for planning. They are more useful for debugging, because
**most process failures are altitude failures** — working in one stage on a
problem that lives in another.

When something is wrong with an edition, walk the spine in order and stop at the
first stage that can't account for it:

1. **Could we see it?** (sources) — was there a feed that carries this?
2. **Did we see it as one thing?** (items → events) — or as six fragments?
3. **Did it reach the ranker, and did the ranker cut it?** (ranking) — check the
   rejected set; "absent" is not "rejected."
4. **Did we say what it means?** (analyzing)
5. **Would anyone get that far?** (presenting)
6. **Would we catch this ourselves next time?** (feedback)

Failures at step 1 routinely present as step 3 problems. Tuning a ranker against
a story it never received is a way to spend a day making things worse.

---

## Standing up a new product

The order to build in, which is not the order the spine runs in:

1. **Hand-write one complete edition first.** It is simultaneously the analysis
   spec, the presenting spec, and the ground truth for every later test. Nothing
   else you can produce this cheaply is worth as much.
2. **Audit sources against that edition** before designing any pipeline. Map
   every citation to the feed that would have surfaced it. Fix the gaps first —
   architecture built on a source list that can't see the news is architecture
   built twice.
3. **Then design ranking and analysis**, with the hand-written edition as the
   target.
4. **Build feedback in the first release, not the second.** It is always the
   thing deferred, and deferring it is how a product plateaus.

One warning about step 1, learned the expensive way: **a hand-written edition
cannot validate a ranker whose scoring anchors were drawn from that same
edition.** That test cannot fail. Use it as a smoke test, and hold out a second
period — selected by hand, before any scoring runs — as the real gate.

---

## Related

- `docs/editorial-process.md` — Brief Signal's order of operations. That doc
  says what runs when; this one says what each stage owes and how to tell which
  is broken.
- `tasks/lessons.md` — the feedback stage in practice.
