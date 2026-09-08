'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Light / dark switch.
 *
 * TWO STATES, not three, and the device is deliberately not consulted.
 *
 * The earlier design followed `prefers-color-scheme` until someone chose, on
 * the reasoning that most people never open a settings menu. That reasoning
 * reversed once it met this audience. Reading outdoors in sunlight is a normal
 * condition here, dark mode is markedly harder to read in it, and a phone set
 * to dark globally is common — so following the device handed the worst
 * default to the people most likely to be standing in the sun. It also meant a
 * language switch could silently change the theme, because losing the
 * attribute meant falling back to the device rather than to a known default.
 *
 * An explicit choice is remembered and wins in both directions.
 *
 * The stored value is a display preference and nothing else. Invariant 5 is
 * about the applicant's profile — caste, income, disability — none of which is
 * ever written anywhere. Remembering that someone prefers a dark screen carries
 * no such risk and is not a step toward carrying one.
 */

const STORAGE_KEY = 'haqdaar-theme';

type Choice = 'light' | 'dark';

/**
 * Runs before first paint, inlined in the document head.
 *
 * Without it the page renders in the system theme and then corrects itself once
 * React hydrates — a white flash for a reader who asked for dark, at the moment
 * they open the page. Small, ugly, and entirely avoidable.
 *
 * Wrapped in try/catch because localStorage throws outright in some privacy
 * modes rather than returning null, and a themed page is not worth a blank one.
 */
export const themeScript = `(function(){var d='light';try{if(localStorage.getItem('${STORAGE_KEY}')==='dark'){d='dark'}}catch(e){}document.documentElement.dataset.theme=d})()`;

/**
 * Read through useSyncExternalStore rather than useState + useEffect.
 *
 * The naive version sets state inside an effect, which React 19 rightly flags:
 * it renders once with the wrong answer and then corrects, and the correction is
 * visible. This subscribes to the two things that can actually change the
 * answer — the stored choice and the device preference — and reports the
 * current one.
 */
const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);

  // Only two things can change the answer now: this tab writing a choice, which
  // notifies listeners directly, and another tab writing one, which is what
  // `storage` reports. The device preference is no longer consulted, so
  // subscribing to it would only cause pointless re-renders at sunset.
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
};

const getSnapshot = (): Choice => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    // Storage throws outright in some privacy modes. Light is the default
    // anyway, so there is nothing to recover from.
    return 'light';
  }
};

/**
 * The server cannot know either the stored choice or the device preference, so
 * it commits to neither. React hydrates with this, then re-renders with the
 * real value — and because the inline script has already set data-theme, the
 * page is never actually painted in the wrong colours.
 */
const getServerSnapshot = (): undefined => undefined;

export function ThemeToggle() {
  const t = useTranslations('app');
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * Re-assert the attribute, because something else removes it.
   *
   * Switching language is a client navigation to a different [locale] segment,
   * which re-renders <html> from server markup that carries no data-theme --
   * the pre-paint script in <head> does not run again on a client navigation.
   * Measured, not assumed: after the switch the attribute read back as null,
   * so a reader who had chosen dark was quietly returned to the default.
   *
   * A cookie rendered server-side would fix this without an effect, and was
   * rejected: reading cookies() in the locale layout opts every route out of
   * static rendering, which costs more than these three lines save.
   */
  useEffect(() => {
    if (choice === undefined) return;
    document.documentElement.dataset.theme = choice;
  }, [choice]);

  const apply = (next: Choice) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still applies to this page view; it just will not persist.
    }
    // `storage` does not fire in the tab that wrote it, so tell subscribers here.
    listeners.forEach((listener) => listener());
  };

  const isDark = choice === 'dark';
  const label = t(isDark ? 'themeToLight' : 'themeToDark');

  return (
    <button
      type="button"
      // Before the first client render there is no known state to announce, so
      // the control is inert rather than announced wrongly.
      aria-hidden={choice === undefined}
      aria-pressed={choice === undefined ? undefined : isDark}
      disabled={choice === undefined}
      title={label}
      onClick={() => apply(isDark ? 'light' : 'dark')}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] transition-colors hover:border-[var(--color-border-strong)]"
    >
      <span className="sr-only">{label}</span>

      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        {isDark ? (
          <g stroke="var(--color-brand-text)" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
          </g>
        ) : (
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
            stroke="var(--color-brand-text)"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}
