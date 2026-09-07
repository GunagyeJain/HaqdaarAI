# Evaluation

Proposal §6 defines success as five measurable metrics. This document converts each into an
**executable pass/fail criterion**. A metric that is only asserted in prose is not a metric.

---

## Metric summary

| # | Metric | Target | Gate |
|---|---|---|---|
| 1 | Turn / response latency | median ≤ 2s, both modes | `pnpm test:latency` |
| 2 | Extraction accuracy | **0%** hallucinated fields | `pnpm test:eval` (CI-blocking) |
| 3 | Matching speed | < 100ms full corpus | `pnpm test:perf` (CI-blocking) |
| 4 | Corpus coverage | ≥ 150 schemes, 100% Zod-valid | `pnpm test:corpus` (CI-blocking) |
| 5 | Reliability | graceful degradation | `pnpm test:e2e` degradation spec |

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

`match_schemes()` timed against the full corpus, 100 runs, reporting median and p95.

Additionally runs **`EXPLAIN ANALYZE`** and records the chosen access path. Per
[ADR-007](DECISIONS.md#adr-007), the expectation at 150 rows is a sequential scan, and that is
fine — the point is to *record what the planner actually does* rather than assert that the GIN
index is doing work it is not. The pipeline document is right that assuming index usage is how
latency targets quietly slip; the fix is to look.

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
