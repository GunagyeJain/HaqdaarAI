import { describe, expect, it, vi } from 'vitest';
import { ProviderUnavailableError, withTimeout } from '@/domain/providers/resilience';

/**
 * The pipeline document warns specifically against an *assumed* downgrade path.
 * Every provider call is wrapped with a hard timeout, and the fallback is
 * exercised here rather than described.
 *
 * A hung STT request must not leave a citizen staring at a spinner: it must
 * fail fast and hand them back the typed form, which always works.
 */

describe('withTimeout', () => {
  it('returns the value when the call finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'stt')).resolves.toBe('ok');
  });

  it('rejects once the deadline passes', async () => {
    vi.useFakeTimers();
    try {
      const hung = new Promise<string>(() => {
        /* never settles — a provider that has stopped responding */
      });
      const guarded = withTimeout(hung, 4000, 'stt');
      const assertion = expect(guarded).rejects.toBeInstanceOf(ProviderUnavailableError);

      await vi.advanceTimersByTimeAsync(4001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('names the provider that timed out, so degradation is attributable', async () => {
    vi.useFakeTimers();
    try {
      const guarded = withTimeout(new Promise<string>(() => {}), 100, 'groq');
      const assertion = guarded.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(101);

      const error = await assertion;
      expect(error).toBeInstanceOf(ProviderUnavailableError);
      expect((error as ProviderUnavailableError).provider).toBe('groq');
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a real failure rather than disguising it as a timeout', async () => {
    const boom = Promise.reject(new Error('402 payment required'));
    await expect(withTimeout(boom, 1000, 'sarvam')).rejects.toThrow('402 payment required');
  });

  it('does not leave a timer pending after the call resolves', async () => {
    vi.useFakeTimers();
    try {
      await withTimeout(Promise.resolve('ok'), 5000, 'stt');
      // A leaked timer would keep a serverless function alive past its response.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
