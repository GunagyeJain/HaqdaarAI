import { expect, test } from '@playwright/test';
import { completeForm } from './support/form';

/**
 * THE MVP GATE (proposal §9.1).
 *
 * A citizen completes a profile by typing alone and receives an explained
 * match. This runs against the real scraped corpus and touches no AI provider,
 * which is what makes invariant 2 an executable claim rather than a promise.
 *
 * The form is five steps now, so most of these have to walk it. The helper
 * below exists so that a change to the grouping breaks one function rather
 * than nine tests.
 */

test.describe('typed-only journey', () => {
  test('completes a profile and gets explained results', async ({ page }) => {
    await completeForm(page, { age: '42', state: 'PB', gender: 'female', residence: 'rural' });

    await expect(page).toHaveURL(/\/en\/results/);
    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    // The summary must name real numbers from the corpus.
    await expect(page.getByText(/out of \d+ schemes checked/)).toBeVisible();
  });

  test('walks five steps and remembers answers across them', async ({ page }) => {
    await page.goto('/en');

    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await page.locator('#input-age').fill('30');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await expect(page).toHaveURL(/step=2/);

    await page.locator('#input-state').selectOption('PB');

    // The phone's back button is the same control as Back, which is the point
    // of keeping the step in the URL.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(page.locator('#input-age')).toHaveValue('30');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('#input-state')).toHaveValue('PB');
  });

  test('every step can be left blank, all the way to the end', async ({ page }) => {
    // INVARIANT 6, walked: a blank is never a barrier, and the citizen is told
    // so on every step.
    await page.goto('/en');

    for (let step = 1; step < 5; step += 1) {
      // Matched on the second sentence, which is unique -- "leave it blank"
      // alone also appears in the income field's explanation.
      await expect(page.getByText(/never say no because of a blank/i)).toBeVisible();

      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page).toHaveURL(new RegExp(`step=${step + 1}`));
    }

    await expect(page.getByRole('button', { name: 'Find my schemes' })).toBeEnabled();
  });

  test('says why every question is being asked', async ({ page }) => {
    await page.goto('/en');

    // Not "Age" alone, which says what to type and not why anyone wants it.
    await expect(page.getByText('Many schemes have an age range.')).toBeVisible();
  });

  test('explains every verdict and exposes the source prose', async ({ page }) => {
    await completeForm(page, { age: '42', state: 'PB' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    const card = page.locator('article').first();
    await expect(card).toBeVisible();

    // INVARIANT 4: the government's own wording is always reachable.
    await card.getByRole('button', { name: "The government's own wording" }).click();
    await expect(card.locator('blockquote')).toBeVisible();

    // And the scheme is linkable back to its source.
    await expect(card.getByRole('link', { name: 'View on myScheme' })).toHaveAttribute(
      'href',
      /myscheme\.gov\.in/,
    );
  });

  test('asks the next best question', async ({ page }) => {
    await completeForm(page, { age: '30' });

    const prompt = page.getByText('One more question would help');
    await expect(prompt).toBeVisible({ timeout: 20_000 });

    // The prompt names how many schemes answering would decide.
    await expect(page.getByText(/could decide \d+ more schemes/)).toBeVisible();
  });

  test('never coerces an unanswered field into a No', async ({ page }) => {
    // INVARIANT 6: absence of information is not disqualification. A profile
    // with only an age must leave the unanswered fields UNKNOWN, never FAIL.
    await page.goto('/en?step=4');

    // Boolean fields offer an explicit "Not answered", and it is the default.
    const bplGroup = page.getByRole('group', { name: /Below Poverty Line/ });
    await expect(bplGroup.getByRole('button', { name: 'Not answered' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await completeForm(page, { age: '30' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    // And the answer that comes back says "may qualify" rather than "no".
    await expect(page.getByText(/\d+ you may qualify for/)).toBeVisible();
  });

  test('tells the citizen their answers are not stored', async ({ page }) => {
    // INVARIANT 5 stated to the person it protects, not only in the code.
    await page.goto('/en');
    await expect(page.getByText(/Nothing you enter is saved/)).toBeVisible();
  });

  test('works entirely in Punjabi', async ({ page }) => {
    // The pilot region's language is a first-class path, not a translation of
    // a demo (ADR-008).
    await completeForm(page, { age: '42', state: 'PB' }, 'pa');

    await expect(page.getByRole('heading', { name: 'ਸਾਨੂੰ ਕੀ ਮਿਲਿਆ' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('submitting moves to the results route', async ({ page }) => {
    await completeForm(page, { state: 'PB' });

    await expect(page).toHaveURL(/\/en\/results/);
    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('opening the results directly returns you to the form, and says why', async ({ page }) => {
    /**
     * INVARIANT 5, at the one moment a citizen can see it. Nothing is stored,
     * so a reloaded or shared results URL has no profile behind it. Returning
     * to the form and saying so tells them something true about how their data
     * is handled, exactly when it is credible.
     */
    await page.goto('/en/results');

    await expect(page).toHaveURL(/\/en(\?|$)/);
    await expect(page.getByText(/we don.t keep your answers/i)).toBeVisible();
  });
  test('land can be given in bigha, and is echoed back in acres to check', async ({ page }) => {
    /**
     * A farmer who knows their holding in bigha and not in hectares would
     * otherwise leave this blank, and the blank costs them every small-farmer
     * scheme. But bigha is a family of local customs sharing a name, so the
     * local meaning is CHOSEN, never inferred, and the result is shown back in
     * a unit they can check.
     */
    await page.goto('/en?step=2');
    await page.locator('#input-state').selectOption('PB');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/step=3/);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/step=4/);

    await page.locator('#input-land-unit').selectOption('bigha');
    await page.getByRole('button', { name: 'The usual size here' }).click();
    await page.locator('#input-landHoldingHectares').fill('2');

    // Punjab's bigha is half an acre, so two of them is one acre.
    await expect(page.getByText(/about 0\.40 hectares/i)).toBeVisible();
    await expect(page.getByText(/roughly 1\.0 acres/i)).toBeVisible();
  });

  test('bigha is not offered until the state is known', async ({ page }) => {
    // Offering it without a state would mean choosing a factor on the citizen's
    // behalf, and the factors differ fourfold.
    await page.goto('/en?step=4');

    await expect(page.locator('#input-land-unit option[value="bigha"]')).toHaveCount(0);
    await expect(page.getByText(/tell us your state first/i)).toBeVisible();
  });

});
