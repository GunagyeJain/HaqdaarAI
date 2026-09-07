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

function Home() {
  const t = useTranslations('home');
  const tApp = useTranslations('app');
  const tPrivacy = useTranslations('privacy');

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold tracking-tight">{tApp('name')}</span>
        <LocaleSwitcher />
      </header>

      <div className="py-8">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-lg text-[var(--color-ink-muted)] text-pretty">
          {t('subtitle')}
        </p>
        {/* INVARIANT 5, stated to the citizen rather than only in the code. */}
        <p className="mt-4 inline-block rounded-lg bg-[var(--color-surface-raised)] px-3 py-2 text-sm text-[var(--color-ink-muted)] ring-1 ring-[var(--color-border)]">
          {tPrivacy('notice')}
        </p>
      </div>

      <div className="grid flex-1 items-start gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {/* Voice sits above the form deliberately: it is an accelerant, and
              the form beneath it is always the fallback and always complete. */}
          <VoiceConsole />
          <ProfileForm />
        </div>
        <ResultsPanel />
      </div>

      <footer className="mt-10 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-ink-muted)]">
        {tApp('disclaimer')}
      </footer>
    </main>
  );
}
