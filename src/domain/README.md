# Domain layer

**Tier 2.** Pure TypeScript. This directory must not import React, Next.js, or anything from
`src/app/` or `src/components/`.

That restriction is what makes the three-tier claim in the proposal true in substance rather than
only on a diagram — and what lets the rule evaluator be unit-tested without a server, a browser,
or a database.

Dependency direction is one-way: `components/` → `app/api/` → `domain/` → `db/`.

## Planned contents

| Directory | Purpose | Phase |
|---|---|---|
| `rules/` | Rule DSL types, Zod schemas, TS reference evaluator | 1 |
| `matching/` | `match_schemes()` caller, result shaping | 1 |
| `questions/` | Information-gain next-question engine | 3 |
| `providers/` | STT / TTS / LLM interfaces and implementations | 4 |

See [docs/DATA-MODEL.md](../../docs/DATA-MODEL.md) for the specification these implement.
