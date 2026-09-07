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
header naturally so **no API key is extracted or hardcoded**; cosmetic redesigns don't break the
payload shape; and it avoids per-field DOM queries entirely. The alternatives are ruled out by the
findings above rather than by preference.

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
