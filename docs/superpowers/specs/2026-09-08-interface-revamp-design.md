# Phase 7 — Interface revamp

**Status:** approved design, not yet implemented.
**Date:** 2026-09-08.

The application is correct and honest, and it reads like a survey. This phase makes it
readable by the person it was built for: someone who may not read confidently, on a
mid-range Android, unsure whether they are allowed to be asking at all.

Phase 7 comes before the pilot deliberately. Testers judge what they see, and the current
interface would collect feedback about the form rather than about the matching.

---

## What is actually wrong

Seven defects were recorded from a production screenshot. **Three are already fixed** and
the checklist in PROGRESS.md is stale on them: the typeface is set (Figtree with a
per-locale Noto face for all four Indic scripts), the mark exists (an open doorway), and
the palette is terracotta on cream rather than default blue.

The four that remain are the ones the developer independently reported, which is a useful
corroboration:

1. **The results column is empty until submit**, so desktop opens on half a screen of
   nothing and the page reads as unfinished.
2. **Sixteen fields in a flat wall**, with no grouping and no sense of progress.
3. **The sticky action bar slices through fields** mid-scroll, with no fade.
4. **"Not answered" pills are solid brand fill**, making the absence of an answer the
   loudest thing on the page — and in dark mode they read as nothing selected at all.

Plus four defects found in use:

5. Switching language resets the theme to dark.
6. Colours change in the wrong order when the theme is switched.
7. Result cards stay in English whatever the locale.
8. The results themselves are unreadable: 0 qualifications, hundreds of maybes, no way in.

---

## The finding that shapes the results design

**Zero PASS verdicts is correct behaviour, not a bug.** Roughly 60% of clauses in the
corpus are `WILDCARD` — membership of a welfare board, attendance percentages, possession
of a driving licence — criteria we deliberately refuse to model rather than guess at. A
wildcard is UNKNOWN forever, so most schemes *structurally cannot reach PASS no matter what
the citizen answers.*

So a results page leading with "you qualify for N" promises something the engine cannot
deliver. The honest product is different: **here are the schemes worth your time, and here
is exactly what to go and check.** UNKNOWN stops being a limbo bucket and becomes the
output.

---

## Non-goals

- **Translating scheme names, summaries and eligibility prose.** These are English-only in
  the corpus because the scraper reads `data.en` from the myscheme payload. `localize()`
  already falls back correctly; there is simply nothing to fall back to. The payload looks
  language-keyed, so translations may be fetchable, but confirming that needs a probe and
  scraper work. **Deferred to after the pilot**, where testers can say whether it blocks
  them. Defect 7 is therefore knowingly carried, not fixed.
- Any change to the matching engine, the rule DSL, or `match_schemes()`.
- The open corpus findings F3, F6, F7, F9, F10. Separate track.

---

## 1. Routing and state

Two real routes replace the single page:

| Route | Contains |
|---|---|
| `/[locale]` | The stepped form |
| `/[locale]/results` | Narrowing questions, shortlist, remaining buckets |

`ProfileProvider` moves from `page.tsx` into `app/[locale]/layout.tsx`, so a client-side
navigation between the two routes preserves the profile in memory. It stays React state
only — invariant 5 is unchanged, nothing is written anywhere.

**Refreshing `/results` directly finds no profile.** It redirects to the form carrying a
plain explanation: *"We don't keep your answers, so we can't reopen your results."* That
turns invariant 5 from an implementation detail into something the citizen is told, at the
one moment it is visible to them.

The current form step lives in the URL as `?step=3`, so the phone's back button moves
between steps rather than leaving the site. **No profile data ever enters the URL** — only
the step index.

## 2. The stepped form

Five steps, one screenful each, replacing the flat sixteen.

| Step | Fields | Framing |
|---|---|---|
| 1. About you | age, gender, maritalStatus | Easiest first; builds momentum |
| 2. Where you live | state, district, residence | "This decides which state's schemes you can get" |
| 3. Work and study | occupation, education | |
| 4. Your household | familySize, annualIncome, isBPL, landHoldingHectares | Money together, after some trust exists |
| 5. What else applies to you | category, isMinority, isDisabled, disabilityPercentage | Framed as *unlocking* schemes, never as gatekeeping |

`disabilityPercentage` is revealed only once `isDisabled` is answered yes, so nobody is
asked to quantify a disability they have not said they have. It is the one conditional
field on the form; every other field is always shown.

Step 5 carries the sensitive questions — caste, disability — and repeats the privacy
promise inline rather than only in the header. The framing is deliberate: these fields open
schemes that exist specifically for those groups, and a citizen who reads them as suspicion
will abandon the form.

Every field gets:

- a plain-language label (not "Land you farm (hectares)" but "How much land do you farm?"),
- one line of *why we ask*,
- an explicit permission to skip: **"Not sure? Leave it blank — we'll never say no because
  of a blank."** This is literally true, and it is the single most important sentence on the
  form. A blank produces UNKNOWN and can never produce FAIL.

A progress bar and "Step 2 of 5" throughout. The sticky action bar gains a gradient fade so
it stops guillotining the field beneath it.

The voice console stays above the steps as an optional accelerant. Invariant 2 holds: the
typed path is complete with every provider off. Invariant 3 holds: voice output still lands
in the same editable inputs for confirmation.

**Field count and validation are unchanged.** This is a presentation change; the profile
shape, the Zod schema and the matcher are untouched.

## 3. Land units

New pure module `src/domain/units/land.ts`, `toHectares(value, unit)`, table-driven tests,
converting before the value reaches the profile. This is domain logic and belongs beside the
other pure modules, not in a component.

Straightforward units convert silently, because they are exact:

| Unit | Hectares |
|---|---|
| hectare | 1 |
| acre | 0.40468564 |
| square metre | 0.0001 |
| square foot | 0.000009290304 |

### Bigha does not, and the research is the reason

The developer asked for a per-state bigha table. **The research does not support one**, and
building it anyway would manufacture exactly the class of defect this project keeps finding
in its own corpus.

Wikipedia is explicit: *"There is no 'standard' size of bigha and it varies considerably
from place to place"* — including within a single state. The evidence:

- **Uttar Pradesh varies 4x against itself.** Western UP: 6,806 sq ft. Eastern UP:
  27,225 sq ft. One "UP" row is wrong for half the state.
- **Punjab has six regional revenue systems** (Mohali, Patiala, Doaba, Majha, Kapurthala,
  Ludhiana), each with its own measures. Two independent searches disagreed 3x on Punjab for
  precisely this reason.
- **Rajasthan's pucca and kaccha bigha differ 1.6x**, and which applies is local practice,
  not state law.

This is not academic. `landHoldingHectares` feeds ceilings such as "land holding under 2
hectares" on small and marginal farmer schemes. A 4x error upward puts a farmer over the
ceiling and **tells them they do not qualify when they do** — the same failure as audit
findings F1 and F8: a plausible number that was never the right number.

**So bigha is offered but never silently converted.**

1. Choosing bigha uses the state already in the profile to show that state's documented
   figure.
2. Where a state has more than one system, the choice is put in plain terms rather than
   picked for them — *"In your area, is 1 bigha closer to a quarter of an acre, or a whole
   acre?"*
3. The result is echoed back checkably: *"2 bigha is about 0.4 hectares, about half an
   acre."*
4. If they cannot say, the field stays blank and the verdict stays UNKNOWN. **Never a
   converted guess.**

Documented defaults, each commented in source with where it came from:

| State | 1 bigha (sq ft) | Hectares |
|---|---|---|
| Assam | 14,400 | 0.13378 |
| Bihar | 27,225 | 0.25293 |
| Himachal Pradesh | 8,712 | 0.08094 |
| Punjab, Haryana | 21,780 | 0.20234 |
| Madhya Pradesh | 12,000 | 0.11148 |
| Rajasthan (pucca) | 27,225 | 0.25293 |
| Rajasthan (kaccha) | 17,424 | 0.16187 |
| Uttar Pradesh (east) | 27,225 | 0.25293 |
| Uttar Pradesh (west) | 6,806.25 | 0.06323 |
| Uttarakhand (plains) | 17,424 | 0.16187 |
| Uttarakhand (hills) | 6,806.25 | 0.06323 |
| West Bengal | 14,400 | 0.13378 |

Sources: [Wikipedia, Bigha](https://en.wikipedia.org/wiki/Bigha);
[Wikipedia, Measurement of land in Punjab](https://en.wikipedia.org/wiki/Measurement_of_land_in_Punjab);
[Punjab Land Measurement Chart](https://www.realtyconsultants.in/tools/area-calculator/punjab-land-measurement-chart).

A state absent from this table offers no bigha option at all — it offers acre and hectare,
and says why.

## 4. The results page

Three stages in order down the page.

### Stage 1 — Narrow

Up to three questions from the existing information-gain engine
(`src/domain/questions/select.ts`), each stating what it unlocks — *"answering this decides
84 schemes"* — and each skippable. This is the developer's own observation that a few more
good questions shrink the list before anyone has to read it.

Skipping all three is a supported path straight to the shortlist.

### Stage 2 — The shortlist

*"N schemes worth your time."* Defined precisely:

- every PASS, then
- every UNKNOWN where `unknownFields` is **empty** — meaning there is nothing further we
  could ask, and only human-verifiable criteria remain. These are as close to a yes as this
  engine can honestly get.

Each card states what the citizen matched, and — the part that makes this work — **what to
go and check**, drawn from the wildcard clauses' own prose.

### Stage 3 — The rest, collapsed

- "Needs more answers from you": UNKNOWN with a non-empty `unknownFields`, sorted
  closest-to-decided first as today.
- "You don't qualify": FAIL, still capped at 25 rendered with the full count stated.

Both closed by default.

### The one data change this needs

To print *"go check: enrolled at a recognised institution"*, the card needs the `WILDCARD`
clauses' `sourceText`, which today never leaves the database — `match.ts` selects
`source_prose` but not `eligibility`.

**Fix:** add `s.eligibility` to the existing select and extract the wildcard texts
server-side in `toItem()`, sending only the resulting strings to the client.
`MatchResultItem` gains `unmodelledCriteria: string[]`.

No migration. No change to `match_schemes()`. The rule tree never ships to the browser.

## 5. Illustrations

Four inline SVG scenes in the existing terracotta palette, theme-aware, roughly 2KB each, no
network request, **no faces** — so there is no decision about whose face represents someone
who needs a welfare scheme, and no script or cultural marker that breaks in one of five
locales.

An open door with light behind it (hero); a hand holding a paper (form start); a lamp (the
narrowing questions); a signpost (results). Every one is `aria-hidden`; none carries meaning
that is not also in text.

## 6. The bug track — implemented first, and separately

These are defects independent of the redesign. Fixing them first means the redesign is built
on a working theme rather than around a broken one.

1. **Light is the default.** Drop the `prefers-color-scheme` default entirely; light unless
   the toggle says otherwise. This reverses the three-state decision recorded in `9f2e262` —
   and that commit's own reasoning supports the reversal: it argued dark is markedly harder
   to read outdoors in sunlight, which is a normal condition for this audience.
2. **The locale switch wipes the theme.** `locale-switcher.tsx` calls
   `router.replace(pathname, { locale })`. The symptom is that the explicit choice is lost
   and the device preference takes over, which is why a dark-set phone lands in dark mode.

   **Diagnose before fixing.** The cause is either React re-rendering `<html>` from server
   markup that carries no `data-theme`, or a hard navigation where the pre-paint script
   runs but the stored value is not read as expected. These need different fixes and the
   difference is observable, so it gets established rather than assumed.

   **The cookie approach is rejected on a constraint that is easy to miss.** Rendering
   `data-theme` server-side from a cookie would fix wipe and flash together — but
   `layout.tsx` pairs `generateStaticParams` with `setRequestLocale` for static rendering,
   and reading `cookies()` opts every locale route into dynamic rendering. That would give
   back the 512ms production median that a region migration was needed to earn.

   **Preferred fix:** keep `localStorage` and the pre-paint script, and have the theme
   component re-assert `data-theme` on mount and on navigation, so a re-render that drops
   the attribute cannot leave the page in the wrong theme. Static rendering is preserved.
   Once the default is light (item 1), a dropped attribute also degrades to light rather
   than to the device preference, which makes the failure quiet instead of jarring.
3. **Staggered colour transition.** Audit `transition-colors` usage across components so
   surfaces and controls share one timing, or none. Reduced-motion continues to disable it.
4. **"Not answered" chips.** Redesign from solid brand fill to a quiet outline chip, legible
   in dark mode. This also fixes the recorded hierarchy inversion, where the absence of an
   answer was the most prominent thing on the page.

## 7. Testing

Unit, new:

- `toHectares` across every unit and every documented bigha variant, including that an
  unknown state offers no bigha factor.
- The shortlist partition: a pure function over `MatchResult`, asserted against fixtures
  covering PASS, UNKNOWN-with-gaps, UNKNOWN-without-gaps and FAIL.
- Wildcard text extraction from a rule tree.

E2E, rewritten — **this is a substantial share of the work and is stated plainly rather than
discovered later.** The existing 74 specs assume one page and a flat form:

- `typed-journey` walks five steps and a route change, still in Punjabi, still with no AI
  provider configured.
- `accessibility` must stay green across all five locales, desktop and mobile, on both new
  routes. WCAG 2.1 AA, 44px targets, keyboard reachability, visible focus and reduced motion
  are gates, not preferences.
- `theme` updates for the light default and the cookie, and gains a case for the bug that
  started it: switching locale must not change the theme.
- New: a results spec covering narrowing, skipping all three questions, and the shortlist
  partition.
- New: refreshing `/results` redirects to the form with the explanation.

Unchanged: every integration test, the eval suite, and the matcher.

## 8. Staging

Three stages, each independently shippable and independently green:

- **Stage 0 — bugs.** Items 1-4 of the bug track. No layout change.
- **Stage 1 — the form.** Routing, state move, five steps, land units, illustrations.
- **Stage 2 — the results.** Narrowing, shortlist, buckets, the `unmodelledCriteria` change.

## 9. Risks

- **The e2e rewrite is the largest single cost** and touches the accessibility gate, which
  is the one gate protecting the audience this project exists for. If it slips, it must slip
  visibly rather than be relaxed.
- **The shortlist could still be empty** for a sparse profile. Copy must handle that
  honestly — "answer a few more questions and we'll have something for you" — rather than
  rendering a blank triumphant heading.
- **Defect 7 is knowingly unfixed.** Non-English testers will meet English scheme names in
  the pilot. That is the deferral working as intended, but it should be watched for
  specifically rather than rediscovered as a surprise.
