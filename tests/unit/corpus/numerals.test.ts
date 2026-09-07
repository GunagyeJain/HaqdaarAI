import { describe, expect, it } from 'vitest';
import { extractNumbers } from '@/domain/corpus/numerals';

/**
 * Indian eligibility prose writes the same figure many ways. Grounding a
 * scraped bound (docs/SCRAPER.md) means recognising all of them -- otherwise a
 * perfectly correct rule gets discarded as ungrounded, and the citizen loses a
 * scheme they qualify for.
 */

describe('extractNumbers', () => {
  const cases: Array<{ prose: string; expected: number[] }> = [
    // plain
    { prose: 'must be at least 18 years of age', expected: [18] },
    { prose: 'income should not exceed 250000', expected: [250000] },
    { prose: 'between 18 and 40 years', expected: [18, 40] },

    // Indian digit grouping (2,2,3) and Western (3,3)
    { prose: 'annual income up to 2,50,000', expected: [250000] },
    { prose: 'annual income up to 250,000', expected: [250000] },
    { prose: 'a grant of 1,00,000 rupees', expected: [100000] },

    // currency markers
    { prose: 'income below ₹2,50,000 per annum', expected: [250000] },
    { prose: 'a subsidy of Rs. 50,000', expected: [50000] },
    { prose: 'a subsidy of Rs 50,000', expected: [50000] },

    // scale words
    { prose: 'family income less than 2.5 lakh', expected: [250000] },
    { prose: 'family income less than 2.5 lakhs', expected: [250000] },
    { prose: 'family income less than 8 Lakh', expected: [800000] },
    { prose: 'a turnover below 1 crore', expected: [10000000] },
    { prose: 'income up to ₹2.5 lakh per annum', expected: [250000] },

    // percentages and decimals
    { prose: 'disability of 40% or more', expected: [40] },
    { prose: 'landholding under 2.5 hectares', expected: [2.5] },

    // several in one sentence
    {
      prose: 'aged between 18 and 40 with family income below ₹2,50,000',
      expected: [18, 40, 250000],
    },

    // nothing numeric
    { prose: 'the applicant must be a resident of India', expected: [] },
  ];

  for (const { prose, expected } of cases) {
    it(`extracts ${JSON.stringify(expected)} from "${prose}"`, () => {
      expect(extractNumbers(prose)).toEqual(expected);
    });
  }

  it('deduplicates a figure repeated in different surface forms', () => {
    expect(extractNumbers('income of 2,50,000 (two lakh fifty thousand) i.e. ₹250000'))
      .toEqual([250000]);
  });

  it('does not invent a number from a bare currency symbol', () => {
    expect(extractNumbers('the amount in ₹ is decided by the state')).toEqual([]);
  });
});
