import { describe, expect, it } from 'vitest';
import { partition } from '@/domain/matching/shortlist';
import type { MatchResult, MatchResultItem } from '@/domain/matching/types';

/**
 * ZERO PASS VERDICTS IS CORRECT BEHAVIOUR, and this is the module that stops it
 * reading as failure.
 *
 * Around 60% of corpus clauses are WILDCARD, and a wildcard is UNKNOWN forever,
 * so most schemes structurally cannot reach PASS no matter what a citizen
 * answers. A results page that leads with "you qualify for N" therefore leads
 * with a number that is almost always zero: accurate, and useless.
 *
 * The shortlist is the honest equivalent. Everything we could check has passed,
 * and what remains is for a human to verify -- which is as close to a yes as
 * this engine can get, and is something a citizen can act on.
 */

const item = (over: Partial<MatchResultItem> & { schemeId: string }): MatchResultItem => ({
  verdict: 'UNKNOWN',
  matchedClauses: [],
  failedClauses: [],
  unknownFields: [],
  unmodelledCriteria: [],
  scheme: {
    id: over.schemeId,
    slug: over.schemeId,
    name: over.schemeId,
    summary: '',
    ministry: null,
    state: null,
    sourceProse: '',
    sourceUrl: '',
    needsReview: false,
  },
  ...over,
});

const resultOf = (
  pass: MatchResultItem[],
  unknown: MatchResultItem[],
  fail: MatchResultItem[],
): MatchResult => ({
  pass,
  unknown,
  fail,
  counts: {
    pass: pass.length,
    unknown: unknown.length,
    fail: fail.length,
    total: pass.length + unknown.length + fail.length,
  },
});

describe('partition', () => {
  it('puts a PASS on the shortlist', () => {
    const qualifies = item({ schemeId: 'a', verdict: 'PASS' });

    expect(partition(resultOf([qualifies], [], [])).shortlist).toEqual([qualifies]);
  });

  it('puts an UNKNOWN with nothing left to ask on the shortlist', () => {
    // Nothing more we could ask; only human-checkable criteria remain.
    const onlyHumanChecks = item({
      schemeId: 'b',
      unknownFields: [],
      unmodelledCriteria: ['Must be a registered member.'],
    });

    const { shortlist, needsAnswers } = partition(resultOf([], [onlyHumanChecks], []));

    expect(shortlist).toEqual([onlyHumanChecks]);
    expect(needsAnswers).toEqual([]);
  });

  it('keeps an UNKNOWN we could still resolve out of the shortlist', () => {
    const answerable = item({ schemeId: 'c', unknownFields: ['annualIncome'] });

    const { shortlist, needsAnswers } = partition(resultOf([], [answerable], []));

    expect(shortlist).toEqual([]);
    expect(needsAnswers).toEqual([answerable]);
  });

  it('orders PASS ahead of UNKNOWN on the shortlist', () => {
    const qualifies = item({ schemeId: 'p', verdict: 'PASS' });
    const probable = item({ schemeId: 'u', unknownFields: [] });

    const { shortlist } = partition(resultOf([qualifies], [probable], []));

    expect(shortlist.map((entry) => entry.schemeId)).toEqual(['p', 'u']);
  });

  it('passes FAIL through untouched', () => {
    const no = item({ schemeId: 'f', verdict: 'FAIL' });

    expect(partition(resultOf([], [], [no])).ineligible).toEqual([no]);
  });

  it('loses nothing: every scheme lands in exactly one group', () => {
    const everything = resultOf(
      [item({ schemeId: 'p', verdict: 'PASS' })],
      [item({ schemeId: 'u1', unknownFields: [] }), item({ schemeId: 'u2', unknownFields: ['age'] })],
      [item({ schemeId: 'f', verdict: 'FAIL' })],
    );

    const { shortlist, needsAnswers, ineligible } = partition(everything);
    const ids = [...shortlist, ...needsAnswers, ...ineligible].map((entry) => entry.schemeId);

    expect(ids.sort()).toEqual(['f', 'p', 'u1', 'u2']);
    expect(new Set(ids).size).toBe(4);
  });

  it('copes with an empty result rather than throwing', () => {
    const empty = partition(resultOf([], [], []));

    expect(empty.shortlist).toEqual([]);
    expect(empty.needsAnswers).toEqual([]);
    expect(empty.ineligible).toEqual([]);
  });
});
