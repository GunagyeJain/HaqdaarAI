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
  test('defaults to light even on a device set to dark', async ({ browser }) => {
    /**
     * The default deliberately ignores the device.
     *
     * Following prefers-color-scheme was the earlier design, on the reasoning
     * that most people never open a settings menu. That reasoning cut the other
     * way once it met this audience: reading outdoors in sunlight is normal
     * here, dark mode is markedly harder to read in it, and a phone set to dark
     * globally is common. Following the device handed the worst default to the
     * people most likely to be standing outside.
     */
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/en');

    const { attr, lightness } = await themeOf(page);
    expect(attr).toBe('light');
    expect(lightness).toBeGreaterThan(80);

    await context.close();
  });

  test('an explicit dark choice still wins on a device set to light', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto('/en');

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    const { attr, lightness } = await themeOf(page);

    expect(attr).toBe('dark');
    expect(lightness).toBeLessThan(30);

    await page.reload();
    expect((await themeOf(page)).attr).toBe('dark');

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

  test('choosing light back again sticks, on a device set to dark', async ({ browser }) => {
    /**
     * Light is now the default, so arriving in light on a dark device proves
     * nothing on its own. What still has to hold is that light chosen
     * DELIBERATELY is stored as a choice rather than treated as an absence --
     * otherwise the distinction survives only until something else reads it.
     */
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/en');

    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    expect((await themeOf(page)).attr).toBe('dark');

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
  test('a chosen "not answered" does not recede into the page in dark mode', async ({ page }) => {
    /**
     * "Not answered" is the default for every field, so it is the state a
     * citizen sees most often, and it has to look chosen when it is chosen.
     *
     * In dark mode it did not. The chip filled with surface-sunken, which on the
     * dark palette is darker than the chips beside it AND darker than the page
     * ground -- measured at lab L 1.63 against a 3.35 ground and 7.76
     * neighbours. It read as a hole rather than as a selection. The inset
     * metaphor says "pressed" on a light ground and inverts on a dark one, which
     * is the general lesson and the reason this is measured rather than eyeballed.
     *
     * Motion is disabled and all three colours are read in ONE evaluate. Both
     * matter: the chips carry a 150ms colour transition, so reading them one
     * after another during it returns values from different moments and the
     * later read is spuriously darker. That race made an earlier version of this
     * test pass against the broken code.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();

    const group = page.getByRole('group', {
      name: 'Do you hold a Below Poverty Line (BPL) card?',
    });
    await expect(group.getByRole('button', { name: 'Not answered' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const lightness = await page.evaluate(() => {
      const read = (element: Element) => {
        const background = getComputedStyle(element).backgroundColor;
        const lab = /^lab\(([\d.]+)/.exec(background);
        const oklab = /^oklab\(([\d.]+)/.exec(background);
        const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(background);

        if (lab) return Number(lab[1]);
        if (oklab) return Number(oklab[1]) * 100;
        if (rgb) {
          return (Number(rgb[1]) * 0.299 + Number(rgb[2]) * 0.587 + Number(rgb[3]) * 0.114) / 2.55;
        }
        return Number.NaN;
      };

      const container = document.querySelector('[role="group"][aria-label*="Below Poverty"]')!;
      const buttons = Array.from(container.querySelectorAll('button'));
      const chosen = buttons.find((button) => button.getAttribute('aria-pressed') === 'true')!;
      const other = buttons.find((button) => button.getAttribute('aria-pressed') === 'false')!;

      return { chosen: read(chosen), other: read(other), ground: read(document.body) };
    });

    // A selection must sit above the page, not below it.
    expect(lightness.chosen).toBeGreaterThan(lightness.ground);
    expect(lightness.chosen).toBeGreaterThan(lightness.other);
  });
});
