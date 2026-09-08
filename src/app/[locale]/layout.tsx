import type { Metadata } from 'next';
import {
  Figtree,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_Gurmukhi,
  Noto_Sans_Tamil,
} from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import '../globals.css';


/**
 * Type.
 *
 * Figtree carries Latin: a humanist sans with open apertures and a tall
 * x-height, which is what makes it hold up at 16px on a cheap panel in
 * daylight. It is warm without being childish, and it is not the default
 * interface sans that every generated layout reaches for.
 *
 * THE CONSTRAINT THAT DECIDES THIS, and the easy one to miss: a Latin-only
 * face silently falls back to whatever the device happens to ship for four of
 * the five locales. The result is a page in two unrelated typefaces, or worse,
 * a script rendered by a font that was never drawn for it. So each Indic
 * locale loads the Noto face built for its script, and only that one.
 *
 * Latin sits first in the stack so digits, rupee amounts and scheme names
 * keep one voice while the script is set by a face designed for it.
 */
const latin = Figtree({
  subsets: ['latin'],
  variable: '--font-latin',
  display: 'swap',
});

// Each loader must be its own module-scope const. Next resolves these
// statically at build time, so a map of calls is rejected outright.
//
// preload is off because only one of the four is ever used on a page, and
// preloading all of them would spend a slow connection on three fonts that
// never render.
const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-indic',
  display: 'swap',
  preload: false,
});

const gurmukhi = Noto_Sans_Gurmukhi({
  subsets: ['gurmukhi'],
  variable: '--font-indic',
  display: 'swap',
  preload: false,
});

const bengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-indic',
  display: 'swap',
  preload: false,
});

const tamil = Noto_Sans_Tamil({
  subsets: ['tamil'],
  variable: '--font-indic',
  display: 'swap',
  preload: false,
});

const indicFonts = {
  hi: devanagari,
  pa: gurmukhi,
  bn: bengali,
  ta: tamil,
} as const;

/** Pre-render every locale at build time. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: t('name'),
    description: t('tagline'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this locale's tree.
  setRequestLocale(locale);

  const indic = locale in indicFonts ? indicFonts[locale as keyof typeof indicFonts] : undefined;

  return (
    <html lang={locale} className={[latin.variable, indic?.variable].filter(Boolean).join(' ')}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
