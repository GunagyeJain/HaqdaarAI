import { expect, test } from '@playwright/test';
import { completeForm } from './support/form';

/**
 * DEGRADATION — proposal §6.2 "Reliability", pipeline Phase 4.
 *
 * The pipeline document warns specifically against an *assumed* downgrade path.
 * These run against a server started with no AI keys configured, which is the
 * state the whole suite runs in, so every assertion here is about the real
 * behaviour rather than a mocked one.
 *
 * The claim under test is invariant 2: with every AI provider switched off, a
 * citizen still completes a profile and gets a match.
 */

test.describe('with no AI provider configured', () => {
  /**
   * PRECONDITION: a server with no AI providers configured.
   *
   * These assertions are about what happens when the keys are absent, so a
   * server that HAS them cannot exercise them — and, worse, the tests below
   * would spend real Groq quota and real Sarvam credits calling providers in
   * the expectation that they fail.
   *
   * Locally that is exactly what happens: .env.local supplies keys to
   * `next start`. So the suite skips, loudly, rather than reporting red for an
   * environment difference that is not a product defect.
   *
   * In CI it must never skip. There is no .env.local there, so a configured
   * provider means the workflow changed and the reliability metric quietly
   * stopped being tested — which is a worse failure than a red test.
   */
  test.beforeEach(async ({ request }) => {
    const capabilities = (await (await request.get('/api/voice')).json()) as Record<
      string,
      boolean
    >;
    const configured =
      capabilities.serverStt || capabilities.serverTts || capabilities.extraction;

    if (!configured) return;

    if (process.env.CI) {
      throw new Error(
        'the degradation suite requires a server with no AI providers configured, but this one reports ' + JSON.stringify(capabilities),
      );
    }

    test.skip(
      true,
      'this server has AI keys (.env.local). Degradation needs a keyless server: run `pnpm test:e2e:degraded`.',
    );
  });
  test('says voice is unavailable instead of offering a dead control', async ({ page }) => {
    await page.goto('/en');

    const notice = page.getByTestId('voice-unavailable');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('not available');
    // And it must say the form still works — a dead end would be worse than
    // no voice at all.
    await expect(notice).toContainText('works exactly the same');
  });

  test('the typed path is completely unaffected', async ({ page }) => {
    // The whole five-step walk, the narrowing, and the list -- with every
    // provider off. This is invariant 2 as an executable claim.
    await completeForm(page, { age: '42', state: 'PB' });

    await expect(page.getByRole('heading', { name: 'What we found' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/out of \d+ schemes checked/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /schemes worth your time/ })).toBeVisible();
  });

  test('the voice endpoint reports its capabilities honestly', async ({ request }) => {
    const response = await request.get('/api/voice');
    expect(response.ok()).toBe(true);

    const capabilities = (await response.json()) as Record<string, boolean>;
    expect(capabilities).toMatchObject({
      serverStt: false,
      serverTts: false,
      extraction: false,
    });
  });

  test('a voice request degrades with a reason rather than a 500', async ({ request }) => {
    const response = await request.post('/api/voice?locale=en', {
      headers: { 'content-type': 'application/json' },
      data: { transcript: 'I am a 42 year old farmer from Punjab' },
    });

    expect(response.status()).toBe(503);
    const body = (await response.json()) as { degraded?: boolean; error?: string };
    expect(body.degraded).toBe(true);
    // Attributable: the operator can see which provider is missing.
    expect(body.error).toContain('GROQ_API_KEY');
  });

  test('text-to-speech degrades without breaking the page', async ({ request }) => {
    const response = await request.post('/api/tts', {
      data: { text: 'What is your age?', locale: 'en' },
    });

    expect(response.status()).toBe(503);
    expect(((await response.json()) as { degraded?: boolean }).degraded).toBe(true);
  });
});

test.describe('input validation', () => {
  test('rejects an empty transcript', async ({ request }) => {
    const response = await request.post('/api/voice?locale=en', {
      headers: { 'content-type': 'application/json' },
      data: { transcript: '   ' },
    });
    expect(response.status()).toBe(400);
  });

  test('rejects a profile with an invented field rather than ignoring it', async ({ request }) => {
    // The matcher must never receive a field the schema does not know.
    const response = await request.post('/api/match', {
      data: { profile: { age: 30, casteCertificateNumber: 'X1' }, locale: 'en' },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('invalid profile');
  });

  test('rejects an out-of-range value', async ({ request }) => {
    const response = await request.post('/api/match', {
      data: { profile: { age: -5 }, locale: 'en' },
    });
    expect(response.status()).toBe(400);
  });
});
