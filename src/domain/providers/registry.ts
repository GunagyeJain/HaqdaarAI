import { groqLlm } from './groq';
import { ProviderUnavailableError } from './resilience';
import { sarvamStt, sarvamTts } from './sarvam';
import type { LlmProvider, SttProvider, TtsProvider } from './types';

/**
 * Provider selection — config, not code (proposal §8).
 *
 * Switching a vendor is an env var. No business logic imports a vendor
 * directly; everything goes through these three functions.
 *
 * `none` is a first-class, supported configuration, not a broken one. With
 * every AI key unset the app is a working typed-form matcher — invariant 2 —
 * and the degradation tests run in exactly that state.
 */

export const PROVIDER_TIMEOUT_MS = Number.parseInt(
  process.env.PROVIDER_TIMEOUT_MS ?? '4000',
  10,
);

const unavailable = (role: string, reason: string) => (): never => {
  throw new ProviderUnavailableError(role, reason);
};

/** Speech-to-text. `browser` means the client handles it; the server has none. */
export function getSttProvider(): SttProvider {
  const choice = process.env.STT_PROVIDER ?? 'sarvam';

  if (choice === 'sarvam') {
    if (!process.env.SARVAM_API_KEY) {
      return { name: 'none', transcribe: unavailable('stt', 'SARVAM_API_KEY is not set') };
    }
    return sarvamStt;
  }

  return {
    name: choice,
    transcribe: unavailable('stt', `no server-side STT provider (STT_PROVIDER=${choice})`),
  };
}

export function getTtsProvider(): TtsProvider {
  const choice = process.env.TTS_PROVIDER ?? 'sarvam';

  if (choice === 'sarvam') {
    if (!process.env.SARVAM_API_KEY) {
      return { name: 'none', synthesize: unavailable('tts', 'SARVAM_API_KEY is not set') };
    }
    return sarvamTts;
  }

  return {
    name: choice,
    synthesize: unavailable('tts', `no server-side TTS provider (TTS_PROVIDER=${choice})`),
  };
}

export function getLlmProvider(): LlmProvider {
  const choice = process.env.LLM_PROVIDER ?? 'groq';

  if (choice === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      return { name: 'none', extract: unavailable('llm', 'GROQ_API_KEY is not set') };
    }
    return groqLlm;
  }

  return {
    name: choice,
    extract: unavailable('llm', `no LLM provider configured (LLM_PROVIDER=${choice})`),
  };
}

/** What the client may offer, so the UI never shows a control that cannot work. */
export function voiceCapabilities() {
  return {
    serverStt: getSttProvider().name !== 'none',
    serverTts: getTtsProvider().name !== 'none',
    extraction: getLlmProvider().name !== 'none',
  };
}
