import { budgetLimits, postgresBudgetStore } from '@/db/budget-store';
import { consumeBudget } from '@/domain/providers/budget';
import { extractProfile } from '@/domain/providers/extraction';
import {
  PROVIDER_TIMEOUT_MS,
  getLlmProvider,
  getSttProvider,
  voiceCapabilities,
} from '@/domain/providers/registry';
import { ProviderUnavailableError, withTimeout } from '@/domain/providers/resilience';
import { routing, type Locale } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

/**
 * The voice turn: audio (or an already-transcribed string) in, suggested fields
 * out.
 *
 * INVARIANT 3: this endpoint returns *suggestions*. It never writes to a
 * profile and never calls the matcher. The client renders what comes back into
 * the same editable inputs the typed form uses, and nothing reaches
 * /api/match until the citizen confirms it.
 *
 * Every stage is wrapped in a hard timeout. A degraded response here is not an
 * error state — the typed form is still fully functional, and the client is
 * told which capabilities are actually available.
 */

/** GET reports what the server can do, so the UI never offers a dead control. */
export function GET() {
  return Response.json(voiceCapabilities());
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const localeParam = url.searchParams.get('locale') ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(localeParam)
    ? (localeParam as Locale)
    : routing.defaultLocale;

  // Stage timings, surfaced as Server-Timing below so a latency regression is
  // attributable to the stage that caused it rather than merely visible in the
  // total. docs/EVALUATION.md asks for spans, not one opaque duration.
  let sttMs = 0;
  let extractMs = 0;

  let transcript: string;

  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      // The browser already transcribed it (SpeechRecognition fallback), so
      // there is no server STT hop at all.
      const body = (await request.json()) as { transcript?: unknown };
      if (typeof body.transcript !== 'string' || body.transcript.trim() === '') {
        return Response.json({ error: 'empty transcript' }, { status: 400 });
      }
      transcript = body.transcript;
    } else {
      const audio = await request.arrayBuffer();
      if (audio.byteLength === 0) {
        return Response.json({ error: 'empty audio' }, { status: 400 });
      }

      // The daily spend cap. Sarvam credits never renew, so an unbounded
      // endpoint on a public URL is an unbounded bill. Exceeding it raises
      // the same error an unreachable provider raises, so the client takes
      // the fallback ladder that the degradation suite already covers
      // rather than a new path that nothing tests.
      const allowance = await consumeBudget(postgresBudgetStore, 'voice', budgetLimits().voice);
      if (!allowance.ok) {
        throw new ProviderUnavailableError(
          'stt',
          `daily speech-to-text limit reached (${allowance.limit})`,
        );
      }

      const stt = getSttProvider();
      const sttStarted = performance.now();
      transcript = await withTimeout(
        stt.transcribe(audio, contentType || 'audio/webm', locale),
        PROVIDER_TIMEOUT_MS,
        'stt',
      );
      sttMs = performance.now() - sttStarted;
    }
  } catch (error) {
    return degraded(error, 'stt', sttMs, extractMs);
  }

  const extractStarted = performance.now();

  try {
    const llm = getLlmProvider();
    const extraction = await withTimeout(
      extractProfile(llm, transcript, locale),
      PROVIDER_TIMEOUT_MS * 2,
      'llm',
    );
    extractMs = performance.now() - extractStarted;

    if (!extraction.ok) {
      return Response.json(
        { transcript, error: extraction.error, stage: 'extract' },
        { status: 502, headers: serverTiming(sttMs, extractMs) },
      );
    }

    return Response.json(
      {
        transcript,
        // Suggestions. The client must render these as editable, unconfirmed
        // values — see invariant 3.
        suggested: extraction.profile,
        dropped: extraction.dropped,
      },
      { headers: serverTiming(sttMs, extractMs) },
    );
  } catch (error) {
    // Elapsed-until-failure, not zero: a 4s timeout and an instant
    // "no API key" are both 503s, and the duration is what tells them apart.
    extractMs = performance.now() - extractStarted;
    return degraded(error, 'extract', sttMs, extractMs, transcript);
  }
}

/**
 * Per-stage spans as the standard `Server-Timing` header.
 *
 * Standard means browser devtools renders it, so this is production
 * instrumentation that the latency harness also reads — not test scaffolding
 * bolted onto a route.
 *
 * `stt;dur=0` is meaningful rather than missing data: it says the browser
 * transcribed locally (SpeechRecognition) and the server STT hop never
 * happened at all.
 */
function serverTiming(sttMs: number, extractMs: number): Record<string, string> {
  return {
    'Server-Timing': [
      `stt;dur=${sttMs.toFixed(1)}`,
      `extract;dur=${extractMs.toFixed(1)}`,
    ].join(', '),
  };
}

/**
 * A provider being unavailable is an expected operating mode, so it is reported
 * with the stage and reason rather than as an opaque 500. The client uses this
 * to fall back rather than to show an error the citizen can do nothing about.
 */
function degraded(
  error: unknown,
  stage: string,
  sttMs: number,
  extractMs: number,
  transcript?: string,
) {
  const unavailable = error instanceof ProviderUnavailableError;

  if (!unavailable) {
    console.error(`voice ${stage} failed`, error);
  }

  return Response.json(
    {
      stage,
      transcript,
      error: error instanceof Error ? error.message : 'voice pipeline failed',
      degraded: true,
    },
    // Emitted on the failure path too, so a stage that timed out is
    // distinguishable from one that never started — and so the header is
    // reliably present rather than present only when things went well.
    { status: 503, headers: serverTiming(sttMs, extractMs) },
  );
}
