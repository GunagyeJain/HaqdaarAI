import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';

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

/**
 * Shared by both routes, because language and theme have to stay reachable from
 * the results as well as the form. A reader who lands on the wrong language
 * must never be stranded on a page that cannot change it.
 *
 * The name links home, which is also the way back from the results.
 */
export function SiteHeader() {
  const t = useTranslations('app');

  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2.5 no-underline">
        <Mark />
        <span className="text-[1.05rem] font-bold tracking-tight">{t('name')}</span>
      </Link>
      <span className="flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </span>
    </header>
  );
}
