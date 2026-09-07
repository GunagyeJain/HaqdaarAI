'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useProfile } from '@/lib/profile-state';
import { SchemeCard } from './scheme-card';

/**
 * The result list.
 *
 * PASS and UNKNOWN are shown together and by default; FAIL is collapsed. That
 * ordering follows from invariant 6: "you may qualify, and here is what we
 * still cannot tell" is the actionable answer, and for most schemes it is the
 * honest one, because most carry at least one criterion we deliberately refuse
 * to model rather than guess at.
 */
/**
 * How many ineligible schemes to render at once.
 *
 * Rendering all of them was measurably slow even on a desktop; on the mid-range
 * Android this is built for it would be far worse, and the FAIL list is the
 * least actionable content on the page. The count is always stated in full —
 * the cap is a rendering limit, not a hidden result.
 */
const MAX_FAILED_RENDERED = 25;

export function ResultsPanel() {
  const t = useTranslations('results');
  const { result, nextQuestion, setHighlightedField } = useProfile();
  const [showFailed, setShowFailed] = useState(false);

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
        {t('empty')}
      </div>
    );
  }

  const { pass, unknown, fail, counts } = result;

  return (
    <section aria-live="polite" className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t('heading')}</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {t('summary', { pass: counts.pass, unknown: counts.unknown, total: counts.total })}
        </p>
      </div>

      {nextQuestion && <NextQuestionCard onAnswer={setHighlightedField} />}

      {pass.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-ink-muted)]">{t('passHint')}</p>
          {pass.map((item) => (
            <SchemeCard key={item.schemeId} item={item} />
          ))}
        </div>
      )}

      {unknown.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-ink-muted)]">{t('unknownHint')}</p>
          {unknown.map((item) => (
            <SchemeCard key={item.schemeId} item={item} />
          ))}
        </div>
      )}

      {fail.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowFailed((shown) => !shown)}
            aria-expanded={showFailed}
            className="min-h-11 self-start text-sm text-[var(--color-brand-strong)] underline underline-offset-2"
          >
            {showFailed ? t('hideFailed') : t('showFailed', { count: counts.fail })}
          </button>
          {showFailed && (
            <>
              {fail.length > MAX_FAILED_RENDERED && (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  {t('showingSome', { shown: MAX_FAILED_RENDERED, total: fail.length })}
                </p>
              )}
              {fail.slice(0, MAX_FAILED_RENDERED).map((item) => (
                <SchemeCard key={item.schemeId} item={item} />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The information-gain prompt: the single unanswered field that would decide
 * the most currently-undecided schemes (docs/DATA-MODEL.md §5).
 */
function NextQuestionCard({ onAnswer }: { onAnswer: (field: null) => void }) {
  const t = useTranslations('question');
  const tResults = useTranslations('results');
  const { nextQuestion, setHighlightedField } = useProfile();

  if (!nextQuestion) return null;

  return (
    <aside className="rounded-xl border border-[var(--color-brand)]/30 bg-[color-mix(in_oklch,var(--color-brand)_7%,transparent)] p-4">
      <h3 className="text-sm font-semibold">{t('heading')}</h3>
      <p className="mt-1 text-base font-medium">
        {tResults(`clause.${nextQuestion.field}`)}
      </p>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        {t('unblocks', { count: nextQuestion.schemesUnblocked })}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setHighlightedField(nextQuestion.field);
            document
              .getElementById(`field-${nextQuestion.field}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById(`input-${nextQuestion.field}`)?.focus();
          }}
          className="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-semibold text-white"
        >
          {tResults(`clause.${nextQuestion.field}`)}
        </button>
        <button
          type="button"
          onClick={() => onAnswer(null)}
          className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 text-sm"
        >
          {t('skip')}
        </button>
      </div>
    </aside>
  );
}
