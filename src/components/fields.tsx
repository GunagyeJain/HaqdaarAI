'use client';

import { useTranslations } from 'next-intl';
import {
  CATEGORIES,
  EDUCATION_LEVELS,
  FIELD_KINDS,
  GENDERS,
  MARITAL_STATUSES,
  OCCUPATIONS,
  RESIDENCES,
  STATE_CODES,
  type ProfileField,
} from '@/domain/rules/types';
import { STATE_LABELS } from '@/lib/state-labels';

/**
 * Form controls.
 *
 * Every control is optional and every one can be returned to "not answered" —
 * unanswered is a meaningful state that produces UNKNOWN, not a validation
 * error to be nagged about.
 *
 * Sizing targets a mid-range Android phone held in one hand: 44px minimum
 * touch targets, and select/inputs large enough to read in sunlight.
 */

const controlClass =
  'min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3.5 py-2.5 text-base transition-colors hover:border-[var(--color-border-strong)]';

export function FieldShell({
  field,
  label,
  highlighted,
  children,
}: {
  field: ProfileField;
  label: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`field-${field}`}
      className={
        'rounded-xl px-3 py-2.5 transition-colors ' +
        (highlighted
          ? 'bg-[var(--color-brand-tint)] ring-2 ring-[var(--color-brand)]'
          : '')
      }
    >
      <label htmlFor={`input-${field}`} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SelectField({
  field,
  label,
  value,
  options,
  highlighted,
  onChange,
}: {
  field: ProfileField;
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  highlighted?: boolean;
  onChange: (value: string | undefined) => void;
}) {
  const t = useTranslations('profile');

  return (
    <FieldShell field={field} label={label} highlighted={highlighted}>
      <select
        id={`input-${field}`}
        className={controlClass}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{t('notAnswered')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function NumberField({
  field,
  label,
  value,
  min,
  max,
  highlighted,
  onChange,
}: {
  field: ProfileField;
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  highlighted?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  const t = useTranslations('profile');

  return (
    <FieldShell field={field} label={label} highlighted={highlighted}>
      <input
        id={`input-${field}`}
        type="number"
        inputMode="numeric"
        className={controlClass}
        placeholder={t('notAnswered')}
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') return onChange(undefined);
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
    </FieldShell>
  );
}

/**
 * Three-state: yes / no / not answered.
 *
 * A plain checkbox cannot express "not answered", and conflating unanswered
 * with "no" is exactly the coercion invariant 6 forbids — it would silently
 * disqualify someone from a BPL or disability scheme they never answered about.
 */
export function BooleanField({
  field,
  label,
  value,
  highlighted,
  onChange,
}: {
  field: ProfileField;
  label: string;
  value: boolean | undefined;
  highlighted?: boolean;
  onChange: (value: boolean | undefined) => void;
}) {
  const t = useTranslations('profile');

  const choices: Array<{ key: string; label: string; next: boolean | undefined }> = [
    { key: 'yes', label: t('yes'), next: true },
    { key: 'no', label: t('no'), next: false },
    { key: 'unset', label: t('notAnswered'), next: undefined },
  ];

  const selectedKey = value === true ? 'yes' : value === false ? 'no' : 'unset';

  return (
    <FieldShell field={field} label={label} highlighted={highlighted}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = selectedKey === choice.key;
          return (
            <button
              key={choice.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(choice.next)}
              className={
                'min-h-12 rounded-xl border px-4 py-2 text-base transition-colors ' + (
                  // A DELIBERATE ASYMMETRY. "Not answered" is the default for
                  // every field, so filling it with the accent colour made the
                  // absence of an answer the loudest thing on the page and left
                  // a finished form looking identical to an untouched one.
                  //
                  // UNKNOWN is still a first-class verdict (invariant 6) and is
                  // still plainly selectable and plainly selected. It is just not
                  // celebrated. The accent is reserved for what the citizen told
                  // us.

                  // The fill is a token rather than surface-sunken because the
                  // direction has to flip with the theme. Inset reads as chosen on
                  // cream; on a near-black ground it is a hole, and this chip sat
                  // BENEATH the page it was drawn on until it was measured.
                  selected && choice.key !== 'unset'
                    ? 'border-[var(--color-brand)] bg-[var(--color-brand)] font-semibold text-[var(--color-brand-on)]'
                    : selected
                      ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-selected)] font-semibold'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)]'
                )
              }
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </FieldShell>
  );
}

/**
 * Sane limits per numeric field.
 *
 * These lived inline on the old flat form and would have been silently dropped
 * when it became a loop over steps. They belong beside the control anyway, so
 * the voice confirmation gate gets them too -- it shares this component, which
 * is what makes invariant 3 literally true rather than approximately true.
 */
const FIELD_BOUNDS: Partial<Record<ProfileField, { min?: number; max?: number }>> = {
  age: { min: 0, max: 120 },
  familySize: { min: 1, max: 50 },
  annualIncome: { min: 0 },
  landHoldingHectares: { min: 0 },
  disabilityPercentage: { min: 0, max: 100 },
};

/**
 * Renders the correct control for any profile field.
 *
 * Shared by the typed form and the voice confirmation gate, so invariant 3 —
 * "extracted fields land in the same editable boxes the typed path uses" — is
 * literally true rather than approximately true.
 */
export function ProfileFieldControl({
  field,
  value,
  highlighted,
  onChange,
}: {
  field: ProfileField;
  value: unknown;
  highlighted?: boolean;
  onChange: (value: unknown) => void;
}) {
  const t = useTranslations('profile');
  const label = (t as unknown as (key: string) => string)(`field.${field}`);
  const option = (group: string, key: string) =>
    (t as unknown as (key: string) => string)(`option.${group}.${key}`);

  const enumOptions: Partial<Record<ProfileField, { group: string; values: readonly string[] }>> = {
    gender: { group: 'gender', values: GENDERS },
    residence: { group: 'residence', values: RESIDENCES },
    category: { group: 'category', values: CATEGORIES },
    occupation: { group: 'occupation', values: OCCUPATIONS },
    education: { group: 'education', values: EDUCATION_LEVELS },
    maritalStatus: { group: 'maritalStatus', values: MARITAL_STATUSES },
  };

  if (field === 'state') {
    return (
      <SelectField
        field={field}
        label={label}
        value={typeof value === 'string' ? value : undefined}
        highlighted={highlighted}
        options={STATE_CODES.map((code) => ({ value: code, label: STATE_LABELS[code] }))}
        onChange={onChange}
      />
    );
  }

  const enumSpec = enumOptions[field];
  if (enumSpec) {
    return (
      <SelectField
        field={field}
        label={label}
        value={typeof value === 'string' ? value : undefined}
        highlighted={highlighted}
        options={enumSpec.values.map((v) => ({ value: v, label: option(enumSpec.group, v) }))}
        onChange={onChange}
      />
    );
  }

  if (FIELD_KINDS[field] === 'boolean') {
    return (
      <BooleanField
        field={field}
        label={label}
        value={typeof value === 'boolean' ? value : undefined}
        highlighted={highlighted}
        onChange={onChange}
      />
    );
  }

  if (FIELD_KINDS[field] === 'number') {
    const bounds = FIELD_BOUNDS[field];
    return (
      <NumberField
        field={field}
        label={label}
        value={typeof value === 'number' ? value : undefined}
        min={bounds?.min}
        max={bounds?.max}
        highlighted={highlighted}
        onChange={onChange}
      />
    );
  }

  return (
    <FieldShell field={field} label={label} highlighted={highlighted}>
      <input
        id={`input-${field}`}
        type="text"
        className={controlClass}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    </FieldShell>
  );
}
