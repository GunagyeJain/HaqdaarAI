import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * ACCESSIBILITY.
 *
 * For this project this is not polish. The people the tool exists for are more
 * likely to be on a cheap phone in bright sunlight, to have low vision, and to
 * be reading a script the interface may render badly. A civic tool that is hard
 * to use excludes exactly the citizens it was built to reach — the same harm as
 * a wrong verdict, arrived at differently.
 *
 * WCAG 2.1 AA, checked automatically. Automated checks catch perhaps a third of
 * real barriers, so the pilot's structured observation is the other half of
 * this and is not replaced by a green suite.
 */

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

const describeViolations = (violations: Array<{ id: string; nodes: unknown[]; help: string }>) =>
  violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n  ');

test.describe('WCAG 2.1 AA', () => {
  for (const locale of ['en', 'hi', 'pa', 'bn', 'ta']) {
    test(`the landing view has no violations in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}`);
      const { violations } = await scan(page).analyze();

      expect(violations.length, `\n  ${describeViolations(violations)}\n`).toBe(0);
    });
  }

  test('the results view has no violations', async ({ page }) => {
    // Result cards carry the verdict colours and the most complex markup, so
    // they are scanned in their real populated state rather than empty.
    await page.goto('/en');
    await page.locator('#input-age').fill('42');
    await page.locator('#input-state').selectOption('PB');
    await page.getByRole('button', { name: 'Find my schemes' }).click();
    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    const { violations } = await scan(page).analyze();
    expect(violations.length, `\n  ${describeViolations(violations)}\n`).toBe(0);
  });

  test('the failed-schemes section has no violations when expanded', async ({ page }) => {
    await page.goto('/en');
    await page.locator('#input-age').fill('42');
    await page.locator('#input-state').selectOption('PB');
    await page.getByRole('button', { name: 'Find my schemes' }).click();
    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: /Show \d+ schemes/ }).click();
    const { violations } = await scan(page).analyze();
    expect(violations.length, `\n  ${describeViolations(violations)}\n`).toBe(0);
  });
});

test.describe('usable without a mouse', () => {
  test('every control is reachable by keyboard', async ({ page }) => {
    await page.goto('/en');

    // Tab through the form and confirm focus actually lands on the controls
    // rather than being trapped or skipped.
    const reached = new Set<string>();
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement?.id ?? '');
      if (id) reached.add(id);
    }

    expect(reached).toContain('input-age');
    expect(reached).toContain('input-state');
    expect(reached).toContain('locale-switcher');
  });

  test('the submit button can be operated from the keyboard', async ({ page }) => {
    await page.goto('/en');
    await page.locator('#input-age').fill('30');
    await page.getByRole('button', { name: 'Find my schemes' }).focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('touch targets', () => {
  test('interactive controls meet the 44px minimum', async ({ page }) => {
    // A citizen filling this in one-handed on a mid-range Android phone is the
    // assumed case, not the edge case.
    await page.goto('/en');

    // Measured in a single pass. Re-querying per element races against
    // conditionally rendered fields and measures a DOM that has moved on.
    const undersized = await page.$$eval(
      'button:not([hidden]), select:not([hidden]), input:not([hidden])',
      (elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0;
            const label =
              element.id ||
              element.textContent?.trim().slice(0, 30) ||
              element.getAttribute('aria-label') ||
              'unnamed';
            return { visible, height: rect.height, label };
          })
          .filter((control) => control.visible && control.height < 44)
          .map((control) => `${control.label} (${control.height.toFixed(0)}px)`),
    );

    expect(undersized, `controls under 44px: ${undersized.join(', ')}`).toEqual([]);
  });
});

test.describe('verdict colour is never the only signal', () => {
  test('each result card states its verdict in words', async ({ page }) => {
    // Colour-blind users, and anyone in sunlight, must get the same answer.
    await page.goto('/en');
    await page.locator('#input-age').fill('42');
    await page.locator('#input-state').selectOption('PB');
    await page.getByRole('button', { name: 'Find my schemes' }).click();
    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });

    const card = page.locator('article').first();
    await expect(card).toContainText(/You qualify|You may qualify|Not eligible/);
  });
});
