# Phase 7 Interface Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a correct-but-survey-like single page into a two-route application with a five-step beginner-friendly form and a results page whose primary output is "schemes worth your time and what to check", while fixing four theme and contrast defects.

**Architecture:** Three stages, each independently shippable and independently green. Stage 0 fixes theme/contrast bugs with no layout change. Stage 1 splits the single page into `/[locale]` (form) and `/[locale]/results`, moves `ProfileProvider` into the locale layout so client navigation preserves the in-memory profile, and replaces the flat sixteen fields with five grouped steps. Stage 2 rebuilds the results page as narrow → shortlist → collapsed buckets, which needs the WILDCARD source prose to reach the client for the first time.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, next-intl v4, Vitest v5, Playwright.

**Spec:** [docs/superpowers/specs/2026-09-08-interface-revamp-design.md](../specs/2026-09-08-interface-revamp-design.md)

## Global Constraints

- **The LLM never decides eligibility.** No task here touches extraction or matching logic.
- **The typed path works with every AI provider off.** Every task must leave this true. The degradation suite (`pnpm test:e2e:degraded`) proves it.
- **No extracted field reaches the matcher without appearing in an editable box first.** The voice confirmation gate reuses `ProfileFieldControl`; do not fork it.
- **Applicant profiles are never persisted.** No localStorage, cookie, sessionStorage or URL parameter may ever carry a profile value. The theme preference is not profile data and may use localStorage.
- **UNKNOWN is a first-class verdict.** Never coerce it to FAIL. A blank field must never cause a no.
- **TypeScript strict, no `any`.**
- **TDD for `src/domain/`** — write the failing test first.
- **WCAG 2.1 AA across all five locales, desktop and mobile**, verified by `tests/e2e/accessibility.spec.ts`. 44px minimum touch targets, keyboard reachability, visible focus, reduced-motion honoured. These are gates, not preferences.
- **Verdict colour is never the only signal.**
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- **Line endings:** `src/domain/corpus/clauses.ts` and `docs/PROGRESS.md` are CRLF; everything else is LF. Do not let an editor normalise a whole file — a 1000-line diff for a 2-line change is a plan failure.
- Run `pnpm lint` and `pnpm typecheck` before every commit.

---

## Stage 0 — Bugs

No layout changes. Each task is a defect fix with a regression test.

### Task 1: The dark-mode "Not answered" chip recedes when selected

**Files:**
- Modify: `src/components/fields.tsx:186-195` (the `BooleanField` chip class expression)
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

**Background the implementer needs.** In dark mode the palette is: `--color-surface` L 0.155, `--color-surface-raised` L 0.205, `--color-surface-sunken` L 0.122. The selected-but-unset chip currently renders `bg-[var(--color-surface-sunken)]` (L 0.122), which is **darker than both the unselected chips (L 0.205) and the page ground (L 0.155)**. The "pressed/inset" metaphor reads correctly in light mode and inverts in dark, so choosing "Not answered" makes the chip recede and look unselected. The fix is to make selection read as *present* in both themes rather than as *inset*.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/theme.spec.ts`:

```typescript
test('a selected "not answered" chip is distinguishable from the unselected ones in dark mode', async ({ page }) => {
  await page.goto('/en');
  await page.evaluate(() => {
    localStorage.setItem('haqdaar-theme', 'dark');
  });
  await page.reload();

  const group = page.getByRole('group', { name: /below poverty line/i });
  const notAnswered = group.getByRole('button', { name: /not answered/i });
  const yes = group.getByRole('button', { name: /^yes$/i });

  await notAnswered.click();
  await expect(notAnswered).toHaveAttribute('aria-pressed', 'true');

  const luminance = async (locator: typeof notAnswered) =>
    locator.evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const [r, g, b] = bg.match(/\d+(\.\d+)?/g)!.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });

  const selected = await luminance(notAnswered);
  const unselected = await luminance(yes);

  // The selected chip must not be dimmer than the ones it sits beside.
  expect(selected).toBeGreaterThan(unselected);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts -g "distinguishable"`
Expected: FAIL — selected luminance is lower than unselected.

- [ ] **Step 3: Fix the chip styling**

In `src/components/fields.tsx`, replace the selected-unset branch. Change:

```
: selected
  ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] font-medium'
```

to:

```
: selected
  ? 'border-2 border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] font-semibold dark:bg-[var(--color-surface-raised)] dark:brightness-125'
```

Tailwind v4 has no `dark:` variant configured here because the theme is driven by `data-theme`, so use a token instead. Add to `src/app/globals.css` in the `@theme` block:

```css
  /* A chip that is selected but carries no answer. Must read as chosen in both
     themes. In light mode "inset" says chosen; on a dark ground the same inset
     is darker than the page and reads as absent instead, so the dark value
     lifts rather than sinks. */
  --color-surface-selected: oklch(0.938 0.018 80);
```

and in **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` and `:root[data-theme='dark']`):

```css
    --color-surface-selected: oklch(0.30 0.014 62);
```

Then the chip branch becomes:

```
: selected
  ? 'border-2 border-[var(--color-border-strong)] bg-[var(--color-surface-selected)] font-semibold'
```

- [ ] **Step 4: Run the test and the accessibility gate**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts tests/e2e/accessibility.spec.ts`
Expected: PASS. The accessibility suite must stay green — the new token carries text and has to clear AA.

- [ ] **Step 5: Commit**

```bash
git add src/components/fields.tsx src/app/globals.css tests/e2e/theme.spec.ts
git commit -m "fix: a selected 'not answered' chip receded into the page in dark mode"
```

---

### Task 2: Light is the default theme

**Files:**
- Modify: `src/components/theme-toggle.tsx` (the store's `getSnapshot`, and `themeScript`)
- Modify: `src/app/globals.css:96-125` (the `prefers-color-scheme` block)
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: `--color-surface-selected` from Task 1.
- Produces: `data-theme` is present on `<html>` for every render — Task 3 relies on it never being absent.

**Background.** Today no stored choice means "follow the device", implemented by a `prefers-color-scheme` media block. The spec reverses this: light unless the toggle says otherwise. Commit `9f2e262`'s own reasoning supports the reversal — it argued dark is markedly harder to read outdoors in sunlight, which is normal for this audience.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/theme.spec.ts`:

```typescript
test('defaults to light even when the device asks for dark', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();

  await page.goto('/en');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const [r] = bg.match(/\d+(\.\d+)?/g)!.map(Number);
  expect(r).toBeGreaterThan(200); // cream, not near-black

  await context.close();
});

test('an explicit dark choice still wins on a light device', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'light' });
  const page = await context.newPage();

  await page.goto('/en');
  await page.getByRole('button', { name: /dark/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await context.close();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts -g "defaults to light"`
Expected: FAIL — no `data-theme` attribute, body renders dark.

- [ ] **Step 3: Make light the default**

In `src/components/theme-toggle.tsx`, change the pre-paint script so it always stamps an attribute, defaulting to light:

```typescript
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');document.documentElement.dataset.theme=(t==='dark')?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;
```

Change the store's snapshot so an absent stored value reports `'light'` rather than reading `matchMedia`. Find the `getSnapshot` function and replace its body with:

```typescript
const getSnapshot = (): Choice => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};
```

Remove the `matchMedia` subscription from `subscribe` — the device preference no longer changes the answer, so listening to it would fire pointless re-renders. Keep the `storage` listener.

In `src/app/globals.css`, delete the entire `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }` block. The `:root[data-theme='dark']` block already carries an identical palette and is now the only dark path. Change `:root { color-scheme: light dark; }` to `:root { color-scheme: light; }`.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Update the module comment**

The doc comment at the top of `theme-toggle.tsx` describes three states and following the device. Rewrite it to describe two states and why:

```typescript
/**
 * Light / dark switch.
 *
 * TWO STATES, not three. Light is the default and the device preference is
 * deliberately ignored.
 *
 * The earlier design followed `prefers-color-scheme` until someone chose, on
 * the reasoning that most people never open a settings menu. That reasoning
 * cut the other way once it met a real reader: this audience reads outdoors in
 * sunlight, where dark mode is markedly harder to read, and a phone set to
 * dark globally is common. Following the device therefore handed the worst
 * default to the people most likely to be standing outside.
 *
 * An explicit choice still wins in both directions and is remembered. The
 * stored value is a display preference and nothing else — invariant 5 concerns
 * the applicant's profile, none of which is written anywhere.
 */
```

- [ ] **Step 6: Commit**

```bash
git add src/components/theme-toggle.tsx src/app/globals.css tests/e2e/theme.spec.ts
git commit -m "fix: light is the default theme, and the device no longer decides"
```

---

### Task 3: Switching language must not change the theme

**Files:**
- Modify: `src/components/theme-toggle.tsx` (add a re-assert effect)
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: `data-theme` always present, from Task 2.
- Produces: nothing later tasks depend on.

**Background.** `locale-switcher.tsx:29` calls `router.replace(pathname, { locale })`. The reported symptom is that an explicit theme is lost and the device preference takes over. Diagnose before fixing — do not assume.

**Rejected approach, and why, so nobody re-proposes it:** rendering `data-theme` server-side from a cookie would fix wipe and flash together, but `src/app/[locale]/layout.tsx:84` pairs `generateStaticParams` with `setRequestLocale` for static rendering, and calling `cookies()` opts every locale route into dynamic rendering. That gives back the 512ms production median that the `sin1` region pin earned.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/theme.spec.ts`:

```typescript
test('switching language keeps the chosen theme', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();

  await page.goto('/en');
  await page.getByRole('button', { name: /dark/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByLabel(/language/i).selectOption('hi');
  await expect(page).toHaveURL(/\/hi/);

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await context.close();
});

test('switching language keeps an explicit light choice on a dark device', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();

  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByLabel(/language/i).selectOption('ta');
  await expect(page).toHaveURL(/\/ta/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await context.close();
});
```

- [ ] **Step 2: Run it and record what actually happens**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts -g "switching language"`

Expected: FAIL. **Record which failure it is**, because it decides nothing about the fix but everything about the comment you write:

- `data-theme` missing entirely → React re-rendered `<html>` from server markup on client navigation.
- `data-theme` present but wrong → the store read a stale value.

- [ ] **Step 3: Re-assert the attribute**

In `src/components/theme-toggle.tsx`, inside the `ThemeToggle` component, after the `useSyncExternalStore` call:

```typescript
/**
 * Client navigation between locales re-renders <html> from server markup that
 * carries no data-theme, so an explicit choice was silently dropped and the
 * page fell back to whatever the device wanted. Re-asserting on every render
 * costs nothing and is the whole fix.
 *
 * A cookie read in the layout would fix this server-side, and was rejected:
 * cookies() opts the locale routes out of static rendering, which is worth
 * more than the two lines it would save.
 */
useEffect(() => {
  document.documentElement.dataset.theme = choice;
}, [choice]);
```

Import `useEffect` from React.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/theme-toggle.tsx tests/e2e/theme.spec.ts
git commit -m "fix: switching language no longer resets the theme"
```

---

### Task 4: Colours change together, not in sequence

**Files:**
- Modify: `src/components/fields.tsx` (`controlClass`, `FieldShell`)
- Modify: `src/app/globals.css` (add a shared transition rule)
- Test: `tests/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Background.** Inputs and result cards carry `transition-colors` (Tailwind: 150ms) while `body` has no transition at all, so the background snaps instantly and the controls follow — the controls appear to change first. Either everything transitions on one timing, or nothing does.

- [ ] **Step 1: Find every offender**

Run: `grep -rn "transition-colors\|transition-\[" src/components src/app`

Record the list. Every one of these participates in the stagger.

- [ ] **Step 2: Write the failing test**

Add to `tests/e2e/theme.spec.ts`:

```typescript
test('the page ground transitions on the same timing as its controls', async ({ page }) => {
  await page.goto('/en');

  const durations = await page.evaluate(() => {
    const body = getComputedStyle(document.body).transitionDuration;
    const control = document.querySelector('select, input');
    const onControl = control ? getComputedStyle(control).transitionDuration : '0s';
    return { body, onControl };
  });

  expect(durations.body).toBe(durations.onControl);
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts -g "same timing"`
Expected: FAIL — body `0s`, control `0.15s`.

- [ ] **Step 4: Give the ground the same transition**

In `src/app/globals.css`, inside `@layer base`, extend the `body` rule:

```css
  body {
    background-color: var(--color-surface);
    color: var(--color-ink);
    font-family: var(--font-sans);
    /* Matches the 150ms Tailwind gives `transition-colors` on controls. Without
       it the ground snapped while the inputs faded, so the controls appeared to
       change theme before the page did. */
    transition-property: background-color, color;
    transition-duration: 150ms;
  }
```

The existing reduced-motion block already forces `transition-duration: 0.01ms !important`, so this stays honoured with no extra work — verify that block covers `body`.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec playwright test tests/e2e/theme.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css tests/e2e/theme.spec.ts
git commit -m "fix: the page ground and its controls change theme together"
```

---

## Stage 1 — The form

### Task 5: Land unit conversion (pure domain module)

**Files:**
- Create: `src/domain/units/land.ts`
- Test: `tests/unit/units/land.test.ts`

**Interfaces:**
- Consumes: `StateCode` from `@/domain/rules/types`.
- Produces:
  - `type LandUnit = 'hectare' | 'acre' | 'square_metre' | 'square_foot' | 'bigha'`
  - `interface BighaVariant { id: string; squareFeet: number }`
  - `const LAND_UNITS: readonly LandUnit[]`
  - `function bighaVariants(state: StateCode | undefined): readonly BighaVariant[]`
  - `function toHectares(value: number, unit: LandUnit, variant?: BighaVariant): number | null`
  - `function toAcres(hectares: number): number`

  Task 6 consumes all of these.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/units/land.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { bighaVariants, toAcres, toHectares } from '@/domain/units/land';

/**
 * A land figure is not cosmetic. `landHoldingHectares` feeds ceilings like
 * "under 2 hectares" on small and marginal farmer schemes, so a conversion
 * error upward pushes a farmer over a limit and tells them they do not qualify
 * when they do -- the same harm as audit findings F1 and F8.
 */
describe('toHectares', () => {
  it('converts the exact units', () => {
    expect(toHectares(1, 'hectare')).toBeCloseTo(1, 10);
    expect(toHectares(1, 'acre')).toBeCloseTo(0.40468564, 8);
    expect(toHectares(10_000, 'square_metre')).toBeCloseTo(1, 10);
    expect(toHectares(43_560, 'square_foot')).toBeCloseTo(0.40468564, 6);
  });

  it('refuses a negative area rather than storing one', () => {
    expect(toHectares(-1, 'acre')).toBeNull();
  });

  it('returns null for bigha with no variant, rather than guessing a factor', () => {
    expect(toHectares(2, 'bigha')).toBeNull();
  });

  it('converts bigha only against an explicit variant', () => {
    const [punjab] = bighaVariants('PB');
    expect(punjab).toBeDefined();
    expect(toHectares(2, 'bigha', punjab)).toBeCloseTo(0.40468564, 5);
  });
});

describe('bighaVariants', () => {
  it('offers one variant where the state has a single documented value', () => {
    expect(bighaVariants('WB')).toHaveLength(1);
    expect(bighaVariants('WB')[0]!.squareFeet).toBe(14_400);
  });

  it('offers both variants where the state uses two systems', () => {
    const up = bighaVariants('UP');
    expect(up.map((v) => v.squareFeet).sort((a, b) => a - b)).toEqual([6806.25, 27_225]);

    const rajasthan = bighaVariants('RJ');
    expect(rajasthan.map((v) => v.squareFeet).sort((a, b) => a - b)).toEqual([17_424, 27_225]);
  });

  it('offers nothing for a state with no documented value, so bigha is not shown', () => {
    expect(bighaVariants('KL')).toEqual([]);
    expect(bighaVariants(undefined)).toEqual([]);
  });
});

describe('toAcres', () => {
  it('gives a figure a farmer can sanity-check', () => {
    expect(toAcres(0.40468564)).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --project unit tests/unit/units/land.test.ts`
Expected: FAIL — cannot resolve `@/domain/units/land`.

- [ ] **Step 3: Implement the module**

Create `src/domain/units/land.ts`:

```typescript
/**
 * Land area, converted to the hectares the profile stores.
 *
 * THE ASYMMETRY THAT GOVERNS THIS MODULE is the same one that governs clause
 * synthesis. `landHoldingHectares` feeds ceilings such as "under 2 hectares" on
 * small and marginal farmer schemes. A conversion that is too large pushes a
 * farmer over a limit and tells them they do not qualify when they do. A
 * missing conversion leaves the field blank, which is UNKNOWN, which is safe.
 *
 * So every unit here is either exact or explicitly chosen by the citizen.
 * Nothing is inferred.
 */
import type { StateCode } from '../rules/types';

export type LandUnit = 'hectare' | 'acre' | 'square_metre' | 'square_foot' | 'bigha';

export const LAND_UNITS: readonly LandUnit[] = [
  'acre',
  'bigha',
  'hectare',
  'square_metre',
  'square_foot',
];

/** International acre, exact by definition. */
const ACRE_IN_HECTARES = 0.40468564224;
/** 1 sq ft = 0.09290304 m^2, exact by definition; 10,000 m^2 = 1 hectare. */
const SQUARE_FOOT_IN_HECTARES = 0.09290304 / 10_000;

const EXACT: Record<Exclude<LandUnit, 'bigha'>, number> = {
  hectare: 1,
  acre: ACRE_IN_HECTARES,
  square_metre: 0.0001,
  square_foot: SQUARE_FOOT_IN_HECTARES,
};

/**
 * One documented local meaning of "bigha".
 *
 * `id` is a message key suffix, so the choice can be put to the citizen in
 * their own language rather than as a number they have no way to check.
 */
export interface BighaVariant {
  id: string;
  squareFeet: number;
}

/**
 * Bigha is not a unit. It is a family of local customs sharing a name, and the
 * spread is large enough to change a verdict:
 *
 *   - Uttar Pradesh varies 4x against itself, west to east.
 *   - Punjab runs six regional revenue systems.
 *   - Rajasthan's pucca and kaccha differ by 1.6x, decided by local practice.
 *
 * Wikipedia states it plainly: "There is no 'standard' size of bigha and it
 * varies considerably from place to place." So this table is a source of
 * SUGGESTIONS to put to the citizen, never a lookup to apply silently.
 *
 * Sources: https://en.wikipedia.org/wiki/Bigha
 *          https://en.wikipedia.org/wiki/Measurement_of_land_in_Punjab
 *          https://www.realtyconsultants.in/tools/area-calculator/punjab-land-measurement-chart
 *
 * A state absent from this table offers no bigha option at all.
 */
const BIGHA_BY_STATE: Partial<Record<StateCode, readonly BighaVariant[]>> = {
  AS: [{ id: 'standard', squareFeet: 14_400 }],
  BR: [{ id: 'standard', squareFeet: 27_225 }],
  HP: [{ id: 'standard', squareFeet: 8_712 }],
  PB: [{ id: 'standard', squareFeet: 21_780 }],
  HR: [{ id: 'standard', squareFeet: 21_780 }],
  MP: [{ id: 'standard', squareFeet: 12_000 }],
  RJ: [
    { id: 'pucca', squareFeet: 27_225 },
    { id: 'kaccha', squareFeet: 17_424 },
  ],
  UP: [
    { id: 'east', squareFeet: 27_225 },
    { id: 'west', squareFeet: 6_806.25 },
  ],
  UK: [
    { id: 'plains', squareFeet: 17_424 },
    { id: 'hills', squareFeet: 6_806.25 },
  ],
  WB: [{ id: 'standard', squareFeet: 14_400 }],
};

/** The documented local meanings of bigha in a state. Empty means: do not offer it. */
export function bighaVariants(state: StateCode | undefined): readonly BighaVariant[] {
  if (!state) return [];
  return BIGHA_BY_STATE[state] ?? [];
}

/**
 * Null means "we will not assert a number", which leaves the field blank and
 * the verdict UNKNOWN. That is always preferable to a plausible wrong area.
 */
export function toHectares(
  value: number,
  unit: LandUnit,
  variant?: BighaVariant,
): number | null {
  if (!Number.isFinite(value) || value < 0) return null;

  if (unit === 'bigha') {
    if (!variant) return null;
    return value * variant.squareFeet * SQUARE_FOOT_IN_HECTARES;
  }

  return value * EXACT[unit];
}

/** For echoing a converted figure back in a unit people picture more easily. */
export function toAcres(hectares: number): number {
  return hectares / ACRE_IN_HECTARES;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project unit tests/unit/units/land.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/units/land.ts tests/unit/units/land.test.ts
git commit -m "feat: land unit conversion, with bigha offered but never guessed"
```

---

### Task 6: The land field asks in the citizen's unit

**Files:**
- Modify: `src/components/fields.tsx` (add `LandField`, export it)
- Modify: `messages/en.json`, `hi.json`, `pa.json`, `bn.json`, `ta.json`
- Test: `tests/e2e/typed-journey.spec.ts`

**Interfaces:**
- Consumes: `LAND_UNITS`, `bighaVariants`, `toHectares`, `toAcres`, `BighaVariant` from Task 5.
- Produces: `LandField` component, used by Task 8's step 4.

- [ ] **Step 1: Add the message keys**

Add under `profile` in `messages/en.json`:

```json
"land": {
  "question": "How much land do you farm?",
  "why": "Some schemes are only for people farming under a certain amount of land.",
  "unit": "Measured in",
  "unit_hectare": "Hectares",
  "unit_acre": "Acres",
  "unit_square_metre": "Square metres",
  "unit_square_foot": "Square feet",
  "unit_bigha": "Bigha",
  "bighaWhich": "Bigha means different sizes in different places. Which is closest to yours?",
  "bigha_standard": "The usual size here",
  "bigha_pucca": "Pucca bigha (the larger one)",
  "bigha_kaccha": "Kaccha bigha (the smaller one)",
  "bigha_east": "Eastern part of the state (larger)",
  "bigha_west": "Western part of the state (smaller)",
  "bigha_plains": "In the plains (larger)",
  "bigha_hills": "In the hills (smaller)",
  "bighaNeedsState": "Tell us your state first and we can offer bigha.",
  "echo": "That is about {hectares} hectares, roughly {acres} acres.",
  "unsure": "Not sure? Leave it blank. We will never say no because of a blank."
}
```

Translate the same keys into `hi.json`, `pa.json`, `bn.json` and `ta.json`. Keep `{hectares}` and `{acres}` placeholders exactly as written.

- [ ] **Step 2: Write the failing test**

Add to `tests/e2e/typed-journey.spec.ts`:

```typescript
test('land can be entered in bigha once a state is chosen, and is echoed back', async ({ page }) => {
  await page.goto('/en');

  await page.getByLabel(/which state/i).selectOption('PB');

  await page.getByLabel(/measured in/i).selectOption('bigha');
  await page.getByLabel(/how much land/i).fill('2');

  await expect(page.getByText(/about 0\.4 hectares/i)).toBeVisible();
  await expect(page.getByText(/roughly 1 acre/i)).toBeVisible();
});

test('bigha is not offered before a state is known', async ({ page }) => {
  await page.goto('/en');

  const unit = page.getByLabel(/measured in/i);
  await expect(unit.locator('option[value="bigha"]')).toHaveCount(0);
  await expect(page.getByText(/tell us your state first/i)).toBeVisible();
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/typed-journey.spec.ts -g "bigha"`
Expected: FAIL — no unit selector exists.

- [ ] **Step 4: Implement `LandField`**

Add to `src/components/fields.tsx`:

```typescript
/**
 * Land, asked in the unit the citizen actually thinks in.
 *
 * A farmer who knows their holding in bigha and not in hectares would
 * otherwise leave this blank, and the blank costs them every small-farmer
 * scheme. So bigha is offered -- but bigha is a family of local customs
 * sharing a name, spread wide enough to change a verdict, so the local meaning
 * is put to them as a choice and the result is echoed back in acres for them
 * to sanity-check. If they cannot answer, the field stays blank and the
 * verdict stays UNKNOWN. Never a converted guess.
 */
export function LandField({
  value,
  state,
  highlighted,
  onChange,
}: {
  value: number | undefined;
  state: StateCode | undefined;
  highlighted?: boolean;
  onChange: (hectares: number | undefined) => void;
}) {
  const t = useTranslations('profile');
  const label = t as unknown as (key: string, values?: Record<string, string>) => string;

  const [unit, setUnit] = useState<LandUnit>('hectare');
  const [entered, setEntered] = useState('');
  const [variantId, setVariantId] = useState<string | undefined>(undefined);

  const variants = bighaVariants(state);
  const variant = variants.find((candidate) => candidate.id === variantId);
  const units = variants.length > 0 ? LAND_UNITS : LAND_UNITS.filter((u) => u !== 'bigha');

  const apply = (raw: string, nextUnit: LandUnit, nextVariant?: BighaVariant) => {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return onChange(undefined);
    onChange(toHectares(parsed, nextUnit, nextVariant) ?? undefined);
  };

  return (
    <FieldShell field="landHoldingHectares" label={label('land.question')} highlighted={highlighted}>
      <p className="mb-2 text-sm text-[var(--color-ink-muted)]">{label('land.why')}</p>

      <input
        id="input-landHoldingHectares"
        type="number"
        inputMode="decimal"
        min={0}
        className={controlClass}
        value={entered}
        onChange={(event) => {
          setEntered(event.target.value);
          apply(event.target.value, unit, variant);
        }}
      />

      <label className="mt-2 block text-sm font-medium" htmlFor="input-land-unit">
        {label('land.unit')}
      </label>
      <select
        id="input-land-unit"
        className={controlClass}
        value={unit}
        onChange={(event) => {
          const next = event.target.value as LandUnit;
          setUnit(next);
          apply(entered, next, variant);
        }}
      >
        {units.map((option) => (
          <option key={option} value={option}>
            {label(`land.unit_${option}`)}
          </option>
        ))}
      </select>

      {variants.length === 0 && (
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{label('land.bighaNeedsState')}</p>
      )}

      {unit === 'bigha' && variants.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium">{label('land.bighaWhich')}</p>
          <div role="group" aria-label={label('land.bighaWhich')} className="mt-1.5 flex flex-wrap gap-2">
            {variants.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={candidate.id === variantId}
                onClick={() => {
                  setVariantId(candidate.id);
                  apply(entered, 'bigha', candidate);
                }}
                className={
                  'min-h-12 rounded-xl border px-4 py-2 text-base ' +
                  (candidate.id === variantId
                    ? 'border-2 border-[var(--color-border-strong)] bg-[var(--color-surface-selected)] font-semibold'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]')
                }
              >
                {label(`land.bigha_${candidate.id}`)}
              </button>
            ))}
          </div>
        </>
      )}

      {value !== undefined && (
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {label('land.echo', {
            hectares: value.toFixed(2),
            acres: toAcres(value).toFixed(1),
          })}
        </p>
      )}

      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{label('land.unsure')}</p>
    </FieldShell>
  );
}
```

Add the imports at the top of the file: `useState` from `react`, and `LAND_UNITS`, `bighaVariants`, `toAcres`, `toHectares`, `type BighaVariant`, `type LandUnit` from `@/domain/units/land`, and `type StateCode` from `@/domain/rules/types`.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec playwright test tests/e2e/typed-journey.spec.ts -g "bigha"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/fields.tsx messages tests/e2e/typed-journey.spec.ts
git commit -m "feat: land can be entered in bigha, acres or square feet"
```

---

### Task 7: Two routes, one in-memory profile

**Files:**
- Modify: `src/app/[locale]/layout.tsx` (wrap children in `ProfileProvider`)
- Modify: `src/app/[locale]/page.tsx` (drop its own provider; form only)
- Create: `src/app/[locale]/results/page.tsx`
- Test: `tests/e2e/typed-journey.spec.ts`

**Interfaces:**
- Consumes: `ProfileProvider`, `useProfile` from `@/lib/profile-state`.
- Produces: the `/[locale]/results` route, and `runMatch` navigating to it. Tasks 8 and 14-15 render into these two routes.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/typed-journey.spec.ts`:

```typescript
test('submitting moves to the results route', async ({ page }) => {
  await page.goto('/en');
  await page.getByLabel(/which state/i).selectOption('PB');
  await page.getByRole('button', { name: /see what you can get/i }).click();

  await expect(page).toHaveURL(/\/en\/results/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('opening results directly returns you to the form, and says why', async ({ page }) => {
  await page.goto('/en/results');

  await expect(page).toHaveURL(/\/en(\?|$)/);
  await expect(page.getByText(/we don't keep your answers/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/typed-journey.spec.ts -g "results route"`
Expected: FAIL — `/en/results` 404s.

- [ ] **Step 3: Move the provider into the layout**

In `src/app/[locale]/layout.tsx`, import `ProfileProvider` from `@/lib/profile-state` and wrap the children:

```tsx
<NextIntlClientProvider>
  <ProfileProvider locale={locale}>{children}</ProfileProvider>
</NextIntlClientProvider>
```

In `src/app/[locale]/page.tsx`, delete the `ProfileProvider` wrapper and the `HomePage`/`Home` split it existed for — the default export becomes the page itself. Remove the `ResultsPanel` import and the two-column grid; the form now occupies the full column.

- [ ] **Step 4: Create the results route**

Create `src/app/[locale]/results/page.tsx`:

```tsx
import { setRequestLocale } from 'next-intl/server';
import { ResultsPage } from '@/components/results-page';

export default async function Results({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ResultsPage />;
}
```

Create `src/components/results-page.tsx` as a thin client component for now — Tasks 14 and 15 fill it in:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useProfile } from '@/lib/profile-state';
import { ResultsPanel } from './results-panel';

/**
 * INVARIANT 5, made visible at the one moment a citizen can see it.
 *
 * Nothing is stored, so a reloaded or shared results URL has no profile behind
 * it. Rather than rendering an empty page or inventing a result, it returns to
 * the form and says why -- which tells the citizen something true about how
 * their data is handled at exactly the moment it is credible.
 */
export function ResultsPage() {
  const t = useTranslations('results');
  const { result } = useProfile();
  const router = useRouter();

  useEffect(() => {
    if (!result) router.replace('/?expired=1');
  }, [result, router]);

  if (!result) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-6 sm:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('heading')}</h1>
      <ResultsPanel />
    </main>
  );
}
```

- [ ] **Step 5: Navigate on submit, and show the expiry notice**

In `src/lib/profile-state.tsx`, `runMatch` must not navigate — keep the domain state pure. Instead, in the form component (Task 8) call `router.push('/results')` after `runMatch()` resolves without error.

On the form page, read the `expired` search param and render the notice. Add to `messages/en.json` under `results`:

```json
"expired": "We don't keep your answers, so we can't reopen your results. It only takes a minute to fill in again."
```

Translate into the other four locales.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec playwright test tests/e2e/typed-journey.spec.ts`
Expected: PASS for the two new cases. Others may fail until Task 8 — that is expected and is fixed there.

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale] src/components/results-page.tsx src/lib/profile-state.tsx messages
git commit -m "feat: the form and the results are two routes sharing one in-memory profile"
```

---

### Task 8: Five steps

**Files:**
- Create: `src/components/form-steps.ts` (the step definition, pure data)
- Modify: `src/components/profile-form.tsx` (render one step at a time)
- Test: `tests/unit/components/form-steps.test.ts`, `tests/e2e/typed-journey.spec.ts`

**Interfaces:**
- Consumes: `LandField` (Task 6), the routes (Task 7).
- Produces: `FORM_STEPS: readonly FormStep[]` where `interface FormStep { id: string; fields: readonly ProfileField[] }`. Task 9 writes copy keyed on `id`.

- [ ] **Step 1: Write the failing test for the step definition**

Create `tests/unit/components/form-steps.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { FORM_STEPS } from '@/components/form-steps';
import { PROFILE_FIELDS } from '@/domain/rules/types';

/**
 * The steps are a presentation grouping over the profile, so the one thing
 * that must never drift is coverage: a field that exists but appears on no
 * step is a field the citizen can never answer, and it would fail silently.
 */
describe('FORM_STEPS', () => {
  it('covers every profile field exactly once', () => {
    const onSteps = FORM_STEPS.flatMap((step) => [...step.fields]);

    expect([...onSteps].sort()).toEqual([...PROFILE_FIELDS].sort());
  });

  it('has five steps', () => {
    expect(FORM_STEPS).toHaveLength(5);
  });

  it('puts the sensitive questions last', () => {
    const last = FORM_STEPS[FORM_STEPS.length - 1]!;

    expect(last.fields).toContain('category');
    expect(last.fields).toContain('isDisabled');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --project unit tests/unit/components/form-steps.test.ts`
Expected: FAIL — cannot resolve `@/components/form-steps`.

- [ ] **Step 3: Define the steps**

Create `src/components/form-steps.ts`:

```typescript
import type { ProfileField } from '@/domain/rules/types';

/**
 * Sixteen fields in a flat wall is the defect this exists to fix. The grouping
 * is not arbitrary:
 *
 *   - Easiest first, so the form starts by being answerable.
 *   - Money questions arrive after a few harmless ones, not on arrival.
 *   - The sensitive fields -- caste, disability -- come last, framed as things
 *     that OPEN schemes rather than things that gate them, with the privacy
 *     promise repeated inline. A citizen who reads them as suspicion leaves.
 */
export interface FormStep {
  id: string;
  fields: readonly ProfileField[];
}

export const FORM_STEPS: readonly FormStep[] = [
  { id: 'about', fields: ['age', 'gender', 'maritalStatus'] },
  { id: 'where', fields: ['state', 'district', 'residence'] },
  { id: 'work', fields: ['occupation', 'education'] },
  { id: 'household', fields: ['familySize', 'annualIncome', 'isBPL', 'landHoldingHectares'] },
  { id: 'more', fields: ['category', 'isMinority', 'isDisabled', 'disabilityPercentage'] },
];
```

- [ ] **Step 4: Run the unit test**

Run: `pnpm vitest run --project unit tests/unit/components/form-steps.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing e2e test for stepping**

Add to `tests/e2e/typed-journey.spec.ts`:

```typescript
test('walks five steps and remembers answers across them', async ({ page }) => {
  await page.goto('/en');

  await expect(page.getByText(/step 1 of 5/i)).toBeVisible();
  await page.getByLabel(/how old are you/i).fill('30');
  await page.getByRole('button', { name: /next/i }).click();

  await expect(page.getByText(/step 2 of 5/i)).toBeVisible();
  await expect(page).toHaveURL(/step=2/);
  await page.getByLabel(/which state/i).selectOption('PB');

  await page.getByRole('button', { name: /back/i }).click();
  await expect(page.getByLabel(/how old are you/i)).toHaveValue('30');
});

test('a blank step is allowed all the way to the end', async ({ page }) => {
  await page.goto('/en');

  for (let step = 1; step < 5; step += 1) {
    await page.getByRole('button', { name: /next/i }).click();
  }

  await expect(page.getByRole('button', { name: /see what you can get/i })).toBeEnabled();
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/typed-journey.spec.ts -g "five steps"`
Expected: FAIL — no step controls.

- [ ] **Step 7: Render one step at a time**

Rewrite `src/components/profile-form.tsx` so it:

- reads the current step from `useSearchParams().get('step')`, defaulting to `1`, clamped to `1..5`;
- renders only `FORM_STEPS[step - 1].fields`, using `ProfileFieldControl` for each, and `LandField` for `landHoldingHectares`;
- skips `disabilityPercentage` unless `profile.isDisabled === true`;
- renders the step heading and help from `t(\`step.${id}.title\`)` and `t(\`step.${id}.help\`)`;
- shows a progress bar of `step / 5` and the text "Step N of 5";
- renders **Back** (hidden on step 1) and **Next**, both navigating with `router.push(\`/?step=${n}\`)` so browser back works;
- on the last step renders the submit button, which calls `await runMatch()` and then `router.push('/results')` when `error` is null;
- keeps the existing sticky bar with its gradient fade, which is already correct.

Keep the reset button on the last step only.

- [ ] **Step 8: Run all the form tests**

Run: `pnpm exec playwright test tests/e2e/typed-journey.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/form-steps.ts src/components/profile-form.tsx tests
git commit -m "feat: the profile form is five steps instead of sixteen fields"
```

---

### Task 9: Plain-language copy, in five languages

**Files:**
- Modify: `messages/en.json`, `hi.json`, `pa.json`, `bn.json`, `ta.json`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Consumes: `FORM_STEPS` ids from Task 8.
- Produces: `step.<id>.title`, `step.<id>.help`, `field.<name>.why` keys used by Task 8's render.

- [ ] **Step 1: Check what the existing i18n test asserts**

Run: `cat tests/unit/i18n.test.ts`

It almost certainly asserts that every locale has the same key set. That test is what protects this task; read it before adding keys so you add them to all five files.

- [ ] **Step 2: Add the step copy to `en.json`**

Under `profile`:

```json
"step": {
  "about": { "title": "About you", "help": "We start with the easy ones." },
  "where": { "title": "Where you live", "help": "This decides which state's schemes you can apply for." },
  "work": { "title": "Work and study", "help": "Many schemes are for particular kinds of work, or for students." },
  "household": { "title": "Your household", "help": "Some schemes have a limit on income or land. Leave anything blank if you are not sure." },
  "more": { "title": "What else applies to you", "help": "These questions open up extra schemes made for particular groups. They are never used to rule you out, and we do not keep them." }
},
"blankIsFine": "Not sure? Leave it blank. We will never say no because of a blank.",
"next": "Next",
"back": "Back",
"stepCounter": "Step {step} of {total}"
```

Change `profile.submit` to something a first-time reader understands: `"See what you can get"`.

- [ ] **Step 3: Add a `why` line for every field**

Under `profile.field`, each field currently maps to a string. Keep those as the labels and add a sibling `why` object:

```json
"why": {
  "age": "Many schemes have an age range.",
  "gender": "Some schemes are only for women, or for transgender applicants.",
  "state": "Most schemes are run by one state.",
  "district": "A few schemes are for particular districts.",
  "residence": "Some schemes are only for villages, others only for towns.",
  "annualIncome": "Many schemes have an income limit. If you are unsure, leave it blank.",
  "category": "Some schemes are reserved for particular categories.",
  "isMinority": "Some scholarships are for minority communities.",
  "occupation": "Schemes exist for farmers, weavers, fishermen and others.",
  "education": "Scholarships depend on what you are studying.",
  "maritalStatus": "Some schemes are for widows or for unmarried women.",
  "isDisabled": "Several schemes exist specifically for disabled people.",
  "disabilityPercentage": "Some schemes need a certificate above a certain percentage.",
  "isBPL": "A BPL card opens a number of schemes.",
  "landHoldingHectares": "Some schemes are only for people farming under a certain amount of land.",
  "familySize": "A few schemes depend on how many people live with you."
}
```

- [ ] **Step 4: Translate into the other four locales**

Add every key above to `hi.json`, `pa.json`, `bn.json` and `ta.json`. Keep `{step}` and `{total}` placeholders verbatim.

- [ ] **Step 5: Run the i18n parity test**

Run: `pnpm vitest run --project unit tests/unit/i18n.test.ts`
Expected: PASS — every locale has the same keys.

- [ ] **Step 6: Commit**

```bash
git add messages tests/unit/i18n.test.ts
git commit -m "feat: plain-language help on every field, in all five languages"
```

---

### Task 10: Illustrations

**Files:**
- Create: `src/components/illustrations.tsx`
- Modify: `src/app/[locale]/page.tsx`, `src/components/profile-form.tsx`, `src/components/results-page.tsx`
- Test: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `OpenDoor`, `HandWithForm`, `Lamp`, `Signpost` — each `({ className }: { className?: string }) => JSX.Element`.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/accessibility.spec.ts`:

```typescript
test('illustrations are decorative and never the only carrier of meaning', async ({ page }) => {
  await page.goto('/en');

  const svgs = page.locator('main svg');
  const count = await svgs.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    await expect(svgs.nth(index)).toHaveAttribute('aria-hidden', 'true');
  }
});
```

- [ ] **Step 2: Run it and watch it fail or pass**

Run: `pnpm exec playwright test tests/e2e/accessibility.spec.ts -g "decorative"`
If it passes already, good — the existing icons are compliant. It must still pass after this task.

- [ ] **Step 3: Draw the illustrations**

Create `src/components/illustrations.tsx` with four inline SVGs. Constraints, all of them load-bearing:

- `aria-hidden="true"` and `focusable="false"` on every `<svg>`.
- Strokes use `currentColor` or `var(--color-brand)` / `var(--color-ink-muted)` so both themes work with no second copy.
- **No faces and no text.** No decision about whose face represents someone needing welfare, and nothing to translate.
- `viewBox` set, no fixed `width`/`height` — size with `className`.
- Keep each under roughly 2KB of markup.

Subjects: `OpenDoor` (a door ajar with light beyond it, echoing the existing mark), `HandWithForm` (a hand holding a sheet), `Lamp` (a small lamp, for the narrowing questions), `Signpost` (a two-armed signpost, for results).

- [ ] **Step 4: Place them**

`OpenDoor` in the hero on `page.tsx`; `HandWithForm` beside the step-1 heading; `Lamp` on the narrowing card (Task 14); `Signpost` beside the results heading. Each sits in a container that hides it below `sm:` so a phone spends its screen on content.

- [ ] **Step 5: Run the accessibility suite across all five locales**

Run: `pnpm exec playwright test tests/e2e/accessibility.spec.ts`
Expected: PASS, every locale, desktop and mobile.

- [ ] **Step 6: Commit**

```bash
git add src/components/illustrations.tsx src/app/[locale]/page.tsx src/components/profile-form.tsx src/components/results-page.tsx tests/e2e/accessibility.spec.ts
git commit -m "feat: drawn illustrations, no faces and no text"
```

---

## Stage 2 — The results

### Task 11: The unmodellable criteria reach the client

**Files:**
- Create: `src/domain/matching/unmodelled.ts`
- Modify: `src/domain/matching/types.ts`, `src/domain/matching/match.ts`
- Test: `tests/unit/matching/unmodelled.test.ts`

**Interfaces:**
- Consumes: `RuleNode` from `@/domain/rules/types`.
- Produces:
  - `function unmodelledCriteria(tree: RuleNode): string[]`
  - `MatchResultItem` gains `unmodelledCriteria: string[]`

  Tasks 12 and 15 consume both.

**Background.** `match.ts` selects `source_prose` but not `eligibility`, so the WILDCARD clauses' own `sourceText` never leaves the database. Without it the shortlist cannot say what to go and check, which is the whole point of the shortlist.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/matching/unmodelled.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { unmodelledCriteria } from '@/domain/matching/unmodelled';
import type { RuleNode } from '@/domain/rules/types';

/**
 * A WILDCARD is a criterion we deliberately refuse to model, carrying the
 * government's own wording (invariant 4). It is also the single most useful
 * thing we can show a citizen whose verdict is UNKNOWN: it is exactly the list
 * of things they must go and check for themselves.
 */
describe('unmodelledCriteria', () => {
  it('collects wildcard prose at every depth', () => {
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { field: 'state', op: 'in', values: ['PB'] },
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: 'Must be a registered member.' },
        {
          op: 'OR',
          clauses: [
            { op: 'WILDCARD', reason: 'ambiguous', sourceText: 'Either own the land or lease it.' },
          ],
        },
        { op: 'NOT', clause: { op: 'WILDCARD', reason: 'unmodellable', sourceText: 'Not an income tax payer.' } },
      ],
    };

    expect(unmodelledCriteria(tree)).toEqual([
      'Must be a registered member.',
      'Either own the land or lease it.',
      'Not an income tax payer.',
    ]);
  });

  it('returns nothing for a fully modelled tree', () => {
    const tree: RuleNode = { op: 'AND', clauses: [{ field: 'age', op: 'gte', value: 18 }] };

    expect(unmodelledCriteria(tree)).toEqual([]);
  });

  it('de-duplicates prose repeated across clauses', () => {
    const repeated = 'Must hold a Family Identity Card.';
    const tree: RuleNode = {
      op: 'AND',
      clauses: [
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: repeated },
        { op: 'WILDCARD', reason: 'unmodellable', sourceText: repeated },
      ],
    };

    expect(unmodelledCriteria(tree)).toEqual([repeated]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --project unit tests/unit/matching/unmodelled.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Create `src/domain/matching/unmodelled.ts`:

```typescript
import type { RuleNode } from '../rules/types';

/**
 * The criteria we deliberately refuse to model, in the government's own words.
 *
 * For a citizen whose verdict is UNKNOWN this is the most useful thing on the
 * card: not "we cannot tell", but the specific list of things to go and check.
 * It is what turns UNKNOWN from a shrug into an instruction.
 *
 * De-duplicated because one criterion is often stated twice in the prose, and a
 * checklist that repeats itself reads as a bug.
 */
export function unmodelledCriteria(tree: RuleNode): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const walk = (node: RuleNode): void => {
    if (node.op === 'AND' || node.op === 'OR') {
      node.clauses.forEach(walk);
      return;
    }
    if (node.op === 'NOT') {
      walk(node.clause);
      return;
    }
    if (node.op === 'WILDCARD') {
      if (seen.has(node.sourceText)) return;
      seen.add(node.sourceText);
      found.push(node.sourceText);
    }
  };

  walk(tree);
  return found;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run --project unit tests/unit/matching/unmodelled.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Carry it through the match query**

In `src/domain/matching/types.ts`, add to `MatchResultItem`:

```typescript
export interface MatchResultItem extends MatchedScheme {
  scheme: SchemeSummary;
  /** What a human must verify. Empty for a fully modelled scheme. */
  unmodelledCriteria: string[];
}
```

In `src/domain/matching/match.ts`:

- add `s.eligibility` to the select list;
- add `eligibility: RuleNode` to the `MatchRow` type;
- in `toItem`, set `unmodelledCriteria: unmodelledCriteria(row.eligibility)`.

**The rule tree itself must not reach the client** — only the extracted strings. Do not add `eligibility` to `SchemeSummary`.

- [ ] **Step 6: Run the integration suite**

Run: `pnpm test`
Expected: PASS. The matcher's own tests must be unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/domain/matching tests/unit/matching
git commit -m "feat: a scheme's unmodellable criteria reach the result card"
```

---

### Task 12: The shortlist partition

**Files:**
- Create: `src/domain/matching/shortlist.ts`
- Test: `tests/unit/matching/shortlist.test.ts`

**Interfaces:**
- Consumes: `MatchResult`, `MatchResultItem` from Task 11.
- Produces: `function partition(result: MatchResult): { shortlist: MatchResultItem[]; needsAnswers: MatchResultItem[]; ineligible: MatchResultItem[] }`. Task 15 renders it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/matching/shortlist.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { partition } from '@/domain/matching/shortlist';
import type { MatchResult, MatchResultItem } from '@/domain/matching/types';

const item = (over: Partial<MatchResultItem> & { schemeId: string }): MatchResultItem => ({
  verdict: 'UNKNOWN',
  matchedClauses: [],
  failedClauses: [],
  unknownFields: [],
  unmodelledCriteria: [],
  scheme: {
    id: over.schemeId,
    slug: over.schemeId,
    name: over.schemeId,
    summary: '',
    ministry: null,
    state: null,
    sourceProse: '',
    sourceUrl: '',
    needsReview: false,
  },
  ...over,
});

/**
 * Zero PASS verdicts is correct behaviour: around 60% of corpus clauses are
 * WILDCARD, and a wildcard is UNKNOWN forever, so most schemes cannot reach
 * PASS however much a citizen answers.
 *
 * So the shortlist is not "PASS". It is "everything we could check has passed,
 * and only a human can settle the rest" -- which is as close to a yes as this
 * engine can honestly get, and is the actionable output.
 */
describe('partition', () => {
  it('puts a PASS on the shortlist', () => {
    const pass = item({ schemeId: 'a', verdict: 'PASS' });
    const result: MatchResult = {
      pass: [pass], unknown: [], fail: [],
      counts: { pass: 1, unknown: 0, fail: 0, total: 1 },
    };

    expect(partition(result).shortlist).toEqual([pass]);
  });

  it('puts an UNKNOWN with nothing left to ask on the shortlist', () => {
    const onlyHumanChecks = item({
      schemeId: 'b',
      unknownFields: [],
      unmodelledCriteria: ['Must be a registered member.'],
    });
    const result: MatchResult = {
      pass: [], unknown: [onlyHumanChecks], fail: [],
      counts: { pass: 0, unknown: 1, fail: 0, total: 1 },
    };

    const { shortlist, needsAnswers } = partition(result);
    expect(shortlist).toEqual([onlyHumanChecks]);
    expect(needsAnswers).toEqual([]);
  });

  it('keeps an UNKNOWN that we could still resolve out of the shortlist', () => {
    const answerable = item({ schemeId: 'c', unknownFields: ['annualIncome'] });
    const result: MatchResult = {
      pass: [], unknown: [answerable], fail: [],
      counts: { pass: 0, unknown: 1, fail: 0, total: 1 },
    };

    const { shortlist, needsAnswers } = partition(result);
    expect(shortlist).toEqual([]);
    expect(needsAnswers).toEqual([answerable]);
  });

  it('orders PASS ahead of UNKNOWN on the shortlist', () => {
    const pass = item({ schemeId: 'p', verdict: 'PASS' });
    const unknown = item({ schemeId: 'u', unknownFields: [] });
    const result: MatchResult = {
      pass: [pass], unknown: [unknown], fail: [],
      counts: { pass: 1, unknown: 1, fail: 0, total: 2 },
    };

    expect(partition(result).shortlist.map((i) => i.schemeId)).toEqual(['p', 'u']);
  });

  it('passes FAIL through untouched', () => {
    const no = item({ schemeId: 'f', verdict: 'FAIL' });
    const result: MatchResult = {
      pass: [], unknown: [], fail: [no],
      counts: { pass: 0, unknown: 0, fail: 1, total: 1 },
    };

    expect(partition(result).ineligible).toEqual([no]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --project unit tests/unit/matching/shortlist.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Create `src/domain/matching/shortlist.ts`:

```typescript
import type { MatchResult, MatchResultItem } from './types';

/**
 * Three groups, replacing the verdict buckets on the results page.
 *
 * The reframing matters. Around 60% of corpus clauses are WILDCARD, and a
 * wildcard is UNKNOWN forever, so most schemes structurally cannot reach PASS
 * no matter what a citizen answers. A page that leads with "you qualify for N"
 * therefore leads with a number that is almost always zero, which is both
 * accurate and useless.
 *
 * The shortlist is the honest equivalent: everything we could check has passed,
 * and what is left is for a human to verify. A citizen can act on that.
 */
export interface Partitioned {
  /** Nothing left that we could decide. Lead with these. */
  shortlist: MatchResultItem[];
  /** Still resolvable by asking the citizen something. */
  needsAnswers: MatchResultItem[];
  /** Ruled out by something they told us. */
  ineligible: MatchResultItem[];
}

export function partition(result: MatchResult): Partitioned {
  const shortlist = [
    ...result.pass,
    ...result.unknown.filter((item) => item.unknownFields.length === 0),
  ];

  return {
    shortlist,
    needsAnswers: result.unknown.filter((item) => item.unknownFields.length > 0),
    ineligible: result.fail,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run --project unit tests/unit/matching/shortlist.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/matching/shortlist.ts tests/unit/matching/shortlist.test.ts
git commit -m "feat: partition results into a shortlist, answerable and ruled out"
```

---

### Task 13: The narrowing stage

**Files:**
- Create: `src/components/narrowing.tsx`
- Modify: `src/components/results-page.tsx`, `messages/*.json`
- Test: `tests/e2e/results.spec.ts`

**Interfaces:**
- Consumes: `useProfile` (`nextQuestion`, `setField`, `runMatch`), `ProfileFieldControl`, `Lamp` from Task 10.
- Produces: `<Narrowing />`, rendered by Task 15's results page above the shortlist.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/results.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test('offers up to three narrowing questions, each skippable', async ({ page }) => {
  await page.goto('/en');
  await page.getByLabel(/which state/i).selectOption('PB');
  for (let step = 1; step < 5; step += 1) {
    await page.getByRole('button', { name: /next/i }).click();
  }
  await page.getByRole('button', { name: /see what you can get/i }).click();

  await expect(page).toHaveURL(/\/results/);
  await expect(page.getByText(/before we show your results/i)).toBeVisible();
  await expect(page.getByText(/decides \d+ schemes/i)).toBeVisible();

  await page.getByRole('button', { name: /skip/i }).click();
  await page.getByRole('button', { name: /skip/i }).click();
  await page.getByRole('button', { name: /skip/i }).click();

  await expect(page.getByRole('heading', { name: /worth your time/i })).toBeVisible();
});

test('skipping straight past the narrowing is one tap', async ({ page }) => {
  await page.goto('/en');
  await page.getByLabel(/which state/i).selectOption('PB');
  for (let step = 1; step < 5; step += 1) {
    await page.getByRole('button', { name: /next/i }).click();
  }
  await page.getByRole('button', { name: /see what you can get/i }).click();

  await page.getByRole('button', { name: /show me anyway/i }).click();
  await expect(page.getByRole('heading', { name: /worth your time/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/results.spec.ts`
Expected: FAIL — no narrowing UI.

- [ ] **Step 3: Add the message keys**

Under `results` in `messages/en.json`, and translated into the other four:

```json
"narrowHeading": "Before we show your results",
"narrowUnblocks": "Answering this decides {count} schemes",
"narrowSkip": "Skip this question",
"narrowSkipAll": "Show me anyway",
"narrowProgress": "Question {asked} of {total}",
"shortlistHeading": "{count} schemes worth your time",
"shortlistEmpty": "Nothing is close enough to show yet. Answering a few more questions will change that.",
"shortlistIntro": "Everything we could check has passed. What is left is for you to confirm.",
"goCheck": "Go and check",
"youMatch": "You match",
"needsAnswers": "Needs more answers from you ({count})",
"ruledOut": "You do not qualify for these ({count})"
```

- [ ] **Step 4: Implement the component**

Create `src/components/narrowing.tsx`. It:

- holds `asked` state, starting at 0, capped at 3;
- renders `nextQuestion` via `ProfileFieldControl` so invariant 3's shared-control rule holds;
- on answer, calls `setField`, then `await runMatch()` to recompute, then increments `asked`;
- renders **Skip this question** (increments `asked` without answering) and **Show me anyway** (sets `asked` to 3);
- renders nothing once `asked >= 3` or `nextQuestion` is null, so the shortlist below becomes the page;
- shows `narrowProgress` and the `Lamp` illustration.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec playwright test tests/e2e/results.spec.ts`
Expected: the two narrowing cases PASS. The shortlist heading assertions fail until Task 14.

- [ ] **Step 6: Commit**

```bash
git add src/components/narrowing.tsx src/components/results-page.tsx messages tests/e2e/results.spec.ts
git commit -m "feat: results narrow with up to three questions before showing a list"
```

---

### Task 14: The shortlist, the buckets, and the card

**Files:**
- Modify: `src/components/results-panel.tsx` (render the partition)
- Modify: `src/components/scheme-card.tsx` (say what to go and check)
- Test: `tests/e2e/results.spec.ts`

**Interfaces:**
- Consumes: `partition` (Task 12), `unmodelledCriteria` on items (Task 11), `<Narrowing />` (Task 13), `Signpost` (Task 10).
- Produces: the finished results page.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/results.spec.ts`:

```typescript
test('a shortlist card says what to go and check', async ({ page }) => {
  await page.goto('/en');
  await page.getByLabel(/which state/i).selectOption('PB');
  for (let step = 1; step < 5; step += 1) {
    await page.getByRole('button', { name: /next/i }).click();
  }
  await page.getByRole('button', { name: /see what you can get/i }).click();
  await page.getByRole('button', { name: /show me anyway/i }).click();

  const first = page.getByRole('article').first();
  await expect(first.getByText(/go and check/i)).toBeVisible();
});

test('the other two groups are collapsed by default', async ({ page }) => {
  await page.goto('/en');
  await page.getByLabel(/which state/i).selectOption('PB');
  for (let step = 1; step < 5; step += 1) {
    await page.getByRole('button', { name: /next/i }).click();
  }
  await page.getByRole('button', { name: /see what you can get/i }).click();
  await page.getByRole('button', { name: /show me anyway/i }).click();

  const needsAnswers = page.getByRole('button', { name: /needs more answers/i });
  await expect(needsAnswers).toHaveAttribute('aria-expanded', 'false');

  const ruledOut = page.getByRole('button', { name: /do not qualify/i });
  await expect(ruledOut).toHaveAttribute('aria-expanded', 'false');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec playwright test tests/e2e/results.spec.ts -g "go and check"`
Expected: FAIL.

- [ ] **Step 3: Render the partition**

Rewrite `src/components/results-panel.tsx` to:

- call `partition(result)`;
- render `<Narrowing />` first;
- render the shortlist heading `shortlistHeading` with the count, `shortlistIntro`, then the cards. If `shortlist` is empty, render `shortlistEmpty` — **never a triumphant heading over nothing**;
- render `needsAnswers` and `ineligible` as two `<button aria-expanded>` disclosures, both closed by default, keeping the existing `MAX_FAILED_RENDERED` cap of 25 and its "showing some" line.

Keep the existing mobile scroll-into-view effect — it is still right, since the results now live on their own route but the narrowing sits above the list.

- [ ] **Step 4: Add "go and check" to the card**

In `src/components/scheme-card.tsx`, add a section after the existing `whyMatched` list:

```tsx
{item.unmodelledCriteria.length > 0 && (
  <div>
    <dt className="font-medium">{t('goCheck')}</dt>
    <dd>
      <ul className="mt-1 list-inside list-disc text-[var(--color-ink-muted)]">
        {item.unmodelledCriteria.map((criterion, index) => (
          <li key={`u${index}`}>{criterion}</li>
        ))}
      </ul>
    </dd>
  </div>
)}
```

Keep the source-prose disclosure and the myscheme link exactly as they are — invariant 4 depends on them.

- [ ] **Step 5: Run the whole e2e suite**

Run: `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/results-panel.tsx src/components/scheme-card.tsx tests/e2e/results.spec.ts
git commit -m "feat: results lead with a shortlist and what to go and check"
```

---

### Task 15: Full verification and the record

**Files:**
- Modify: `docs/PROGRESS.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Run every gate**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:degraded
```

All must pass. `test:e2e:degraded` is the one that proves invariant 2 still holds — the typed path complete with no AI keys — and it is the one most likely to have been broken by a form rewrite.

- [ ] **Step 2: Check the accessibility gate specifically**

Run: `pnpm exec playwright test tests/e2e/accessibility.spec.ts`

Confirm the report covers all five locales on both routes, desktop and mobile. If a locale was missed because the spec enumerates routes, add `/results` to its route list.

- [ ] **Step 3: Update PROGRESS.md**

Tick the Phase 7 checklist, correcting the three items that were already done before this phase (typeface, mark, brand colour) and the two fixed during it (sticky bar fade, "not answered" prominence) so the record matches the code. Add an `## Exit met` line. Update `## Current State` and `## Next Step`.

Add to the decision log:

```
| 2026-09-08 | **Zero PASS is correct, so the results page stopped leading with it.** ~60% of corpus clauses are WILDCARD and a wildcard is UNKNOWN forever, so most schemes cannot reach PASS however much a citizen answers. The page now leads with a shortlist -- everything checkable passed, only human verification remains -- which is the actionable output and is what UNKNOWN was always for. |
| 2026-09-08 | **A selected "not answered" chip receded in dark mode.** The chip used surface-sunken, which on the dark palette is darker than both the unselected chips and the page ground, so choosing it read as choosing nothing. The inset metaphor works in light mode and inverts in dark, which is the general lesson. |
| 2026-09-08 | **Bigha is offered but never silently converted.** UP varies 4x against itself, Punjab runs six regional revenue systems, Rajasthan's pucca and kaccha differ 1.6x. Since landHoldingHectares feeds "under 2 hectares" ceilings, a wrong factor is a false negative on a small-farmer scheme. The local meaning is put to the citizen and echoed back in acres. |
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: Phase 7 complete, interface revamped"
```

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: routing/state → 7; stepped form → 8, 9; land units → 5, 6; results three stages → 13, 14; the `unmodelledCriteria` data change → 11; shortlist definition → 12; illustrations → 10; bug track items 1-4 → 2, 3, 4, 1 respectively; testing → woven through, with 15 as the gate.

**Two spec claims were wrong and are corrected here.** The spec listed the sticky-bar fade and the "not answered" prominence as outstanding; both are already fixed in the code. Task 1 replaces the latter with the defect that actually remains — a dark-mode contrast inversion, which is a different bug with a different cause.

**Deliberately not covered.** Scheme-content translation (spec non-goal, deferred past the pilot) and corpus findings F3, F6, F7, F9, F10 (separate track).
