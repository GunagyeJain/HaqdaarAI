# Evaluation

Proposal §6 defines success as five measurable metrics. This document converts each into an
**executable pass/fail criterion**. A metric that is only asserted in prose is not a metric.

---

## Metric summary

| # | Metric | Target | Measured (2026-09-07) | Gate |
|---|---|---|---|---|
| 1 | Response latency | median ≤ 2s | **338ms** typed (p95 758ms) · voice unmeasured | `pnpm test:e2e` |
| 2 | Extraction accuracy | **0%** hallucinated | **0** invented across 38 transcripts (adversarial) | `pnpm test:eval` |
| 3 | Matching speed | < 100ms | **52.9ms** server over 483 schemes | `pnpm test` |
| 4 | Corpus coverage | ≥ 150 schemes | **483**, 98% with a modelled clause | `pnpm test` |
| 5 | Reliability | graceful degradation | all fallbacks exercised with no keys | `pnpm test:e2e` |

Every gate above runs in CI on each push, except corpus coverage, which skips on
an empty database and is enforced by the scrape workflow that has one.

**One metric is not yet met and is not being reported as if it were:** the voice
path's latency needs Sarvam and Groq credentials. The typed figure above covers
the typed path only.

---

## 1. Latency (primary metric)

Measured from input completion to the system returning a match or next question.

Each stage emits a span (`stt`, `extract`, `match`, `render`). The harness runs 30 iterations per
mode and reports **median and p95** — median against the target, p95 because a good median hiding
a bad tail is not actually a good experience.

Reported per stage, not just in total, so a regression is attributable rather than merely visible.
Re-run after deployment: managed hosting adds network hops that shift the numbers, so a
dev-machine measurement is not the result.

---

## 2. Extraction accuracy — the 0% hallucination gate

The strongest claim in the proposal, and the one most in need of a harness.

**Golden set:** ~50 transcripts in `tests/eval/fixtures/`, each paired with expected extracted
JSON. Deliberately includes hard cases: code-mixed Hindi/English, ambiguous numbers
(*"do lakh"*, *"twenty-five thousand"*), speech disfluency, contradictory self-correction
(*"I'm 40 — sorry, 42"*), and **transcripts that mention no profile fields at all**.

**The suite runs in two modes, and the one that runs in CI is the important one.**

*Adversarial (always):* a provider that returns every field populated regardless
of what was said. The gate must reduce that to only what the transcript
supports. This tests **our defence** — the part we control, and the part that
must hold whichever model is configured and however it drifts. Result: **0
invented fields across 38 transcripts.**

*Live (only with `GROQ_API_KEY`):* the real model against the same set,
reporting hallucination and recall.

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
