# Deployment

Target: "operationally deployable" on common managed hosting (proposal §7) —
Vercel for the app, Neon for Postgres, GitHub Actions for the scheduled scrape.

Nothing here is exotic on purpose. The project's claim is about determinism and
auditability, not infrastructure novelty.

---

## What runs where

| Piece | Host | Why |
|---|---|---|
| Next.js app + API routes | Vercel | Edge-deployed, one deploy for UI and API ([ADR-001](DECISIONS.md#adr-001)) |
| PostgreSQL | Neon | Only Postgres is needed; branching makes migration testing safe |
| Corpus scraper | GitHub Actions | Long-running Playwright session; exceeds serverless limits ([ADR-005](DECISIONS.md#adr-005)) |

---

## First deploy

**1. Database.** Create a Neon project and take the pooled connection string.
Apply the schema from a machine that has the repo:

```bash
DATABASE_URL="postgres://…" pnpm db:migrate
```

Migrations include `match_schemes()` and its helpers, so this is what puts the
matcher into the database — it is not applied by hand, ever.

**2. Corpus.** The app is functional but empty until loaded. Three routes, fastest first:

- **Copy the corpus you already have** (seconds). It is 10 MB and already verified:

  ```bash
  docker exec haqdaar-postgres pg_dump -U haqdaar -d haqdaar --data-only --table=schemes > corpus.sql
  psql "$DATABASE_URL" -f corpus.sql
  ```

- **Trigger the Refresh scheme corpus workflow manually** (~20 min). Do this anyway at least
  once — verifying the schedule fires is a sign-off requirement, not an optional check.
- **Run `pnpm scrape` locally** against the production `DATABASE_URL` (~20 min).

Seeding from the dump and *separately* dispatching the workflow is the recommended order: it
gets the app working immediately and still proves the scheduled path end to end.

**3. App.** Import the repo into Vercel. It needs `DATABASE_URL`; every AI key
is optional, and the typed path works without them (invariant 2).

**4. Scheduled scrape.** Add `DATABASE_URL` as a repository secret. The workflow
runs weekly and can be dispatched manually.

> **Verify it fires at least once before sign-off.** The pipeline document treats
> an unscheduled or unmonitored re-scrape as a deployment blocker, and that is
> the right call: a corpus that silently stops updating produces confident,
> outdated verdicts.

---

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Pooled Neon connection string |
| `SARVAM_API_KEY` | no | Indic STT/TTS. Unset → browser speech, then typed form |
| `GROQ_API_KEY` | no | Extraction only. Unset → voice input disabled, form unaffected |
| `GROQ_MODEL` | no | **Leave blank.** Defaults to `openai/gpt-oss-20b`, verified available. Other strict-mode options: `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`. The proposal's Llama models were deprecated in June 2026 ([ADR-004](DECISIONS.md#adr-004)) |
| `SARVAM_TTS_SPEAKER` | no | Defaults to `ritu`. Must be a `bulbul:v3` speaker — v2 names such as `anushka` are rejected |
| `STT_PROVIDER` / `TTS_PROVIDER` / `LLM_PROVIDER` | no | `sarvam` / `groq` / `none` |
| `PROVIDER_TIMEOUT_MS` | no | Hard timeout before falling back. Default 4000 |

**Deploying with no AI keys is a supported configuration, not a broken one.**
It is the state the degradation suite runs in.

**Provider budgets, measured 2026-09-08.** The two providers behave differently and the
difference matters more than the raw numbers.

| | Groq (extraction) | Sarvam (STT / TTS) |
|---|---|---|
| Free allowance | 200,000 tokens/day | ₹100 of credits |
| Renews | **daily, forever** | **never** |
| Measured cost | ~3,800–4,900 tokens per extraction | ₹30/hr audio, ₹30/10k chars |
| Practical ceiling | **~40–50 extractions/day** | ~50 voice sessions total |

An earlier version of this document claimed ~1,600 tokens per extraction and named the
8,000/minute limit as the constraint. Both were wrong: the per-call cost is roughly three
times higher and **the binding limit is the daily cap**. One full live evaluation pass
consumes ~186,000 of the 200,000 daily tokens, so an eval run and a day of pilot sessions
cannot share a day.

Neither running out breaks the app. Groq exhausted disables voice input and leaves the typed
form untouched; Sarvam exhausted falls back to browser speech, which is free and unlimited.
That ladder is invariant 2 and the degradation suite covers it.

---

---

## Hosting free tiers, and the one that bites

| | Free allowance | Relevant limit |
|---|---|---|
| Vercel Hobby | 100 GB transfer, 1M invocations, 4 CPU-hours/month | **10-second function timeout**; non-commercial only |
| Neon | 0.5 GB storage/project, 100 CU-hours/month | Autosuspends when idle (adds cold-start latency) |

The corpus is **10 MB**, so Neon storage is not a concern.

**Set `PROVIDER_TIMEOUT_MS=3000` on Vercel.** This is the one real incompatibility. The
default of 4000 gives the voice route 4s for STT plus 8s for extraction — up to **12
seconds sequentially**, which exceeds the Hobby plan’s 10-second cap. Vercel would kill
the request with a 504 *before* the app’s own fallback could run, turning a graceful
degradation into a hard failure for the citizen. At 3000 the worst case is 3s + 6s = 9s and
the app stays in control of its own failure. Typical extraction is ~1.1s, so this costs
nothing in practice.

This is exactly what "providers are config, not code" is for: an env var, not a code change.

**Vercel Hobby is non-commercial only.** A course project qualifies. If Haqdaar is ever
operated as a service, this is no longer the right plan.
## After deploying

Re-run the §6 measurements against production. Managed hosting adds network
hops and different CPU, so a developer-machine figure is not the result
([EVALUATION.md](EVALUATION.md)).

```bash
E2E_BASE_URL="https://<deployment>" pnpm test:e2e --project=chromium
```

That covers latency, the typed journey, degradation, and accessibility against
the real deployment. For matching speed, run `EXPLAIN (ANALYZE, TIMING OFF)` on
`match_schemes()` against Neon directly — the number that matters is server-side
execution, not the round-trip from a laptop in another country.

Record the production numbers next to the local ones in EVALUATION.md rather
than replacing them. The difference between the two is itself a finding.

---

## Operational notes

**Connection pooling.** Matching is a single stateless query, so use Neon's
pooled endpoint. Serverless functions open many short-lived connections and will
exhaust a direct endpoint.

**Cold starts.** Drizzle ships no query-engine binary ([ADR-002](DECISIONS.md#adr-002)),
which keeps cold starts small — this is part of why it was chosen over Prisma.

**No personal data is stored.** There is no user table and no session store
(invariant 5, [ADR-006](DECISIONS.md#adr-006)). A database breach exposes public
scheme data. This is worth stating in the deployment write-up, because it is a
deliberate design position rather than an omission.

**If the scrape starts failing**, read the workflow log before changing code.
The scraper fails loudly and names the reason — a payload shape change, repeated
fetch failures, or a count below the floor — and the fix differs for each.
