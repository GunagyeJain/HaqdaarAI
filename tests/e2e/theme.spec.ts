import { expect, test } from '@playwright/test';

/**
 * THE THEME SWITCH.
 *
 * The interesting assertions are not "clicking it changes the colour". They are
 * the two things that quietly rot: the choice surviving a reload, and an
 * explicit choice beating the device preference in *both* directions.
 *
 * The second matters more than it looks. Choosing light on a phone that is
 * globally dark is the case a naive toggle gets wrong, and for this audience it
 * is not hypothetical — reading outdoors in sunlight is normal, and dark mode is
 * markedly harder to read in it.
 */

const themeOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    /**
     * Perceived lightness, 0-100.
     *
     * Not an exact colour string: Chrome serialises oklch() as lab() in
     * computed styles, so asserting the literal token value passes today and
     * breaks on a browser update for no real reason. What the test actually
     * cares about is that dark is dark.
     */
    const background = getComputedStyle(document.body).backgroundColor;
    const lab = /^lab\(([\d.]+)/.exec(background);
    const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(background);

    const lightness = lab
      ? Number(lab[1])
      : rgb
        ? (Number(rgb[1]) * 0.299 + Number(rgb[2]) * 0.587 + Number(rgb[3]) * 0.114) / 2.55
        : Number.NaN;

    return { attr: document.documentElement.dataset.theme ?? null, lightness };
  });

test.describe('theme switch', () => {
  test('follows the device when nothing has been chosen', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/en');

    // No stored choice, so no attribute is set at all — the media query alone
    // decides, which is what keeps the default honest.
    const { attr, lightness } = await themeOf(page);
    expect(attr).toBeNull();
    expect(lightness).toBeLessThan(30);

    await context.close();
  });

  test('an explicit choice survives a reload', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    expect((await themeOf(page)).attr).toBe('dark');

    await page.reload();

    // Set before first paint by the inlined script, not after hydration.
    expect((await themeOf(page)).attr).toBe('dark');
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  });

  test('choosing light beats a device set to dark', async ({ browser }) => {
    // The case a naive toggle gets wrong.
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/en');

    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    const { attr, lightness } = await themeOf(page);

    expect(attr).toBe('light');
    expect(lightness).toBeGreaterThan(80);

    await page.reload();
    expect((await themeOf(page)).attr).toBe('light');

    await context.close();
  });

  test('the control is labelled in the reader’s language', async ({ page }) => {
    // An icon-only control is unusable without an accessible name, and a name
    // in English is unusable to the people this is built for.
    await page.goto('/hi');
    await expect(page.getByRole('button', { name: 'डार्क मोड पर जाएँ' })).toBeVisible();
  });

  test('does not paint the wrong theme before correcting itself', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();

    // Re-open and read the attribute at the earliest possible moment. If the
    // theme were applied in an effect rather than before paint, this would be
    // null here and the reader would see a white flash.
    await page.goto('/en', { waitUntil: 'commit' });
    const early = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
    expect(early).toBe('dark');
  });
});
