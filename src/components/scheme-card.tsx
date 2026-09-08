'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { MatchResultItem } from '@/domain/matching/types';
import type { Verdict } from '@/domain/rules/types';
import { STATE_LABELS } from '@/lib/state-labels';
import { useClauseText } from './clause-text';

/**
 * One scheme, with the reasoning behind its verdict.
 *
 * The source prose is always one tap away (invariant 4). A citizen being told
 * they do not qualify can read the government's own wording and judge for
 * themselves — which is the difference between a tool that informs and one
 * that simply pronounces.
 */

const VERDICT_STYLE: Record<Verdict, { dot: string; text: string; border: string }> = {
  PASS: {
    dot: 'bg-[var(--color-pass)]',
    text: 'text-[var(--color-pass-text)]',
    border: 'border-l-[var(--color-pass)]',
  },
  UNKNOWN: {
    dot: 'bg-[var(--color-unknown)]',
    text: 'text-[var(--color-unknown-text)]',
    border: 'border-l-[var(--color-unknown)]',
  },
  FAIL: {
    dot: 'bg-[var(--color-fail)]',
    text: 'text-[var(--color-fail-text)]',
    border: 'border-l-[var(--color-fail)]',
  },
};

export function SchemeCard({ item }: { item: MatchResultItem }) {
  const t = useTranslations('results');
  const clauseText = useClauseText();
  const [showProse, setShowProse] = useState(false);

  const style = VERDICT_STYLE[item.verdict];
  const scope = item.scheme.state
    ? (STATE_LABELS[item.scheme.state as keyof typeof STATE_LABELS] ?? item.scheme.state)
    : t('central');

  return (
    <article
      className={`rounded-2xl border border-l-[5px] border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4 sm:p-5 ${style.border}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[1.05rem] leading-snug font-bold">{item.scheme.name}</h3>
        {/* Colour is never the only signal — the verdict is always spelled out. */}
        <span className={`flex items-center gap-1.5 text-sm font-medium ${style.text}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
          {t(item.verdict === 'PASS' ? 'pass' : item.verdict === 'FAIL' ? 'fail' : 'unknown')}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
        {scope}
        {item.scheme.ministry ? ` · ${item.scheme.ministry}` : ''}
      </p>

      {item.scheme.summary && (
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">{item.scheme.summary}</p>
      )}

      <dl className="mt-3 grid gap-2 text-sm">
        {item.matchedClauses.length > 0 && (
          <div>
            <dt className="font-medium">{t('whyMatched')}</dt>
            <dd>
              <ul className="mt-1 list-inside list-disc text-[var(--color-ink-muted)]">
                {item.matchedClauses.map((clause, index) => (
                  <li key={`m${index}`}>{clauseText(clause)}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}

        {item.failedClauses.length > 0 && (
          <div>
            <dt className="font-medium">{t('whyFailed')}</dt>
            <dd>
              <ul className="mt-1 list-inside list-disc text-[var(--color-ink-muted)]">
                {item.failedClauses.map((clause, index) => (
                  <li key={`f${index}`}>{clauseText(clause)}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}

        {item.verdict === 'UNKNOWN' && item.unknownFields.length > 0 && (
          <div>
            <dt className="font-medium">{t('stillNeeded')}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {item.unknownFields.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs"
                >
                  {t(`clause.${field}`)}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setShowProse((shown) => !shown)}
          aria-expanded={showProse}
          className="min-h-11 text-[var(--color-brand-text)] underline underline-offset-2"
        >
          {t('sourceProse')}
        </button>
        <a
          href={item.scheme.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 content-center text-[var(--color-brand-text)] underline underline-offset-2"
        >
          {t('viewOnMyScheme')}
        </a>
      </div>

      {showProse && (
        <blockquote className="mt-2 whitespace-pre-line rounded-xl border-l-2 border-[var(--color-border-strong)] bg-[var(--color-surface-sunken)] p-3.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {item.scheme.sourceProse}
        </blockquote>
      )}
    </article>
  );
}
