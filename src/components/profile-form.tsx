'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import type { ProfileField } from '@/domain/rules/types';
import { useRouter } from '@/i18n/navigation';
import { useProfile } from '@/lib/profile-state';
import { LandField, ProfileFieldControl } from './fields';
import { clampStep, FORM_STEPS, TOTAL_STEPS } from './form-steps';

/**
 * The typed profile form, in five steps.
 *
 * INVARIANT 2: this is the whole product. It works with every AI provider
 * switched off; voice is layered on top and writes into the same state.
 *
 * Sixteen fields in a flat wall is what this replaces. For a reader who does
 * not read confidently that was a page to abandon: no grouping, no sense of
 * progress, and no indication that leaving something blank was allowed.
 *
 * Three things carry the weight here, and none of them is decoration:
 *
 *   - Every field says WHY it is being asked, because "Land you farm
 *     (hectares)" tells someone what to type and not why anyone wants it.
 *   - Every step repeats that a blank is fine. It is literally true -- a blank
 *     produces UNKNOWN and can never produce FAIL (invariant 6) -- and it is
 *     the single most important sentence on the form.
 *   - The step lives in the URL, so the phone's back button moves between steps
 *     instead of leaving the site. No profile value ever goes there.
 */
export function ProfileForm() {
  const t = useTranslations('profile');
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    profile,
    setField,
    clearField,
    reset,
    runMatch,
    isMatching,
    error,
    highlightedField,
    answeredCount,
  } = useProfile();

  // next-intl types message keys as literals; step and field keys are built at
  // runtime, so the lookup is widened here rather than duplicating every key.
  const label = t as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;

  const step = clampStep(searchParams.get('step'));
  const current = FORM_STEPS[step - 1]!;
  const isLastStep = step === TOTAL_STEPS;

  /**
   * Asking someone who has just said they are not disabled what percentage
   * their disability is erodes trust, particularly in a session that also asks
   * about caste and income. Same rule as selectNextQuestion.
   */
  const visibleFields = current.fields.filter(
    (field) => field !== 'disabilityPercentage' || profile.isDisabled === true,
  );

  const change = (field: ProfileField) => (value: unknown) => {
    if (value === undefined) clearField(field);
    else setField(field, value as never);
  };

  /**
   * Stable, because LandField recomputes inside an effect that depends on it.
   * `setField` and `clearField` are themselves stable, so this never changes
   * identity and the effect never loops.
   */
  const setLand = useCallback(
    (hectares: number | undefined) => {
      if (hectares === undefined) clearField('landHoldingHectares');
      else setField('landHoldingHectares', hectares);
    },
    [clearField, setField],
  );

  const goToStep = (next: number) => {
    router.push(`/?step=${next}`);
  };

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        // Navigate only on success, so a failed match leaves the citizen on the
        // form with their answers intact and the error visible beside them.
        void runMatch().then((matched) => {
          if (matched) router.push('/results');
        });
      }}
    >
      <div className="mb-4">
        <p className="text-sm font-medium text-[var(--color-ink-muted)]">
          {label('stepCounter', { step, total: TOTAL_STEPS })}
        </p>

        <span
          aria-hidden="true"
          className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunken)]"
        >
          <span
            className="block h-full rounded-full bg-[var(--color-brand)] transition-[width]"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </span>

        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          {label(`step.${current.id}.title`)}
        </h2>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-[var(--color-ink-muted)]">
          {label(`step.${current.id}.help`)}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {visibleFields.map((field) => (
          <div key={field}>
            {field === 'landHoldingHectares' ? (
              // Asked in the citizen's own unit, and converted only against a
              // meaning they chose. See src/domain/units/land.ts.
              <LandField
                value={profile.landHoldingHectares}
                state={profile.state}
                highlighted={highlightedField === field}
                onChange={setLand}
              />
            ) : (
              <ProfileFieldControl
                field={field}
                value={profile[field]}
                highlighted={highlightedField === field}
                onChange={change(field)}
              />
            )}
            <p className="mt-1 px-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {label(`why.${field}`)}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-5 rounded-xl bg-[var(--color-brand-tint)] px-3.5 py-2.5 text-[0.85rem] leading-snug sm:text-sm">
        {label('blankIsFine')}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-[var(--color-fail)]/10 px-3 py-2 text-sm text-[var(--color-fail-text)]"
        >
          {error}
        </p>
      )}

      {/* The bar floats over the fields as they scroll past. The gradient above
          it says "there is more underneath" rather than slicing whichever field
          happens to be behind it clean in half. */}
      <div className="pointer-events-none sticky bottom-0 -mt-2 h-6 bg-gradient-to-b from-transparent to-[var(--color-surface)]" />
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 bg-[var(--color-surface)] pb-3 pt-1">
        {step > 1 && (
          <button
            type="button"
            onClick={() => goToStep(step - 1)}
            className="min-h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-5 text-base transition-colors hover:border-[var(--color-border-strong)]"
          >
            {label('back')}
          </button>
        )}

        {isLastStep ? (
          <button
            type="submit"
            disabled={isMatching}
            className="min-h-12 flex-1 rounded-xl bg-[var(--color-brand)] px-5 text-base font-semibold text-[var(--color-brand-on)] disabled:opacity-60"
          >
            {isMatching ? t('submitting') : t('submit')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => goToStep(step + 1)}
            className="min-h-12 flex-1 rounded-xl bg-[var(--color-brand)] px-5 text-base font-semibold text-[var(--color-brand-on)]"
          >
            {label('next')}
          </button>
        )}

        {isLastStep && (
          <button
            type="button"
            onClick={reset}
            className="min-h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 text-base transition-colors hover:border-[var(--color-border-strong)]"
          >
            {t('reset')}
          </button>
        )}

        {/* Progress, shown as something filling up rather than a bare count.
            Every field is optional, so this is encouragement, not a demand. */}
        <span className="w-full text-xs text-[var(--color-ink-muted)]">
          {t('answered', { count: answeredCount, total: 16 })}
        </span>
      </div>
    </form>
  );
}
