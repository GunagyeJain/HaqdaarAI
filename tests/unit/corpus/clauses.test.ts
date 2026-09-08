import { describe, expect, it } from 'vitest';
import { synthesizeClauses, synthesizeRuleTree } from '@/domain/corpus/clauses';
import type { RuleNode } from '@/domain/rules/types';

/**
 * Clause synthesis turns one bullet of eligibility prose into one rule clause.
 *
 * The asymmetry that governs this module: a MISSED clause degrades the scheme
 * to UNKNOWN, which is safe and prompts a question. A WRONG clause silently
 * disqualifies an eligible citizen, which is the exact harm this project exists
 * to prevent. So synthesis is deliberately conservative — it recognises a small
 * set of high-confidence patterns and sends everything else to WILDCARD.
 *
 * Where these tests look pedantically strict about refusing to parse something,
 * that is the point.
 */

/** Single-criterion prose yields exactly one clause. */
const synthesizeClause = (prose: string): RuleNode => {
  const clauses = synthesizeClauses(prose);
  if (clauses.length !== 1) {
    throw new Error(`expected 1 clause, got ${clauses.length}: ${JSON.stringify(clauses)}`);
  }
  return clauses[0]!;
};

const isWildcard = (node: RuleNode, reason?: string) =>
  node.op === 'WILDCARD' && (reason === undefined || node.reason === reason);

describe('age', () => {
  it.each([
    ['The age of the applicant must be at least 18 years.', { field: 'age', op: 'gte', value: 18 }],
    ['Applicant should be minimum 21 years of age.', { field: 'age', op: 'gte', value: 21 }],
    ['The applicant must not be less than 18 years old.', { field: 'age', op: 'gte', value: 18 }],
    ['Age should be below 35 years.', { field: 'age', op: 'lt', value: 35 }],
    ['Applicant must be under 30 years of age.', { field: 'age', op: 'lt', value: 30 }],
    ['Age must not exceed 40 years.', { field: 'age', op: 'lte', value: 40 }],
    ['Maximum age is 45 years.', { field: 'age', op: 'lte', value: 45 }],
    [
      'The applicant should be between 18 and 40 years of age.',
      { field: 'age', op: 'between', min: 18, max: 40 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });

  // "below" is exclusive, "not more than" is inclusive. Conflating them shifts
  // the boundary by a year and wrongly excludes people exactly on it.
  it('distinguishes exclusive from inclusive upper bounds', () => {
    expect(synthesizeClause('Age below 35 years.')).toMatchObject({ op: 'lt' });
    expect(synthesizeClause('Age not more than 35 years.')).toMatchObject({ op: 'lte' });
  });
});

/**
 * MONTHLY INCOME LIMITS (audit finding F1, docs/AUDIT.md).
 *
 * The profile field is annual. A scheme that states a monthly cap therefore
 * has to be converted, and until this was fixed it was not: "monthly income of
 * ₹15,000 or below" became `annualIncome < 15000`, which rejects everyone
 * earning between ₹15,001 and ₹1,80,000 a year — essentially the whole
 * population the scheme exists for.
 *
 * Grounding cannot catch it. "15,000" genuinely appears in the sentence; the
 * number is right and the period is wrong. Found by reading fifteen schemes
 * beside their prose, which is the only thing that could have found it.
 */
describe('income stated per month', () => {
  it.each([
    [
      'The applicant should have a monthly income of ₹15,000/- or below.',
      // `lt` rather than `lte` because the normaliser reads "below" as
      // exclusive. Strictly "₹15,000 or below" includes ₹15,000, so this is a
      // real if minor imprecision — it affects only someone earning the bound
      // exactly. Recorded in docs/AUDIT.md rather than changed here, because
      // the operator question is separate from the annualisation this fixes.
      { field: 'annualIncome', op: 'lt', value: 180000 },
    ],
    [
      'Family income must be less than ₹10,000 per month.',
      { field: 'annualIncome', op: 'lt', value: 120000 },
    ],
    [
      'Income should not exceed Rs. 5,000 p.m.',
      { field: 'annualIncome', op: 'lte', value: 60000 },
    ],
    [
      'Monthly family income up to ₹20,000/-.',
      { field: 'annualIncome', op: 'lte', value: 240000 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });

  it('leaves an annual figure alone', () => {
    // The guard must be the word, not the number. Multiplying an annual
    // figure by twelve would be the same bug pointing the other way.
    expect(
      synthesizeClause('Annual family income should not exceed ₹2,50,000.'),
    ).toEqual({ field: 'annualIncome', op: 'lte', value: 250000 });
  });

  it('leaves an unqualified figure alone', () => {
    // No period stated. Assuming monthly would invent a limit twelve times
    // larger than the government wrote, so the plain reading wins.
    expect(
      synthesizeClause('Income should not exceed ₹1,00,000.'),
    ).toEqual({ field: 'annualIncome', op: 'lte', value: 100000 });
  });
});

/**
 * SLASH ALTERNATIVES (audit finding F2, docs/AUDIT.md).
 *
 * The disjunction guard already declines to assert anything from a sentence
 * offering alternatives, because conjoining alternatives is a false negative.
 * It only recognised the WORD "or", so a slash slipped past it:
 *
 *   "The applicant should be an Ex-serviceman/Widow of an Ex-serviceman."
 *   -> gender eq female
 *
 * which fails every male ex-serviceman — the scheme’s primary beneficiary —
 * on a scheme that plainly names them first.
 *
 * The counter-examples matter as much as the examples. A slash is common in
 * this corpus for things that are not choices at all: "₹15,000/-", markdown
 * link targets, and URLs full of them. Treating those as alternatives would
 * discard good clauses, including the income bound fixed in F1.
 */
/**
 * A RANGE SPELT OUT AS TWO BOUNDS (audit finding F4, docs/AUDIT.md).
 *
 * "not less than 18 years old or more than 50 years of age" states a range.
 * The lower bound matched first and claimed the age field, so the upper bound
 * was never tried and half the constraint vanished — a 60-year-old was told
 * they might qualify for a scheme that stops at 50.
 *
 * Less harmful than a false negative: it shows someone a scheme they will be
 * turned away from rather than hiding one they are entitled to. Still wrong.
 */
/**
 * YEARS OF RESIDENCE ARE NOT YEARS OF AGE (audit finding F5).
 *
 * "a Native/Resident of Puducherry for not less than 5 years" asserted
 * `age >= 5`. Harmless in effect, since almost every applicant is older than
 * five, but it is the wrong field — and the same misreading of a longer
 * duration would not be harmless.
 *
 * The two counter-examples are the whole difficulty. Both mention residence
 * AND a genuine age, and a rule that simply suppressed age near the word
 * "resident" would silently discard a correct clause. So the test is not
 * whether residence is mentioned, but whether the number IS the duration.
 */
describe('residency duration is not age', () => {
  it.each([
    'The applicant should be a Native/Resident of Puducherry for not less than 5 years.',
    'The applicant must be a resident of Delhi for at least 5 years before applying.',
    'Residence of a minimum of 5 years in Delhi before the date of application.',
    'The applicant should have been residing in Haryana for at least 3 years.',
  ])('does not read a duration as an age: %s', (prose) => {
    const clauses = synthesizeClauses(prose);
    expect(clauses.filter((c) => 'field' in c && c.field === 'age')).toEqual([]);
  });

  it('still reads an age stated alongside a residence', () => {
    // The number here is the applicant’s age; "residing" is incidental.
    const clauses = synthesizeClauses(
      'All women of 60 years and above residing in the State of Punjab can apply.',
    );

    expect(clauses).toContainEqual({ field: 'age', op: 'gte', value: 60 });
  });

  it('still reads an age stated as a separate criterion', () => {
    const clauses = synthesizeClauses(
      'The applicant must be a resident of Bihar state and should be at least 25 years.',
    );

    expect(clauses).toContainEqual({ field: 'age', op: 'gte', value: 25 });
  });
});

describe('a range written as two bounds', () => {
  it.each([
    [
      'The applicant age should not be less than 18 years old or more than 50 years of age.',
      { field: 'age', op: 'between', min: 18, max: 50 },
    ],
    [
      'The age should not be less than 18 years and not more than 45 years at the time of marriage.',
      { field: 'age', op: 'between', min: 18, max: 45 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });

  it('still reads a lone lower bound as a lower bound', () => {
    // The paired pattern must not swallow the single-bound case.
    expect(synthesizeClause('The applicant should not be less than 18 years.')).toEqual({
      field: 'age',
      op: 'gte',
      value: 18,
    });
  });

  it('refuses a range whose bounds are inverted', () => {
    // "not less than 50 ... or more than 18" is not a range anyone meant.
    // Emitting between(50, 18) would match nobody and fail everyone.
    const clauses = synthesizeClauses(
      'The age should not be less than 50 years or more than 18 years.',
    );

    expect(clauses.every((c) => 'op' in c && c.op === 'WILDCARD')).toBe(true);
  });
});

describe('alternatives separated by a slash', () => {
  it('declines to assert a gender taken from one branch', () => {
    const clauses = synthesizeClauses(
      'The applicant should be an Ex-serviceman/Widow of an Ex-serviceman.',
    );

    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({ op: 'WILDCARD', reason: 'ambiguous' });
  });

  it('declines when both genders are offered', () => {
    const clauses = synthesizeClauses(
      'The minimum age limit of the beneficiary (male/female) will be 18 years.',
    );

    expect(clauses.every((c) => 'op' in c && c.op === 'WILDCARD')).toBe(true);
  });

  it('does not treat a rupee suffix as an alternative', () => {
    // "₹15,000/-" is a slash, and discarding this clause would undo F1.
    expect(
      synthesizeClauses('The applicant should have a monthly income of ₹15,000/- below.'),
    ).toEqual([{ field: 'annualIncome', op: 'lt', value: 180000 }]);
  });

  it('does not treat a link target as an alternative', () => {
    // Markdown link targets and URLs are full of slashes that mean nothing.
    const clauses = synthesizeClauses(
      'The applicant should be the Widow of an [Ex-serviceman](https://sainik.py.gov.in/definition).',
    );

    expect(clauses).toEqual([{ field: 'gender', op: 'eq', value: 'female' }]);
  });
});

describe('income', () => {
  it.each([
    [
      'Annual family income should not exceed ₹2,50,000.',
      { field: 'annualIncome', op: 'lte', value: 250000 },
    ],
    [
      'Family income must be less than 2.5 lakh per annum.',
      { field: 'annualIncome', op: 'lt', value: 250000 },
    ],
    [
      'Annual income up to Rs. 8,00,000.',
      { field: 'annualIncome', op: 'lte', value: 800000 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });

  it('does not read an unrelated amount as an income cap', () => {
    // A benefit amount is not an eligibility bound. Treating it as one would
    // invent a cap that excludes everyone earning above a grant size.
    expect(isWildcard(synthesizeClause('A subsidy of ₹50,000 is provided.'))).toBe(true);
  });
});

describe('categorical criteria', () => {
  it.each([
    ['The applicant must be a woman.', { field: 'gender', op: 'eq', value: 'female' }],
    ['Only female applicants are eligible.', { field: 'gender', op: 'eq', value: 'female' }],
    [
      'The applicant must belong to SC/ST category.',
      { field: 'category', op: 'in', values: ['sc', 'st'] },
    ],
    [
      'Applicant should belong to the OBC category.',
      { field: 'category', op: 'in', values: ['obc'] },
    ],
    ['The applicant must be from a rural area.', { field: 'residence', op: 'eq', value: 'rural' }],
    ['The family must be Below Poverty Line (BPL).', { field: 'isBPL', op: 'eq', value: true }],
    [
      'The applicant must be a person with disability.',
      { field: 'isDisabled', op: 'eq', value: true },
    ],
    [
      'Disability of 40% or more is required.',
      { field: 'disabilityPercentage', op: 'gte', value: 40 },
    ],
  ])('%s', (prose, expected) => {
    expect(synthesizeClause(prose)).toEqual(expected);
  });
});

describe('refusing to guess', () => {
  it('sends a conditional to WILDCARD rather than parsing its parts', () => {
    // Real prose from the Stand-Up India scheme. It mentions "male" and
    // "SC / ST", but asserts neither unconditionally — a naive matcher would
    // produce a rule that excludes every woman.
    const clause = synthesizeClause('If the applicant is a male, he must be from SC / ST category.');
    expect(isWildcard(clause, 'ambiguous')).toBe(true);
  });

  it.each([
    // Real prose from the Udyogini Scheme. A cap that is waived for some
    // applicants is not a cap. Emitting `annualIncome < 150000` here would
    // wrongly exclude every widowed or disabled woman above that figure.
    'The family income should be less than ₹1,50,000. No limit on family income for widowed or disabled women.',
    'Income limit of ₹2,50,000, except for SC/ST applicants.',
    'The age limit is 35 years, relaxable by 5 years for reserved categories.',
    'Age limit of 30 years is exempted for persons with disabilities.',
    'Unless otherwise specified, the applicant must be 18 years old.',
    'Provided that the applicant has not availed this benefit before.',
    'Preference will be given to deserving candidates.',
    'Subject to the discretion of the district officer.',
  ])('sends vague or qualified prose to WILDCARD: %s', (prose) => {
    expect(isWildcard(synthesizeClause(prose), 'ambiguous')).toBe(true);
  });

  it.each([
    'The applicant must not be in default to any bank or financial institution.',
    'Finance is provided for Greenfield Enterprises.',
    'The applicant must possess a valid Aadhaar card.',
  ])('sends unmodellable prose to WILDCARD: %s', (prose) => {
    expect(isWildcard(synthesizeClause(prose), 'unmodellable')).toBe(true);
  });

  it('always preserves the original prose on a wildcard', () => {
    const prose = 'The applicant must possess a valid Aadhaar card.';
    const clause = synthesizeClause(prose);
    expect(clause.op === 'WILDCARD' && clause.sourceText).toBe(prose);
  });
});

describe('synthesizeRuleTree', () => {
  const markdown = [
    '- Finance is provided for Greenfield Enterprises.',
    '- If the applicant is a male, he must be from SC / ST category.',
    '- The age of the applicant must be at least 18 years.',
    '- The applicant must not be in default to any bank/financial institution.',
  ].join('\n');

  it('produces one clause per bullet, conjoined', () => {
    const tree = synthesizeRuleTree(markdown);
    expect(tree.op).toBe('AND');
    expect(tree.op === 'AND' && tree.clauses).toHaveLength(4);
  });

  it('recovers the one modellable criterion and wildcards the rest', () => {
    const tree = synthesizeRuleTree(markdown);
    const clauses = tree.op === 'AND' ? tree.clauses : [];

    expect(clauses.filter((c) => c.op !== 'WILDCARD')).toEqual([
      { field: 'age', op: 'gte', value: 18 },
    ]);
    expect(clauses.filter((c) => c.op === 'WILDCARD')).toHaveLength(3);
  });

  it('handles an empty or missing eligibility section', () => {
    // No criteria means nothing disqualifies anyone — an empty AND, which is
    // vacuously PASS. That is correct, not a bug.
    expect(synthesizeRuleTree('')).toEqual({ op: 'AND', clauses: [] });
  });

  it('ignores markdown formatting and blank lines', () => {
    const tree = synthesizeRuleTree('\n\n*  The applicant must be a woman.\n\n-   \n');
    expect(tree).toEqual({
      op: 'AND',
      clauses: [{ field: 'gender', op: 'eq', value: 'female' }],
    });
  });
});

describe('prose that is not a bullet list', () => {
  // Real prose from Pradhan Mantri Suraksha Bima Yojana. myscheme does not
  // always use bullets, and this scheme states genuine criteria in one
  // paragraph.
  const pmsby =
    'Individual bank account holders of participating banks aged between 18 years ' +
    '(completed) and 70 years (age nearer birthday) who give their consent to join / ' +
    'enable auto-debit, will be enrolled into the scheme.';

  it('never reduces unparsed criteria to an empty AND', () => {
    // An empty AND is vacuously PASS. Returning one here would tell every
    // citizen they qualify for a scheme whose criteria we simply failed to
    // read — the failure must surface as UNKNOWN, not as a false PASS.
    const tree = synthesizeRuleTree(pmsby);
    expect(tree).not.toEqual({ op: 'AND', clauses: [] });
  });

  it('holds unparsed criteria at UNKNOWN rather than PASS', () => {
    const tree = synthesizeRuleTree(pmsby);
    const clauses = tree.op === 'AND' ? tree.clauses : [];
    expect(clauses.length).toBeGreaterThan(0);
    // At least one clause must be undecidable, so the scheme cannot pass silently.
    expect(clauses.some((c) => c.op === 'WILDCARD')).toBe(true);
  });

  it('still parses recognisable criteria from unbulleted prose', () => {
    const tree = synthesizeRuleTree('The applicant must be at least 18 years of age.');
    const clauses = tree.op === 'AND' ? tree.clauses : [];
    expect(clauses).toContainEqual({ field: 'age', op: 'gte', value: 18 });
  });

  it('splits multi-sentence prose into separate clauses', () => {
    const tree = synthesizeRuleTree(
      'The applicant must be a woman. The applicant must be from a rural area.',
    );
    const clauses = tree.op === 'AND' ? tree.clauses : [];
    expect(clauses).toEqual([
      { field: 'gender', op: 'eq', value: 'female' },
      { field: 'residence', op: 'eq', value: 'rural' },
    ]);
  });
});

describe('several criteria in one sentence', () => {
  // Real prose from a Punjab scheme. Emitting only the gender clause told a
  // 42-year-old woman she qualified for a scheme restricted to women over 60.
  const busScheme =
    'All women of 60 years and above residing in the State of Punjab can avail of the benefits under the scheme.';

  it('recognises "N years and above" as a lower bound', () => {
    expect(synthesizeClauses('The applicant must be 60 years and above.')).toContainEqual({
      field: 'age',
      op: 'gte',
      value: 60,
    });
  });

  it.each([
    '60 years or above',
    '60 years and above',
    '60 years or more',
    '60 years and older',
  ])('recognises "%s"', (phrase) => {
    expect(synthesizeClauses(`The applicant must be ${phrase}.`)).toContainEqual({
      field: 'age',
      op: 'gte',
      value: 60,
    });
  });

  it('captures every criterion in a conjunctive sentence', () => {
    const clauses = synthesizeClauses(busScheme);

    expect(clauses).toContainEqual({ field: 'age', op: 'gte', value: 60 });
    expect(clauses).toContainEqual({ field: 'gender', op: 'eq', value: 'female' });
  });

  it('emits at most one clause per field', () => {
    const clauses = synthesizeClauses(busScheme);
    const fields = clauses.filter((c) => c.op !== 'WILDCARD').map((c) => 'field' in c && c.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('refuses a disjunctive sentence rather than conjoining alternatives', () => {
    // "A or B" conjoined into "A and B" would wrongly exclude someone who
    // satisfies only one — the exact false-negative harm the project exists to
    // prevent. Structure we cannot read is UNKNOWN, not a guess.
    const clauses = synthesizeClauses(
      'The applicant must be a woman or belong to the SC category.',
    );
    expect(clauses).toHaveLength(1);
    expect(clauses[0]?.op).toBe('WILDCARD');
  });

  it('does not mistake a comparison idiom for a disjunction', () => {
    // "or more" and "or above" are comparison idioms, not alternatives.
    expect(synthesizeClauses('Disability of 40% or more is required.')).toEqual([
      { field: 'disabilityPercentage', op: 'gte', value: 40 },
    ]);
  });
});

describe('a list of eligible groups is not a list of requirements', () => {
  /**
   * Audit finding F9, and the most severe open one when it was written.
   *
   * "The applicant belongs to General, SC, ST categories, SHG members, PWD,
   * Women, and Transgender individuals" NAMES the groups a scheme is open to.
   * Read as a conjunction it asserted disabled AND Scheduled Caste AND female
   * simultaneously, so a General-category non-disabled male farmer -- the first
   * words of the sentence -- was failed outright, and ST and Transgender
   * vanished entirely.
   *
   * This is F2's defect arriving through punctuation the earlier guard does not
   * cover: commas and a trailing "and", never the word "or".
   */
  it('declines to assert anything from an enumeration of groups', () => {
    const clauses = synthesizeClauses(
      'The applicant belongs to General, SC, ST categories, SHG members, PWD, ' +
        'Women, and Transgender individuals.',
    );

    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toMatchObject({ op: 'WILDCARD', reason: 'ambiguous' });
  });

  /**
   * THE SCOPING, which is the hard part and the reason this is narrow.
   *
   * A scheme genuinely restricted to Scheduled Caste women is a conjunction and
   * must survive. The difference is not the number of fields asserted, it is
   * the list: an enumeration separated by commas and closed with and/or.
   */
  it('keeps a genuine conjunction that is not a list', () => {
    expect(synthesizeClauses('The applicant should be an SC girl student.')).toEqual([
      { field: 'category', op: 'in', values: ['sc'] },
      { field: 'gender', op: 'eq', value: 'female' },
    ]);
  });

  it('keeps a list that only ever asserts one identity', () => {
    // Commas and an "and", but nothing to pick between: the age is the only
    // thing asserted, so there is no wrong branch to survive.
    expect(
      synthesizeClauses(
        'The applicant should be a resident of Punjab, hold a ration card, ' +
          'and be at least 18 years of age.',
      ),
    ).toEqual([{ field: 'age', op: 'gte', value: 18 }]);
  });

  it('keeps two identities asserted across separate bullets', () => {
    // Separate criteria are separate. The guard is about one sentence listing
    // alternatives, not about a scheme having two requirements.
    const clauses = synthesizeClauses(
      `- The applicant should belong to the Scheduled Caste.
- The applicant should be a woman.`,
    );

    expect(clauses).toEqual([
      { field: 'category', op: 'in', values: ['sc'] },
      { field: 'gender', op: 'eq', value: 'female' },
    ]);
  });
});
