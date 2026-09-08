import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ProfileForm } from '@/components/profile-form';
import { ResultsPanel } from '@/components/results-panel';
import { VoiceConsole } from '@/components/voice-console';
import { ProfileProvider } from '@/lib/profile-state';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ProfileProvider locale={locale}>
      <Home />
    </ProfileProvider>
  );
}

/**
 * The mark: an open doorway.
 *
 * Haqdaar means "one who is rightfully entitled", and the thing being offered
 * is a way in — so the mark is a door standing open rather than a crest or a
 * seal. Seals say "this is official"; the barrier here is that people already
 * assume it is official and assume it is not for them.
 *
 * Drawn rather than lettered so it carries no script, and works identically in
 * all five locales.
 */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-[0.7rem] bg-[var(--color-brand)]"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path
          d="M5 21V9.5a7 7 0 0 1 14 0V21"
          stroke="var(--color-brand-on)"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M12 21v-6.5"
          stroke="var(--color-brand-on)"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function Home() {
  const t = useTranslations('home');
  const tApp = useTranslations('app');
  const tPrivacy = useTranslations('privacy');

  return (
    <div className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 pb-10 pt-5 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2.5">
            <Mark />
            <span className="text-[1.05rem] font-bold tracking-tight">{tApp('name')}</span>
          </span>
          <LocaleSwitcher />
        </header>

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

        {/* One column on a phone, which is the assumed device. The results
            column only appears beside the form once there is room for both. */}
        <div className="grid flex-1 items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
          <div className="flex flex-col gap-6">
            {/* Voice sits above the form deliberately: it is an accelerant, and
                the form beneath it is always the fallback and always complete. */}
            <VoiceConsole />
            <ProfileForm />
          </div>

          {/* Sticky on desktop so verdicts stay in view while the form is
              edited; static on phones, where sticky panels steal the screen. */}
          <div className="lg:sticky lg:top-6">
            <ResultsPanel />
          </div>
        </div>

        <footer className="mt-12 border-t border-[var(--color-border)] pt-6 text-[0.8rem] leading-relaxed text-[var(--color-ink-muted)] sm:text-sm">
          {tApp('disclaimer')}
        </footer>
      </main>
    </div>
  );
}
