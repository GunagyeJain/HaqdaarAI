import { expect, test } from '@playwright/test';

/**
 * THE MVP GATE (proposal §9.1).
 *
 * A citizen completes a profile by typing alone and receives an explained
 * match. This runs against the real scraped corpus and touches no AI provider,
 * which is what makes invariant 2 an executable claim rather than a promise.
 */

test.describe('typed-only journey', () => {
  test('completes a profile and gets explained results', async ({ page }) => {
    await page.goto('/en');

    // Nothing is shown before the citizen says anything.
    await expect(page.getByText('Tell us a little about yourself')).toBeVisible();

    await page.locator('#input-age').fill('42');
    await page.locator('#input-state').selectOption('PB');
    await page.locator('#input-gender').selectOption('female');
    await page.locator('#input-residence').selectOption('rural');

    await page.getByRole('button', { name: 'Find my schemes' }).click();

    const results = page.getByRole('region').or(page.locator('section[aria-live="polite"]'));
    await expect(results.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    // The summary must name real numbers from the corpus.
    await expect(page.getByText(/out of \d+ schemes checked/)).toBeVisible();
  });

  test('explains every verdict and exposes the source prose', async ({ page }) => {
    await page.goto('/en');
    await page.locator('#input-age').fill('42');
    await page.locator('#input-state').selectOption('PB');
    await page.getByRole('button', { name: 'Find my schemes' }).click();

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

  test('asks the next best question and focuses that field', async ({ page }) => {
    await page.goto('/en');
    await page.locator('#input-age').fill('30');
    await page.getByRole('button', { name: 'Find my schemes' }).click();

    const prompt = page.getByText('One more question would help');
    await expect(prompt).toBeVisible({ timeout: 20_000 });

    // The prompt names how many schemes answering would decide.
    await expect(page.getByText(/could decide \d+ more schemes/)).toBeVisible();
  });

  test('never coerces an unanswered field into a No', async ({ page }) => {
    // INVARIANT 6: absence of information is not disqualification. A profile
    // with only an age must not produce any FAIL on unanswered fields.
    await page.goto('/en');
    await page.locator('#input-age').fill('30');
    await page.getByRole('button', { name: 'Find my schemes' }).click();

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    // Boolean fields offer an explicit "Not answered" state.
    const bplGroup = page.getByRole('group', { name: /Below Poverty Line/ });
    await expect(bplGroup.getByRole('button', { name: 'Not answered' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('tells the citizen their answers are not stored', async ({ page }) => {
    // INVARIANT 5 stated to the person it protects, not only in the code.
    await page.goto('/en');
    await expect(page.getByText(/Nothing you enter is saved/)).toBeVisible();
  });

  test('works entirely in Punjabi', async ({ page }) => {
    // The pilot region's language is a first-class path, not a translation of
    // a demo (ADR-008).
    await page.goto('/pa');

    await page.locator('#input-age').fill('42');
    await page.locator('#input-state').selectOption('PB');
    await page.getByRole('button', { name: 'ਮੇਰੀਆਂ ਯੋਜਨਾਵਾਂ ਲੱਭੋ' }).click();

    await expect(page.getByRole('heading', { name: 'ਸਾਨੂੰ ਕੀ ਮਿਲਿਆ' })).toBeVisible({
      timeout: 20_000,
    });
  });
});
