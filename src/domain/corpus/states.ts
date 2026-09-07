import { STATE_CODES, type StateCode } from '../rules/types';

/**
 * myscheme labels states by name; the profile uses ISO-style codes. Mapping is
 * exact and deliberately incomplete-tolerant: a name we do not recognise yields
 * `null` rather than a guess, because a wrong state restriction disqualifies
 * every citizen outside it.
 */
const BY_NAME: Record<string, StateCode> = {
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  assam: 'AS',
  bihar: 'BR',
  chhattisgarh: 'CG',
  chattisgarh: 'CG',
  goa: 'GA',
  gujarat: 'GJ',
  haryana: 'HR',
  'himachal pradesh': 'HP',
  jharkhand: 'JH',
  karnataka: 'KA',
  kerala: 'KL',
  'madhya pradesh': 'MP',
  maharashtra: 'MH',
  manipur: 'MN',
  meghalaya: 'ML',
  mizoram: 'MZ',
  nagaland: 'NL',
  odisha: 'OD',
  orissa: 'OD',
  punjab: 'PB',
  rajasthan: 'RJ',
  sikkim: 'SK',
  'tamil nadu': 'TN',
  telangana: 'TS',
  tripura: 'TR',
  'uttar pradesh': 'UP',
  uttarakhand: 'UK',
  'west bengal': 'WB',

  'andaman and nicobar islands': 'AN',
  chandigarh: 'CH',
  'dadra and nagar haveli and daman and diu': 'DH',
  'dadra and nagar haveli': 'DH',
  'daman and diu': 'DH',
  delhi: 'DL',
  'nct of delhi': 'DL',
  'jammu and kashmir': 'JK',
  ladakh: 'LA',
  lakshadweep: 'LD',
  puducherry: 'PY',
  pondicherry: 'PY',
};

/** Resolves a state name or code to a StateCode, or null when unrecognised. */
export function toStateCode(name: string | null | undefined): StateCode | null {
  if (!name) return null;

  const cleaned = name.trim().toLowerCase();
  if (cleaned.length === 0 || cleaned === 'all') return null;

  const byName = BY_NAME[cleaned];
  if (byName) return byName;

  const upper = name.trim().toUpperCase();
  return (STATE_CODES as readonly string[]).includes(upper) ? (upper as StateCode) : null;
}
