# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

**Phase 3 complete — the MVP gate is met.** A citizen completes a profile by
typing alone, in any of five languages, and receives an explained match against
the real 483-scheme corpus. No AI provider is involved anywhere in this path.

| Gate | Result |
|---|---|
| `pnpm lint` / `pnpm typecheck` | clean |
| `pnpm test` | **212 passed** |
| `pnpm test:e2e` | **28 passed** (desktop + mobile) |
| `match_schemes()` | 71ms server-side |

What exists: the shared profile state (which Phase 4's voice console will write
into), the localized profile form, `POST /api/match`, result cards that explain
every verdict and expose the government's own wording, and the information-gain
next-question engine.

**The question engine works as specified.** With age alone it asks for `state`
(unblocking 440 schemes); with age and state it asks for `annualIncome`
(unblocking 27) — deferring the sensitive question until it was genuinely the
highest-value one. When every undecided scheme is blocked only by wildcards it
returns null rather than asking something that could not help.

**A false positive found by running the app.** A 42-year-old woman was shown
PASS for "Concessional Bus Travel Facility to Women above 60". The prose reads
"All women of 60 years and above residing in the State of Punjab" — a single
sentence stating three criteria, of which synthesis emitted only the gender.
Two fixes: `"N years and above"` is now a recognised bound, and synthesis emits
every high-confidence pattern rather than the first. A disjunction guard keeps
that safe: when an "or" sits alongside something we matched, we decline to
assert rather than conjoin alternatives into a false negative.

**`pnpm db:renormalize` was the payoff for invariant 4.** Keeping the source
prose was justified as an audit trail; it also meant the whole corpus could be
rebuilt from stored prose in seconds instead of re-scraping for half an hour.
The prose is the source of truth; the rule tree is a derived artefact.

## Next Step

**Phase 4 — voice, strictly additive.** `MediaRecorder` capture, Sarvam STT/TTS
behind the provider interface, Groq extraction in strict JSON-schema mode into
the editable-fields confirmation gate, and browser-native fallbacks built in
from the start and tested.

Nothing in Phase 4 may make the typed path a prerequisite or a fallback — it is
the product, and voice is an accelerant.

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
