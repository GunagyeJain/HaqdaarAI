# Corpus audit

**Sample:** 15 of 483 schemes, `pnpm audit:sample 15 1` (deterministic, seed 1).
**Date:** 2026-09-08. **Reviewer:** first pass by the coding agent; human sign-off outstanding.

Reproduce exactly with `pnpm audit:sample 15 1`.

---

## Why this audit exists

Every automated gate checks that a rule is well-formed, that its bounds are grounded in prose that
genuinely contains them, and that the prose was stored. **None of them can check whether the rule
means what the sentence means.** A clause can be valid Zod, correctly grounded in a number that
really appears, and still be about entirely the wrong thing.

That is what this sample is for, and it found six classes of defect. Four are real, one is
systematic, and one produces exactly the harm the project was built to prevent.

---

## Severity 1 — false negatives

A false negative here is a citizen told they do not qualify for money or medicine they are
entitled to. This is the harm named in the first paragraph of CLAUDE.md.

### F1. A monthly income limit is stored as an annual one — **systematic** · FIXED

Seen in `mrcbspbocwwb` and `egsdcppbocwwb`, and in every scheme phrased this way.

> *"The applicant should have a **monthly** income of ₹15,000/- or below."*

```
annualIncome lt 15000
```

₹15,000 per **month** is ₹1,80,000 per **year**. The stored rule rejects anyone earning more than
₹15,000 *a year*, so a construction worker earning ₹12,000 a month — comfortably inside the real
limit — is told they do not qualify. **The band of people wrongly excluded is ₹15,001 to
₹1,80,000 a year, which is essentially the scheme's entire intended population.**

Grounding cannot catch this: "15,000" genuinely appears in the sentence. The number is right and
the period is wrong, and only reading the sentence reveals it.

**Fixed 2026-09-08.** `clauses.ts` annualises a figure when the prose states a period, and only
then — an unqualified number is read as written, because inventing a limit twelve times larger
than the government wrote would be the same defect pointing the other way.

**Fixing it exposed a second defect.** The annualised bound then failed grounding, because 180000
does not appear in a sentence that says 15,000, and the clause collapsed to a WILDCARD. The
obvious repair — teach `isGrounded` that an annualised monthly figure is grounded by its monthly
source — changed nothing, because **`groundRuleTree` never called `isGrounded`.** It carried its
own inlined copy of the rule, so the exported function was dead code and the two definitions had
been free to drift. Both now go through one definition.

That is worth recording on its own: a safety gate with two implementations, only one of which
runs, is a gate that can be strengthened in the wrong copy and appear to have been strengthened.

**Verified on the real corpus, not just in tests:** 28 schemes state a monthly income limit;
`pnpm db:renormalize` now yields `annualIncome lt 180000` for `mrcbspbocwwb`, and the corpus-wide
modelled-clause count returned to 1053 from the 1030 the grounding rejection had cost.

### F2. "Widow of an Ex-serviceman" becomes "must be female" · FIXED

`sg-sw` (Spectacle Grant, Sainik Welfare).

> *"The applicant should be an **Ex-serviceman**/Widow of an Ex-serviceman."*

```
state in ["PY"]
gender eq "female"
```

The sentence describes two eligible groups, joined by *or*. The model kept only the second and
turned it into a hard filter, so **every male ex-serviceman — the scheme's primary beneficiary —
is failed outright.** An OR was flattened into an AND, and the wrong branch survived.

**Fixed 2026-09-08.** A disjunction guard already existed and already did the right thing — it
declines to assert anything from a sentence offering alternatives. It only recognised the *word*
"or", so a slash walked straight past it. The gap was that narrow.

**Scoping the fix was the hard part, and the first two attempts were wrong.** Both were caught by
measuring against the real corpus, not by reasoning about it.

Treating every slash as an alternation discarded **76 sound clauses**, most of them income
bounds. This prose is full of slashes that are not choices: *"Annual Income of Parents/Guardian
should not be more than Rs. 60,000"*, *"he/she"*, *"professional/Non-Professional"*. That cap is
the same cap whoever earns it. Restricting the rule to clauses that cannot hold alternatives was
closer, and still discarded those same bounds.

The distinction that actually holds: **a clause anchored to a number is unharmed by a slash
between nouns; a clause anchored to a bare noun is exactly what alternation breaks.** One word
anywhere in a sentence asserts gender, which is why "Ex-serviceman/Widow" keeps the second branch
and silently drops the first. The guard is therefore scoped to gender.

`SC/ST category` is safe under all three versions and worth stating: it becomes
`category in [sc, st]`, which represents the choice rather than picking from it. That is what
correct handling of an alternation looks like.

**Cost, measured rather than estimated:** 34 clauses corpus-wide (3%), all in bullets that
genuinely are alternations, where asserting anything from one branch was wrong anyway. Ten
schemes lost a gender filter and 73 keep one. A male ex-serviceman now sees UNKNOWN where he
previously saw a flat no.

### F3. A conditional income limit applied unconditionally

`ombgh` (Boys and Girls Hostels).

> *"**For Other Economically Backward Classes**, the Income of the parent/guardian should not
> exceed ₹75,000/-."*

```
category in ["sc"]
annualIncome lte 75000
```

The limit is scoped to OEBC applicants. The model applies it to everyone, including the Scheduled
Caste applicants the scheme is primarily for — so an SC family earning ₹80,000 is wrongly failed
on a limit that was never meant to apply to them.

---

## Severity 2 — false positives

Less harmful: a citizen is shown a scheme they will be turned away from later. Still wrong.

### F4. An upper age bound is silently dropped

`gspv` (Subsidy for Procurement of Vehicle).

> *"The applicant's age should not be less than 18 years old **or more than 50 years of age**."*

```
age gte 18
```

The `between` operator exists and is used correctly elsewhere (`mrcbspbocwwb` parses "between 18
and 60 years"). This phrasing simply is not handled, and half the constraint vanished.

---

## Severity 3 — criteria that disappear entirely

Worse than a wildcard, because a wildcard is *visible*. These leave no trace in the rule tree at
all, which sits awkwardly beside invariant 4: the prose is stored, but individual criteria within
it have no corresponding clause of any kind.

- `aamgsiscs` — *"secured **65% and above marks** in the 10th Standard"* has no clause and no
  wildcard. The SC category was extracted from the same sentence; the marks requirement vanished.
- `sg-sw` — three prose criteria, two clauses, zero wildcards. *"registered with the Department of
  Sainik Welfare"* and *"should not be a member of ECHS"* both vanished.

---

## Severity 4 — over-conservative, and inconsistent

Safe (they produce UNKNOWN, never a wrong FAIL) but they reduce how much the matcher can decide,
and the inconsistency suggests a parser gap rather than a judgement call.

| Scheme | Prose | Modelled | Note |
|---|---|---|---|
| `igoapsm` | "should be **65 years of age or older**" | WILDCARD | `age gte` exists; `gspv` parses "not less than 18 years" |
| `eicccpsrtcctd` | "age... should be **6 years or below**" | WILDCARD | `age lte` exists |
| `mmssy` | "should belong to a **minority community**" | WILDCARD | `isMinority` is a profile field |

`igoapsm` is an old-age pension. Age is the one criterion that matters most for it, it is stated
in the plainest possible language, and it is the one thing the matcher refuses to decide.

### F5. Residency duration read as an age

`ombgh`:

> *"should be a Native/Resident of the Union Territory of Puducherry for **not less than 5 years**."*

```
age gte 5
```

Five years of *residence* became five years of *age*. Harmless in effect — almost every applicant
is older than five — but it is the attribution failure from
[ADR-012](DECISIONS.md#adr-012) appearing in the corpus layer rather than the extraction layer, and
a different sentence would not be harmless.

### F6. "or below" is read as exclusive

`mrcbspbocwwb` states *"₹15,000/- **or below**"*, which includes ₹15,000. The normaliser maps
"below" to `lt`, so the stored clause excludes someone earning exactly the bound. It affects one
income exactly, and is left as recorded rather than changed, because "below" genuinely is
exclusive in the other phrasings the same pattern handles. Deciding it needs a judgement about
which reading dominates in Indian scheme prose.

### F7. A duplicated clause

`sopaatdapwhsn` models `isDisabled eq true` twice, from two sentences that both mention disability.
Harmless, but it inflates clause counts and makes the "what you meet" list repeat itself.

---

## What this says about the corpus as a whole

**The wildcards are working.** Roughly 60% of clauses in this sample are WILDCARD, and nearly all
of them should be — membership of a welfare board, possession of a driving licence, attendance
percentages. These are genuinely unmodellable and refusing to guess at them is right.

**The failures cluster in numbers with units and in sentences with structure.** Every Severity 1
finding is a case where the *number* was extracted correctly and its *meaning* was not: a period
(monthly vs annual), a scope (applies to whom), or a connective (or vs and). This is a precise,
addressable class rather than a general unreliability.

**One in fifteen carries a serious false negative** (F2), and one systematic pattern (F1) affects
every scheme that states a monthly income limit — a common phrasing for exactly the low-income
schemes this project exists to surface.

---

## Owed

- [ ] **Human sign-off.** This pass was done by the agent that wrote the normaliser, which is the
      weakest possible reviewer for it. The findings above are offered as a starting point, not a
      substitute.
- [x] ~~**Fix F1 (monthly → annual).**~~ Done 2026-09-08, and it uncovered a duplicated
      grounding rule in the process. Production picks it up on the next deploy plus a
      `db:renormalize` against the production database.
- [x] ~~**Fix F2 (or-flattening into a gender filter).**~~ Done 2026-09-08.
- [ ] **The slash is handled; the word "or" is still blunt.** "SC or ST category" wildcards the
      whole bullet, while "SC/ST category" resolves to `category in [sc, st]`. The second is
      better, and the word-based guard could learn the same trick.
- [ ] Decide on F3, F4 and the Severity 3 disappearances.
- [ ] Re-run `pnpm db:renormalize` after any normaliser change, then re-audit with the same seed
      and diff the output.
- [ ] Audit a second sample with a different seed before the pilot; one sample of fifteen is
      enough to prove defects exist and not enough to bound them.
