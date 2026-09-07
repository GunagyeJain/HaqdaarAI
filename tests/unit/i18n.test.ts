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

  /** Walks a nested message object, yielding every leaf as [dotted key, value]. */
  function* leaves(value: unknown, prefix = ''): Generator<[string, unknown]> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      yield [prefix, value];
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      yield* leaves(child, prefix ? `${prefix}.${key}` : key);
    }
  }

  it('no locale ships an empty or untranslated-looking string', async () => {
    for (const locale of locales) {
      for (const [key, value] of leaves(await loadMessages(locale))) {
        expect(typeof value, `${locale}:${key} should be a string`).toBe('string');
        expect(String(value).trim(), `${locale}:${key}`).not.toBe('');
        expect(String(value), `${locale}:${key}`).not.toMatch(/^TODO/i);
      }
    }
  });

  it('keeps ICU placeholders consistent across locales', async () => {
    // A translation that drops {count} renders a sentence missing its number;
    // one that invents a placeholder throws at render time.
    const placeholders = (value: unknown) =>
      [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

    const english = new Map([...leaves(await loadMessages('en'))]);

    for (const locale of locales) {
      if (locale === 'en') continue;
      for (const [key, value] of leaves(await loadMessages(locale))) {
        expect(placeholders(value), `${locale}:${key} placeholders`).toEqual(
          placeholders(english.get(key)),
        );
      }
    }
  });
});
