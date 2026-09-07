/**
 * Timeouts and failure typing for provider calls.
 *
 * Proposal §10 mitigates rate limits and latency spikes with "strict timeout
 * limits and graceful downgrades". The pipeline document adds the important
 * qualifier: the downgrade must be *tested*, not assumed.
 *
 * A hung provider must never leave a citizen watching a spinner. It fails fast
 * and hands them back the typed form, which always works.
 */

export class ProviderUnavailableError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.provider = provider;
  }
}

/**
 * Rejects with ProviderUnavailableError if `promise` has not settled within
 * `ms`. A genuine failure propagates unchanged, so a 402 or a bad request is
 * never disguised as a timeout.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, provider: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderUnavailableError(provider, `${provider} timed out after ${ms}ms`));
    }, ms);
  });

  // The finally clears the timer on both paths; without it a serverless
  // function can stay alive past its own response.
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
