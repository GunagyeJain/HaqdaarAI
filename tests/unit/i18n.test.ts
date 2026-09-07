import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { locales, localeNames, speechLocales } from '@/i18n/routing';

const messagesDir = path.resolve(import.meta.dirname, '../../messages');

/** Flattens nested message objects to dotted key paths: `app.name`, `home.title`, … */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

async function loadMessages(locale: string): Promise<unknown> {
  return (await import(`../../messages/${locale}.json`)).default;
}

describe('locale configuration', () => {
  it('declares at least English, Hindi and Punjabi (ADR-008)', () => {
    expect(locales).toEqual(expect.arrayContaining(['en', 'hi', 'pa']));
  });

  it('gives every locale a display name and a speech tag', () => {
    for (const locale of locales) {
      expect(localeNames[locale], `display name for ${locale}`).toBeTruthy();
      expect(speechLocales[locale], `speech tag for ${locale}`).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
  });

  it('has exactly one message file per declared locale, and no orphans', () => {
    const files = readdirSync(messagesDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace('.json', ''))
      .sort();

    expect(files).toEqual([...locales].sort());
  });
});

describe('message completeness', () => {
  it('every locale has the same keys as English', async () => {
    const englishKeys = flattenKeys(await loadMessages('en')).sort();

    for (const locale of locales) {
      if (locale === 'en') continue;

      const keys = flattenKeys(await loadMessages(locale)).sort();

      // Reported as explicit diffs so a failure names the missing string
      // rather than dumping two large arrays.
      expect(englishKeys.filter((k) => !keys.includes(k)), `missing in ${locale}`).toEqual([]);
      expect(keys.filter((k) => !englishKeys.includes(k)), `extra in ${locale}`).toEqual([]);
    }
  });

  it('no locale ships an empty or untranslated-looking string', async () => {
    for (const locale of locales) {
      const messages = (await loadMessages(locale)) as Record<string, Record<string, string>>;

      for (const [namespace, entries] of Object.entries(messages)) {
        for (const [key, value] of Object.entries(entries)) {
          expect(value.trim(), `${locale}:${namespace}.${key}`).not.toBe('');
          expect(value, `${locale}:${namespace}.${key}`).not.toMatch(/^TODO/i);
        }
      }
    }
  });
});
