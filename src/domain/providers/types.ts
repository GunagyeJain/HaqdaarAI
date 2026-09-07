import type { Locale } from '@/i18n/routing';

/**
 * Provider contracts. Swapping a vendor is an env var, never an edit to
 * business logic (proposal §8).
 *
 * INVARIANT 1 is enforced by these signatures. `LlmProvider.extract` receives a
 * transcript and a locale — nothing else. It has no parameter through which a
 * scheme, a rule, or a verdict could reach it, so it cannot decide eligibility
 * even if a future prompt tried to.
 *
 * `extract` returns `unknown` deliberately: the value is untrusted until it has
 * passed ProfileSchema and the grounding check in ./extraction.
 */

export interface SttProvider {
  readonly name: string;
  transcribe(audio: ArrayBuffer, mimeType: string, locale: Locale): Promise<string>;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(text: string, locale: Locale): Promise<{ audio: ArrayBuffer; mimeType: string }>;
}

export interface LlmProvider {
  readonly name: string;
  extract(transcript: string, locale: Locale): Promise<unknown>;
}
