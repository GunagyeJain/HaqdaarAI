import { describe, expect, it } from 'vitest';
import { extractCurrencyAmounts, extractNumbers } from '@/domain/corpus/numerals';

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

/**
 * Audit finding F8 (docs/AUDIT.md). These are the exact sentences from the
 * corpus, not invented ones -- each produced an income ceiling that failed
 * every applicant the scheme was written for.
 */
describe('extractNumbers, on prose carrying HTML character references', () => {
  it('does not read 39 out of an escaped apostrophe', () => {
    const prose =
      'The applicant&#39;s family annual income should not exceed ₹2,00,000/- from all sources.';

    expect(extractNumbers(prose)).toEqual([200000]);
  });

  it('does not read 39 out of a double-escaped apostrophe', () => {
    const prose = 'Your family&amp;#39;s monthly income cannot be more than ₹2,000/-.';

    expect(extractNumbers(prose)).toEqual([2000]);
  });

  it('reads a rupee sign that arrives as a reference', () => {
    expect(extractNumbers('income up to &#8377;2,50,000')).toEqual([250000]);
  });

  it('is unaffected by references carrying no digits', () => {
    expect(extractNumbers('aged between 18 &amp; 40 years')).toEqual([18, 40]);
  });
});

/**
 * An income ceiling is written with money in it. Audit finding F8 collected
 * three sentences where the first number in the bullet was an academic year, a
 * subsidy percentage, or a digit stranded by a typo -- and each became the
 * scheme's income limit, failing everyone.
 *
 * So the income builders ask for amounts rather than for numbers. A sentence
 * that states no amount yields nothing, and the bullet becomes UNKNOWN, which
 * is the honest answer (invariant 6) and never a wrong FAIL.
 */
describe('extractCurrencyAmounts', () => {
  it('accepts a rupee sign', () => {
    expect(extractCurrencyAmounts('income up to ₹2,00,000')).toEqual([200000]);
  });

  it('accepts Rs, with or without the point', () => {
    expect(extractCurrencyAmounts('not more than Rs. 60,000')).toEqual([60000]);
    expect(extractCurrencyAmounts('not more than Rs 60,000')).toEqual([60000]);
  });

  it('accepts a scale word as an anchor of its own', () => {
    expect(extractCurrencyAmounts('family income less than 2.5 lakh')).toEqual([250000]);
    expect(extractCurrencyAmounts('a turnover below 1 crore')).toEqual([10000000]);
  });

  it('tolerates a typographic space inside the digit grouping', () => {
    const prose = 'Income of parents/guardians should not exceed ₹2, 00,000/- per annum';

    expect(extractCurrencyAmounts(prose)).toEqual([200000]);
  });

  it('accepts a space between the symbol and the digits, which is how the corpus writes it', () => {
    expect(extractCurrencyAmounts('should not exceed ₹ 1,00,000/- per annum')).toEqual([100000]);
    expect(extractCurrencyAmounts('must not exceed ₹ 20,00,000.')).toEqual([2000000]);
  });

  it('reads a spaced symbol and a broken grouping together', () => {
    const prose = 'Applicant family income should not exceed ₹ 6, 500/- per month';

    expect(extractCurrencyAmounts(prose)).toEqual([6500]);
  });

  it('rejects a markdown note label', () => {
    expect(extractCurrencyAmounts('**NOTE 4:** The revised income ceilings account for CPI.')).toEqual([]);
  });

  it('rejects a calendar year', () => {
    const prose = 'All families whose second girl child is born on or before 21st January 2015, will receive a grant irrespective of their income.';

    expect(extractCurrencyAmounts(prose)).toEqual([]);
  });

  it('rejects an academic year, which is not an amount', () => {
    const prose =
      'From the academic year 1980-81, employed students whose income combined with the ' +
      'income of their parents does not exceed the maximum prescribed income ceiling.';

    expect(extractCurrencyAmounts(prose)).toEqual([]);
  });

  it('rejects a percentage, which is not an amount', () => {
    const prose =
      'For the 50% Subsidy Scheme and Margin Money, her annual income must be below ' +
      'the poverty line.';

    expect(extractCurrencyAmounts(prose)).toEqual([]);
  });

  it('rejects a bare age', () => {
    expect(extractCurrencyAmounts('the applicant should be between 18 and 60 years')).toEqual([]);
  });

  it('reads an amount through an escaped rupee sign', () => {
    expect(extractCurrencyAmounts('income up to &#8377;2,50,000')).toEqual([250000]);
  });
});

describe('extractNumbers, on digit grouping broken by a typo', () => {
  it('reads a currency amount across the stray space', () => {
    expect(extractNumbers('should not exceed ₹2, 00,000/- per annum')).toEqual([200000]);
  });

  it('still keeps a plain comma-separated list apart', () => {
    expect(extractNumbers('applicants aged 18, 20 and 25 years')).toEqual([18, 20, 25]);
  });
});
