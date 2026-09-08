import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { ExpiredNotice } from '@/components/expired-notice';
import { ProfileForm } from '@/components/profile-form';
import { SiteHeader } from '@/components/site-header';
import { VoiceConsole } from '@/components/voice-console';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Home />;
}

function Home() {
  const t = useTranslations('home');
  const tPrivacy = useTranslations('privacy');
  const tDisclaimer = useTranslations('app');

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 pb-10 pt-5 sm:px-8">
        <SiteHeader />

        {/* Calm, but not so airy that the form is pushed off the first screen.
            An earlier pass gave the hero the entire phone viewport, so the only
            thing a visitor could see was a headline — handsome, and useless.
            Desktop keeps the larger scale, where the room genuinely exists. */}
        <div className="pt-7 pb-6 sm:pt-14 sm:pb-8">
          <h1 className="max-w-3xl text-[1.75rem] leading-[1.15] font-extrabold tracking-tight text-balance sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-ink-muted)] text-pretty sm:mt-4 sm:text-xl">
            {t('subtitle')}
          </p>

          {/* INVARIANT 5, said to the citizen rather than only recorded in code.
              People are about to be asked about caste, income and disability;
              the promise not to keep it belongs next to the asking. */}
          <p className="mt-5 inline-flex items-start gap-2 rounded-xl bg-[var(--color-brand-tint)] px-3.5 py-2.5 text-[0.85rem] leading-snug text-[var(--color-ink)] sm:text-sm">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 size-4 shrink-0"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5l-7-3Z"
                stroke="var(--color-brand-text)"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {tPrivacy('notice')}
          </p>
        </div>

        {/* One column, always. The results used to sit in a second column that
            was empty until submit, so desktop opened on half a screen of
            nothing. They now have a route of their own. */}
        <div className="flex flex-col gap-6">
          {/* Voice sits above the form deliberately: it is an accelerant, and
              the form beneath it is always the fallback and always complete. */}
          <VoiceConsole />
          {/* The form reads its step from the URL, and useSearchParams needs a
              boundary for the page to stay statically rendered. */}
          <Suspense fallback={null}>
            <ExpiredNotice />
            <ProfileForm />
          </Suspense>
        </div>

        <footer className="mt-12 border-t border-[var(--color-border)] pt-6 text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)] sm:text-sm">
          {tDisclaimer('disclaimer')}
        </footer>
      </main>
    </div>
  );
}
