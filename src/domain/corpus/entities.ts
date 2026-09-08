/**
 * HTML character references in scraped prose, decoded before anything reads
 * numbers out of it.
 *
 * myscheme returns eligibility text with references intact, and frequently
 * double-escaped -- an apostrophe arrives as `&#39;` or as `&amp;#39;`. That is
 * not a cosmetic problem. `&#39;` contains the digits 3 and 9, the income
 * builders take the first number in the bullet, and so
 *
 *     "The applicant&#39;s family annual income should not exceed ₹2,00,000"
 *
 * was stored as `annualIncome <= 39`. Twenty-five schemes carried an income
 * ceiling of ₹39 a year. Nobody is under it, so every one of those schemes
 * failed every applicant who reached it -- the exact harm named in the first
 * paragraph of CLAUDE.md, on scholarship and pension schemes for low-income
 * families.
 *
 * Grounding could not catch it, because "39" genuinely appears in the prose.
 * That is the same blind spot as audit finding F1: the number was extracted
 * correctly and it was never the number the sentence was about.
 *
 * Stored prose is left exactly as scraped (invariant 4) -- decoding happens on
 * the way into the parser, so `pnpm db:renormalize` repairs the corpus without
 * a re-scrape and the audit trail keeps the bytes the government served.
 */

/** The named references this corpus actually contains. */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

const REFERENCE = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]*));/gi;

/**
 * Each pass peels one layer of escaping, so `&amp;amp;#39;` needs three. The
 * cap only exists so that malformed input cannot spin; real prose settles in
 * one or two.
 */
const MAX_PASSES = 6;

/** Highest code point Unicode defines. Anything above it is malformed. */
const MAX_CODE_POINT = 0x10ffff;

function fromCodePoint(raw: string, radix: number): string | null {
  const code = Number.parseInt(raw, radix);
  if (!Number.isFinite(code) || code < 1 || code > MAX_CODE_POINT) return null;
  return String.fromCodePoint(code);
}

/**
 * Decodes every reference it recognises. An unrecognised one is left exactly as
 * written rather than guessed at -- the same principle as a WILDCARD clause.
 */
export function decodeEntities(text: string): string {
  let current = text;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const next = current.replace(REFERENCE, (match, hex, decimal, name) => {
      if (typeof hex === 'string') return fromCodePoint(hex, 16) ?? match;
      if (typeof decimal === 'string') return fromCodePoint(decimal, 10) ?? match;
      if (typeof name === 'string') return NAMED[name.toLowerCase()] ?? match;
      return match;
    });

    if (next === current) return current;
    current = next;
  }

  return current;
}
