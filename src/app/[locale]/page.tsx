import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <Home />;
}

function Home() {
  const t = useTranslations('home');
  const tApp = useTranslations('app');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <span className="text-lg font-semibold tracking-tight">{tApp('name')}</span>
        <LocaleSwitcher />
      </header>

      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="text-4xl font-bold tracking-tight text-balance">{t('title')}</h1>
        <p className="mt-4 text-lg text-[var(--color-ink-muted)] text-pretty">{t('subtitle')}</p>

        <p className="mt-10 inline-flex w-fit rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1 text-sm text-[var(--color-ink-muted)]">
          {t('status')}
        </p>
      </div>

      <footer className="border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-ink-muted)]">
        {tApp('disclaimer')}
      </footer>
    </main>
  );
}
