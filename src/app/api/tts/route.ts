import { budgetLimits, postgresBudgetStore } from '@/db/budget-store';
import { consumeBudget } from '@/domain/providers/budget';
import { PROVIDER_TIMEOUT_MS, getTtsProvider } from '@/domain/providers/registry';
import { ProviderUnavailableError, withTimeout } from '@/domain/providers/resilience';
import { routing, type Locale } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

/**
 * Speaks a next-question prompt.
 *
 * Always optional. The on-screen text is rendered in parallel and is the
 * primary channel; audio is an accessibility addition for citizens who find
 * reading harder. If this 503s the client falls back to the browser's own
 * SpeechSynthesis, and if that is missing too, the text is already on screen.
 */
export async function POST(request: Request) {
  let body: { text?: unknown; locale?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.text !== 'string' || body.text.trim() === '') {
    return Response.json({ error: 'no text to speak' }, { status: 400 });
  }

  const locale = (routing.locales as readonly string[]).includes(String(body.locale))
    ? (body.locale as Locale)
    : routing.defaultLocale;

  try {
    // Daily spend cap — see src/domain/providers/budget.ts. Synthesis is the
    // more expensive of the two Sarvam calls per unit, so it is capped lower.
    const allowance = await consumeBudget(postgresBudgetStore, 'tts', budgetLimits().tts);
    if (!allowance.ok) {
      throw new ProviderUnavailableError(
        'tts',
        `daily speech limit reached (${allowance.limit})`,
      );
    }

    const tts = getTtsProvider();
    const { audio, mimeType } = await withTimeout(
      tts.synthesize(body.text, locale),
      PROVIDER_TIMEOUT_MS,
      'tts',
    );

    return new Response(audio, {
      headers: { 'content-type': mimeType, 'cache-control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        degraded: true,
        error: error instanceof Error ? error.message : 'speech synthesis failed',
      },
      { status: 503 },
    );
  }
}
