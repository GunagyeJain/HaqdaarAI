import { defineRouting } from 'next-intl/routing';

/**
 * Supported locales. See docs/DECISIONS.md ADR-008.
 *
 * Adding a language must cost exactly one `messages/<locale>.json` file plus one
 * entry here. If it ever costs more, the i18n layer has been built wrong.
 */
export const locales = ['en', 'hi', 'pa', 'bn', 'ta'] as const;

export type Locale = (typeof locales)[number];

/** Display names, each written in its own script. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  pa: 'ਪੰਜਾਬੀ',
  bn: 'বাংলা',
  ta: 'தமிழ்',
};

/**
 * BCP-47 tags passed to speech providers. The UI locale and the voice locale are
 * deliberately the same value, so a citizen is answered in the language they are
 * reading — see docs/ARCHITECTURE.md.
 */
export const speechLocales: Record<Locale, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  pa: 'pa-IN',
  bn: 'bn-IN',
  ta: 'ta-IN',
};

export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
});
