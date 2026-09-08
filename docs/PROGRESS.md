# Progress

**Read this first at the start of every session. Update it at the end of every session.**

This file is the source of truth for where the work stands. The project is built solo through an
AI coding agent, so continuity lives here rather than in anyone's memory.

---

## Current State

*Last updated 2026-09-08 (session 4: Phase 7 interface revamp).*

The application works end to end. A citizen completes a profile — by typing, or
by speaking — in any of five languages and receives an explained match against a
real corpus scraped from myscheme.gov.in — 483 schemes locally,
**506 in production** since the scheduled refresh was verified.

### Verified numbers

| Metric (proposal §6) | Target | Measured |
|---|---|---|
| Response latency | median ≤2s | local **338ms** · voice **1210ms** · **production 512ms** (p95 1111ms) |
| Extraction accuracy | 0% hallucinated | **0** adversarial (37) · **0** live (40), recall not recaptured |
| Matching speed | <100ms | **52.9ms** server-side, 483 schemes |
| Corpus coverage | ≥150 schemes | **506 in production**, 97% with a modelled clause |
| Reliability | graceful degradation | every fallback exercised |
| Accessibility | WCAG 2.1 AA | clean, 5 locales, desktop + mobile |

Suites: **348 unit/integration · 45 eval · 121 e2e · 8 degraded.** All green.

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

1. **Push and renormalize production.** The F8 fix and the whole of Phase 7 are
   committed on `phase-7-interface` and **production has neither**: the
   scheduled scrape ran from `27b7fc3`, so all 506 production schemes were
   re-derived by the buggy normaliser and the ₹39 income ceilings are live now.
   Merge, let Vercel deploy, then run `pnpm db:renormalize` with `DATABASE_URL`
   pointed at Neon — the script reads stored prose, so no re-scrape is needed.
   **Still the highest-priority item on the list.**
2. **Run the mobile project in CI.** `ci.yml` runs `--project=chromium` only, so
   the mobile project has never run there. A test asserting a desktop-only
   element on a phone sat failing unnoticed, and the horizontal-overflow defect
   below was invisible to every gate. One flag closes both.
3. **Re-measure production latency and voice latency** once deployed and once
   the Groq quota resets. The results page now renders more per card, so the
   §6.1 number is worth re-taking rather than assumed unchanged.

Then **Phase 8 — pilot** ([EVALUATION.md](EVALUATION.md) has the protocol).

### Owed before the pilot — do not quietly drop these

1. **Human sign-off on the corpus audit** ([AUDIT.md](AUDIT.md)). **Two** samples
   are now done (seeds 1 and 2) and between them found ten defect classes.
   F1, F2, F4, F5 and F8 are fixed; F3, F6, F7, F9 and F10 are open. What is
   still owed is **a person reading the findings**, because both passes were
   made by the same agent that wrote the code they audit — that is the whole
   reason the item exists and no amount of further self-auditing discharges it.
   Reproduce with `pnpm audit:sample 15 1` and `pnpm audit:sample 15 2`.

   **The second sample did not flatten the curve**, which is the argument for a
   third: fourteen new schemes produced four new findings, two of them
   Severity 1, and one (F8) was systematic across 26 schemes — more widespread
   than F1 and strictly more harmful. Thirty schemes is 6% of the corpus and
   says nothing about the other 94%.

   **F9 is the most severe open finding.** A comma-separated list of eligible
   groups ("General, SC, ST categories, SHG members, PWD, Women, and
   Transgender") becomes a requirement to be all of them simultaneously.
2. ~~**Verify the scheduled scrape fires once.**~~ **Done 2026-09-08.** Run
   [34211965790](https://github.com/GunagyeJain/HaqdaarAI/actions/runs/34211965790)
   completed green in 23m34s, every step including the post-scrape verification.
   Production is now **506 schemes, 493 of them carrying a modelled clause (97%)**.

   The first dispatch, earlier the same day, had reported failure while the
   scrape itself succeeded — `match-schemes.test.ts` inserted fixtures one row
   at a time and blew a 10s hook budget against Neon. Fixed at the cause in
   `9f2e262`; this run is the verification of that fix.
3. **Recapture recall from a live eval run.** The 2026-09-08 run was
   **conclusive on the gated metric** — all 40 transcripts, **0 invented
   fields** — but its console output was discarded by the reporter, so the
   recall figure was lost. Recall is reported, not gated, so nothing is blocked;
   one clean pass with `--reporter=verbose` restores the number. **Attempted again
   on 2026-09-08 and returned INCONCLUSIVE** — 36 of 40 calls rate-limited, only
   3 transcripts reached the model (recall 6/9 on those, 0 invented). The daily
   *request* count had reset while the *token* budget had not, which is exactly the
   trap the inconclusive path exists for. Budget a whole
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
- [x] Manual audit of a 15-scheme random sample — first pass done 2026-09-08,
      [AUDIT.md](AUDIT.md). Found seven defect classes including one systematic
      false negative. **Human sign-off still owed:** the pass was done by the
      agent that wrote the normaliser, which is the weakest possible reviewer
      for it.

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

### Phase 6 — Design pass and deployment ✅
- [x] WCAG 2.1 AA, automated across all five locales, desktop and mobile
- [x] 44px touch targets, keyboard reachability, visible focus, reduced-motion
- [x] Verdict colour never the only signal
- [x] Dark mode following system preference
- [x] Rendering cap on the ineligible list (455 cards → 25)
- [x] Scheduled re-scrape workflow written
- [x] [DEPLOYMENT.md](DEPLOYMENT.md) — hosting, environment, post-deploy checks
- [x] **Deploy to Vercel + Neon** — live at https://haqdaar-ai.vercel.app, full 483-scheme corpus
- [x] **Verify the scheduled scrape fires once** — done 2026-09-08, run
      [34211965790](https://github.com/GunagyeJain/HaqdaarAI/actions/runs/34211965790)
      green in 23m34s. Production corpus 506 schemes, 97% modelled.
- [x] Re-run all metrics against production — **512ms median, p95 1111ms**, inside
      the 2s budget. Got there via a real failure: the first deployment ran
      functions in `iad1` with the database in Singapore and measured 2686ms
      ([EVALUATION.md](EVALUATION.md) keeps all three numbers)

**Exit met.** Live, all metrics re-verified on real infrastructure, and the
weekly refresh proven to run end to end rather than merely to exist as a file.

### Phase 7 — Interface ✅

The application was correct and honest and it read like a survey. This phase
made it readable by the person it was built for: someone who may not read
confidently, on a mid-range Android, unsure whether they are allowed to be
asking at all.

Spec: [2026-09-08-interface-revamp-design.md](superpowers/specs/2026-09-08-interface-revamp-design.md).
Plan: [2026-09-08-interface-revamp.md](superpowers/plans/2026-09-08-interface-revamp.md).

**Three of the seven recorded defects were already fixed** before this phase
began, and the checklist had gone stale on them: the typeface (Figtree with a
per-locale Noto face), the mark (an open doorway), and the palette (terracotta
on cream, not default blue). Two more — the sticky-bar fade and the "Not
answered" prominence — were fixed during the phase before it started, which is
why the list below differs from the one it replaced.

- [x] **Dead space.** The results had a column that stood empty until submit,
      so desktop opened on half a screen of nothing. They now have a route of
      their own at `/[locale]/results`.
- [x] **Sixteen identical fields in a flat wall.** Five grouped steps, easiest
      first, sensitive questions last and framed as opening schemes rather than
      gating them. Every field says why it is asked; every step says a blank is
      never a no.
- [x] **The sticky action bar slices through fields.** Fixed earlier; the
      gradient fade is in place and kept.
- [x] **"Not answered" hierarchy inversion.** Fixed earlier as prominence, and
      fixed again here for a different defect: in dark mode the chip sat at
      lab L 1.63 beneath a 3.35 page, so choosing it made it recede.
- [x] **Light is the default theme**, and the device no longer decides.
- [x] **Switching language no longer discards the chosen theme.**
- [x] **Ground and controls change theme together.**
- [x] **Results are readable.** Narrowing questions, then a shortlist, then the
      long tail collapsed. See the decision log.
- [x] **Land can be given in bigha, acres or square feet**, with the local
      meaning of bigha chosen by the citizen and never inferred.
- [x] **Illustrations**: four drawn scenes, no faces, no text, both themes.
- [ ] **Scheme names and prose are still English.** Knowingly deferred, not
      forgotten — see "Owed before the pilot".

**Constraints held throughout** — gates, not preferences:

- WCAG 2.1 AA across five locales, desktop and mobile. **28 accessibility
  assertions green**, including two new ones that would have caught the
  horizontal-overflow defect described in the decision log.
- 44px touch targets, keyboard reachability, visible focus, reduced motion.
- Verdict colour is never the only signal.
- The typed path complete with every AI provider off, proven by the degradation
  suite walking the whole new five-step flow.

**Exit met.** Suites: **348 unit/integration · 121 e2e · 8 degraded**, all
green. The e2e count is up from 74 because the form, the results and the
overflow now have their own specs.

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
| 2026-09-08 | **A monthly income limit was stored as an annual one** — "monthly income of ₹15,000 or below" became `annualIncome < 15000`, wrongly excluding everyone earning ₹15,001–₹1,80,000 a year, which is the whole population such schemes are for. 28 schemes affected. Found by reading fifteen schemes beside their prose; no automated gate could have caught it, because the number was right and only its period was wrong. |
| 2026-09-08 | **`groundRuleTree` never called `isGrounded`** — it carried an inlined copy of the same rule, so the exported function was dead code and strengthening it changed nothing in the pipeline. A safety gate with two implementations, one of which never runs, can be improved in the wrong copy and look improved. Now one definition. |
| 2026-09-08 | **Zero PASS verdicts is correct, so the results page stopped leading with it.** ~60% of corpus clauses are WILDCARD and a wildcard is UNKNOWN forever, so most schemes cannot reach PASS however much a citizen answers. Leading with "you qualify for N" leads with a number that is almost always zero — accurate, useless, and easily read as a rejection of the person rather than a limit of the tool. The page now leads with a shortlist: everything checkable passed, only human verification left. Measured at 22 schemes for a sparse profile. |
| 2026-09-08 | **The results page scrolled sideways on a phone, and nothing measured it.** Card reasons sit in a grid; a grid item's automatic minimum is its min-content width; the government prose we quote carries raw URLs. One unbreakable token widened a card to 600px inside a 412px phone, Chromium scaled the page to fit, and every line of text got smaller for a reader who may already have low vision. `overflow-wrap: break-word` does NOT fix it — it wraps visually without reducing min-content. The grid items need `min-w-0`. Surfaced only as a Playwright click timing out. |
| 2026-09-08 | **A selected "not answered" chip receded in dark mode.** It used surface-sunken, which on the dark palette is darker than both the chips beside it and the page ground — lab L 1.63 against a 3.35 page. Inset reads as "chosen" on cream and as a hole on near-black. The general lesson: a depth metaphor that works in one theme can invert in the other. |
| 2026-09-08 | **Reading `searchParams` in a page flips it from static to dynamic.** Showing the expiry notice server-side turned `/[locale]` — the landing page — into a server-rendered route, which is the same cost that ruled out reading a theme cookie in the layout. Caught in the build output, not by reasoning. The notice reads the parameter client-side. |
| 2026-09-08 | **Bigha is offered but never silently converted.** UP varies 4x against itself, Punjab runs six regional revenue systems, Rajasthan's pucca and kaccha differ 1.6x. Since `landHoldingHectares` feeds "under 2 hectares" ceilings on small-farmer schemes, a wrong factor is a false negative on exactly the people those schemes exist for. The state selects which meanings to OFFER; the citizen picks theirs; the result is echoed back in acres to check. |
| 2026-09-08 | **CI runs `--project=chromium` only**, so the mobile project has never run there. A `typed-journey` test asserting a `hidden lg:block` element had been failing on mobile unnoticed while CI stayed green. |
| 2026-09-08 | **The scheduled scrape is verified.** Run 34211965790 green in 23m34s; production is 506 schemes, 97% modelled. The earlier same-day dispatch had reported failure while succeeding — the scrape worked, the post-scrape verification blew a 10s hook budget inserting fixtures one row at a time against Neon. A weekly job that cries wolf is worse than no job. |
| 2026-09-08 | **An escaped apostrophe was an income ceiling.** `&#39;` contains the digits 3 and 9, the income builders took the first number in the bullet, and 26 schemes were stored with `annualIncome <= 39` — a limit nobody is under, so each failed every applicant. Grounding passed it because "39" is genuinely in the text. Found by the second audit sample, which is the entire argument for having taken one. |
| 2026-09-08 | **`db:renormalize` had always reported every scheme as changed.** Postgres normalizes JSONB key order, so comparing `JSON.stringify` of a stored tree against a freshly built one never matched. The metric was always the row count. Fixed the same day it was needed: the very next run reported 26, and 26 was the finding. |
| 2026-09-08 | **Measuring a fix caught a defect in the fix**, for the second time in a day. Anchoring income bounds to a currency marker discarded 15 sound ceilings, because this corpus writes `₹ 2,00,000` with a space after the symbol and only the `Rs` branch tolerated one. Net cost after correction: 2 clauses. Reasoning about the corpus would not have found this; running against it did. |
| 2026-09-08 | The e2e suite ran parallel workers against a single deployment and measured its own contention — two accessibility scans timed out at 30s, then passed in 10s and 8.6s alone. A run against `E2E_BASE_URL` now uses one worker. |

---

## Open questions

- Which myscheme facets map cleanly onto profile fields, and which need synthesis from prose?
  Resolved during Phase 2 field mapping.
- Does myscheme supply translated scheme content for all five locales, or only some? Determines
  the fallback strategy for localized `name` / `summary`.
- Exact Groq model ID — verify current offerings at Phase 4 rather than assuming.
