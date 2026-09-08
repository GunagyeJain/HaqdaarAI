# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

*Last updated 2026-09-08 (session 2: voice latency, provider budget, honest-inconclusive).*

needs the developer’s Vercel and Neon accounts.
needs the developer's Vercel and Neon accounts.

The application works end to end. A citizen completes a profile — by typing, or
by speaking — in any of five languages and receives an explained match against a
real 483-scheme corpus scraped from myscheme.gov.in.

### Verified numbers

| Metric (proposal §6) | Target | Measured |
|---|---|---|
| Response latency | median ≤2s | local **338ms** · voice **1210ms** · **production 512ms** (p95 1111ms) |
| Extraction accuracy | 0% hallucinated | **0** adversarial (37) · **0** live (40), recall not recaptured |
| Matching speed | <100ms | **52.9ms** server-side, 483 schemes |
| Corpus coverage | ≥150 schemes | **483**, 98% with a modelled clause |
| Reliability | graceful degradation | every fallback exercised |
| Accessibility | WCAG 2.1 AA | clean, 5 locales, desktop + mobile |

Suites: **243 unit/integration · 45 eval · 74 e2e.** All green.

Local runs show skips, and they are honest ones rather than hidden failures:
the degradation suite skips because .env.local gives this machine real keys
(run `pnpm test:e2e:degraded` to exercise it — 8 passed), and the live
extraction and voice-latency measurements skip as **inconclusive** whenever
the Groq daily quota is spent. CI has no .env.local, so it runs degradation
directly and skips the live halves instead.

### Local environment

Postgres runs in Docker (`pnpm db:up`, host port **5433**) and already holds the
483-scheme corpus. `.env.local` exists, is gitignored, and holds working Sarvam
and Groq keys. `GROQ_MODEL` is deliberately blank — the code defaults to
`openai/gpt-oss-20b`, which is verified available.

Two environment quirks worth knowing before debugging something that is not
broken: pnpm needs `node-linker=hoisted` here (Windows symlink locks), and this
network blocks `cdn.playwright.dev`, so Playwright drives system Chrome locally
via `PW_CHANNEL` while CI uses the bundled browser.

### Provider budget — measured 2026-09-08, and tighter than assumed

The two providers are economically different and it changes how the work is
scheduled:

| | Groq (extraction) | Sarvam (STT / TTS) |
|---|---|---|
| Free allowance | 200,000 tokens/day | ₹100 of credits |
| Renews | **daily, forever** | **never** |
| Measured unit cost | ~3,800–4,900 tokens per extraction | ₹30/hr audio · ₹30/10k chars |
| Practical ceiling | **~40–50 extractions/day** | ~50 pilot sessions total |

The per-call cost was assumed to be ~1,600 tokens and is not. **One full live
eval pass consumes ~186,000 of the 200,000 daily tokens**, so an eval run and a
day of pilot sessions cannot share a day. Plan them apart.

Nothing breaks when either runs out: extraction degrades to the typed path, and
Sarvam degrades to browser `SpeechRecognition`/`speechSynthesis`, which are free
and unlimited. That ladder is invariant 2 and is covered by the degradation suite.

## Next Step

**Deployed and verified.** Live at https://haqdaar-ai.vercel.app with the full
483-scheme corpus, 512ms production median, CI green.

Next, in order:

1. **Verify the scheduled scrape fires once** — the last deployment blocker.
   The `DATABASE_URL` secret and the workflow are both in place; it has simply
   never been dispatched. `gh workflow run "Refresh scheme corpus"`, then watch
   it finish. It upserts, so it cannot destroy the corpus.
2. **Phase 7 — Interface.** A full revamp, before the pilot rather than after,
   because testers judge what they see and would otherwise give feedback about
   the form instead of the matching.
3. **Re-measure voice latency in production** once the Groq quota resets. It is
   currently reported as inconclusive, which is honest but incomplete.

Then **Phase 8 — pilot** ([EVALUATION.md](EVALUATION.md) has the protocol).

### Owed before the pilot — do not quietly drop these

1. **Manual audit of 15 random schemes** against their `source_prose`. The only
   check that catches a rule which is well-formed, correctly grounded, and still
   wrong. This is human review time, not engineering time.
2. **Verify the scheduled scrape fires once.** The pipeline document treats an
   unverified re-scrape as a deployment blocker, and it is right.
3. **Recapture recall from a live eval run.** The 2026-09-08 run was
   **conclusive on the gated metric** — all 40 transcripts, **0 invented
   fields** — but its console output was discarded by the reporter, so the
   recall figure was lost. Recall is reported, not gated, so nothing is blocked;
   one clean pass with `--reporter=verbose` restores the number. Budget a whole
   day of Groq quota for it.
4. ~~Cap voice spend before the app is public.~~ **Done 2026-09-08.** A daily
   per-provider cap that stores no identifier of any kind — three integers a
   day for the whole application, nothing joinable to a person. A per-visitor
   limit would be fairer and was rejected because it needs to identify
   visitors, which invariant 5 forbids. One abuser can still spend a day; they
   cannot spend the grant. Tune with `VOICE_DAILY_LIMIT` / `TTS_DAILY_LIMIT`.

### Known limitations, recorded rather than hidden

- **Grounding checks presence, not attribution**, and the serious form of this
  is third-party speech. "my father is 70 and disabled" grounds `isDisabled`
  because the word is genuinely there — the defect is *whose* fact it is. The
  live model failed all three such transcripts before the extraction prompt was
  told to record only the speaker's own facts ([ADR-012](DECISIONS.md#adr-012)).
  They are permanent golden-set fixtures and are carved out of the adversarial
  assertion by an explicit `beyondGrounding` flag, with their own test asserting
  the gap. A prompt is a mitigation, not a guarantee; **the pilot should watch
  whether people notice and clear these values.**
- **PASS verdicts are rare and that is correct.** ~1,100 clauses across the
  corpus are `WILDCARD`, because the prose states criteria we deliberately refuse
  to model rather than guess at. A wildcard is UNKNOWN forever, so most schemes
  cannot reach PASS. The UNKNOWN set is the actionable output, not a failure.
- **State names are English across all locales.** A scoping decision, not a
  principle; revisit if pilot testers object.

---

## Phases

Each phase ends at a checkpoint: **tests green · this file updated · work committed.**

### Phase 0 — Foundation ✅
- [x] `git init`, `.gitignore`, conventional-commit setup
- [x] Next.js + TypeScript (strict) + Tailwind scaffold
- [x] Drizzle + `docker-compose.yml` for local Postgres
- [x] `next-intl` wiring with all five locales stubbed
- [x] Vitest + Playwright configured
- [x] GitHub Actions CI — lint, typecheck, test
- [x] `.env.example` for all provider keys

**Exit met:** all gates green; `pnpm db:migrate` succeeds against local Postgres.

### Phase 1 — Rule DSL and matcher ✅
- [x] Zod schemas: `ProfileSchema`, `RuleTreeSchema` (recursive, discriminated on `op`)
- [x] TS reference evaluator — TDD, failing tests first
- [x] Table-driven tests: every operator × PASS/FAIL/UNKNOWN
- [x] Drizzle schema + `schemes` table migration
- [x] `match_schemes()` PL/pgSQL function as a versioned migration
- [x] **Differential test:** TS evaluator and SQL function agree on every fixture
- [x] Property test: monotonicity (a new field never reverses a decided verdict)

**Exit met:** three-valued logic verified in both implementations, and both tests
proven capable of catching a deliberate mutation.

### Phase 2 — Corpus ✅
- [x] Playwright navigation scraper intercepting `page.on('response')`
- [x] Field mapping: myscheme structured facets → profile fields
- [x] Rule-tree synthesis from eligibility prose
- [x] Prose-grounding with Indian numeric surface forms (`2,50,000`, `2.5 lakh`, `₹…`)
- [x] Ungrounded bounds → `WILDCARD` + `needs_review`
- [x] Fail-loudly behaviour + run summary report
- [x] Keyword passes for a regionally coherent corpus
- [ ] Manual audit of a 15-scheme random sample — **human review time, still owed**

**Exit met:** 483 schemes (target 150+), all Zod-valid, zero ungrounded bounds stored.

### Phase 3 — Typed path (MVP GATE) ✅
- [x] Shared profile state (consumed later by both input paths)
- [x] Localized typed profile form
- [x] `POST /api/match`
- [x] Result cards: PASS / FAIL / UNKNOWN **with reasoning** and source prose
- [x] Information-gain next-question engine
- [x] Full i18n across all five locales
- [x] `pnpm db:renormalize` — rebuild rule trees from stored prose, no re-scrape

**Exit met:** verified end to end by `tests/e2e/typed-journey.spec.ts`, including
a complete journey in Punjabi, against the real corpus with no AI provider configured.

### Phase 4 — Voice (additive) ✅
- [x] `MediaRecorder` capture with browser `SpeechRecognition` fallback
- [x] Provider interfaces + Sarvam STT/TTS implementations
- [x] Groq extraction in strict JSON-schema mode → Zod → one bounded retry
- [x] Grounding gate: no value survives that the transcript does not support
- [x] Editable-fields confirmation gate (invariant 3), sharing the form's controls
- [x] `POST /api/tts` with on-screen text always rendered in parallel
- [x] Browser-native fallbacks, built in from the start and **tested**
- [x] Verified against real Sarvam and Groq keys (2026-09-08) — found four
      defects that would have failed the whole voice path in the pilot; see
      [ADR-011](DECISIONS.md#adr-011)

**Exit met for the tested paths:** `tests/e2e/degradation.spec.ts` runs with no AI
keys and proves the typed path is unaffected, capabilities are reported honestly,
and every provider failure degrades with an attributable reason.

### Phase 5 — Evaluation harness ✅
- [x] 40-transcript golden set: code-mixed, Indic script, disfluency,
      self-correction, empty transcripts, and sensitive-field inference traps
- [x] Grounding assertion (0% hallucinated fields) — CI-blocking, adversarial
- [x] Latency measurement for the typed path, median + p95
- [x] Voice-path latency — **1210ms median, p95 1395ms** (browser-STT path);
      the Sarvam server-STT hop stays unmeasured by choice ([ADR-013](DECISIONS.md#adr-013))
- [x] `EXPLAIN ANALYZE` matcher benchmark, with a JIT-regression assertion
- [x] Degradation E2E spec
- [x] Corpus coverage gate, incl. source-prose presence (invariant 4)
- [x] CI runs every gate on each push

**Exit met for every metric.** Voice latency was the last gap and is now measured.
The Sarvam STT hop within it stays unmeasured by choice, and is reported that way
rather than approximated from a synthetic-audio run that would flatter it.

### Phase 6 — Design pass and deployment
- [x] WCAG 2.1 AA, automated across all five locales, desktop and mobile
- [x] 44px touch targets, keyboard reachability, visible focus, reduced-motion
- [x] Verdict colour never the only signal
- [x] Dark mode following system preference
- [x] Rendering cap on the ineligible list (455 cards → 25)
- [x] Scheduled re-scrape workflow written
- [x] [DEPLOYMENT.md](DEPLOYMENT.md) — hosting, environment, post-deploy checks
- [x] **Deploy to Vercel + Neon** — live at https://haqdaar-ai.vercel.app, full 483-scheme corpus
- [ ] **Verify the scheduled scrape fires once** — deployment blocker
- [x] Re-run all metrics against production — **512ms median, p95 1111ms**, inside
      the 2s budget. Got there via a real failure: the first deployment ran
      functions in `iad1` with the database in Singapore and measured 2686ms
      ([EVALUATION.md](EVALUATION.md) keeps all three numbers)

**Exit:** live, and all metrics re-verified on real infrastructure.

### Phase 7 — Interface

The application is correct and honest, and it looks like a form. The developer’s
assessment, and it is right: **generic, AI-generated, no identity of its own.**
A tool that asks people for their caste, income and disability status has to look
like something they can trust, and trust is partly visual.

This phase comes **before** the pilot deliberately. Testers judge what they see,
and shipping the current interface would collect feedback about the form rather
than about the matching.

**What is actually wrong, from a production screenshot rather than by taste:**

- [ ] **The sticky action bar slices through form fields.** The `sticky
      bottom-0` bar in `profile-form.tsx:209` is opaque with a hard top border,
      so mid-scroll it cuts "What you do" and "Highest education" in half with
      no fade or affordance that content continues beneath it.
      *Checked before claiming worse: no content is lost, and keyboard focus
      scrolls clear of the bar rather than landing under it. So this is a
      visual defect, not a functional one* — it looks broken without being
      broken, which is still worth fixing.
- [ ] **No typeface is chosen at all.** `layout.tsx` sets only `antialiased`;
      everything renders in the browser default. That single fact accounts for
      much of the generic feel. Whatever is chosen **must cover Devanagari,
      Gurmukhi, Bengali and Tamil** — a Latin-only font silently falls back
      to system defaults in four of the five locales, which is worse than now.
- [ ] **The brand colour is default Tailwind blue.** The most recognisable
      "generated by an AI" tell there is.
- [ ] **No mark, no wordmark treatment.** "Haqdaar.ai" is 16px semibold text.
      The name means *one who is rightfully entitled* and deserves better.
- [ ] **A hierarchy inversion.** The "Not answered" pills are solid brand blue,
      making the *absence of an answer* the most visually prominent thing on the
      page. UNKNOWN is a first-class verdict (invariant 6), but that is an
      argument for showing it honestly, not loudly.
- [ ] **Sixteen identical fields in a flat wall**, with no grouping, no
      progressive disclosure and no sense of progress beyond "2 of 16 answered".
- [ ] **Dead space.** `max-w-5xl` two-column on desktop leaves the results
      column empty until submit, so first impression is half a screen of nothing.

**Constraints the revamp must not break** — these are gates, not preferences:

- WCAG 2.1 AA, verified automatically across five locales, desktop and mobile.
  The tokens in `globals.css` were derived from contrast requirements; a new
  palette must clear the same bar and `accessibility.spec.ts` must stay green.
- 44px touch targets, keyboard reachability, visible focus, reduced-motion.
- Verdict colour is never the only signal.
- Five locales, including scripts with taller line boxes than Latin.
- The typed path must remain complete and usable with every AI provider off.

**Exit:** a distinctive interface that a stranger would not identify as
template output, with every accessibility gate still green and the e2e suite
passing unchanged.

### Phase 8 — Pilot
- [ ] Recruit testers beyond the CS cohort, including non-English speakers
- [ ] Each completes one typed and one voice profile
- [ ] Injected-transcription-error test
- [ ] Consolidated report against every §6 metric

**Exit:** course deliverable complete.

---

## Decision log

Architectural decisions go in [DECISIONS.md](DECISIONS.md) as ADRs. Smaller in-flight notes,
surprises, and things worth remembering go here:

| Date | Note |
|---|---|
| 2026-09-07 | myscheme.gov.in scheme pages return no content over plain HTTP and the sitemap has zero scheme pages — response interception is the only viable route. |
| 2026-09-07 | Platform hosts 4,700+ schemes, so the 150+ target has large headroom. Corpus scope can be narrowed for coherence rather than stretched for count. |
| 2026-09-07 | **pnpm needs `node-linker=hoisted` on this machine** (`.npmrc`). The default symlinked layout fails with `EBUSY` on Windows when antivirus holds file locks. |
| 2026-09-07 | pnpm 11 moved native-build approval out of `package.json` into `pnpm-workspace.yaml` as `allowBuilds` (not `onlyBuiltDependencies`). esbuild, `@swc/core` and `unrs-resolver` all need it. |
| 2026-09-07 | **This network blocks `cdn.playwright.dev`** — `playwright install` fails even outside the sandbox. `playwright.config.ts` therefore drives system-installed Chrome locally via `channel`, while CI uses the bundled download. Override with `PW_CHANNEL`. |
| 2026-09-07 | Pinned **TypeScript 5.9, not 7.0**. TS 7 (the Go-native compiler) is out but the ESLint/Next toolchain around it is young; a two-month build is not the place to absorb that. Revisit before deployment. |
| 2026-09-07 | Next 16 renamed the `middleware` file convention to `proxy`. `src/proxy.ts` holds the next-intl handler; the import is still `next-intl/middleware`. |
| 2026-09-07 | `vitest.config` must be `.mts` — as `.ts` it is loaded as CJS and warns on every run. |
| 2026-09-08 | **A Groq extraction costs ~3,800–4,900 tokens, not the ~1,600 assumed.** One full live eval pass burns ~186k of the 200k daily free tier. The daily cap, not the per-minute one, is the binding constraint: ~40–50 extractions/day. |
| 2026-09-08 | **A 429 arrives as a thrown `ProviderUnavailableError`, not a failed result.** `extractProfile` rethrows it deliberately, so the eval’s rate-limit counter never saw it and a throttled run reported FAILURE. Both the eval and the voice-latency harness now catch it and report **inconclusive**. Found by exhausting the real quota, not by reading the code. |
| 2026-09-08 | **The degradation suite could never pass locally.** `next start` loads `.env.local`, so the local server always had real keys while the suite asserts their absence — and its assertions were spending real Groq and Sarvam budget calling providers expecting failure. `pnpm test:e2e:degraded` now starts a keyless server on port 3101. |
| 2026-09-08 | Golden set is **40 transcripts**, 37 of them in adversarial scope (3 are `beyondGrounding`). Docs had said 38 in several places. |
| 2026-09-08 | **Production latency fails the §6.1 target: 2686ms median, 8x the local 338ms.** `X-Vercel-Id: bom1::iad1` shows the function running in Virginia while the database is far from it; one trivial query costs ~180ms and the matcher spends ~2.0s on database round trips. Not a slow query — a transcontinental one. `vercel.json` now pins `sin1`. |
| 2026-09-08 | **CI had never run before today** — the repo was local-only, so "CI runs every gate on each push" described the file, not reality. Four e2e gates needing a corpus had never protected anything; `tests/fixtures/corpus.sql` (25 real schemes) now gives CI one. |
| 2026-09-08 | The latency spec died on Playwright’s 30s default against a slow deployment, reporting a stopwatch instead of a measurement. Timeout now scales with the run count so a failing deployment fails *with its number*. |
| 2026-09-08 | **`vercel.json` pinning `sin1` cut production latency 5.2x**, 2686ms to 512ms. One line, one region. |
| 2026-09-08 | The e2e suite ran parallel workers against a single deployment and measured its own contention — two accessibility scans timed out at 30s, then passed in 10s and 8.6s alone. A run against `E2E_BASE_URL` now uses one worker. |

---

## Open questions

- Which myscheme facets map cleanly onto profile fields, and which need synthesis from prose?
  Resolved during Phase 2 field mapping.
- Does myscheme supply translated scheme content for all five locales, or only some? Determines
  the fallback strategy for localized `name` / `summary`.
- Exact Groq model ID — verify current offerings at Phase 4 rather than assuming.
