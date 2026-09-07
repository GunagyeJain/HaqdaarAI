# Haqdaar.ai

A multimodal (voice + typed) eligibility matcher for Indian government welfare schemes.
Course project for UCS503P, Thapar Institute of Engineering and Technology.

**Haqdaar** (Hindi/Urdu) — *"one who is rightfully entitled."* The mission is helping people
claim what they are already entitled to, not merely browse a list of schemes.

---

## The one idea that matters

**An LLM never decides eligibility.**

The LLM converts speech into structured JSON fields. A deterministic PostgreSQL engine decides
eligibility, evaluating that profile against scraped scheme rules with three-valued logic
(PASS / FAIL / UNKNOWN). Every structured rule keeps its raw source prose, so any verdict is
auditable back to the government's own words.

The harm this design exists to prevent is specific: **an LLM hallucinating a citizen *out* of a
benefit they are entitled to.** A false negative here is not a bad UX outcome; it is a person not
receiving money or medicine they qualify for.

---

## Invariants

Violating any of these is a **bug**, not a preference. If a change requires breaking one, stop and
raise it rather than working around it.

1. **The LLM never decides eligibility.** It performs extraction only — transcript → structured
   fields. It never sees scheme rules and never emits a verdict.
2. **The typed path works with every AI provider switched off.** Voice is strictly additive. A
   user who never speaks a word completes a profile and gets a match.
3. **No extracted field reaches the matcher without appearing in an editable box first.** Voice
   output is a *suggestion* requiring explicit human confirmation.
4. **Every structured rule stores its source prose.** No rule exists that cannot be audited
   against the text it came from.
5. **Applicant profiles are never persisted.** Caste, income and disability status are sensitive.
   Profile state is session-only. There is no user table and no login.
6. **UNKNOWN is a first-class verdict.** Never silently coerce it to FAIL. "We cannot tell yet"
   is the honest answer and is what drives the next question.

---

## Architecture in one paragraph

A single Next.js application with **three hard logical tiers**, enforced by dependency direction:
`components/` → `app/api/` → `domain/` → `db/`, never upward. `src/domain/` is pure TypeScript —
it imports no React and no Next.js — which is what makes it independently testable and what makes
the three-tier claim true in substance rather than only on a diagram. The Playwright scraper is a
separate long-running worker with its own lifecycle, deliberately decoupled from the request path
so scraping load never touches user-facing latency.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Where things live

| Path | Contains |
|---|---|
| `src/app/[locale]/` | Localized UI routes |
| `src/app/api/` | Route handlers — the API tier entry points |
| `src/domain/rules/` | Rule DSL types, Zod schemas, TS reference evaluator |
| `src/domain/matching/` | `match_schemes()` caller and result shaping |
| `src/domain/questions/` | Information-gain next-question engine |
| `src/domain/corpus/` | Pure scrape normalization — numerals, grounding, clause synthesis |
| `src/domain/providers/` | STT / TTS / LLM interfaces + implementations |
| `src/db/` | Drizzle schema and SQL migrations (incl. `match_schemes()`) |
| `scraper/` | Playwright navigation worker — browser driving and orchestration only |
| `messages/` | i18n strings — `en` `hi` `pa` `bn` `ta` |
| `tests/` | `unit/` `integration/` `e2e/` `eval/` |

---

## Conventions

- **TypeScript strict.** No `any`. JSONB columns are typed via Drizzle's `$type<T>()`.
- **Zod is the single schema contract.** The *same* schemas validate scraper output and LLM
  extraction output. If they ever diverge, that is the bug.
- **SQL functions live in versioned migrations**, never applied by hand.
- **TDD for `src/domain/`.** The rule evaluator especially — write the failing table-driven test
  first.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Git history is a
  readable log of intent, not just a backup.
- **Providers are config, not code.** Swapping an STT vendor is an env var, never an edit to
  business logic.

---

## Commands

```bash
pnpm dev              # Next.js dev server
pnpm test             # Vitest — unit + integration
pnpm test:e2e         # Playwright end-to-end
pnpm test:eval        # extraction golden-set eval (0% hallucination gate)
pnpm db:up            # docker-compose Postgres
pnpm db:migrate       # apply Drizzle migrations
pnpm db:studio        # inspect data
pnpm scrape           # run the corpus scraper
pnpm lint typecheck   # static checks
pnpm db:renormalize   # rebuild rule trees from stored prose, no re-scrape
```

---

## Session protocol

This project is built solo through Claude Code, so **continuity across sessions is a design
constraint, not an afterthought.**

- **Start of session:** read [docs/PROGRESS.md](docs/PROGRESS.md) — its `## Current State` and
  `## Next Step` blocks are the source of truth for where the work stands.
- **End of session:** update those two blocks, tick the phase checklist, commit.
- Prefer small, focused files. When a file grows large it is usually doing too much — and it also
  stops fitting comfortably in context, which makes edits less reliable.
- Tests are executable memory. A passing suite encodes intent more durably than prose does.

---

## Source documents

- `Haqdaar-Project-Proposal-Final.pdf` — **the idea. Authoritative.**
- `haqdaar-ai-implementation-pipeline.md` — a phase plan. **Advisory**; superseded where
  [docs/DECISIONS.md](docs/DECISIONS.md) records a deviation.

The project idea is fixed. The tech stack is not, and has been revised — see the ADRs.
