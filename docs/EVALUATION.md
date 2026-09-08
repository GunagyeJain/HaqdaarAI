# Evaluation

Proposal §6 defines success as five measurable metrics. This document converts each into an
**executable pass/fail criterion**. A metric that is only asserted in prose is not a metric.

---

## Metric summary

| # | Metric | Target | Measured (2026-09-08) | Gate |
|---|---|---|---|---|
| 1 | Response latency | median ≤ 2s | local **338ms** · voice **1210ms** · **production 512ms** | `pnpm test:e2e` |
| 2 | Extraction accuracy | **0%** hallucinated | **0** adversarial · **0** live over 40 transcripts (2026-09-08) | `pnpm test:eval` |
| 3 | Matching speed | < 100ms | **52.9ms** server over 483 schemes | `pnpm test` |
| 4 | Corpus coverage | ≥ 150 schemes | **483**, 98% with a modelled clause | `pnpm test` |
| 5 | Reliability | graceful degradation | all fallbacks exercised with no keys | `pnpm test:e2e` |

Every gate above runs in CI on each push, except corpus coverage, which skips on
an empty database and is enforced by the scrape workflow that has one.

**Every §6 metric is now measured.** One qualification, stated rather than buried:
the voice figure covers the **browser-STT** configuration — the client transcribes
locally and the server extracts and matches. The **Sarvam server-STT hop is still
unmeasured**, deliberately, because measuring it with synthesised audio would produce a
floor dressed up as a result. See [ADR-013](DECISIONS.md#adr-013); the pilot produces the
honest number.

---

## 1. Latency (primary metric)

Measured from input completion to the system returning a match or next question.

Each stage emits a span. The typed harness runs 12 iterations; the voice harness runs **8**,
not the 30 originally specified here, because every voice iteration spends Groq daily quota
and the extraction eval needs the same budget. The deviation is recorded rather than the
number quietly changed — override with `VOICE_LATENCY_RUNS`.

Both report **median and p95** — median against the target, p95 because a good median
hiding a bad tail is not actually a good experience for the people in the tail.

Voice stage attribution comes from the `Server-Timing` header that `/api/voice` emits in
production, not from client-side guesswork, so a regression names the stage that caused it.
A `stt;dur=0` span is meaningful rather than missing: it says the browser transcribed
locally and the server STT hop never happened.

**Measured 2026-09-08, local dev machine, 483-scheme corpus:**

| Path | Stage | Median | p95 |
|---|---|---|---|
| Typed | full request | 338ms | 758ms |
| Voice | extraction (Groq) | 1125ms | 1318ms |
| Voice | matching (Postgres) | 78ms | 100ms |
| Voice | **full turn** | **1210ms** | **1395ms** |

Extraction is ~93% of the voice turn, which is the useful finding: the matcher is not the
bottleneck, so optimising it would buy nothing. 7 of 8 runs were measured — one returned
a 502 from the extraction stage, and a throttled or degraded call is recorded as unmeasured
rather than folded into the distribution as though the system were merely slow.

### Production, measured 2026-09-08

Against `https://haqdaar-ai.vercel.app` (Vercel Hobby + Neon, full 483-scheme corpus):

| Run | Median | p95 | Verdict |
|---|---|---|---|
| Local dev machine | 338ms | 758ms | pass |
| Production, functions in `iad1` | 2686ms | 2873ms | **FAIL** |
| Production, functions in `sin1` | **512ms** | **1111ms** | **pass** |

All three are kept. The middle row is the finding, and deleting it would delete the reason
the third row exists.

**What went wrong.** The first deployment missed the §6.1 budget by 34%. Three endpoints
separated network from database:

| Request | iad1 | What it includes |
|---|---|---|
| `GET /api/voice` | ~0.50s | client to function and back, **no database** |
| `GET /api/health` | ~0.68s | the same path plus **one** trivial query |
| `POST /api/match` | ~2.5s | the same path plus the full matcher |

One database round trip cost **~180ms**, and the matcher spent **~2.0s** on database round
trips — a query that takes 52.9ms server-side locally. The matcher had not become slower.
Every round trip it made was crossing an ocean.

`X-Vercel-Id: bom1::iad1` named it: requests entered at Mumbai, functions executed in
Virginia, and the database was in Singapore. A 180ms trivial query is not a slow query; it
is a transcontinental one.

**The fix was one line.** `vercel.json` pins functions to `sin1`. Hobby permits exactly one
region, and Singapore is correct on both counts: beside the database, and far closer to the
citizens this is built for than Virginia. Latency fell **5.2x**, from 2686ms to 512ms.

**Two harness defects surfaced on the way, both of which hid the number.**

The latency spec died on Playwright’s 30s default doing 12 runs of ~2.5s and reported "Test
timeout exceeded" — a stopwatch where a measurement belonged. Its budget now scales with
the run count, so a slow deployment fails *with its median attached*.

And the suite ran parallel workers against one deployment, so it measured its own
contention: two accessibility scans timed out at 30s, then passed in 10s and 8.6s when run
alone. Nothing was wrong with the page. A run against `E2E_BASE_URL` now uses a single
worker — slower in wall-clock, honest in result, and it matters most for the one spec
whose entire job is to report a number a citizen would actually experience.

**Full production suite: 31 passed, 6 skipped, 0 failed.** The skips are honest: five
degradation tests, because production has real AI keys and that suite needs their absence,
and the voice-latency measurement, because the Groq daily quota was spent.

**This is what re-measuring in production is for.** Every local number was correct and none
of them predicted a 2.7-second production median. A dev-machine measurement is not the result.


---

## 2. Extraction accuracy — the 0% hallucination gate

The strongest claim in the proposal, and the one most in need of a harness.

**Golden set:** 40 transcripts in `tests/eval/fixtures/`, each paired with expected extracted
JSON. Deliberately includes hard cases: code-mixed Hindi/English, ambiguous numbers
(*"do lakh"*, *"twenty-five thousand"*), speech disfluency, contradictory self-correction
(*"I'm 40 — sorry, 42"*), and **transcripts that mention no profile fields at all**.

**The suite runs in two modes, and the one that runs in CI is the important one.**

*Adversarial (always):* a provider that returns every field populated regardless
of what was said. The gate must reduce that to only what the transcript
supports. This tests **our defence** — the part we control, and the part that
must hold whichever model is configured and however it drifts. Result: **0
invented fields across 37 transcripts.**

*Live (only with `GROQ_API_KEY`):* the real model against the same set,
reporting hallucination and recall.

The live half is **paced at 13 seconds per call**, because an unpaced loop hits a rate limit
and the rate limit then consumes the bounded retry that exists for genuine model glitches,
making throttling look like a model failure. A full run takes about nine minutes and is
deliberately not part of CI.

**Budget, measured on 2026-09-08 rather than assumed.** An extraction costs **~3,800-4,900
tokens**, not the ~1,600 this document previously claimed. Groq allows **200,000 tokens/day**
on the free tier, so:

| | Figure |
|---|---|
| Cost of one extraction | ~3,800-4,900 tokens |
| Free allowance | 200,000 tokens/day, renewing |
| Extractions available per day | **~40-50** |
| Cost of one full live eval pass | ~186,000 tokens — **nearly the whole day** |

The binding constraint is the daily cap, not the per-minute one. A full eval pass and a day of
pilot sessions **cannot share a day**; plan them apart.

**Result, 2026-09-08:** the live run completed **without throttling** and invented **0 fields**
across the 40-transcript golden set, confirming that [ADR-012](DECISIONS.md#adr-012) holds
against the real model. The recall and coverage figures were not captured from that run
(the reporter discarded console output), so they are **owed one more pass** when the quota
resets. The 0-hallucination result is the gated one and it is recorded; recall is reported
rather than gated, so its absence delays nothing.

**When the quota runs out mid-run the suite reports INCONCLUSIVE, not green.** That path was
not merely written but *exercised*: the day's budget was genuinely exhausted on 2026-09-08
and the run was observed taking it. The first implementation did not work — a 429 arrives as
a thrown `ProviderUnavailableError`, not as a failed result, so it escaped the rate-limit
counter entirely and failed the suite instead. Reasoning about the code did not reveal that;
running it out of quota did.

The distinction matters because the three outcomes mean different things: **green** = the model
invented nothing across the whole set; **red** = it invented something; **inconclusive** = we
could not observe it. Collapsing the third into either of the others is the same error the
product exists to prevent (invariant 6), applied to our own evaluation.

Testing the model alone would make the gate hostage to a vendor's behaviour and
to a rate limit; testing the defence means CI fails when *we* regress.

**A known limitation, recorded rather than left to be discovered.** Grounding
verifies a value was *said*, not that it was said *about that field*. A
transcript containing "60 percent disability" will ground an extracted `age` of
60. This is why grounding is the second of three barriers rather than the only
one — strict JSON-schema decoding precedes it, and the citizen confirming the
value in an editable box follows it. There is a test pinning this behaviour so
it would be noticed if it ever widened.

Two assertions per fixture:

- **Grounding (the hallucination gate).** No extracted field may be populated unless it is
  supported by the transcript. A field invented from nothing is a hard failure. This is the
  assertion that makes "0% hallucinated fields" a fact rather than a hope.
- **Recall.** Fields clearly present in the transcript should be extracted. Tracked and reported,
  but a miss is *not* a hard failure — a missing field degrades to `UNKNOWN` and prompts a
  question, which is safe. An invented field can silently exclude an eligible citizen, which is
  not. **The gate is deliberately asymmetric because the harms are asymmetric.**

The empty-transcript fixtures matter most: a model that populates fields from a transcript
containing none of them is exhibiting exactly the failure mode this project exists to prevent.

---

## 3. Matching speed

`match_schemes()` timed against a 300-scheme corpus, reporting the median of nine runs.

**Two numbers are reported, because they answer different questions:**

| Measure | What it includes | Target |
|---|---|---|
| **Server execution** | `EXPLAIN (ANALYZE, TIMING OFF)` — the function itself | **<100ms (§6.2)** |
| Client round-trip | plus transport and deserialising 300 rows | feeds the ≤2s budget (§6.1) |

§6.2 specifies "execution time for the SQL matching function", so the gate asserts on server
execution. Reporting only the round-trip would penalise or flatter the metric depending on the
network; reporting only server time would hide what the API tier actually waits for.

**Live model, measured 2026-09-08** (`openai/gpt-oss-20b`, 41 transcripts):

| Run | Invented | Recall |
|---|---|---|
| First | **3** — all from one third-party transcript | 41/51 (80%) |
| After the [ADR-012](DECISIONS.md#adr-012) prompt fix | **0** | 46/51 (90%) |

Recall improved alongside the fix rather than being traded against it. The
adversarial half held at 0 throughout, across the 37 transcripts grounding can
decide; the 3 third-party cases are carved out explicitly and pinned by their
own test, because grounding structurally cannot settle whose fact a value is.

**Quota note.** The free tier allows 200,000 tokens/day and each extraction
costs roughly 1,600, so a few full runs exhaust it. When calls are rate-limited
the suite reports **inconclusive** and skips rather than passing — an incomplete
run reported as green would look like evidence and would not be.

---

**Measured (2026-09-07, 300 schemes, local Docker Postgres):**

- server execution **68.7ms** · round-trip **76.5ms** — both inside target.
- Reached after a real regression was found and fixed: the first measurement was **220ms**,
  caused by a planner row estimate wrong by two orders of magnitude tripping JIT compilation.
  See [ADR-010](DECISIONS.md#adr-010).

The benchmark also asserts the plan contains **no JIT section**, which is what regressed before;
a timing assertion alone would have caught the symptom without naming the cause.

Per [ADR-007](DECISIONS.md#adr-007) the plan is recorded rather than assumed. At this corpus size
the planner chooses a sequential scan and the GIN index is not doing meaningful work — which is
the honest position, and the reason the index is justified by the scalability argument rather than
by this benchmark.

**Re-run after deployment.** Managed hosting shifts these numbers, so a developer-machine figure
is not the result.

---

## 4. Corpus coverage

- Unique schemes ≥ **150**
- **100%** of inserted records pass `SchemeSchema`
- Every numeric bound in every rule tree is prose-grounded, or the clause is a flagged `WILDCARD`
- `needs_review` count reported (not a failure — a work queue)

Plus a **manual audit**: a random sample of 15 schemes compared rule-tree-against-`source_prose`,
recorded in the pilot report. This is human review time and needs budgeting as such; it is the
only check that catches a rule that is well-formed, well-grounded, and still wrong.

---

## 5. Reliability — degradation

Automated, not assumed. The pipeline document specifically warns against an untested fallback path.

| Forced failure | Required behaviour |
|---|---|
| Sarvam STT unavailable | Falls back to browser `SpeechRecognition`, then the typed form. No dead end. |
| Groq unavailable / times out | Voice input disabled with an explanatory message; **typed form fully functional** |
| Sarvam TTS unavailable | Falls back to browser `SpeechSynthesis`; on-screen text always shown |
| All AI providers removed | **Entire typed path works end to end** (invariant 2) |

The last row is run with every AI-related env var unset. It is the direct executable test of the
proposal's central multimodal-safety-net claim.

---

## 6. Correctness of the matcher

Not a §6 metric, but the foundation everything else rests on.

- **Table-driven unit tests** over the TS reference evaluator: every operator × every verdict,
  plus `AND`/`OR` short-circuit asymmetry, nested trees, `NOT` over `UNKNOWN`, and empty clause
  lists.
- **Differential testing.** The same fixtures run through the TS evaluator *and* `match_schemes()`
  in Postgres; the two must agree on every case. Two independent implementations of Kleene logic
  disagreeing is the cheapest possible way to catch a subtle error in either — and three-valued
  logic is exactly the kind of thing that looks right and isn't.
- **Property test:** adding a field to a profile may move a scheme `UNKNOWN → PASS` or
  `UNKNOWN → FAIL`, but must never move it `PASS → FAIL` or `FAIL → PASS`. Monotonicity is the
  invariant that makes the conversational loop coherent — answering a question must never reverse
  a decided verdict.

---

## 7. Accessibility

Not a §6 metric, and arguably it should have been. The people this tool exists
for are more likely to be on a cheap phone in bright sunlight, to have low
vision, and to be reading a script that renders poorly at Latin line heights. An
interface they cannot use excludes exactly the citizen it was built to reach —
the same harm as a wrong verdict, arrived at differently.

Checked automatically against **WCAG 2.1 AA** (`tests/e2e/accessibility.spec.ts`):

- every locale's landing view, and the populated results view, scanned with axe
- all interactive controls at least 44px tall, on a mobile viewport
- full keyboard reachability, and a visible focus ring that is never designed away
- verdict colour is never the only signal — the verdict is always spelled out

**What the first run found:** 54 colour-contrast violations. The verdict colours
were legible on a good monitor and failed AA — precisely the case where checking
beats judgement. Text now uses darkened tokens kept separate from the decorative
ones, so a dot can stay vivid without dragging its label below threshold.

It also surfaced a performance problem rather than an accessibility one:
rendering all 455 ineligible schemes took over 30 seconds. The list is now capped
at 25 rendered cards with the full count always stated.

**Automated checks catch roughly a third of real barriers.** The pilot's
structured observation is the other two-thirds and is not replaced by a green
suite.

---

## Pilot validation (proposal §6.3)

- Each tester completes **one profile entirely by typing** and **one entirely by voice**,
  confirming both paths are independently sufficient.
- Recruitment deliberately extends **beyond the CS cohort**, including non-English speakers — the
  Punjabi locale exists partly to make this possible ([ADR-008](DECISIONS.md#adr-008)).
- Structured observation captures: where users hesitated, whether the editable-review step
  actually caught transcription errors, and any `UNKNOWN` or fallback behaviour that confused them.
- One deliberate test: **inject a transcription error and confirm the reviewer catches it.** If
  users click through the editable-fields gate without reading, the gate is not doing its job and
  the interface needs to change.

Consolidated into a report covering every metric above, formatted as the course deliverable.
