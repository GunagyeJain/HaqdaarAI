'use client';

import { useTranslations } from 'next-intl';
import {
  CATEGORIES,
  EDUCATION_LEVELS,
  GENDERS,
  MARITAL_STATUSES,
  OCCUPATIONS,
  RESIDENCES,
  STATE_CODES,
  type Category,
  type Education,
  type Gender,
  type MaritalStatus,
  type Occupation,
  type Residence,
  type StateCode,
} from '@/domain/rules/types';
import { useProfile } from '@/lib/profile-state';
import { STATE_LABELS } from '@/lib/state-labels';
import { BooleanField, NumberField, SelectField } from './fields';

/**
 * The typed profile form.
 *
 * INVARIANT 2: this is the whole product. It works with every AI provider
 * switched off; voice is layered on top of it in Phase 4 and writes into the
 * same state.
 */
export function ProfileForm() {
  const t = useTranslations('profile');
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

  const set = <K extends keyof typeof profile>(field: K) =>
    (value: (typeof profile)[K] | undefined) => {
      if (value === undefined) clearField(field);
      else setField(field, value);
    };

  // next-intl types message keys as literals; enum option keys are built at
  // runtime from the domain enums, so the lookup is widened here rather than
  // duplicating every option key as a literal union.
  const label = t as unknown as (key: string) => string;

  const options = <T extends string>(values: readonly T[], group: string) =>
    values.map((value) => ({
      value,
      label: label(`option.${group}.${value}`),
    }));

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void runMatch();
      }}
    >
      <div className="mb-2">
        <h2 className="text-xl font-semibold tracking-tight">{t('heading')}</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t('intro')}</p>
      </div>

      <div className="grid gap-1 sm:grid-cols-2">
        <NumberField
          field="age"
          label={t('field.age')}
          value={profile.age}
          min={0}
          max={120}
          highlighted={highlightedField === 'age'}
          onChange={set('age')}
        />
        <SelectField
          field="state"
          label={t('field.state')}
          value={profile.state}
          highlighted={highlightedField === 'state'}
          options={STATE_CODES.map((code) => ({ value: code, label: STATE_LABELS[code] }))}
          onChange={(value) => set('state')(value as StateCode | undefined)}
        />
        <SelectField
          field="gender"
          label={t('field.gender')}
          value={profile.gender}
          highlighted={highlightedField === 'gender'}
          options={options(GENDERS, 'gender')}
          onChange={(value) => set('gender')(value as Gender | undefined)}
        />
        <SelectField
          field="residence"
          label={t('field.residence')}
          value={profile.residence}
          highlighted={highlightedField === 'residence'}
          options={options(RESIDENCES, 'residence')}
          onChange={(value) => set('residence')(value as Residence | undefined)}
        />
        <SelectField
          field="occupation"
          label={t('field.occupation')}
          value={profile.occupation}
          highlighted={highlightedField === 'occupation'}
          options={options(OCCUPATIONS, 'occupation')}
          onChange={(value) => set('occupation')(value as Occupation | undefined)}
        />
        <SelectField
          field="education"
          label={t('field.education')}
          value={profile.education}
          highlighted={highlightedField === 'education'}
          options={options(EDUCATION_LEVELS, 'education')}
          onChange={(value) => set('education')(value as Education | undefined)}
        />
        <SelectField
          field="maritalStatus"
          label={t('field.maritalStatus')}
          value={profile.maritalStatus}
          highlighted={highlightedField === 'maritalStatus'}
          options={options(MARITAL_STATUSES, 'maritalStatus')}
          onChange={(value) => set('maritalStatus')(value as MaritalStatus | undefined)}
        />
        <NumberField
          field="familySize"
          label={t('field.familySize')}
          value={profile.familySize}
          min={1}
          max={50}
          highlighted={highlightedField === 'familySize'}
          onChange={set('familySize')}
        />
        <NumberField
          field="landHoldingHectares"
          label={t('field.landHoldingHectares')}
          value={profile.landHoldingHectares}
          min={0}
          highlighted={highlightedField === 'landHoldingHectares'}
          onChange={set('landHoldingHectares')}
        />
        <NumberField
          field="annualIncome"
          label={t('field.annualIncome')}
          value={profile.annualIncome}
          min={0}
          highlighted={highlightedField === 'annualIncome'}
          onChange={set('annualIncome')}
        />
        <SelectField
          field="category"
          label={t('field.category')}
          value={profile.category}
          highlighted={highlightedField === 'category'}
          options={options(CATEGORIES, 'category')}
          onChange={(value) => set('category')(value as Category | undefined)}
        />
      </div>

      <BooleanField
        field="isBPL"
        label={t('field.isBPL')}
        value={profile.isBPL}
        highlighted={highlightedField === 'isBPL'}
        onChange={set('isBPL')}
      />
      <BooleanField
        field="isMinority"
        label={t('field.isMinority')}
        value={profile.isMinority}
        highlighted={highlightedField === 'isMinority'}
        onChange={set('isMinority')}
      />
      <BooleanField
        field="isDisabled"
        label={t('field.isDisabled')}
        value={profile.isDisabled}
        highlighted={highlightedField === 'isDisabled'}
        onChange={set('isDisabled')}
      />

      {/* Only meaningful once disability is confirmed — see selectNextQuestion. */}
      {profile.isDisabled === true && (
        <NumberField
          field="disabilityPercentage"
          label={t('field.disabilityPercentage')}
          value={profile.disabilityPercentage}
          min={0}
          max={100}
          highlighted={highlightedField === 'disabilityPercentage'}
          onChange={set('disabilityPercentage')}
        />
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-[var(--color-fail)]/10 px-3 py-2 text-sm text-[var(--color-fail-text)]">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] py-3">
        <button
          type="submit"
          disabled={isMatching}
          className="min-h-12 flex-1 rounded-xl bg-[var(--color-brand)] px-5 text-base font-semibold text-white disabled:opacity-60"
        >
          {isMatching ? t('submitting') : t('submit')}
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-h-12 rounded-xl border border-[var(--color-border)] px-4 text-base"
        >
          {t('reset')}
        </button>
        <span className="w-full text-xs text-[var(--color-ink-muted)]">
          {t('answered', { count: answeredCount, total: 16 })}
        </span>
      </div>
    </form>
  );
}
