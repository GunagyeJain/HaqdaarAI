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

**2. Corpus.** The app is functional but empty until scraped. Either run
`pnpm scrape` locally against the production `DATABASE_URL`, or trigger the
**Refresh scheme corpus** workflow manually. Expect ~20 minutes.

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
| `GROQ_MODEL` | no | Overrides the default; see [ADR-004](DECISIONS.md#adr-004) on model drift |
| `STT_PROVIDER` / `TTS_PROVIDER` / `LLM_PROVIDER` | no | `sarvam` / `groq` / `none` |
| `PROVIDER_TIMEOUT_MS` | no | Hard timeout before falling back. Default 4000 |

**Deploying with no AI keys is a supported configuration, not a broken one.**
It is the state the degradation suite runs in.

---

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
