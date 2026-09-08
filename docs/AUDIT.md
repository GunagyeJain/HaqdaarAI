# Corpus audit

**Samples:** two of 15 schemes each, drawn deterministically from 483 —
`pnpm audit:sample 15 1` and `pnpm audit:sample 15 2`. Fourteen of the second sample's
schemes are new; `mafcw` appears in both.
**Date:** 2026-09-08. **Reviewer:** both passes by the coding agent; human sign-off outstanding.

Reproduce exactly with `pnpm audit:sample 15 1` and `pnpm audit:sample 15 2`.

The second sample was owed because *one sample of fifteen is enough to prove defects exist
and not enough to bound them*. It found four more, one of which (F8) is the most severe
defect this project has recorded.

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

### F8. An escaped apostrophe becomes an income ceiling of ₹39 — **systematic** · FIXED

Found in the second sample, in `hpms` and `marriage-of-daughter-of-sc-widow`, and present in
26 schemes corpus-wide.

> *"The applicant**&#39;**s family annual income should not exceed ₹2,00,000/- from all sources."*

```
annualIncome lte 39
```

myscheme returns prose with HTML character references intact, and often double-escaped: an
apostrophe arrives as `&#39;` or `&amp;#39;`. That string contains the digits **3** and **9**,
and the income builders took the first number in the bullet.

**Twenty-five schemes carried an income ceiling of ₹39 a year**, plus one at ₹468 where F1's
monthly annualisation multiplied the same 39. **Nobody is under those ceilings, so every one of
those schemes failed every applicant who reached it** — and they are scholarships and pensions
for low-income families, which is exactly the population this project exists to surface. This is
a worse instance of the harm than F1: F1 wrongly excluded a band of incomes, F8 excluded
everybody.

Grounding could not catch it, because "39" genuinely appears in the prose. Same blind spot as F1.

**Fixed 2026-09-08.** References are decoded on the way into the parser. Stored prose is left
exactly as scraped (invariant 4), so `pnpm db:renormalize` repaired the corpus with no re-scrape.

**Three more of the same class came with it**, all "first number in the bullet":

| Scheme | Prose | Stored | Actual limit |
|---|---|---|---|
| `post-st` | "From the academic year **1980**-81…" | `lte 1980` | none stated |
| `mkym` | "For the **50%** Subsidy Scheme… below the poverty line" | `lt 50` | none stated |
| `fadcs` | "₹**2, 00,000**/- per annum" (a stray space) | `lte 2` | ₹2,00,000 |

So the income builders now ask for **amounts** — figures carrying a rupee marker or a scale word
— rather than for numbers. A sentence stating no amount yields nothing and the bullet becomes
UNKNOWN, which is honest and never a wrong FAIL.

**The measurement caught a defect in the fix**, which is the second time that has happened today
and is worth the discipline. The first version anchored on a bare `₹` and **discarded 15 sound
income bounds**, because this corpus writes `₹ 2,00,000` with a space after the symbol and only
the `Rs` branch allowed one. Real ceilings were vanishing — `aag` at ₹20,00,000, `gtadap` at
₹75,000. Corrected, the net cost is **2 clauses**, both sentences that state no limit at all.

**Corpus after:** zero income ceilings below ₹12,000/year remain, from 29 before.

### F9. A list of eligible groups becomes a requirement to be all of them

`beds` (Buffalo Entrepreneurship Development Scheme), second sample.

> *"The applicant belongs to **General, SC, ST** categories, **SHG members, PWD, Women, and
> Transgender** individuals."*

```
isDisabled eq true
category in ["sc"]
gender eq "female"
```

The sentence names the groups the scheme is open to. The model turned three of them into three
**simultaneous** hard filters, so an applicant must now be disabled *and* Scheduled Caste *and*
female. A General-category non-disabled male farmer — named in the sentence's first word — is
failed outright, and "ST" and "Transgender" vanished entirely.

This is F2's class (a disjunction flattened into a conjunction) arriving through a **comma-
separated list** rather than a slash or the word "or", so the existing guard, scoped to gender
and to `or`/`/`, walks straight past it. It is worse than F2 because it asserts three wrong
filters at once instead of one.

### F10. A residence-conditional income limit becomes a residence filter

`tls-cl1mc` (Term Loan, Credit Line 1 for Minority Community), second sample.

> *"The annual family income of the applicant should not exceed ₹98,000/- **(Rural Area)** and
> ₹1,20,000/- **(Urban Area)**."*

```
annualIncome lte 98000
residence eq "rural"
```

Two defects from one sentence. The lower of the two limits is applied to everyone, and — worse —
**a residence requirement is invented that the prose never states.** The scheme is open to urban
applicants at a higher ceiling; the stored rule fails every one of them on residence.

F3 is the same shape (a scoped limit applied unconditionally) but stops short of fabricating a
second filter. Expressing either correctly needs conditional rules the DSL does not have; what
does not need the DSL is *not asserting the condition as a criterion*.

---

## Severity 2 — false positives

Less harmful: a citizen is shown a scheme they will be turned away from later. Still wrong.

### F4. An upper age bound is silently dropped · FIXED

`gspv` (Subsidy for Procurement of Vehicle).

> *"The applicant's age should not be less than 18 years old **or more than 50 years of age**."*

```
age gte 18
```

The `between` operator exists and is used correctly elsewhere (`mrcbspbocwwb` parses "between 18
and 60 years"). This phrasing simply is not handled, and half the constraint vanished.

**Fixed 2026-09-08.** The cause was ordering rather than a missing operator. `not less than 18
years` matched first and claimed the age field, so the upper bound was never tried — the
patterns are ordered most-specific-first exactly to avoid this, and a paired form was missing
from the front of the list. `gspv` now reads `age between 18 and 50`, so a 60-year-old is
correctly told no rather than shown a scheme that stops at 50.

Two phrasings occur in the corpus and both are handled: *"...or more than 50 years of age"* and
*"...and not more than 45 years"*.

**A guard came with it.** An inverted range — *"not less than 50 years or more than 18 years"* —
is a data error rather than a criterion. Left alone the lower bound would match on its own and
assert `age >= 50`: half of a contradictory sentence, picked arbitrarily, and capable of
excluding someone who qualifies. Such a bullet is now UNKNOWN in full. No scheme in the corpus
states one today, which is the point of writing the guard before one does.

Only two schemes were affected, and that is worth stating plainly: this was the cheapest of the
remaining findings, not the most valuable.

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

### F5. Residency duration read as an age · FIXED

`ombgh`:

> *"should be a Native/Resident of the Union Territory of Puducherry for **not less than 5 years**."*

```
age gte 5
```

Five years of *residence* became five years of *age*. Harmless in effect — almost every applicant
is older than five — but it is the attribution failure from
[ADR-012](DECISIONS.md#adr-012) appearing in the corpus layer rather than the extraction layer, and
a different sentence would not be harmless.

**Fixed 2026-09-08.** Fourteen bullets across the corpus were making this mistake, not one.

**The two exceptions are what made it interesting.** Both of these mention residence *and* a
genuine age, and a rule that suppressed age wherever "resident" appeared would have silently
discarded a correct clause — trading a harmless wrong answer for a harmful missing one:

> *"All women of **60 years** and above **residing** in the State of Punjab"* — the age comes
> first and the residence is incidental.

> *"a **resident** of Bihar state **and** should be at least **25 years**"* — two separate
> criteria in one sentence.

So the test is not whether residence is mentioned, but whether **the number is the duration**.
The residency term has to come first and reach the number without crossing an "and", and the age
clause is dropped only when its value equals the duration found. `ombgh` lost its `age >= 5`;
`cbtfw60ya-p` kept its `age >= 60`.

**Cost:** 13 clauses, every one of them an assertion about the wrong field.

### F6. "or below" is read as exclusive

`mrcbspbocwwb` states *"₹15,000/- **or below**"*, which includes ₹15,000. The normaliser maps
"below" to `lt`, so the stored clause excludes someone earning exactly the bound. It affects one
income exactly, and is left as recorded rather than changed, because "below" genuinely is
exclusive in the other phrasings the same pattern handles. Deciding it needs a judgement about
which reading dominates in Indian scheme prose.

### F7. A duplicated clause

`sopaatdapwhsn` models `isDisabled eq true` twice, from two sentences that both mention disability.
Harmless, but it inflates clause counts and makes the "what you meet" list repeat itself.

The second sample shows this is not a one-off. `wbedrj` (Widow B.Ed Scheme) asserts
`gender eq "female"` **four times**, from four bullets that each mention women. A citizen reading
"what you meet" sees the same line four times, which reads as a bug in the page rather than as
four criteria.

### F5 again — the residency fix has a vocabulary, and it is too narrow

`marriage-of-daughter-of-sc-widow`, second sample:

> *"Applicant must have **lived in** Chandigarh for at least **3 years**."*

```
age gte 3
```

F5's fix keys on residency *terms* — "resident", "native", "domicile". "Lived in" is not among
them, so the same defect survives in a phrasing the first sample did not contain. Harmless in
effect, as F5 was, and the same wrong-field assertion underneath.

### Recall, not correctness — a modellable bullet that is never reached

`post-st` contains *"income from all sources does not exceed ₹ 2,00,000/- per annum"*, which
synthesizes correctly as `annualIncome lte 200000` when passed to the parser on its own. In the
scheme it produces no clause at all: the surrounding prose is not split into bullets the way the
parser expects. Recorded because it is the opposite failure to the ones above — nothing wrong is
asserted, something right is simply never seen.

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

**The second sample did not flatten that curve.** Fourteen new schemes produced four more
findings, two of them Severity 1, and one of those (F8) reached 26 schemes — more than F1's 28
and strictly more harmful, since it excluded everyone rather than a band. Thirty schemes read
across two samples is 6% of the corpus. **Nothing here supports a claim about the other 94%**,
and the honest reading is that the defect rate has not yet been bounded.

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
- [x] ~~Decide on F4.~~ Fixed 2026-09-08.
- [ ] **Decide on F3 and the Severity 3 disappearances.** Both need a judgement about what the
      prose means rather than a parser change. F3 asks whether a limit scoped to one category
      should apply to everyone (it should not, but expressing that needs conditional rules the
      DSL does not have). The Severity 3 cases ask what to do when one bullet states several
      criteria and only some are modellable — today the remainder leaves no trace at all.
- [x] ~~Re-run `pnpm db:renormalize` after any normaliser change, then re-audit with the same
      seed and diff the output.~~ Done 2026-09-08. Seed 1 re-audited against the live corpus and
      **all four claimed fixes verified there, not only in tests**: `mrcbspbocwwb` reads
      `annualIncome lt 180000`, `sg-sw` has lost its gender filter, `gspv` reads
      `age between 18 and 50`, `ombgh` has lost `age >= 5`.
- [x] ~~Audit a second sample with a different seed.~~ Done 2026-09-08, seed 2. Found F8, F9,
      F10, a fourfold duplicate, and a recurrence of F5 under a phrasing seed 1 did not contain.
- [ ] **Fix F9 (a comma-separated list of eligible groups becomes a conjunction).** The most
      severe open finding. F2's guard is scoped to gender and to `or`/`/`; this arrives as a
      comma list and asserts three wrong filters at once. Scope it by measuring, as F2 was — an
      unscoped rule will discard sound clauses.
- [ ] **Fix F10 (an invented residence filter).** The narrower half is cheap and worth doing on
      its own: never assert `residence` from a parenthetical that is qualifying an amount.
- [ ] **Widen F5's residency vocabulary** to cover "lived in", and re-check the two exceptions
      that made the original fix delicate.
- [ ] **Deduplicate identical leaf clauses** within one scheme (F7). Cosmetic, cheap, and
      visible to every citizen who reads "what you meet".
- [ ] **A third sample.** Two samples of fifteen found ten defect classes between them and the
      second sample's worst finding was systematic across 26 schemes. The curve has not flattened,
      which is the argument for sampling again rather than declaring the corpus understood.
