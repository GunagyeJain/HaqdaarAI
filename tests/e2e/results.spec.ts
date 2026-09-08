import { expect, test } from '@playwright/test';
import { completeForm, showResults } from './support/form';

/**
 * THE RESULTS PAGE.
 *
 * Zero PASS verdicts is correct behaviour, not a bug: around 60% of corpus
 * clauses are WILDCARD, a wildcard is UNKNOWN forever, and so most schemes
 * structurally cannot reach PASS however much a citizen answers.
 *
 * So the page cannot lead with "you qualify for N" -- that number is almost
 * always zero, which is accurate, useless, and easily read as a rejection of
 * the person rather than a limit of the tool. These tests hold it to leading
 * with something actionable instead.
 */

test.describe('narrowing before the list', () => {
  test('offers a question, says what it decides, and is skippable in one tap', async ({ page }) => {
    await completeForm(page, { age: '30' }, 'en', { stopAtNarrowing: true });

    await expect(page.getByRole('heading', { name: 'Before we show your results' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Question 1 of 3')).toBeVisible();
    await expect(page.getByText(/decides \d+ schemes/)).toBeVisible();

    await page.getByRole('button', { name: 'Show me anyway' }).click();
    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible();
  });

  test('skipping a question offers a different one, not the same one again', async ({ page }) => {
    /**
     * Someone who does not want to state their caste should be able to move
     * past it and still be asked the next most useful thing. Without a real
     * exclusion, skipping would hand back the same question and the only way
     * on would be to abandon the narrowing.
     */
    await completeForm(page, { age: '30' }, 'en', { stopAtNarrowing: true });

    const askedField = () => page.locator('[id^="field-"]').first().getAttribute('id');

    const first = await askedField();
    expect(first).toBeTruthy();

    await page.getByRole('button', { name: 'Skip this question' }).click();

    const second = await askedField();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  test('the list stays hidden while the narrowing is on screen', async ({ page }) => {
    // Showing a list that is about to change would be showing an answer we are
    // mid-way through correcting.
    await completeForm(page, { age: '30' }, 'en', { stopAtNarrowing: true });

    await expect(page.getByRole('heading', { name: 'Before we show your results' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { name: 'What we found' })).toHaveCount(0);
  });
});

test.describe('the list', () => {
  test('leads with a shortlist rather than with a zero', async ({ page }) => {
    await completeForm(page, { age: '42', state: 'PB' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    // The first thing under the heading is what is worth their time.
    await expect(page.getByRole('heading', { name: /schemes worth your time/ })).toBeVisible();
    await expect(
      page.getByText('Everything we could check has passed. What is left is for you to confirm.'),
    ).toBeVisible();
  });

  test('a shortlist card says what to go and check', async ({ page }) => {
    // The most useful line on an UNKNOWN card: not "we cannot tell", but the
    // specific things a human has to verify, in the government's own words.
    await completeForm(page, { age: '42', state: 'PB' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    const first = page.locator('article').first();
    await expect(first.getByText('Go and check')).toBeVisible();
    await expect(first.locator('li').first()).not.toBeEmpty();
  });

  test('the long tail is collapsed but its size is stated in full', async ({ page }) => {
    await completeForm(page, { age: '42', state: 'PB' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    const ruledOut = page.getByRole('button', { name: /You do not qualify for these \(\d+\)/ });
    await expect(ruledOut).toBeVisible();
    await expect(ruledOut).toHaveAttribute('aria-expanded', 'false');

    await ruledOut.click();
    await expect(ruledOut).toHaveAttribute('aria-expanded', 'true');
  });

  test('every scheme is still accounted for', async ({ page }) => {
    // The reframing must not quietly lose schemes on its way to a friendlier
    // number. The summary still names the whole corpus.
    await completeForm(page, { age: '42', state: 'PB' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/out of \d+ schemes checked/)).toBeVisible();
  });

  test('works in Punjabi end to end', async ({ page }) => {
    await completeForm(page, { age: '42', state: 'PB' }, 'pa', { stopAtNarrowing: true });

    await expect(page.getByRole('heading', { name: 'ਤੁਹਾਡੇ ਨਤੀਜੇ ਦਿਖਾਉਣ ਤੋਂ ਪਹਿਲਾਂ' })).toBeVisible({
      timeout: 20_000,
    });

    await showResults(page, 'pa');
    await expect(page.getByRole('heading', { name: 'ਸਾਨੂੰ ਕੀ ਮਿਲਿਆ' })).toBeVisible();
  });
});
