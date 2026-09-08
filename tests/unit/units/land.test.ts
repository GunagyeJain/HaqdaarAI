import { describe, expect, it } from 'vitest';
import { bighaVariants, toAcres, toHectares } from '@/domain/units/land';

/**
 * A land figure is not cosmetic. `landHoldingHectares` feeds ceilings such as
 * "under 2 hectares" on small and marginal farmer schemes, so a conversion that
 * comes out too large pushes a farmer over a limit and tells them they do not
 * qualify when they do -- the same harm as audit findings F1 and F8, and from
 * the same cause: a plausible number that was never the right number.
 *
 * So every unit here is either exact by definition or explicitly chosen by the
 * citizen. Nothing is inferred from a state alone.
 */
describe('toHectares', () => {
  it('converts the units that are exact by definition', () => {
    expect(toHectares(1, 'hectare')).toBeCloseTo(1, 10);
    expect(toHectares(1, 'acre')).toBeCloseTo(0.40468564, 8);
    expect(toHectares(10_000, 'square_metre')).toBeCloseTo(1, 10);
    expect(toHectares(43_560, 'square_foot')).toBeCloseTo(0.40468564, 6);
  });

  it('reads zero as zero rather than as absent', () => {
    expect(toHectares(0, 'acre')).toBe(0);
  });

  it('refuses a negative area instead of storing one', () => {
    expect(toHectares(-1, 'acre')).toBeNull();
  });

  it('refuses a value that is not a number', () => {
    expect(toHectares(Number.NaN, 'hectare')).toBeNull();
  });

  it('refuses bigha with no variant, rather than guessing a factor', () => {
    expect(toHectares(2, 'bigha')).toBeNull();
  });

  it('converts bigha only against an explicitly chosen variant', () => {
    const [punjab] = bighaVariants('PB');

    expect(punjab).toBeDefined();
    // Punjab's bigha is 4 kanal, 21,780 sq ft -- half an acre. Two of them is
    // one acre.
    expect(toHectares(2, 'bigha', punjab)).toBeCloseTo(0.40468564, 5);
  });
});

describe('bighaVariants', () => {
  it('offers one variant where the state has a single documented value', () => {
    const bengal = bighaVariants('WB');

    expect(bengal).toHaveLength(1);
    expect(bengal[0]!.squareFeet).toBe(14_400);
  });

  it('offers both where the state runs two systems, rather than picking one', () => {
    const up = bighaVariants('UP');
    expect(up.map((variant) => variant.squareFeet).sort((a, b) => a - b)).toEqual([
      6_806.25, 27_225,
    ]);

    const rajasthan = bighaVariants('RJ');
    expect(rajasthan.map((variant) => variant.squareFeet).sort((a, b) => a - b)).toEqual([
      17_424, 27_225,
    ]);
  });

  it('offers nothing for a state with no documented value, so bigha is not shown', () => {
    expect(bighaVariants('KL')).toEqual([]);
  });

  it('offers nothing when the state is not known yet', () => {
    expect(bighaVariants(undefined)).toEqual([]);
  });

  it('never offers a variant without a usable factor', () => {
    for (const variant of [...bighaVariants('UP'), ...bighaVariants('RJ')]) {
      expect(variant.squareFeet).toBeGreaterThan(0);
      expect(variant.id).not.toBe('');
    }
  });
});

describe('toAcres', () => {
  it('gives back a figure a farmer can sanity-check', () => {
    expect(toAcres(0.40468564)).toBeCloseTo(1, 6);
  });
});
