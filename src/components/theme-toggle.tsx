'use client';

import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

/**
 * Light / dark switch.
 *
 * Until someone chooses, the device decides — which is right for the majority
 * who never open a settings menu. Once they choose, that choice wins in both
 * directions, including choosing light on a phone that is globally dark. That
 * last case is the one a naive toggle gets wrong, and it is not hypothetical
 * here: reading outdoors in sunlight is a normal condition for this audience,
 * and dark mode is markedly harder to read in it.
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
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}})()`;

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
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  // The device preference can change while the page is open (a scheduled dark
  // mode at sunset), and `storage` covers the same site open in another tab.
  media.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
  };
};

const getSnapshot = (): Choice => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Storage unavailable; fall through to the device preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
