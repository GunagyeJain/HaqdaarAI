'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { selectNextQuestion } from '@/domain/questions/select';
import type { ProfileField } from '@/domain/rules/types';
import { useProfile } from '@/lib/profile-state';
import { ProfileFieldControl } from './fields';
import { Lamp } from './illustrations';

/**
 * A few good questions before the list.
 *
 * A citizen arriving at the results has answered whatever they felt like
 * answering, which is usually not much, and the honest consequence is a very
 * long UNKNOWN list. Two or three well-chosen questions cut that down far more
 * than any amount of sorting, because the engine picks the field blocking the
 * most currently-undecided schemes.
 *
 * Everything here is skippable, and skipping is real: the engine is asked for
 * the next best question excluding what was declined, rather than handing back
 * the same one. Someone who does not want to state their caste should not have
 * to abandon the narrowing to get past the question.
 *
 * The results stay hidden while this is on screen. Showing a list underneath
 * that is about to change would be showing an answer we are in the middle of
 * correcting.
 */

/** Enough to shrink the list; few enough that it does not become a second form. */
const MAX_QUESTIONS = 3;

export function Narrowing({ onDone }: { onDone: () => void }) {
  const t = useTranslations('results');
  const { profile, result, setField, clearField, runMatch, isMatching } = useProfile();

  const [answered, setAnswered] = useState(0);
  const [skipped, setSkipped] = useState<ReadonlySet<ProfileField>>(new Set());

  const question = useMemo(() => {
    if (!result) return null;
    const everything = [...result.pass, ...result.unknown, ...result.fail];
    return selectNextQuestion(everything, profile, skipped);
  }, [result, profile, skipped]);

  const handled = answered + skipped.size;
  const finished = handled >= MAX_QUESTIONS || question === null;

  const answer = (field: ProfileField) => (value: unknown) => {
    if (value === undefined) {
      clearField(field);
      return;
    }
    setField(field, value as never);
    setAnswered((count) => count + 1);
  };

  const show = () => {
    void runMatch().then(onDone);
  };

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <h2 className="min-w-0 flex-1 text-xl font-bold tracking-tight">{t('narrowHeading')}</h2>
        <Lamp className="hidden w-20 shrink-0 sm:block" />
      </div>

      {!finished && question && (
        <>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {t('narrowProgress', { asked: handled + 1, total: MAX_QUESTIONS })}
          </p>

          <div className="mt-4">
            <ProfileFieldControl
              field={question.field}
              value={profile[question.field]}
              onChange={answer(question.field)}
            />
          </div>

          <p className="mt-2 px-3 text-sm text-[var(--color-ink-muted)]">
            {t('narrowUnblocks', { count: question.schemesUnblocked })}
          </p>
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isMatching}
          onClick={show}
          className="min-h-12 flex-1 rounded-xl bg-[var(--color-brand)] px-5 text-base font-semibold text-[var(--color-brand-on)] disabled:opacity-60"
        >
          {t('narrowSkipAll')}
        </button>

        {!finished && question && (
          <button
            type="button"
            onClick={() =>
              setSkipped((current) => new Set(current).add(question.field))
            }
            className="min-h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base transition-colors hover:border-[var(--color-border-strong)]"
          >
            {t('narrowSkip')}
          </button>
        )}
      </div>
    </section>
  );
}
