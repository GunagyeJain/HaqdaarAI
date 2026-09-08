'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  /**
   * On a phone the results sit below sixteen form fields, so submitting
   * appeared to do nothing at all: the button is at the bottom of the
   * viewport, the answer is a screen and a half further down, and the only
   * visible change is a progress count ticking up. People conclude it is
   * broken, because from where they are sitting it is.
   *
   * Desktop shows both columns at once and needs none of this, which is
   * exactly why it went unnoticed on a laptop.
   *
   * Honours prefers-reduced-motion, and only moves focus-free scroll — the
   * live region already announces the result to a screen reader, so
   * stealing focus here would interrupt rather than help.
   */
  useEffect(() => {
    if (!result || !headingRef.current) return;
    if (!window.matchMedia('(max-width: 1023px)').matches) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    headingRef.current.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [result]);

  if (!result) {
    return (
      <div className="hidden rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]/50 p-8 text-center text-sm leading-relaxed text-[var(--color-ink-muted)] lg:block">
        {t('empty')}
      </div>
    );
  }

  const { pass, unknown, fail, counts } = result;

  return (
    <section aria-live="polite" className="flex flex-col gap-4">
      <div className="scroll-mt-4">
        <h2 ref={headingRef} className="scroll-mt-4 text-xl font-bold tracking-tight">
          {t('heading')}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
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
            className="min-h-11 self-start text-sm text-[var(--color-brand-text)] underline underline-offset-2"
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
          className="min-h-11 rounded-lg bg-[var(--color-brand)] px-4 text-sm font-semibold text-[var(--color-brand-on)]"
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
