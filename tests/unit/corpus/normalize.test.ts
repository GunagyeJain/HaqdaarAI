import { describe, expect, it } from 'vitest';
import { normalizeDetail } from '@/domain/corpus/normalize';
import type { RuleNode } from '@/domain/rules/types';
import detailSui from '@tests/fixtures/myscheme/detail-sui.json';
import detailPmsby from '@tests/fixtures/myscheme/detail-pmsby.json';
import detailUs from '@tests/fixtures/myscheme/detail-us.json';

/**
 * Normalization is tested against payloads recorded from the live site rather
 * than against payloads I invented, so the tests fail if myscheme changes shape
 * — which is exactly the signal the scraper needs (docs/SCRAPER.md, Fail loudly).
 */

const leaves = (node: RuleNode): RuleNode[] => {
  if (node.op === 'AND' || node.op === 'OR') return node.clauses.flatMap(leaves);
  if (node.op === 'NOT') return leaves(node.clause);
  return [node];
};

const unwrap = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error(`expected success, got: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
};

describe('normalizeDetail — Stand-Up India (bulleted prose)', () => {
  const result = unwrap(normalizeDetail(detailSui));
  const { scheme, stats } = result;

  it('carries identity and provenance', () => {
    expect(scheme.slug).toBe('sui');
    expect(scheme.name.en).toBe('Stand-Up India');
    expect(scheme.ministry).toBe('Ministry Of Finance');
    expect(scheme.sourceUrl).toBe('https://www.myscheme.gov.in/schemes/sui');
  });

  it('is a central scheme, so no state restriction', () => {
    expect(scheme.state).toBeNull();
  });

  it('stores the eligibility prose verbatim (invariant 4)', () => {
    // Every rule must be auditable against the text it came from.
    expect(scheme.sourceProse).toContain('The age of the applicant must be at least 18 years.');
    expect(scheme.sourceProse).toContain('must not be in default');
  });

  it('recovers the one modellable criterion', () => {
    expect(leaves(scheme.eligibility)).toContainEqual({ field: 'age', op: 'gte', value: 18 });
  });

  it('keeps the 18 bound because it is grounded in the prose', () => {
    expect(stats.ungroundedValues).toEqual([]);
  });

  it('flags the scheme for review and counts wildcards by reason', () => {
    expect(scheme.needsReview).toBe(true);
    expect(stats.wildcardsByReason.ambiguous).toBe(1);
    expect(stats.wildcardsByReason.unmodellable).toBe(2);
    expect(stats.wildcardsByReason.ungrounded).toBe(0);
  });
});

describe('normalizeDetail — PM Suraksha Bima Yojana (unbulleted prose)', () => {
  const { scheme } = unwrap(normalizeDetail(detailPmsby));

  it('never produces a vacuously passing scheme from unparsed prose', () => {
    const clauses = leaves(scheme.eligibility);
    expect(clauses.length).toBeGreaterThan(0);
    expect(clauses.some((c) => c.op === 'WILDCARD')).toBe(true);
  });

  it('still retains the prose for audit', () => {
    expect(scheme.sourceProse).toContain('18 years');
    expect(scheme.sourceProse).toContain('70 years');
  });
});

describe('normalizeDetail — failure behaviour', () => {
  it('rejects a payload whose shape has changed', () => {
    // Silent tolerance here is how a scraper quietly returns garbage.
    const result = normalizeDetail({ data: { slug: 'x' } });
    expect(result.ok).toBe(false);
  });

  it('rejects a payload that is not an object at all', () => {
    expect(normalizeDetail(null).ok).toBe(false);
    expect(normalizeDetail('nonsense').ok).toBe(false);
  });

  it('names the reason it rejected a payload', () => {
    const result = normalizeDetail({ data: { slug: 'x' } });
    expect(result.ok === false && result.error.length).toBeGreaterThan(0);
  });
});

describe('normalizeDetail — state-level schemes', () => {
  const stateScheme = {
    data: {
      slug: 'punjab-test',
      en: {
        basicDetails: {
          schemeName: 'A Punjab Scheme',
          level: { value: 'state', label: 'State' },
          nodalMinistryName: { value: 1, label: 'Department of Punjab' },
          beneficiaryState: [{ value: 'punjab', label: 'Punjab' }],
        },
        schemeContent: { briefDescription: 'A scheme for Punjab residents.' },
        eligibilityCriteria: { eligibilityDescription_md: '- The applicant must be a woman.' },
      },
    },
  };

  it('adds a state restriction from structured data, not from prose', () => {
    // The state comes from myscheme's own facet, so it is high-confidence in a
    // way parsed prose is not.
    const { scheme } = unwrap(normalizeDetail(stateScheme));
    expect(scheme.state).toBe('PB');
    expect(leaves(scheme.eligibility)).toContainEqual({
      field: 'state',
      op: 'in',
      values: ['PB'],
    });
  });

  it('keeps the criteria parsed from prose alongside it', () => {
    const { scheme } = unwrap(normalizeDetail(stateScheme));
    expect(leaves(scheme.eligibility)).toContainEqual({
      field: 'gender',
      op: 'eq',
      value: 'female',
    });
  });

  it('does not invent a state restriction it cannot map', () => {
    const unknown = structuredClone(stateScheme);
    unknown.data.en.basicDetails.beneficiaryState = [{ value: 'atlantis', label: 'Atlantis' }];

    const { scheme } = unwrap(normalizeDetail(unknown));
    expect(scheme.state).toBeNull();
    expect(leaves(scheme.eligibility).some((c) => 'field' in c && c.field === 'state')).toBe(false);
  });
});

describe('normalizeDetail — Udyogini Scheme (real state-level payload)', () => {
  const { scheme } = unwrap(normalizeDetail(detailUs));

  it('reads the state from basicDetails.state', () => {
    // State schemes carry `state`, not `beneficiaryState` — and getting this
    // wrong offers a Karnataka-only scheme to the whole country.
    expect(scheme.state).toBe('KA');
  });

  it('restricts eligibility to that state', () => {
    expect(leaves(scheme.eligibility)).toContainEqual({
      field: 'state',
      op: 'in',
      values: ['KA'],
    });
  });

  it('falls back to the department when there is no nodal ministry', () => {
    // nodalMinistryName is null for state schemes.
    expect(scheme.ministry).toBe('Woman and Child Development Department');
  });

  it('parses numbered markdown bullets', () => {
    expect(leaves(scheme.eligibility)).toContainEqual({
      field: 'gender',
      op: 'eq',
      value: 'female',
    });
  });

  it('does not assert an income cap that the prose waives for some applicants', () => {
    const income = leaves(scheme.eligibility).filter(
      (c) => 'field' in c && c.field === 'annualIncome',
    );
    expect(income).toEqual([]);
  });
});
