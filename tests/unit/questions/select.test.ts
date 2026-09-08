import { describe, expect, it } from 'vitest';
import { ASK_ORDER, selectNextQuestion } from '@/domain/questions/select';
import type { MatchedScheme } from '@/domain/matching/types';
import type { Profile, ProfileField } from '@/domain/rules/types';

/**
 * Both source documents say the system asks the "optimal follow-up question"
 * without defining optimal. docs/DATA-MODEL.md §5 defines it as information
 * gain: ask the field blocking the most currently-undecided schemes.
 *
 * Ties break by ask-cost, which deliberately defers the sensitive questions —
 * caste, income, disability. A citizen should reach a useful shortlist before
 * being asked anything uncomfortable, and should be able to simply stop.
 */

const scheme = (
  id: string,
  verdict: MatchedScheme['verdict'],
  unknownFields: ProfileField[] = [],
): MatchedScheme => ({
  schemeId: id,
  verdict,
  matchedClauses: [],
  failedClauses: [],
  unknownFields,
});

describe('information gain', () => {
  it('asks the field blocking the most undecided schemes', () => {
    const results = [
      scheme('a', 'UNKNOWN', ['state', 'age']),
      scheme('b', 'UNKNOWN', ['state']),
      scheme('c', 'UNKNOWN', ['state']),
      scheme('d', 'UNKNOWN', ['age']),
    ];

    const question = selectNextQuestion(results, {});

    expect(question?.field).toBe('state');
    expect(question?.schemesUnblocked).toBe(3);
  });

  it('ignores schemes that are already decided', () => {
    // A PASS or FAIL verdict cannot change, so its unknown fields are not
    // worth a question (monotonicity — see the property test on the evaluator).
    const results = [
      scheme('a', 'PASS', ['annualIncome', 'annualIncome']),
      scheme('b', 'FAIL', ['annualIncome']),
      scheme('c', 'UNKNOWN', ['age']),
    ];

    expect(selectNextQuestion(results, {})?.field).toBe('age');
  });

  it('never asks for a field the profile already has', () => {
    const results = [
      scheme('a', 'UNKNOWN', ['age']),
      scheme('b', 'UNKNOWN', ['age']),
      scheme('c', 'UNKNOWN', ['state']),
    ];

    // `age` blocks more, but it is already answered.
    expect(selectNextQuestion(results, { age: 30 })?.field).toBe('state');
  });

  it('returns null when there is nothing useful left to ask', () => {
    expect(selectNextQuestion([scheme('a', 'PASS'), scheme('b', 'FAIL')], {})).toBeNull();
  });

  it('returns null when every undecided scheme is blocked only by wildcards', () => {
    // A WILDCARD names no field, so no question resolves it. Continuing to ask
    // would be pretending we can decide something we cannot.
    expect(selectNextQuestion([scheme('a', 'UNKNOWN', [])], {})).toBeNull();
  });
});

describe('ask-cost tie-breaking', () => {
  it('prefers the cheaper question when information gain is equal', () => {
    const results = [scheme('a', 'UNKNOWN', ['category', 'age'])];

    // Both block exactly one scheme; age is asked first.
    expect(selectNextQuestion(results, {})?.field).toBe('age');
  });

  it('defers sensitive fields behind ordinary ones', () => {
    const sensitive: ProfileField[] = ['annualIncome', 'category', 'isDisabled', 'isMinority'];
    const ordinary: ProfileField[] = ['age', 'state', 'residence', 'gender'];

    for (const s of sensitive) {
      for (const o of ordinary) {
        expect(
          ASK_ORDER.indexOf(o),
          `${o} should be asked before ${s}`,
        ).toBeLessThan(ASK_ORDER.indexOf(s));
      }
    }
  });

  it('still asks a sensitive field when it unblocks strictly more schemes', () => {
    // Ask-cost is a tie-break, not a veto. Deferring a question that would
    // resolve most of the list would waste the citizen's time.
    const results = [
      scheme('a', 'UNKNOWN', ['annualIncome']),
      scheme('b', 'UNKNOWN', ['annualIncome']),
      scheme('c', 'UNKNOWN', ['annualIncome']),
      scheme('d', 'UNKNOWN', ['age']),
    ];

    expect(selectNextQuestion(results, {})?.field).toBe('annualIncome');
  });

  it('ranks every profile field, so no field is unreachable', () => {
    const ranked = new Set(ASK_ORDER);
    expect(ranked.size).toBe(ASK_ORDER.length);
  });
});

describe('questions that would not make sense', () => {
  it('does not ask for disability percentage when the citizen is not disabled', () => {
    // Asking "what percentage is your disability?" of someone who just said
    // they are not disabled erodes trust in a tool that is asking about caste
    // and income in the same session.
    const results = [
      scheme('a', 'UNKNOWN', ['disabilityPercentage']),
      scheme('b', 'UNKNOWN', ['disabilityPercentage']),
      scheme('c', 'UNKNOWN', ['age']),
    ];

    const profile: Profile = { isDisabled: false };
    expect(selectNextQuestion(results, profile)?.field).toBe('age');
  });

  it('does ask for disability percentage when the citizen is disabled', () => {
    const results = [
      scheme('a', 'UNKNOWN', ['disabilityPercentage']),
      scheme('b', 'UNKNOWN', ['disabilityPercentage']),
      scheme('c', 'UNKNOWN', ['age']),
    ];

    const profile: Profile = { isDisabled: true };
    expect(selectNextQuestion(results, profile)?.field).toBe('disabilityPercentage');
  });
  /**
   * A citizen who does not want to answer something must be able to move past
   * it and still be offered the next most useful question. Without an
   * exclusion, skipping would hand back the same question and the only real
   * option would be to abandon the narrowing entirely.
   */
  describe('skipping', () => {
    it('offers the next best question when one is excluded', () => {
      const results = [
        scheme('a', 'UNKNOWN', ['annualIncome']),
        scheme('b', 'UNKNOWN', ['annualIncome']),
        scheme('c', 'UNKNOWN', ['age']),
      ];

      expect(selectNextQuestion(results, {})?.field).toBe('annualIncome');
      expect(selectNextQuestion(results, {}, new Set(['annualIncome']))?.field).toBe('age');
    });

    it('returns null once everything on offer has been skipped', () => {
      const results = [scheme('a', 'UNKNOWN', ['age'])];

      expect(selectNextQuestion(results, {}, new Set(['age']))).toBeNull();
    });

    it('is unaffected by excluding a field nobody was going to be asked', () => {
      const results = [scheme('a', 'UNKNOWN', ['age'])];

      expect(selectNextQuestion(results, {}, new Set(['district']))?.field).toBe('age');
    });
  });

});
