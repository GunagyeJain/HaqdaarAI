# Architecture

## Three tiers, one deployable

The proposal specifies a three-tier web architecture. That is what this is — the tiers are
**logical and strictly enforced**, but they ship as a single Next.js application rather than as
separate services. The reasoning is recorded in [ADR-001](DECISIONS.md#adr-001).

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1 — PRESENTATION          src/app/[locale]/, components/│
│ Typed form · voice console · result cards · i18n             │
│ One shared profile state consumed by both input paths        │
├─────────────────────────────────────────────────────────────┤
│ TIER 2 — APPLICATION + DOMAIN  src/app/api/, src/domain/     │
│ Route handlers · rule evaluator · matching · next-question   │
│ · provider selection (STT/TTS/LLM)                           │
├─────────────────────────────────────────────────────────────┤
│ TIER 3 — DATA                  src/db/                       │
│ Drizzle schema · migrations · match_schemes() · Postgres     │
└─────────────────────────────────────────────────────────────┘

        ┌──────────────────────────────────────┐
        │ scraper/  — separate worker          │
        │ Playwright · own lifecycle · cron    │
        │ Writes to Tier 3. Never on the       │
        │ request path.                        │
        └──────────────────────────────────────┘
```

**The boundary is enforced by dependency direction:** `components/` → `app/api/` → `domain/` →
`db/`, never upward. `src/domain/` imports no React and no Next.js — it is plain TypeScript. That
is what makes the tier claim true in substance rather than only on a diagram, and it is what makes
the rule evaluator unit-testable without a server or a browser.

The scraper is deliberately decoupled from the live request path (proposal §7) so scrape load can
never touch user-facing latency.

---

## Data flow

### Typed path — always available (invariant 2)

```
form input → shared profile state → POST /api/match
           → match_schemes(profile) → verdicts + reasoning
           → result cards + next question
```

No AI provider is involved at any point. With every API key removed, this path still works.

### Voice path — strictly additive (invariant 2)

```
MediaRecorder → POST /api/stt   → Sarvam           → transcript
              → POST /api/extract → Groq (JSON schema) → Zod
              → EDITABLE FIELDS ── requires explicit confirmation ──┐
                                                                    ↓
                                          shared profile state → /api/match
                                                                    ↓
                                          next question → /api/tts → playback
                                                        + on-screen text
```

The **editable-fields gate** is the safety mechanism (invariant 3). Extracted values are
suggestions rendered into the same boxes the typed path uses. Nothing reaches the matcher until
the citizen confirms it. A mis-transcription is therefore always recoverable, which is the whole
argument for being multimodal rather than voice-only.

Note that both paths converge on **one profile state object**. Neither is a second system.

---

## Provider abstraction — config, not code

Proposal §8 requires provider selection to be configuration. Each provider is an interface in
`src/domain/providers/` with implementations selected by env var:

```ts
interface SttProvider  { transcribe(audio: Blob, locale: Locale): Promise<string> }
interface TtsProvider  { synthesize(text: string, locale: Locale): Promise<AudioBuffer> }
interface LlmProvider  { extract(transcript: string, locale: Locale): Promise<unknown> }
```

| Role | Primary | Fallback |
|---|---|---|
| STT | Sarvam AI | browser `SpeechRecognition`, then typed form |
| TTS | Sarvam AI | browser `SpeechSynthesis` |
| LLM | Groq (strict JSON schema) | typed form |

Every provider call is wrapped with a **timeout and a tested fallback**. The pipeline document
warns against an *assumed* downgrade path; the degradation route is exercised by an automated test
(see [EVALUATION.md](EVALUATION.md)), not merely written down.

`LlmProvider.extract()` returns `unknown` on purpose — the value is only trusted after passing
`ProfileSchema`. The type system enforces that nothing skips validation.

---

## Internationalization

Five locales at launch: **English, Hindi, Punjabi, Bengali, Tamil**, via `next-intl` with
`/[locale]/` routing.

Punjabi is a deliberate inclusion rather than an arbitrary third language: the institute is in
Patiala, so it provides access to genuine non-English pilot testers. That directly addresses the
pilot-validation risk of a tester pool skewed toward technically comfortable CS students.

- **UI strings** (~120) are translated in `messages/<locale>.json`.
- **Scheme content** is stored as localized JSONB (`name`, `summary`), populated where
  myscheme.gov.in supplies a translation and falling back to English otherwise.
- **Voice** locale is passed through to Sarvam for both STT and TTS, so a citizen speaks and is
  answered in the same language the UI is displaying.

Adding a sixth language must cost exactly one `messages/*.json` file plus one locale entry. If it
ever costs more than that, the i18n layer has been built wrong.

---

## Latency budget

The primary success metric is a ≤2s median (proposal §6.1).

| Stage | Budget | Applies to |
|---|---|---|
| Sarvam STT | 600–900ms | voice only |
| Groq extraction | 300–500ms | voice only |
| `match_schemes()` | <100ms | both |
| Network + render | ~200ms | both |
| **Voice total** | **~1.2–1.7s** | |
| **Typed total** | **~150ms** | |

Collapsing to a single application removes a browser→API→DB network hop that a split backend would
have added — a direct contribution to this budget, and part of the reasoning behind ADR-001.

Every stage is instrumented and emits a span; the measured distribution — not the estimate above —
is what the evaluation harness reports.
