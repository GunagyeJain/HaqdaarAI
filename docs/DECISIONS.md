# Architecture Decision Records

Deviations from `Haqdaar-Project-Proposal-Final.pdf` and `haqdaar-ai-implementation-pipeline.md`,
with reasoning.

**The project idea is fixed; the stack is not.** These records exist so the deviations are
deliberate and defensible rather than accidental — and so the documentation team can describe the
built system accurately.

---

## ADR-001 — Single Next.js application instead of Next.js + NestJS

**Date:** 2026-09-07 · **Status:** Accepted · **Supersedes:** proposal §5.2, pipeline Phase 1

**Context.** The proposal specifies a three-tier architecture with a separate NestJS backend. That
choice implicitly assumes a team splitting frontend and backend work. In practice this project is
built by one developer working through an AI coding agent; the other two team members handle
documentation.

**Decision.** One Next.js application with three **hard logical tiers** enforced by dependency
direction (`components/` → `app/api/` → `domain/` → `db/`). `src/domain/` imports no React and no
Next.js. The Playwright scraper remains a genuinely separate worker.

**Reasoning.**
- With no team to parallelize across, a split repo costs real plumbing — two deploy targets, CORS,
  a shared types package, two CI pipelines — and buys nothing back.
- End-to-end shared types across a single codebase materially reduce the surface area over which
  an AI agent can lose coherence between sessions. Continuity is a stated project constraint.
- Removing a browser→API→DB hop directly serves the ≤2s median latency metric (§6.1).
- The three-tier requirement is satisfied *in substance*: enforced dependency direction and a
  framework-free domain layer make the tiers real and independently testable, which a shared
  monolith with tangled imports would not.

**Trade-offs accepted.** The tiers are not independently deployable or independently scalable.
Neither is required at this scale. A future split is straightforward precisely because
`src/domain/` has no framework dependencies — it would lift out unchanged.

---

## ADR-002 — Drizzle instead of Prisma

**Date:** 2026-09-07 · **Status:** Accepted · **Supersedes:** proposal §8

**Context.** The system's core is a hand-written PL/pgSQL function performing recursive
three-valued evaluation over typed JSONB. The ORM's job here is mostly to stay out of the way of
SQL.

**Decision.** Drizzle ORM.

**Reasoning.**
- **Typed JSONB.** `jsonb('eligibility').$type<RuleTree>()` gives real compile-time types on the
  rule tree. Prisma degrades JSONB to `Prisma.JsonValue`, effectively `any` — on the single most
  important column in the schema.
- **SQL migrations are first-class.** `match_schemes()` lives in a plain `.sql` migration under
  version control. Under Prisma the function requires a hand-written migration regardless, so
  Prisma's migration engine adds ceremony without adding coverage.
- **Typed raw SQL.** Drizzle's `sql` template infers result types; `$queryRaw` largely does not.
- **No query-engine binary**, so cold starts are faster — relevant on serverless, where the
  latency budget is measured.

**Trade-offs accepted.** Drizzle assumes comfort reading SQL, and there is no Prisma Studio. The
first is a prerequisite for this project anyway; the second is covered by `drizzle-kit studio`.

---

## ADR-003 — Playwright response interception instead of DOM scraping

**Date:** 2026-09-07 · **Status:** Accepted · **Supersedes:** pipeline Phase 2

**Context.** Reconnaissance against myscheme.gov.in (recorded in [SCRAPER.md](SCRAPER.md)) found:
scheme pages are client-rendered and return no content over plain HTTP; the sitemap contains zero
scheme pages; and the underlying JSON API returns 401 because it is header-gated by the site's own
bundle.

**Decision.** Drive the real SPA with Playwright and intercept `page.on('response')` to harvest the
structured JSON the application already receives.

**Reasoning.** Stable JSON field names instead of CSS selectors; the browser supplies the gating
header itself, so the scraper never handles a credential; cosmetic redesigns don't break the
payload shape; and it avoids per-field DOM queries entirely. The alternatives are ruled out by the
findings above rather than by preference.

A key *was* subsequently discovered in the site's client bundle, and the decision not to use it is
recorded separately in [ADR-009](#adr-009).

---

## ADR-004 — Extraction LLM uses strict JSON-schema mode

**Date:** 2026-09-07 · **Status:** Accepted · **Refines:** proposal §4.1

**Context.** The proposal names "Llama 3 via Groq" for extraction. The model is dated, and the
0%-hallucinated-fields target (§6.2) needs a structural mechanism rather than prompt discipline.

**Decision.** A current Groq-served model (ID verified at implementation time, not assumed), called
in **strict JSON-schema mode**, its output parsed by `ProfileSchema` with one bounded retry on
failure.

**Reasoning.** Constrained decoding plus schema validation makes a malformed or invented field a
*caught error* rather than a silent corruption. Combined with invariant 3 — nothing reaches the
matcher without human confirmation in an editable box — hallucinated content has two independent
barriers before it can affect a verdict.

---

## ADR-005 — GitHub Actions schedule for re-scrape, not Vercel Cron

**Date:** 2026-09-07 · **Status:** Accepted · **Refines:** pipeline Phase 5

**Decision.** The periodic re-scrape runs as a GitHub Actions scheduled workflow.

**Reasoning.** A full Playwright browser session paginating a large corpus runs for minutes and
exceeds serverless execution limits. GitHub Actions provides generous timeouts, native Playwright
support, free scheduling, and retained run logs — which matter because scrape failures must be
noticed (see *Fail loudly* in SCRAPER.md).

---

## ADR-006 — Applicant profiles are never persisted

**Date:** 2026-09-07 · **Status:** Accepted · **Extends:** the source documents (absent from both)

**Decision.** No user accounts, no profile storage. Profile state is session-only.

**Reasoning.** The profile contains caste, income, and disability status about identifiable
citizens. Not storing it is simultaneously the simplest design, the strongest privacy position,
and the removal of an entire class of risk — there is no database of vulnerable citizens' welfare
profiles to breach, subpoena, or misuse. For a civic tool this is a feature worth stating
publicly, not merely an omission.

**Trade-offs accepted.** No returning-user convenience and no longitudinal analytics. Neither is
required by the proposal's success metrics.

---

## ADR-007 — Honest characterization of the GIN index

**Date:** 2026-09-07 · **Status:** Accepted · **Corrects:** proposal §7, pipeline Phase 4

**Context.** Both documents present the GIN index on the JSONB eligibility column as the reason
matching meets its <100ms target.

**Decision.** Keep the index, but state its role accurately: it supports the **scalability**
argument, not today's benchmark.

**Reasoning.** GIN with `jsonb_path_ops` accelerates containment (`@>`) — enum and boolean
equality. It does **not** accelerate range predicates such as `annualIncome <= 250000`, which are a
large share of real eligibility clauses. At 150 rows a sequential scan already finishes far inside
100ms; no index is doing meaningful work at that size. The honest claim is that the design scales
to the platform's real 4,700+ schemes via containment indexing and a single stateless query — and
`EXPLAIN ANALYZE` is used to verify rather than assert which access path the planner chooses.

Overstating this would be an easy claim to make and an easy one to be caught on in review. The
accurate version is also the more interesting one, because it redirects effort to where the real
difficulty lives: **correctness of three-valued logic, not speed.**

---

## ADR-008 — Five languages with full UI switching

**Date:** 2026-09-07 · **Status:** Accepted · **Extends:** the source documents

**Context.** The proposal targets tier-2/3 citizens and selects Sarvam AI for Indic speech, but
never states the UI language. An English-only interface accepting Hindi speech is incoherent with
the accessibility argument the project rests on.

**Decision.** English, Hindi, Punjabi, Bengali, and Tamil, with full UI switching via `next-intl` —
not merely multilingual voice.

**Reasoning.** Punjabi is chosen deliberately: the institute is in Patiala, giving access to
genuine non-English pilot testers and directly addressing the risk that the pilot pool skews toward
technically comfortable CS students. Adding a sixth language must cost one `messages/*.json` file
plus one locale entry; if it costs more, the i18n layer is wrong.

---

## ADR-009 — Do not replay the discovered API key

**Date:** 2026-09-07 · **Status:** Accepted · **Refines:** [ADR-003](#adr-003)

**Context.** Reconnaissance established that `api.myscheme.gov.in` rejects anonymous requests
(401) and rejects same-origin `fetch()` from inside the site's own page (403). The site
authenticates its own calls with an `x-api-key` header whose value is a public constant compiled
into the client JavaScript bundle. That value is trivially readable, and the scraper could harvest
it at runtime from the app's own outbound request — no hardcoding, surviving key rotation — making
the scrape roughly twenty times faster and putting the full 4,772-scheme corpus in reach.

**Decision.** We do not read or replay the key. The scraper navigates scheme pages and intercepts
the responses the browser receives on its own.

**Reasoning.**
- `robots.txt` sanctions *crawling*. It does not speak to programmatic use of an undocumented
  internal API, and the 401/403 responses are a reasonably clear signal that direct access is not
  invited. Browsing the site is unambiguously within what has been permitted; replaying an
  internal credential is not obviously within it.
- The speed is not needed. At a ~300-scheme target, navigation costs about twenty minutes in a
  scheduled job that runs at most daily. We would be trading a clear ethical position for time
  nobody is waiting on.
- Robustness runs the same direction: the browser handles the key, so key rotation, header
  changes, and added anti-abuse checks are the site's problem rather than ours.

**Trade-offs accepted.** A materially slower scrape and a practical ceiling well below the full
corpus. Both are acceptable against a 150+ requirement and a 300 target.

**Note for the report.** This is worth stating explicitly rather than omitting: the constraint was
identified, the faster path was available, and the slower one was chosen deliberately. That is a
more honest engineering account than a scraper that simply never mentions the key.

---

## ADR-010 — Fix the planner's row estimate rather than disable JIT

**Date:** 2026-09-07 · **Status:** Accepted · **Refines:** [ADR-007](#adr-007)

**Context.** Measured against the first real 300-scheme corpus, `match_schemes()` took ~220ms
median against the <100ms target in proposal §6.2. `EXPLAIN ANALYZE` — used per ADR-007 rather
than assuming — showed the cause was not the matching logic:

```
Function Scan on haqdaar_leaves  (cost=0.25..260.25 rows=1000)  (actual rows=6)
Nested Loop Left Join            (rows=298000)                  (actual rows=1788)
JIT: Timing: ... Emission 34.9 ms, Total 41.2 ms
```

A set-returning function reports 1000 estimated rows by default. Across the corpus that produced a
total cost around 179,000 — over the default `jit_above_cost` of 100,000 — so Postgres spent more
time JIT-compiling the query than executing it.

**Decision.** Declare `ROWS 6` on `haqdaar_leaves` (real schemes average about six leaf clauses),
and group by scheme id alone instead of by `(id, haqdaar_eval_node(...))`, which had forced a sort
on a computed plpgsql result.

**Reasoning.** `SET jit = off` would also have made the number go away, and would have been the
wrong fix: it hides a bad estimate rather than correcting it, and a wrong estimate produces bad
plans in other ways as the corpus grows. Correcting the estimate leaves the planner free to choose
JIT if the corpus ever genuinely warrants it.

**Result.** 220ms → **68.7ms** server-side execution over 300 schemes.

**A correction to how this was measured.** The first measurements timed the client round-trip,
which includes transport and deserialising 300 rows. §6.2 specifies "execution time for the SQL
matching function", which is server-side. The benchmark now reports both — server execution and
round-trip — and asserts on the former, because conflating them either flatters or penalises the
metric depending on which way the network happens to fall.

---

## ADR-011 — A schema that cannot express "not mentioned" makes the model guess

**Date:** 2026-09-08 · **Status:** Accepted · **Refines:** [ADR-004](#adr-004)

**Context.** ADR-004 committed to strict JSON-schema decoding for extraction. Making that work
against the live Groq API required three attempts, and the differences between them are not
cosmetic.

| Schema form | Result |
|---|---|
| `anyOf: [schema, {type:'null'}]` | Model emitted the **string** `"null"`; strict decoding rejected the whole response, failing requests whose other fields were all correct. |
| `type: ['string','null']`, enum unchanged | **HTTP 200, and silently wrong.** With no way to express null for an enum field, the model guessed: *"I am a 42 year old farmer"* came back with `gender: "male"`. |
| `type: ['string','null']` **and** `null` added to the enum | Correct. The model returns `null`. |

**Decision.** Nullability is expressed as a type array *and* `null` is appended to every enum.
The `state` field additionally drops its 36-code enum entirely: the model receives a free-text
name and `toStateCode()` normalises it, the same function the scraper uses.

**Reasoning.** The middle row is the one worth remembering. It returned 200, passed schema
validation, and invented a protected attribute out of nothing. **A schema that gives a model no
way to say "they did not tell me" is a schema that forces it to guess** — and guessing about
gender, caste, income or disability is precisely the harm this project exists to prevent.

The grounding gate caught that fabricated gender downstream, which is the defence working as
designed. But defence in depth is not a licence to leave a trap in the first layer: the schema
should never have created the pressure.

Dropping the state enum was a second-order benefit. It was more than half the schema's token
cost, which on a free-tier key throttled extraction to roughly five calls per minute, and it
asked the model to recall an arbitrary two-letter code table it has no reason to know.

**Also corrected:** a `400 json_validate_failed` was being classified as *provider unavailable*.
It is not — it means the model produced malformed output, which is transient and is exactly what
the bounded retry exists for. Misclassifying it meant the retry never fired on the one condition
it was written for, while a genuinely absent provider was retried pointlessly.

**Verified against live credentials on 2026-09-08.** None of this was reachable without them; the
whole voice path would have failed in the pilot.

---

## ADR-012 — Extraction records only the speaker's own facts

**Date:** 2026-09-08 · **Status:** Accepted · **Refines:** [ADR-004](#adr-004), [ADR-011](#adr-011)

**Context.** The first live run of the golden set against real Groq inference reported **3
hallucinated fields**, all from one transcript:

> *"my neighbour is a 60 year old widow, does she qualify for anything?"*

The model returned `age: 60`, `gender: female`, `maritalStatus: widowed` — the neighbour's
details, attributed to the applicant. **Grounding passed all three**, and correctly by its own
definition: "60" and "widow" genuinely appear in the transcript.

**This is the attribution limitation in its serious form.** It had been documented as a
number landing on the wrong field. It is worse than that: an entire other person's profile can be
applied to the citizen, and every downstream verdict is then about somebody else.

It is not an exotic edge case either. Asking on behalf of a parent, spouse or neighbour is a
normal way to use a tool like this — arguably more common among the people it targets, who may be
helping a less literate or less mobile relative.

**Decision.** The extraction system prompt now instructs the model to record only facts about the
speaker, and to return nothing when they describe someone else. Three third-party transcripts are
permanent golden-set fixtures.

**Reasoning.** Grounding cannot solve this. It checks that a value was *said*, and these values
were said — the defect is *whose* they are, which is a question about discourse structure, not
about token presence. Fixing it at the extraction layer is the only place the information exists.

**This is a mitigation, not a proof.** A prompt instruction is weaker than a structural guarantee,
which is why the fixtures are permanent: the golden set now fails loudly if a model change
regresses it. The remaining barrier is invariant 3 — the citizen sees these values in editable
boxes and can clear them — and the pilot should watch specifically for whether people notice.

**Method note.** This was found because the eval runs against the live model, not only against the
adversarial stub. The adversarial half tests our defence and passed throughout; only real inference
produced this particular failure. Both halves are needed, and neither substitutes for the other.

---

## ADR-013 — Measure the voice path where it is free, and say what is not measured

**Date:** 2026-09-08 · **Status:** Accepted · **Completes:** Phase 5

**Context.** Voice-path latency was the last unmeasured metric in proposal §6.1. It had been
blocked on provider credentials; once those existed, a second constraint appeared that is
structural rather than temporary.

The two providers have very different economics, and the difference decides the design:

| | Groq (extraction) | Sarvam (STT / TTS) |
|---|---|---|
| Free allowance | 200,000 tokens/day | ₹100 of credits |
| Renews | **daily, indefinitely** | **never** |
| On exhaustion | resumes tomorrow | requests fail until topped up |

A harness that spends a renewing daily allowance costs nothing. A harness that spends a one-time
grant is drawing down a fixed budget that the pilot also needs.

**Decision.** The voice-latency harness measures the **browser-STT configuration** by default:
the client transcribes locally with `SpeechRecognition`, POSTs the transcript, and the server
performs extraction and matching. The Sarvam server-STT hop is implemented behind
`VOICE_LATENCY_AUDIO=1` and is **off by default**.

**Reasoning.** This is not a shortcut around the measurement. Browser STT is rung two of the
fallback ladder in `src/components/voice-console.tsx` — a configuration real users run, exercised
by the degradation suite, and the one that keeps working for free after Sarvam's credits are gone.
Measuring it is measuring a real production path, not a proxy for one.

The reason to keep the audio stage available but disabled is honesty about what it would prove.
Synthesised speech is *cleaner* than a citizen on a mid-range phone in a noisy room: Bulbul
produces studio-clear audio with no crosstalk, no clipping and no regional accent Saaras was not
tuned for. An STT figure obtained that way is a **floor**, not a representative measurement. It
would look like a result while quietly being an optimistic one — and reporting an optimistic
number as a measured one is the failure mode this project's evaluation exists to avoid.

**What is therefore claimed, and what is not.** The voice turn is measured at **median 1210ms,
p95 1395ms** (extraction 1125ms, matching 78ms) against a 2000ms target. That figure covers the
browser-STT path. The Sarvam-STT path adds one network hop that **remains unmeasured**, and the
metric table says so rather than extrapolating.

**The pilot produces the honest STT number**, because it is the first time real people speak real
sentences into real microphones. That is the only measurement of a speech system that means much.
