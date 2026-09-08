/**
 * Numeric surface forms in Indian eligibility prose.
 *
 * The same figure is written many ways -- 250000, 2,50,000, ₹2.5 lakh -- and
 * prose grounding (docs/SCRAPER.md) has to recognise all of them. Failing to
 * recognise one does not produce a wrong rule; it discards a correct rule as
 * ungrounded, which costs a citizen a scheme they qualify for. So the parser
 * errs toward recognising more forms, and grounding stays an exact-value check.
 *
 * `extractNumbers` is that permissive reading, and grounding is its caller.
 * `extractCurrencyAmounts` is the strict one, for callers deciding what a
 * money figure IS rather than whether one is present -- see audit finding F8.
 */

import { decodeEntities } from './entities';

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
 * Two branches, and the split is the point.
 *
 * A currency marker says the digits after it belong together, so a stray space
 * inside the grouping can be absorbed: the corpus contains "₹2, 00,000/- per
 * annum", which read as ₹2 and set that scheme's income ceiling to two rupees.
 *
 * Bare digits get no such licence, because absorbing a space there would merge
 * "aged 18, 20 and 25" into one number. `Rs` and `INR` are anchored on a word
 * boundary so that the "rs" inside "years" cannot introduce an amount.
 *
 * A bare currency symbol with no digits deliberately does not match.
 */
const NUMBER_PATTERN = new RegExp(
  String.raw`(?:(₹\s*|\bRs\.?\s*|\bINR\s*)(\d+(?:,\s?\d+)*(?:\.\d+)?)` +
    String.raw`|(\d[\d,]*(?:\.\d+)?))` +
    String.raw`\s*(thousand|lakhs?|lacs?|crores?)?\b`,
  'gi',
);

interface Figure {
  value: number;
  /** Carries a currency marker or a scale word, so it is a sum of money. */
  isAmount: boolean;
}

function* scan(prose: string): Generator<Figure> {
  for (const match of decodeEntities(prose).matchAll(NUMBER_PATTERN)) {
    const digits = match[2] ?? match[3];
    if (digits === undefined) continue;

    const base = Number.parseFloat(digits.replace(/[,\s]/g, ''));
    if (!Number.isFinite(base)) continue;

    const scaleWord = match[4]?.toLowerCase();
    const value = scaleWord ? base * (SCALES[scaleWord] ?? 1) : base;

    yield { value, isAmount: match[1] !== undefined || scaleWord !== undefined };
  }
}

function collect(figures: Generator<Figure>, keep: (figure: Figure) => boolean): number[] {
  const found: number[] = [];
  const seen = new Set<number>();

  for (const figure of figures) {
    if (!keep(figure)) continue;
    if (seen.has(figure.value)) continue;
    seen.add(figure.value);
    found.push(figure.value);
  }

  return found;
}

/**
 * Every numeric value appearing in `prose`, normalised to a plain number,
 * de-duplicated, in order of first appearance.
 */
export function extractNumbers(prose: string): number[] {
  return collect(scan(prose), () => true);
}

/**
 * Only the figures written as sums of money -- carrying ₹, Rs, INR, or a scale
 * word such as lakh.
 *
 * An income ceiling is written with money in it. Taking the first number in the
 * bullet instead read an academic year ("From the academic year 1980-81") and a
 * subsidy percentage ("For the 50% Subsidy Scheme") as income limits, in
 * sentences that state no limit at all. Both failed every applicant. Asking for
 * an amount yields nothing in such a sentence, so the bullet becomes UNKNOWN --
 * the honest answer, and never a wrong FAIL.
 */
export function extractCurrencyAmounts(prose: string): number[] {
  return collect(scan(prose), (figure) => figure.isAmount);
}
