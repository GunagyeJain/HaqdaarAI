'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

/**
 * Shown when someone arrives from a results URL that has no profile behind it.
 *
 * Read on the CLIENT deliberately. Awaiting `searchParams` in the page would
 * opt the whole locale route out of static rendering — the same cost that ruled
 * out reading a theme cookie in the layout, and it is worse here because this
 * is the landing page. Measured, not assumed: doing it server-side flipped
 * `/[locale]` from ● to ƒ in the build output.
 */
export function ExpiredNotice() {
  const t = useTranslations('results');
  const searchParams = useSearchParams();

  if (searchParams.get('expired') !== '1') return null;

  return (
    <p
      role="status"
      className="mb-6 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 py-3 text-sm leading-relaxed"
    >
      {t('expired')}
    </p>
  );
}
