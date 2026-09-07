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

      const stt = getSttProvider();
      transcript = await withTimeout(
        stt.transcribe(audio, contentType || 'audio/webm', locale),
        PROVIDER_TIMEOUT_MS,
        'stt',
      );
    }
  } catch (error) {
    return degraded(error, 'stt');
  }

  try {
    const llm = getLlmProvider();
    const extraction = await withTimeout(
      extractProfile(llm, transcript, locale),
      PROVIDER_TIMEOUT_MS * 2,
      'llm',
    );

    if (!extraction.ok) {
      return Response.json({ transcript, error: extraction.error, stage: 'extract' }, { status: 502 });
    }

    return Response.json({
      transcript,
      // Suggestions. The client must render these as editable, unconfirmed
      // values — see invariant 3.
      suggested: extraction.profile,
      dropped: extraction.dropped,
    });
  } catch (error) {
    return degraded(error, 'extract', transcript);
  }
}

/**
 * A provider being unavailable is an expected operating mode, so it is reported
 * with the stage and reason rather than as an opaque 500. The client uses this
 * to fall back rather than to show an error the citizen can do nothing about.
 */
function degraded(error: unknown, stage: string, transcript?: string) {
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
    { status: 503 },
  );
}
