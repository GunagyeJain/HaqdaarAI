# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

**Phase 4 complete.** Voice is layered on the working typed path, strictly
additively, with every fallback tested rather than assumed.

| Gate | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | clean |
| `pnpm test` | **230 passed** |
| `pnpm test:e2e` | **44 passed** (desktop + mobile) |

What exists: provider contracts for STT/TTS/LLM selected by env var, Sarvam and
Groq implementations, `MediaRecorder` capture with a browser-`SpeechRecognition`
fallback, `POST /api/voice` and `POST /api/tts`, and the confirmation gate.

**The hallucination gate is structural, not a prompt.** Whatever the model
returns passes two independent checks before it can reach an editable box:
`ProfileSchema` (strict, so an invented *field* is a parse error) and grounding
(so an invented *value* is discarded). A transcript saying "hello, testing
testing" yields an empty profile even if the model returns three plausible
fields. What was dropped is reported to the citizen rather than hidden.

**Invariant 3 is literal, not approximate.** Suggestions render through
`ProfileFieldControl` — the same component the typed form uses — and nothing
reaches the profile, let alone the matcher, until the citizen confirms.

**A design flaw the degradation test caught.** A missing API key was surfacing
as "extraction failed" (502) rather than "provider unavailable" (503), which
would have shown the citizen an error instead of falling back. `extractProfile`
now propagates `ProviderUnavailableError` rather than swallowing it: a model
returning bad JSON and a provider that does not exist are categorically
different, and only one of them is worth a retry.

**A note on model drift.** Groq deprecated `llama-3.1-8b-instant` and
`llama-3.3-70b-versatile` in June 2026, so the proposal's "Llama 3" no longer
exists. The default is now a current strict-mode-capable model, overridable by
env — which is exactly why ADR-004 said to verify the model rather than assume it.

**Not yet exercised against real providers.** No Sarvam or Groq key is
configured, so the live paths are unverified. The API shapes were taken from
current vendor documentation, and the degradation suite runs in precisely the
unconfigured state. Real keys are needed before the pilot.

## Next Step

**Phase 5 — the evaluation harness.** The ~50-transcript golden set for the 0%
hallucination gate, latency instrumentation for both modes, and CI gates on
corpus coverage and matching speed.

Much of the machinery already exists — the grounding check is written and
tested; Phase 5 is about turning each §6 metric into a CI-blocking number.

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
