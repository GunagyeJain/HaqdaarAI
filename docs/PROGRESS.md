# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

**Phase 5 complete.** Every §6 metric is now an executable number rather than a
claim in prose.

| Metric | Target | Measured |
|---|---|---|
| Response latency (§6.1) | median ≤2s | **338ms** typed, p95 758ms |
| Extraction accuracy (§6.2) | 0% hallucinated | **0** across 38 transcripts |
| Matching speed (§6.2) | <100ms | **52.9ms** over 483 schemes |
| Corpus coverage (§6.2) | ≥150 schemes | **483**, 98% modelled |
| Reliability (§6.2) | graceful degradation | every fallback exercised |

Suites: **243 unit/integration · 43 eval · 48 e2e.**

**The eval tests our defence, not the vendor's goodwill.** The adversarial half
runs in CI on every push: a provider that fabricates all sixteen fields must not
get a single value past grounding. Testing only the live model would make the
gate hostage to a rate limit and would fail for reasons that are not our
regression.

**The adversarial eval immediately earned itself.** It found that grounding
matched two-letter state codes as *substrings* — `"ld"` is inside "old",
"children" and "world"; `"as"` inside "as"; `"up"` inside "up". Five golden
transcripts were grounding a state nobody had named, and a wrong state clause
disqualifies a citizen from every scheme in the state they actually live in.
Fixed by matching whole words for Latin terms and never accepting a bare code.

**A benchmark whose subject changes is not a benchmark.** The matching-speed
test had been seeding 300 synthetic schemes on top of whatever was already
there, so the number depended on whether you had scraped. It now measures the
real corpus when one exists and seeds only on an empty database — and says which
it did.

## Next Step

**Phase 6 — deployment.** Vercel plus Neon, migrations applied, the scheduled
re-scrape workflow verified to fire once, and the accessibility pass. Then
re-run every metric above against production, because managed hosting shifts
them and a developer-machine number is not the result.

**Two things are owed before the pilot**, both recorded rather than quietly
dropped: verification against real Sarvam and Groq credentials (which also
unblocks the voice latency metric), and the manual audit of a 15-scheme random
sample against source prose — the only check that catches a rule that is
well-formed, correctly grounded, and still wrong.

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
- [ ] Verify against real Sarvam and Groq keys — **still owed, needs credentials**

**Exit met for the tested paths:** `tests/e2e/degradation.spec.ts` runs with no AI
keys and proves the typed path is unaffected, capabilities are reported honestly,
and every provider failure degrades with an attributable reason.

### Phase 5 — Evaluation harness ✅
- [x] 38-transcript golden set: code-mixed, Indic script, disfluency,
      self-correction, empty transcripts, and sensitive-field inference traps
- [x] Grounding assertion (0% hallucinated fields) — CI-blocking, adversarial
- [x] Latency measurement for the typed path, median + p95
- [ ] Voice-path latency — **owed, needs provider credentials**
- [x] `EXPLAIN ANALYZE` matcher benchmark, with a JIT-regression assertion
- [x] Degradation E2E spec
- [x] Corpus coverage gate, incl. source-prose presence (invariant 4)
- [x] CI runs every gate on each push

**Exit met for every metric except voice latency**, which is blocked on credentials
and is reported as unmeasured rather than approximated from the typed figure.

### Phase 6 — Design pass and deployment
- [ ] Accessibility-first visual refinement — WCAG AA, large tap targets, high contrast
- [ ] Performance on low-end Android
- [ ] Deploy: Vercel + Neon, migrations applied
- [ ] GitHub Actions scheduled re-scrape, **verified to fire once**
- [ ] Re-run latency benchmarks against production

**Exit:** live, and all metrics re-verified on real infrastructure.

### Phase 7 — Pilot
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

---

## Open questions

- Which myscheme facets map cleanly onto profile fields, and which need synthesis from prose?
  Resolved during Phase 2 field mapping.
- Does myscheme supply translated scheme content for all five locales, or only some? Determines
  the fallback strategy for localized `name` / `summary`.
- Exact Groq model ID — verify current offerings at Phase 4 rather than assuming.
