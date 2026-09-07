/**
 * Numeric surface forms in Indian eligibility prose.
 *
 * The same figure is written many ways -- 250000, 2,50,000, ₹2.5 lakh -- and
 * prose grounding (docs/SCRAPER.md) has to recognise all of them. Failing to
 * recognise one does not produce a wrong rule; it discards a correct rule as
 * ungrounded, which costs a citizen a scheme they qualify for. So the parser
 * errs toward recognising more forms, and grounding stays an exact-value check.
 */

const SCALES: Record<string, number> = {
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

/**
 * Matches an optional currency marker, a digit run that may carry Indian (2,2,3)
 * or Western (3,3) grouping, an optional decimal part, and an optional scale word.
 * A bare currency symbol with no digits deliberately does not match.
 */
const NUMBER_PATTERN = new RegExp(
  String.raw`(?:₹|Rs\.?\s*)?` +
    String.raw`(\d[\d,]*(?:\.\d+)?)` +
    String.raw`\s*(thousand|lakhs?|lacs?|crores?)?\b`,
  'gi',
);

/**
 * Every numeric value appearing in `prose`, normalised to a plain number,
 * de-duplicated, in order of first appearance.
 */
export function extractNumbers(prose: string): number[] {
  const found: number[] = [];
  const seen = new Set<number>();

  for (const match of prose.matchAll(NUMBER_PATTERN)) {
    const digits = match[1];
    if (digits === undefined) continue;

    const base = Number.parseFloat(digits.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;

    const scaleWord = match[2]?.toLowerCase();
    const value = scaleWord ? base * (SCALES[scaleWord] ?? 1) : base;

    if (!seen.has(value)) {
      seen.add(value);
      found.push(value);
    }
  }

  return found;
}
