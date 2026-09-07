# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

**Phase 2 complete.** The corpus is scraped, normalized and stored; the matcher runs
against it inside target.

| Gate | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm test` | **182 passed** |
| `match_schemes()` | **71ms** server-side over 783 schemes (target <100ms) |

**Corpus: 483 schemes** across 33 states, from a platform of 4,772. 472 flagged
`needs_review`. Zero ungrounded bounds — no scraped figure was stored that could
not be located in the source prose.

Modelled clause coverage: `state` · `gender` · `age` · `annualIncome` · `category` ·
`isDisabled` · `isBPL` · `residence` · `disabilityPercentage`. Only 9 of the first
300 schemes ended up with no modelled clause at all.

**A note on what the verdicts look like.** A full Punjab profile returns roughly
1 PASS, 26 UNKNOWN, 456 FAIL. PASS is rare *by design*: most schemes carry at least
one clause we deliberately refuse to model, and a WILDCARD is UNKNOWN forever. The
UNKNOWN set is the actionable output — "you may qualify, here is what we cannot tell
and here is the government's own wording" — not a failure mode. A system that forced
a binary answer would have to guess on ~1,100 clauses, and each guess risks telling
someone they do not qualify when they do.

## Next Step

**Phase 3 — the typed path, and the MVP gate.** Shared profile state, the localized
profile form, `POST /api/match`, result cards showing PASS/FAIL/UNKNOWN *with their
reasoning*, and the information-gain next-question engine.

This is the proposal's own definition of success. Treat it as independently shippable.

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

### Phase 3 — Typed path (MVP GATE)
- [ ] Shared profile state (consumed later by both input paths)
- [ ] Localized typed profile form
- [ ] `POST /api/match`
- [ ] Result cards: PASS / FAIL / UNKNOWN **with reasoning**
- [ ] Information-gain next-question engine
- [ ] Full i18n across all five locales

**Exit:** a citizen completes a profile by typing alone and receives an explained match.
**This is the proposal's own definition of success — treat it as independently shippable.**

### Phase 4 — Voice (additive)
- [ ] `MediaRecorder` capture
- [ ] Provider interfaces + Sarvam STT/TTS implementations
- [ ] Groq extraction in strict JSON-schema mode → Zod → one bounded retry
- [ ] Editable-fields confirmation gate (invariant 3)
- [ ] TTS playback with synchronized on-screen text
- [ ] Browser-native fallbacks, **built in from the start and tested**

**Exit:** full profile completable by voice; forced provider failure degrades gracefully.

### Phase 5 — Evaluation harness
- [ ] ~50-transcript golden set incl. code-mixed and empty-transcript cases
- [ ] Grounding assertion (0% hallucinated fields) — CI-blocking
- [ ] Latency instrumentation, both modes, median + p95
- [ ] `EXPLAIN ANALYZE` matcher benchmark
- [ ] Degradation E2E spec
- [ ] CI gates on corpus coverage and matching speed

**Exit:** every §6 metric is an executable pass/fail check.

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
