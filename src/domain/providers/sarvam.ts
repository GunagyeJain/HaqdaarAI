import type { Locale } from '@/i18n/routing';
import { speechLocales } from '@/i18n/routing';
import { ProviderUnavailableError } from './resilience';
import type { SttProvider, TtsProvider } from './types';

/**
 * Sarvam AI — Indic-native speech.
 *
 * Chosen over Whisper or Deepgram because the target user speaks Hindi,
 * Punjabi, Bengali or Tamil, often code-mixed with English, and general-purpose
 * models degrade badly on exactly that. The accessibility argument in the
 * proposal only holds if the speech layer actually works in these languages.
 *
 * API shapes verified against docs.sarvam.ai (2026-09-07):
 *   STT  POST https://api.sarvam.ai/speech-to-text   multipart, header api-subscription-key
 *   TTS  POST https://api.sarvam.ai/text-to-speech   JSON, base64 audio back
 */

const BASE = 'https://api.sarvam.ai';

function requireKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    throw new ProviderUnavailableError('sarvam', 'SARVAM_API_KEY is not set');
  }
  return key;
}

export const sarvamStt: SttProvider = {
  name: 'sarvam',

  async transcribe(audio: ArrayBuffer, mimeType: string, locale: Locale): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), 'audio.webm');
    form.append('model', process.env.SARVAM_STT_MODEL ?? 'saaras:v3');
    form.append('language_code', speechLocales[locale]);

    const response = await fetch(`${BASE}/speech-to-text`, {
      method: 'POST',
      headers: { 'api-subscription-key': requireKey() },
      body: form,
    });

    if (!response.ok) {
      throw new ProviderUnavailableError(
        'sarvam',
        `speech-to-text failed (${response.status})`,
      );
    }

    const data = (await response.json()) as { transcript?: unknown };
    if (typeof data.transcript !== 'string') {
      throw new ProviderUnavailableError('sarvam', 'speech-to-text returned no transcript');
    }

    return data.transcript;
  },
};

export const sarvamTts: TtsProvider = {
  name: 'sarvam',

  async synthesize(text: string, locale: Locale) {
    const response = await fetch(`${BASE}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': requireKey(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Bulbul caps a request at 2500 characters; a next-question prompt is
        // one sentence, so truncation here is a guard, not a normal path.
        text: text.slice(0, 2500),
        target_language_code: speechLocales[locale],
        model: process.env.SARVAM_TTS_MODEL ?? 'bulbul:v3',
        speaker: process.env.SARVAM_TTS_SPEAKER ?? 'anushka',
      }),
    });

    if (!response.ok) {
      throw new ProviderUnavailableError(
        'sarvam',
        `text-to-speech failed (${response.status})`,
      );
    }

    const data = (await response.json()) as { audios?: unknown };
    const first = Array.isArray(data.audios) ? data.audios[0] : undefined;
    if (typeof first !== 'string') {
      throw new ProviderUnavailableError('sarvam', 'text-to-speech returned no audio');
    }

    return {
      audio: Uint8Array.from(atob(first), (char) => char.charCodeAt(0)).buffer as ArrayBuffer,
      mimeType: 'audio/wav',
    };
  },
};
