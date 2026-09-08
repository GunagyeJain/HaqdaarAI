import { expect, type Page } from '@playwright/test';

/**
 * Walking the five-step form, in one place.
 *
 * Every spec that needs a populated result has to get through the form first.
 * Keeping that here means a change to the step grouping breaks one function
 * rather than a dozen tests, and it keeps the assertions in each spec about
 * the thing that spec is actually for.
 */

/** Which step each field sits on. Mirrors FORM_STEPS in the app. */
export const STEP_OF = {
  age: 1,
  gender: 1,
  maritalStatus: 1,
  state: 2,
  district: 2,
  residence: 2,
  occupation: 3,
  education: 3,
  familySize: 4,
  annualIncome: 4,
  isBPL: 4,
  landHoldingHectares: 4,
  category: 5,
  isMinority: 5,
  isDisabled: 5,
} as const;

export type FormField = keyof typeof STEP_OF;

const TYPED_FIELDS: readonly FormField[] = [
  'age',
  'district',
  'familySize',
  'annualIncome',
  'landHoldingHectares',
];

export const NEXT = { en: 'Next', hi: 'आगे', pa: 'ਅੱਗੇ', bn: 'পরবর্তী', ta: 'அடுத்து' } as const;

export const SUBMIT = {
  en: 'Find my schemes',
  pa: 'ਮੇਰੀਆਂ ਯੋਜਨਾਵਾਂ ਲੱਭੋ',
} as const;

/** The control that ends the narrowing stage and reveals the list. */
export const SHOW_RESULTS = {
  en: 'Show me anyway',
  pa: 'ਫਿਰ ਵੀ ਨਤੀਜੇ ਦਿਖਾਓ',
} as const;

/**
 * Walks past the narrowing questions to the list.
 *
 * Submitting lands on the narrowing stage, not on the results, so any test
 * about the list itself has to get through it first.
 */
export async function showResults(page: Page, locale: 'en' | 'pa' = 'en'): Promise<void> {
  await page.getByRole('button', { name: SHOW_RESULTS[locale] }).click();
}

export type SupportedLocale = keyof typeof NEXT;

/**
 * Walks to the end of the form, filling whatever was asked for on the way, and
 * submits. Steps with nothing to fill are walked straight past, which is itself
 * the behaviour invariant 6 requires.
 */
export async function completeForm(
  page: Page,
  answers: Partial<Record<FormField, string>>,
  locale: SupportedLocale = 'en',
  options: { stopAtNarrowing?: boolean } = {},
): Promise<void> {
  await page.goto(`/${locale}`);

  for (let step = 1; step <= 5; step += 1) {
    for (const [field, value] of Object.entries(answers) as Array<[FormField, string]>) {
      if (STEP_OF[field] !== step) continue;

      const control = page.locator(`#input-${field}`);
      if (TYPED_FIELDS.includes(field)) await control.fill(value);
      else await control.selectOption(value);
    }

    if (step < 5) {
      await page.getByRole('button', { name: NEXT[locale] }).click();
      await expect(page).toHaveURL(new RegExp(`step=${step + 1}`));
    }
  }

  await page.getByRole('button', { name: SUBMIT[locale as 'en' | 'pa'] }).click();

  // Submitting lands on the narrowing stage. Most tests want the list behind
  // it, so walk past unless the test is about the narrowing itself.
  if (!options.stopAtNarrowing) await showResults(page, locale as 'en' | 'pa');
}
