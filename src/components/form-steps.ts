import type { ProfileField } from '@/domain/rules/types';

/**
 * The form, grouped.
 *
 * Sixteen fields in a flat wall is the defect this replaces: no grouping, no
 * progressive disclosure, and no sense of progress beyond a count ticking up.
 * For a reader who does not read confidently, that is a page to abandon.
 *
 * The grouping is not arbitrary:
 *
 *   - Easiest first, so the form begins by being answerable and the citizen
 *     learns that blanks are allowed before anything difficult arrives.
 *   - Money questions sit in the middle, after a few harmless ones rather than
 *     on arrival.
 *   - Caste, religion and disability come LAST, framed as things that open
 *     schemes rather than things that gate them, with the privacy promise
 *     repeated inline. This is the same reasoning as ASK_ORDER in the
 *     next-question engine: someone should reach the end of an answerable form
 *     before being asked anything uncomfortable, and should be free to stop.
 *
 * Every field stays optional. A blank produces UNKNOWN and can never produce
 * FAIL, which is invariant 6 and is said out loud on every step.
 */
export interface FormStep {
  /** Message-key suffix for this step's title and help text. */
  id: string;
  fields: readonly ProfileField[];
}

export const FORM_STEPS: readonly FormStep[] = [
  { id: 'about', fields: ['age', 'gender', 'maritalStatus'] },
  { id: 'where', fields: ['state', 'district', 'residence'] },
  { id: 'work', fields: ['occupation', 'education'] },
  { id: 'household', fields: ['familySize', 'annualIncome', 'isBPL', 'landHoldingHectares'] },
  { id: 'more', fields: ['category', 'isMinority', 'isDisabled', 'disabilityPercentage'] },
];

export const TOTAL_STEPS = FORM_STEPS.length;

/** Clamps whatever arrived in the URL to a step that exists. */
export function clampStep(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '1', 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), TOTAL_STEPS);
}
