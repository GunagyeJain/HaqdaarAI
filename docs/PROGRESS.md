# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

**Phase 6 substantially complete.** The accessibility pass is done and gated;
deployment is configured and documented but **not executed** — that needs your
Vercel and Neon accounts.

Suites: **243 unit/integration · 43 eval · 70 e2e.** WCAG 2.1 AA clean across
all five locales, desktop and mobile.

**The accessibility audit found real defects, which is why it exists.** The
first run reported **54 colour-contrast violations**: the verdict colours were
perfectly legible on this monitor and failed AA. For a tool aimed at people
reading cheap screens in sunlight, that is not cosmetic. Text now uses darkened
tokens kept separate from decorative ones, so a dot stays vivid without dragging
its label below threshold. Dark mode was added at the same time — on the OLED
panels common in this price bracket it costs less battery, which matters when a
phone may be shared or charged infrequently.

It also surfaced a performance problem: rendering all 455 ineligible schemes
took over 30 seconds. Capped at 25 rendered cards with the full count always
stated — a rendering limit, never a hidden result.

**The scheduled re-scrape workflow exists** (`.github/workflows/scrape.yml`),
runs weekly, and treats the corpus-coverage gate as a real gate because unlike
CI it has a corpus. It has **not yet fired**, and the pipeline document is right
that an unverified re-scrape is a deployment blocker.

## Next Step

**Finish Phase 6 — deploy.** Follow [DEPLOYMENT.md](DEPLOYMENT.md): Neon
project, migrations, corpus, Vercel import, `DATABASE_URL` secret. Then re-run
the metrics against production and record them *next to* the local numbers
rather than replacing them — the difference is itself a finding.

Then **Phase 7 — pilot**.

### Owed before the pilot, and not quietly dropped

1. **Real Sarvam and Groq credentials.** The voice path has never run against a
   live provider. This also unblocks the voice latency metric, which is
   currently reported as unmeasured rather than approximated.
2. **The manual audit** of 15 random schemes against their source prose. The
   only check that catches a rule which is well-formed, correctly grounded, and
   still wrong.
3. **Verify the scheduled scrape fires** at least once.

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
- [x] WCAG 2.1 AA, automated across all five locales, desktop and mobile
- [x] 44px touch targets, keyboard reachability, visible focus, reduced-motion
- [x] Verdict colour never the only signal
- [x] Dark mode following system preference
- [x] Rendering cap on the ineligible list (455 cards → 25)
- [x] Scheduled re-scrape workflow written
- [x] [DEPLOYMENT.md](DEPLOYMENT.md) — hosting, environment, post-deploy checks
- [ ] **Deploy to Vercel + Neon** — needs your accounts
- [ ] **Verify the scheduled scrape fires once** — deployment blocker
- [ ] Re-run all metrics against production

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
