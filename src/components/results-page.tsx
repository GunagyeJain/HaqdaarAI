'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useProfile } from '@/lib/profile-state';
import { ResultsPanel } from './results-panel';
import { SiteHeader } from './site-header';

/**
 * The results, on a route of their own.
 *
 * They used to sit in a second column beside the form, empty until submit, so
 * desktop opened on half a screen of nothing and the page read as unfinished.
 *
 * INVARIANT 5 becomes visible here, at the one moment a citizen can see it.
 * Nothing is stored, so a reloaded or shared results URL has no profile behind
 * it. Rather than rendering an empty page or inventing a result, it returns to
 * the form and says why — which tells them something true about how their
 * answers are handled, exactly when that claim is credible.
 */
export function ResultsPage() {
  const { result } = useProfile();
  const router = useRouter();
  const tApp = useTranslations('app');

  useEffect(() => {
    if (!result) router.replace('/?expired=1');
  }, [result, router]);

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-10 pt-5 sm:px-8">
        <SiteHeader />

        <div className="flex-1 pt-7 sm:pt-10">
          {result ? <ResultsPanel /> : null}
        </div>

        <footer className="mt-12 border-t border-[var(--color-border)] pt-6 text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)] sm:text-sm">
          {tApp('disclaimer')}
        </footer>
      </main>
    </div>
  );
}
