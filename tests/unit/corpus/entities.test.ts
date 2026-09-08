import { describe, expect, it } from 'vitest';
import { decodeEntities } from '@/domain/corpus/entities';

/**
 * myscheme's eligibility prose arrives with HTML character references intact,
 * and sometimes double-escaped: an apostrophe reaches us as `&#39;` or as
 * `&amp;#39;`.
 *
 * Left alone this is not a display nuisance, it is a correctness failure.
 * `&#39;` contains the digits 3 and 9, and the income builders take the first
 * number in the bullet -- so "The applicant&#39;s family annual income should
 * not exceed ₹2,00,000" was stored as `annualIncome <= 39`. Twenty-five
 * schemes carried a ceiling of ₹39 a year, which nobody is under, so every one
 * of them failed every applicant. Grounding could not catch it because "39"
 * genuinely appears in the text (audit finding F8, docs/AUDIT.md).
 */
describe('decodeEntities', () => {
  it('decodes a numeric character reference', () => {
    expect(decodeEntities('The applicant&#39;s income')).toBe("The applicant's income");
  });

  it('decodes a double-escaped reference, which is how most of them arrive', () => {
    expect(decodeEntities('Your family&amp;#39;s income')).toBe("Your family's income");
  });

  it('decodes a hexadecimal reference', () => {
    expect(decodeEntities('the applicant&#x27;s age')).toBe("the applicant's age");
  });

  it('decodes the rupee sign, so a currency marker survives to be read', () => {
    expect(decodeEntities('income up to &#8377;2,00,000')).toBe('income up to ₹2,00,000');
  });

  it('decodes the named references this corpus actually contains', () => {
    expect(decodeEntities('&gt; ***For Registration:***')).toBe('> ***For Registration:***');
    expect(decodeEntities('EPF&amp;NPS')).toBe('EPF&NPS');
    expect(decodeEntities('a&nbsp;resident')).toBe('a resident');
    expect(decodeEntities('the &quot;applicant&quot;')).toBe('the "applicant"');
    expect(decodeEntities('won&rsquo;t be eligible')).toBe('won’t be eligible');
  });

  it('leaves prose containing no references untouched', () => {
    const prose = 'The applicant should be between 18 and 60 years.';
    expect(decodeEntities(prose)).toBe(prose);
  });

  it('leaves a bare ampersand alone', () => {
    expect(decodeEntities('Health & Family Welfare')).toBe('Health & Family Welfare');
  });

  it('leaves an unknown reference alone rather than guessing at it', () => {
    expect(decodeEntities('a &notarealentity; here')).toBe('a &notarealentity; here');
  });

  it('terminates on a deeply nested escape instead of looping', () => {
    expect(decodeEntities('&amp;amp;amp;#39;')).toBe("'");
  });
});
