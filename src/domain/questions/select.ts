import type { MatchedScheme } from '../matching/types';
import type { Profile, ProfileField } from '../rules/types';

/**
 * "Next best question", defined.
 *
 * Both source documents promise an "optimal follow-up question" without saying
 * what optimal means. It means information gain: ask the unanswered field that
 * is blocking the most currently-undecided schemes (docs/DATA-MODEL.md §5).
 */

/**
 * Tie-break order — cheapest and least intrusive first.
 *
 * Sensitive fields (income, poverty status, caste, disability, religion) sit at
 * the end deliberately. A citizen should reach a useful shortlist before being
 * asked anything uncomfortable, and should be free to stop at any point.
 *
 * This is a tie-break, never a veto: a sensitive field that unblocks strictly
 * more schemes is still asked first, because deferring it would waste the
 * citizen's time to no benefit.
 */
export const ASK_ORDER: readonly ProfileField[] = [
  'age',
  'state',
  'residence',
  'gender',
  'occupation',
  'education',
  'maritalStatus',
  'familySize',
  'district',
  'landHoldingHectares',
  'annualIncome',
  'isBPL',
  'category',
  'isDisabled',
  'disabilityPercentage',
  'isMinority',
];

export interface NextQuestion {
  field: ProfileField;
  /** How many currently-undecided schemes answering this would help resolve. */
  schemesUnblocked: number;
}

/**
 * Fields that make no sense to ask given what the citizen has already said.
 *
 * Asking someone who just said they are not disabled what percentage their
 * disability is erodes trust — particularly in a session that also asks about
 * caste and income.
 */
function isMoot(field: ProfileField, profile: Profile): boolean {
  return field === 'disabilityPercentage' && profile.isDisabled === false;
}

export function selectNextQuestion(
  results: readonly MatchedScheme[],
  profile: Profile,
): NextQuestion | null {
  const blocking = new Map<ProfileField, number>();

  for (const result of results) {
    // A decided verdict cannot change (monotonicity), so its unknown fields are
    // not worth a question.
    if (result.verdict !== 'UNKNOWN') continue;

    for (const field of new Set(result.unknownFields)) {
      if (profile[field] !== undefined) continue;
      if (isMoot(field, profile)) continue;

      blocking.set(field, (blocking.get(field) ?? 0) + 1);
    }
  }

  if (blocking.size === 0) return null;

  const rank = (field: ProfileField): number => {
    const index = ASK_ORDER.indexOf(field);
    return index === -1 ? ASK_ORDER.length : index;
  };

  let best: NextQuestion | null = null;
  for (const [field, count] of blocking) {
    if (
      best === null ||
      count > best.schemesUnblocked ||
      (count === best.schemesUnblocked && rank(field) < rank(best.field))
    ) {
      best = { field, schemesUnblocked: count };
    }
  }

  return best;
}
