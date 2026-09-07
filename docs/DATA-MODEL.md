# Data Model

The specification for how eligibility is represented and evaluated. This is the core of the
project — everything else is delivery mechanism.

---

## 1. The applicant profile

A flat object. Every field is **optional** — absence is meaningful and is what produces `UNKNOWN`
verdicts and drives the next question. Never persisted (invariant 5); lives in session state only.

| Field | Type | Notes |
|---|---|---|
| `age` | `number` | years |
| `gender` | `'male' \| 'female' \| 'transgender'` | |
| `state` | `StateCode` | `'PB'`, `'UP'`, … — 28 states + 8 UTs |
| `district` | `string` | free text; used by a minority of schemes |
| `residence` | `'urban' \| 'rural'` | |
| `annualIncome` | `number` | INR, family income unless stated otherwise |
| `category` | `'general' \| 'obc' \| 'sc' \| 'st' \| 'ews'` | social category |
| `isMinority` | `boolean` | religious minority status |
| `occupation` | `Occupation` | `farmer`, `student`, `unemployed`, `salaried`, `self_employed`, `daily_wage`, `artisan`, `fisherman`, `homemaker`, `retired` |
| `education` | `Education` | `none`, `primary`, `secondary`, `higher_secondary`, `graduate`, `postgraduate` |
| `maritalStatus` | `'single' \| 'married' \| 'widowed' \| 'divorced'` | |
| `isDisabled` | `boolean` | |
| `disabilityPercentage` | `number` | 0–100; only meaningful when `isDisabled` |
| `isBPL` | `boolean` | below poverty line |
| `landHoldingHectares` | `number` | agricultural schemes |
| `familySize` | `number` | |

**Why a closed field set.** Scheme prose is unbounded; the profile is not. Any eligibility clause
that cannot be expressed against these fields becomes a `WILDCARD` (§3) rather than silently
expanding the schema or being dropped. Adding a field is a deliberate, reviewed change — it
invalidates cached scrape normalizations and must be done consciously.

---

## 2. The rule tree

A scheme's eligibility is a **predicate tree** stored in one JSONB column.

```jsonc
{
  "op": "AND",
  "clauses": [
    { "field": "age",          "op": "between", "min": 18, "max": 40 },
    { "field": "annualIncome", "op": "lte",     "value": 250000 },
    { "field": "state",        "op": "in",      "values": ["PB", "HR", "UP"] },
    { "field": "gender",       "op": "eq",      "value": "female" },
    {
      "op": "OR",
      "clauses": [
        { "field": "category",   "op": "in", "values": ["sc", "st"] },
        { "field": "isDisabled", "op": "eq", "value": true }
      ]
    },
    {
      "op": "WILDCARD",
      "sourceText": "The applicant must not be an income tax payer.",
      "reason": "unmodellable"
    }
  ]
}
```

### Node types

| Node | Shape | Meaning |
|---|---|---|
| **Branch** | `{ op: 'AND' \| 'OR', clauses: Node[] }` | logical combination |
| **Negation** | `{ op: 'NOT', clause: Node }` | rarely needed; see §4 for its `UNKNOWN` behaviour |
| **Leaf** | `{ field, op, ... }` | a comparison against one profile field |
| **Wildcard** | `{ op: 'WILDCARD', sourceText, reason }` | a clause we deliberately refuse to model |

### Leaf operators

| Operator | Payload | Applies to |
|---|---|---|
| `eq` / `neq` | `value` | any |
| `lt` `lte` `gt` `gte` | `value` | numeric |
| `between` | `min`, `max` (inclusive) | numeric |
| `in` / `not_in` | `values[]` | enum, string |

### Wildcard reasons

- `unmodellable` — the clause is real but outside the closed profile schema
  (*"must not be an income tax payer"*).
- `ambiguous` — prose too vague to bound reliably (*"preference to deserving candidates"*).
- `ungrounded` — a numeric bound the scraper could not verify against source prose (§ SCRAPER.md).

A wildcard **always evaluates to `UNKNOWN`**. It is never guessed at and never dropped. This is
the proposal's §5.1 requirement — *relax incalculable conditionals to a wildcard status flagged
for manual review rather than dropped or guessed at* — encoded directly in the type system.

---

## 3. Three-valued logic

Every node evaluates to `TRUE`, `FALSE`, or `UNKNOWN`. This is **Kleene three-valued logic**.

A leaf is `UNKNOWN` when the profile lacks the field it tests. A wildcard is always `UNKNOWN`.

```
AND:  FALSE  if any clause is FALSE
      UNKNOWN if no clause is FALSE and at least one is UNKNOWN
      TRUE    otherwise

OR:   TRUE    if any clause is TRUE
      UNKNOWN if no clause is TRUE and at least one is UNKNOWN
      FALSE   otherwise

NOT:  TRUE <-> FALSE;  UNKNOWN stays UNKNOWN
```

Note the asymmetry, and that it is correct: an `AND` can be decided `FALSE` while fields are still
missing (one disqualifying answer is enough), and an `OR` can be decided `TRUE` the same way. Only
when nothing is decisive does missing information propagate upward. This is exactly why the engine
can return useful verdicts from a half-filled profile.

### The SQL correspondence

This maps **exactly** onto PostgreSQL's `bool_and()` / `bool_or()` over nullable booleans, where
`NULL` represents `UNKNOWN`:

> `bool_and()` returns `NULL` if and only if no input is `FALSE` and at least one input is `NULL`.
> `bool_or()` returns `NULL` if and only if no input is `TRUE` and at least one input is `NULL`.

Those are precisely the rules above. The engine does not simulate three-valued logic — it
*inherits* it from SQL's own null semantics. This correspondence is the reason the matcher is a
single stateless query rather than an interpreter loop, and it is the most defensible piece of
engineering in the project.

---

## 4. `match_schemes(profile jsonb)`

A PL/pgSQL function containing a recursive evaluator over the rule tree. One call evaluates the
whole corpus.

**Returns one row per scheme:**

| Column | Type | Purpose |
|---|---|---|
| `scheme_id` | `uuid` | |
| `verdict` | `'PASS' \| 'FAIL' \| 'UNKNOWN'` | |
| `matched_clauses` | `jsonb[]` | clauses that evaluated TRUE — *why they qualify* |
| `failed_clauses` | `jsonb[]` | clauses that evaluated FALSE — *why they don't* |
| `unknown_fields` | `text[]` | profile fields that would resolve this scheme |

**Returning the reasoning, not just the verdict, is deliberate.** It powers two things at once:
the PASS/FAIL/UNKNOWN result cards that explain themselves to the citizen, and the next-question
engine in §5. A boolean-only matcher would force a second pass to recover both.

Defined in a versioned migration under `src/db/migrations/`, never applied by hand.

---

## 5. Next-best-question: information gain

Both source documents say the system asks the *"optimal follow-up question"* without defining
optimal. It is defined here.

Given `unknown_fields` for every scheme currently returning `UNKNOWN`:

> Ask the field `f` maximising `| { s : verdict(s) = UNKNOWN ∧ f ∈ unknown_fields(s) } |`

— the single field blocking the most currently-undecided schemes. Answering it resolves the
largest slice of the remaining uncertainty.

**Tie-break by ask-cost**, a static ordering that prefers cheap, non-sensitive questions:

```
age → state → residence → occupation → education → maritalStatus →
familySize → annualIncome → isBPL → category → isDisabled → isMinority
```

Sensitive fields (caste, income, disability) are asked last where the information gain is
comparable. The citizen reaches a useful shortlist before being asked anything uncomfortable, and
may simply stop.

The computation reuses the `unknown_fields` already returned by §4 — no extra round-trip.

---

## 6. Storage

```sql
CREATE TABLE schemes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  name              jsonb NOT NULL,           -- localized: { en, hi, pa, bn, ta }
  summary           jsonb NOT NULL,
  ministry          text,
  state             text,                     -- NULL = central scheme
  eligibility       jsonb NOT NULL,           -- the rule tree
  source_prose      text NOT NULL,            -- invariant 4 — raw eligibility text
  source_url        text NOT NULL,
  benefits          jsonb,
  documents         jsonb,
  scraped_at        timestamptz NOT NULL,
  needs_review      boolean NOT NULL DEFAULT false   -- any WILDCARD present
);

CREATE INDEX schemes_eligibility_gin ON schemes USING gin (eligibility jsonb_path_ops);
CREATE INDEX schemes_state_idx       ON schemes (state);
```

### An honest note on the GIN index

Both source documents treat the GIN index as the reason matching is fast. That is **not accurate**,
and the project is stronger for saying so plainly:

- GIN with `jsonb_path_ops` accelerates **containment** (`@>`) — enum and boolean equality.
- It does **not** accelerate **range predicates** (`annualIncome <= 250000`), which are a large
  share of real eligibility clauses.
- At a 150-scheme corpus, a sequential scan already completes far inside the 100ms target. 150
  rows is simply not enough data for any index to matter.

The index is retained because it is genuinely load-bearing for the **scalability** argument
(proposal §7) at the platform's real scale of 4,700+ schemes — not because it is what hits the
benchmark today. The claim to make is the true one: *the design scales via containment indexing
and a single stateless query,* and it is verified with `EXPLAIN ANALYZE` rather than asserted.

The real engineering challenge at this corpus size is **correctness of three-valued logic**, not
speed. That is where the test effort goes.

---

## 7. Validation contract

The **same Zod schemas** validate both scraper normalizer output and LLM extraction output.

```
ProfileSchema   ← LLM extraction (voice) AND typed form
RuleTreeSchema  ← scraper normalizer, before insert
SchemeSchema    ← full scheme record, before insert
```

This is the proposal's best structural idea: live-extracted data and scraped data conform to one
contract, so there is no second system and no drift between them. If the two ever need different
schemas, that divergence is the bug.

`RuleTreeSchema` is recursive (`z.lazy()`) and **discriminated on `op`**, so an invalid operator
or a missing payload field fails at the boundary rather than at evaluation time.
