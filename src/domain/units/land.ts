/**
 * Land area, converted to the hectares the profile stores.
 *
 * THE ASYMMETRY THAT GOVERNS THIS MODULE is the one that governs clause
 * synthesis. `landHoldingHectares` feeds ceilings such as "under 2 hectares" on
 * small and marginal farmer schemes. A conversion that comes out too large
 * pushes a farmer over a limit and tells them they do not qualify when they do.
 * A conversion we decline to make leaves the field blank, which is UNKNOWN,
 * which is safe and prompts a question.
 *
 * So every unit here is either exact by definition or explicitly chosen by the
 * citizen. Nothing is inferred from a state alone.
 */
import type { StateCode } from '../rules/types';

export type LandUnit = 'hectare' | 'acre' | 'square_metre' | 'square_foot' | 'bigha';

/** Offered in this order: the two people actually use first. */
export const LAND_UNITS: readonly LandUnit[] = [
  'acre',
  'bigha',
  'hectare',
  'square_metre',
  'square_foot',
];

/** International acre, exact by definition. */
const ACRE_IN_HECTARES = 0.40468564224;

/** 1 sq ft = 0.09290304 m², exact by definition; 10,000 m² = 1 hectare. */
const SQUARE_FOOT_IN_HECTARES = 0.09290304 / 10_000;

const EXACT: Record<Exclude<LandUnit, 'bigha'>, number> = {
  hectare: 1,
  acre: ACRE_IN_HECTARES,
  square_metre: 0.0001,
  square_foot: SQUARE_FOOT_IN_HECTARES,
};

/**
 * One documented local meaning of "bigha".
 *
 * `id` is a message-key suffix rather than a label, so the choice can be put to
 * the citizen in their own language instead of as a number they have no way to
 * check.
 */
export interface BighaVariant {
  id: string;
  squareFeet: number;
}

/**
 * Bigha is not a unit. It is a family of local customs sharing a name, and the
 * spread between them is wide enough to change a verdict:
 *
 *   - Uttar Pradesh varies 4x against itself, west to east.
 *   - Punjab runs six regional revenue systems.
 *   - Rajasthan's pucca and kaccha differ by 1.6x, settled by local practice
 *     rather than by state law.
 *
 * Wikipedia states it plainly: "There is no 'standard' size of bigha and it
 * varies considerably from place to place." This table is therefore a source of
 * SUGGESTIONS to put to the citizen, never a lookup to apply silently. A state
 * absent from it offers no bigha option at all.
 *
 * Sources:
 *   https://en.wikipedia.org/wiki/Bigha
 *   https://en.wikipedia.org/wiki/Measurement_of_land_in_Punjab
 *   https://www.realtyconsultants.in/tools/area-calculator/punjab-land-measurement-chart
 */
const BIGHA_BY_STATE: Partial<Record<StateCode, readonly BighaVariant[]>> = {
  AS: [{ id: 'standard', squareFeet: 14_400 }],
  BR: [{ id: 'standard', squareFeet: 27_225 }],
  HP: [{ id: 'standard', squareFeet: 8_712 }],
  // 4 kanal at 5,445 sq ft each: half an acre.
  PB: [{ id: 'standard', squareFeet: 21_780 }],
  HR: [{ id: 'standard', squareFeet: 21_780 }],
  MP: [{ id: 'standard', squareFeet: 12_000 }],
  RJ: [
    { id: 'pucca', squareFeet: 27_225 },
    { id: 'kaccha', squareFeet: 17_424 },
  ],
  UP: [
    { id: 'east', squareFeet: 27_225 },
    { id: 'west', squareFeet: 6_806.25 },
  ],
  UK: [
    { id: 'plains', squareFeet: 17_424 },
    { id: 'hills', squareFeet: 6_806.25 },
  ],
  WB: [{ id: 'standard', squareFeet: 14_400 }],
};

/**
 * The documented local meanings of bigha in a state, for putting to the
 * citizen. An empty list means: do not offer bigha at all.
 */
export function bighaVariants(state: StateCode | undefined): readonly BighaVariant[] {
  if (!state) return [];
  return BIGHA_BY_STATE[state] ?? [];
}

/**
 * Null means "we will not assert a number", which leaves the field blank and
 * the verdict UNKNOWN. That is always preferable to a plausible wrong area.
 */
export function toHectares(
  value: number,
  unit: LandUnit,
  variant?: BighaVariant,
): number | null {
  if (!Number.isFinite(value) || value < 0) return null;

  if (unit === 'bigha') {
    if (!variant) return null;
    return value * variant.squareFeet * SQUARE_FOOT_IN_HECTARES;
  }

  return value * EXACT[unit];
}

/**
 * For echoing a converted figure back in a unit people picture more readily.
 * Hectares mean little to someone who measures in bigha; acres mean more.
 */
export function toAcres(hectares: number): number {
  return hectares / ACRE_IN_HECTARES;
}
