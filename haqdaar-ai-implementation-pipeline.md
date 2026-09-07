# Haqdaar.ai — Implementation Pipeline
**Prepared for:** UCS503P, Thapar Institute of Engineering and Technology
**Team:** Dibyanshu Samal, Gunagye Jain, Yash Jagwan (CSED)
**Reviewed as:** Senior Technical Project Manager / Software Architect

This pipeline sequences the project around the proposal's own stated priority — time-to-value via a typed-form-and-deterministic-matcher iteration shipped first, with voice layered on afterward as a strictly additive feature (Sections 2 and 9). Rather than impose a generic SDLC, each phase below is mapped back to the specific deliverables, metrics, and risks already defined in the proposal, so the plan is directly actionable against your own engineering constraints.

## Timeline at a Glance

| Phase | Focus | Suggested Duration |
|---|---|---|
| 0 | Requirements Gathering & Scoping | Week 1 |
| 1 | Architecture & Environment Setup | Week 1–2 |
| 2 | Core Development I — Deterministic Matcher & Corpus Pipeline | Weeks 2–5 |
| 3 | Core Development II — Multimodal Voice Layer | Weeks 5–8 |
| 4 | Integrated Testing & QA | Weeks 8–9 |
| 5 | Deployment | Weeks 9–10 |
| 6 | Pilot Validation | Weeks 10–11 |

---

## Phase 0 — Requirements Gathering & Scoping

**Phase Objectives:** Lock the canonical applicant profile schema, define precisely what "deterministic" means in practice (which eligibility clauses the SQL engine can evaluate vs. which must be flagged `UNKNOWN`), and translate the Section 6 success metrics into testable acceptance criteria before any code is written.

**Key Deliverables:**
- Canonical applicant profile schema (fields, types, allowed values) checked against 10–15 real eligibility clauses pulled by hand from myscheme.gov.in
- Written resolution logic for `UNKNOWN`: what triggers a follow-up question vs. what gets a wildcard flag for manual review
- Data dictionary mapping eligibility prose → structured JSONB predicate types (range, enum, boolean, wildcard)
- Section 6 metrics converted into explicit pass/fail acceptance criteria (≤2s median latency, 0% hallucinated fields, <100ms matching, ≥150 schemes)

**Tech Stack & Architecture:** No implementation yet. Draft the profile schema directly in Zod — the same validation library used later for both the LLM extractor and the scraper normalizer — so this phase's output is immediately reusable as the runtime contract in Phases 2–3.

**Dependencies & Risks:** Everything downstream depends on this schema being right; skipping a hand-review of real scheme pages risks discovering gaps mid-scrape, when they're expensive to fix. Main risk: eligibility prose is messier than expected (overlapping income/caste brackets, vague clauses) — mitigate by explicitly scoping which predicate types v1 supports and routing everything else to the wildcard/manual-review path described in Section 5.1, rather than trying to model every edge case up front.

**Testing & QA:** Manual peer review — for each of the 10–15 sample schemes, confirm every eligibility clause maps cleanly to a schema field or is explicitly marked unsupported. No automated tests at this stage.

---

## Phase 1 — Architecture & Environment Setup

**Phase Objectives:** Stand up the 3-tier skeleton and CI pipeline before feature work starts, matching the proposal's own heuristic of bringing up the CI-backed stack early (Section 2).

**Key Deliverables:**
- Repo(s) for the Next.js frontend and NestJS backend
- PostgreSQL (local Docker for dev) with a Prisma schema for `schemes` (JSONB rules + raw source prose) and `applicant_profile`
- GIN index on the JSONB eligibility column added from day one rather than retrofitted later
- CI pipeline (e.g. GitHub Actions) running lint + build + a placeholder test suite on every push
- Environment-variable scaffolding for swappable LLM and STT/TTS providers, so provider selection (Section 8) is config, not code
- A single shared profile-state module in Next.js, stubbed in now even though only the typed form will populate it until Phase 3

**Tech Stack & Architecture:** Next.js (Vercel-style edge deploy target), NestJS, PostgreSQL + Prisma, Docker for local Postgres. Keep the shared profile-state type loosely versioned rather than locking it down — its final shape depends on what the voice extractor in Phase 3 actually outputs.

**Dependencies & Risks:** Needs Phase 0's schema draft to define correct Prisma models. Risk: over-specifying the shared profile state too early can force a rewrite once voice extraction lands — keep it deliberately flexible until Phase 3 validates the real shape.

**Testing & QA:** CI green on an empty build for both frontend and backend; a smoke test confirming the NestJS API can read/write a dummy row through Prisma.

---

## Phase 2 — Core Development I: Deterministic Matcher & Corpus Pipeline
*(First iteration — proposal Section 9.1. Treat this as the MVP gate: the proposal defines success as what this iteration delivers, not the finished multimodal product.)*

**Phase Objectives:** Prove the deterministic matching engine and the scraped corpus work end-to-end against a typed profile, with zero dependency on voice.

**Key Deliverables:**
- `match_schemes()` PostgreSQL function evaluating a profile against JSONB scheme rules in a single stateless query
- Playwright scraper pipeline against myscheme.gov.in reaching 150+ schemes, with every scraped numeric bound (income caps, age limits) grounded back against source prose before insert, and incalculable conditionals relaxed to a flagged wildcard rather than dropped or guessed
- Raw scraped prose stored alongside every structured rule for auditability
- Typed applicant profile form in Next.js — fully standalone-functional, the "multimodal safety net" from Section 4.3
- Result cards showing PASS / FAIL / UNKNOWN with the underlying reasoning (which fields matched, which are missing)
- Backend unit tests for the matching function, wired into CI

**Tech Stack & Architecture:** NestJS matching endpoint calling `match_schemes()`; Zod validation on the scraper's normalizer output so scraped data conforms to the exact same schema as live-extracted data will later (Section 5.1); Playwright scrape job kept decoupled from the live conversational API (Section 7) so scraping load never touches user-facing latency.

**Dependencies & Risks:** Hard dependency on Phase 0's schema and Phase 1's Prisma models. Biggest risk is scrape coverage/staleness (Section 10) — myscheme.gov.in's page structure or pagination could shift mid-scrape, so design the scraper to fail loudly (logs/alerts) on unexpected page shapes rather than silently under-counting. Second risk: prose-grounding numeric bounds at 150+ schemes is genuinely reviewer-time-heavy — budget real human review time, not just engineering time, for this step.

**Testing & QA:** Unit tests on `match_schemes()` covering PASS/FAIL/UNKNOWN across every predicate type; schema-validation tests asserting 100% of scraped records pass Zod before insert; a CI check asserting scheme count ≥150 before this phase is considered done; manual audit of a random sample of scraped rules against their source prose.

---

## Phase 3 — Core Development II: Multimodal Voice Layer
*(Subsequent iteration — proposal Section 9.2. Never starts until Phase 2's matcher is stable.)*

**Phase Objectives:** Layer voice input onto the already-working typed pipeline — additive only, never a prerequisite for a working match.

**Key Deliverables:**
- Microphone capture via the native `MediaRecorder` API
- STT provider integration (e.g. Sarvam AI) routed through a NestJS provider-selection layer, so switching vendors is a config change
- Isolated LLM extraction layer (e.g. Llama 3 via Groq) that only converts transcripts into structured JSON — never touches eligibility logic — validated against the same Zod schema the scraper uses
- Extracted fields land in the same editable text boxes the typed form uses, requiring explicit user confirmation before they reach the matcher
- "Next best question" conversational loop: TTS playback of the follow-up question with synchronized on-screen text
- Browser-native `SpeechSynthesis`/typed-form fallback built in from the start, not bolted on later

**Tech Stack & Architecture:** NestJS conversational-turn-loop endpoint orchestrating STT → LLM extraction → shared profile state → `match_schemes()` → next-question selection → TTS. LLM calls remain extraction-only and schema-constrained, consistent with the hallucination-avoidance design in Section 4.3.

**Dependencies & Risks:** Hard dependency on Phase 2's shared profile state and matcher being stable — building voice against a moving matcher target will cause rework. Key risk (Section 10): STT/LLM API rate limits or latency spikes — mitigate with strict timeout limits and an automatic, *tested* downgrade to the typed form and native `SpeechSynthesis`, not an assumed one.

**Testing & QA:** Prompt-evaluation suite asserting 0% hallucinated fields on a benchmark set of spoken-profile transcripts (Section 6.2); latency instrumentation spanning STT → extraction → matching to track progress toward the ≤2s median; manual pilot runs completing a full profile by voice alone, confirming the editable-field review step actually catches injected transcription errors rather than passing them through silently.

---

## Phase 4 — Integrated Testing & QA

**Phase Objectives:** Validate the whole system against the proposal's own Section 6 metrics — not just per-phase unit tests — and confirm typed and voice paths are each independently sufficient.

**Key Deliverables:**
- End-to-end suite covering both "typed-only" and "voice-only" completed profiles reaching a correct match
- Latency benchmarking report for both modes against the ≤2s median target
- Hallucination-rate report from the extraction benchmark (target: 0%)
- SQL matching-speed report (<100ms target) against the full 150+ scheme corpus
- Degradation-test report: forcing an STT/LLM provider failure and confirming graceful fallback

**Tech Stack & Architecture:** Playwright (already in the stack for scraping) doubles as the browser-level E2E test tool for both input paths; a lightweight timing harness in NestJS middleware for latency capture; a CI gate that fails the build if matching speed or corpus coverage regresses below target.

**Dependencies & Risks:** Requires Phases 2 and 3 both feature-complete. Risk: latency targets are easy to hit on a small dev corpus but slip at 150+ schemes if the GIN index isn't actually being used by the query planner — verify with `EXPLAIN ANALYZE` rather than assuming the index is hit.

**Testing & QA:** This phase is itself the QA gate — every Section 6 metric becomes a pass/fail criterion (automated where possible, manually reported otherwise) before deployment proceeds.

---

## Phase 5 — Deployment

**Phase Objectives:** Ship to infrastructure matching the "operationally deployable" goal in Section 7 — common managed web hosting, not bespoke infrastructure.

**Key Deliverables:**
- Managed PostgreSQL (Supabase or Render) provisioned with the production schema and GIN index applied via Prisma migrations
- Containerized NestJS API deployment
- Next.js frontend on a Vercel-style edge deployment
- Production environment variables for STT/TTS/LLM providers, carrying over the rate-limit/timeout config from Phase 3
- Scheduled job for the periodic re-scrape from Section 9.2, keeping the corpus current as scheme policy changes

**Tech Stack & Architecture:** Docker image for NestJS; Prisma migration-deploy step in CI/CD; Vercel (or equivalent) for the Next.js edge deployment; managed Postgres with connection pooling sized for a stateless, single-query matching workload.

**Dependencies & Risks:** Depends on Phase 4's benchmarks passing against realistic infrastructure — re-run latency and matching-speed benchmarks post-deploy, since managed-hosting network hops can shift the numbers. Risk: corpus staleness in production if the re-scrape job isn't actually scheduled and monitored — treat this as a deployment blocker, not a nice-to-have.

**Testing & QA:** Smoke test both typed and voice flows against the production URL; re-run the Section 6 latency/matching benchmarks in the deployed environment; confirm the scheduled re-scrape job fires successfully at least once before sign-off.

---

## Phase 6 — Pilot Validation

**Phase Objectives:** Execute the Section 6.3 pilot plan — validate against the real, full corpus with real users, not just internal team testing.

**Key Deliverables:**
- Pilot testers each completing one full profile via typing and one full profile via voice, confirming both paths are independently sufficient
- Comparative report of LLM providers (e.g. Groq vs. a local mock) on accuracy and latency across the iteration window
- Consolidated pilot report against every Section 6 metric, formatted as the course deliverable

**Tech Stack & Architecture:** No new infrastructure — reuses the deployed Phase 5 system, plus lightweight survey/logging tooling to capture pilot-tester feedback and timing data.

**Dependencies & Risks:** Depends on a working, deployed system from Phase 5. Risk: pilot pool skewing toward technically comfortable users (e.g. fellow students) rather than the tier-2/3 citizen profile the proposal targets (Section 4.3) — recruit outside the immediate CS cohort where possible to actually stress-test the accessibility assumptions.

**Testing & QA:** The pilot itself is the test: structured observation of sessions, timing logs cross-checked against the ≤2s target, and a written summary of any `UNKNOWN`-flagging or fallback-path failures observed with real users.

---

**Note on CI/CD:** Per Section 5.3, CI/CD isn't a discrete phase — it runs continuously from Phase 1 onward (build + matcher unit tests on every change, repeatable migrations, seed/scrape scripts), gating every phase transition above rather than being a one-time setup task.
