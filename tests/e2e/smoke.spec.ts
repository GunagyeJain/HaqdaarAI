import { expect, test } from '@playwright/test';

/**
 * Phase 0 smoke coverage: the app boots, every locale renders in its own script,
 * and language switching works. Phase 3 replaces this with real user journeys.
 */

const localeExpectations = [
  { locale: 'en', script: /Know what you are entitled to/ },
  { locale: 'hi', script: /हक़दार/ },
  { locale: 'pa', script: /ਹੱਕਦਾਰ/ },
  { locale: 'bn', script: /অধিকারী/ },
  { locale: 'ta', script: /உரிமை/ },
];

for (const { locale, script } of localeExpectations) {
  test(`renders ${locale} in its own script`, async ({ page }) => {
    await page.goto(`/${locale}`);

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toContainText(script);
  });
}

test('redirects the bare root to the default locale', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
});

test('switching language navigates and re-renders', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('combobox').selectOption('pa');

  await expect(page).toHaveURL(/\/pa$/);
  await expect(page.locator('h1')).toContainText(/ਹੱਕਦਾਰ/);
});

test('health endpoint reports database reachability', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok', database: 'reachable' });
});
