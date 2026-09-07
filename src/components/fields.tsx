'use client';

import { useTranslations } from 'next-intl';
import type { ProfileField } from '@/domain/rules/types';

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
  'min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-base';

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
        'rounded-xl p-3 transition-colors ' +
        (highlighted
          ? 'bg-[color-mix(in_oklch,var(--color-brand)_10%,transparent)] ring-2 ring-[var(--color-brand)]'
          : '')
      }
    >
      <label htmlFor={`input-${field}`} className="mb-1.5 block text-sm font-medium">
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
                'min-h-11 rounded-lg border px-4 py-2 text-base transition-colors ' +
                (selected
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]')
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
