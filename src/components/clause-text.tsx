'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { LeafClause, ProfileField } from '@/domain/rules/types';
import { STATE_LABELS } from '@/lib/state-labels';

/**
 * Renders one eligibility clause as a readable sentence.
 *
 * A result card that only said PASS or FAIL would be asking the citizen to
 * trust it. Naming the criterion in their own language is what makes the
 * verdict checkable against the government's wording shown beside it.
 */

/** Fields whose values are enums with their own translated labels. */
const ENUM_GROUPS: Partial<Record<ProfileField, string>> = {
  gender: 'gender',
  residence: 'residence',
  category: 'category',
  occupation: 'occupation',
  education: 'education',
  maritalStatus: 'maritalStatus',
};

export function useClauseText() {
  const t = useTranslations('results');
  const tProfile = useTranslations('profile');
  const locale = useLocale();

  const formatValue = (field: ProfileField, value: unknown): string => {
    if (typeof value === 'boolean') {
      return value ? tProfile('yes') : tProfile('no');
    }

    if (field === 'state' && typeof value === 'string') {
      return STATE_LABELS[value as keyof typeof STATE_LABELS] ?? value;
    }

    const group = ENUM_GROUPS[field];
    if (group && typeof value === 'string') {
      // Falls back to the raw value if a scraped enum is outside our set.
      try {
        return tProfile(`option.${group}.${value}`);
      } catch {
        return value;
      }
    }

    if (typeof value === 'number') {
      return new Intl.NumberFormat(locale).format(value);
    }

    return String(value);
  };

  return (clause: LeafClause): string => {
    const field = t(`clause.${clause.field}`);

    switch (clause.op) {
      case 'between':
        return `${field} ${t('op.between', {
          min: formatValue(clause.field, clause.min),
          max: formatValue(clause.field, clause.max),
        })}`;
      case 'in':
      case 'not_in':
        return `${field} ${t(`op.${clause.op}`, {
          value: clause.values.map((value) => formatValue(clause.field, value)).join(', '),
        })}`;
      default:
        return `${field} ${t(`op.${clause.op}`, {
          value: formatValue(clause.field, clause.value),
        })}`;
    }
  };
}
