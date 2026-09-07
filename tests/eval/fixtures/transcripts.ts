import type { Profile } from '@/domain/rules/types';
import type { Locale } from '@/i18n/routing';

/**
 * The extraction golden set (proposal §6.2).
 *
 * `expected` is what the transcript GENUINELY SUPPORTS — not what a model might
 * plausibly infer. That distinction is the whole point: any field returned that
 * is not here is, by definition, invented.
 *
 * The hard cases are deliberate. Code-mixed speech, Indian number words,
 * disfluency and self-correction are what the target user actually produces,
 * and the transcripts that mention nothing at all are the ones that catch a
 * model filling a form because it was asked to fill a form.
 */

export interface GoldenCase {
  id: string;
  locale: Locale;
  transcript: string;
  expected: Profile;
  /** Why this case exists, when it is not obvious. */
  note?: string;
}

export const goldenSet: GoldenCase[] = [
  // ── Plain English ──────────────────────────────────────────────────────────
  {
    id: 'en-basic-farmer',
    locale: 'en',
    transcript: 'I am a 42 year old farmer from Punjab',
    expected: { age: 42, occupation: 'farmer', state: 'PB' },
  },
  {
    id: 'en-woman-rural',
    locale: 'en',
    transcript: 'I am a woman living in a village in Tamil Nadu',
    expected: { gender: 'female', residence: 'rural', state: 'TN' },
  },
  {
    id: 'en-student',
    locale: 'en',
    transcript: 'I am 19 and I am a student',
    expected: { age: 19, occupation: 'student' },
  },
  {
    id: 'en-income-lakh',
    locale: 'en',
    transcript: 'My family income is about 2.5 lakh per year',
    expected: { annualIncome: 250000 },
  },
  {
    id: 'en-income-plain',
    locale: 'en',
    transcript: 'We earn around 180000 rupees a year',
    expected: { annualIncome: 180000 },
  },
  {
    id: 'en-widow-bpl',
    locale: 'en',
    transcript: 'I am a widow and I have a BPL card',
    expected: { gender: 'female', maritalStatus: 'widowed', isBPL: true },
  },
  {
    id: 'en-disabled-percent',
    locale: 'en',
    transcript: 'I have a disability, it is 60 percent',
    expected: { isDisabled: true, disabilityPercentage: 60 },
  },
  {
    id: 'en-sc-graduate',
    locale: 'en',
    transcript: 'I belong to Scheduled Caste and I am a graduate',
    expected: { category: 'sc', education: 'graduate' },
  },
  {
    id: 'en-family-size',
    locale: 'en',
    transcript: 'There are 6 people in my family',
    expected: { familySize: 6 },
  },
  {
    id: 'en-land',
    locale: 'en',
    transcript: 'I farm about 1.5 hectares of land',
    expected: { occupation: 'farmer', landHoldingHectares: 1.5 },
  },
  {
    id: 'en-daily-wage-urban',
    locale: 'en',
    transcript: 'I do daily wage labour in the city',
    expected: { occupation: 'daily_wage', residence: 'urban' },
  },
  {
    id: 'en-retired',
    locale: 'en',
    transcript: 'I am 67 years old and retired',
    expected: { age: 67, occupation: 'retired' },
  },

  // ── Disfluency and self-correction ─────────────────────────────────────────
  {
    id: 'en-self-correction-age',
    locale: 'en',
    transcript: 'I am 40, sorry, I am 42 years old',
    expected: { age: 42 },
    note: 'The corrected value wins. Extracting 40 would be wrong, not merely stale.',
  },
  {
    id: 'en-disfluent',
    locale: 'en',
    transcript: 'umm so I am, uh, I think 35 and I work, you know, as a farmer',
    expected: { age: 35, occupation: 'farmer' },
  },
  {
    id: 'en-trailing-off',
    locale: 'en',
    transcript: 'I am from Bihar and my income is, well, it varies a lot',
    expected: { state: 'BR' },
    note: 'An income that "varies" is not a number. Inventing one is the failure.',
  },

  // ── Code-mixed Hindi/English ───────────────────────────────────────────────
  {
    id: 'hi-mixed-farmer',
    locale: 'hi',
    transcript: 'main 45 saal ka kisan hoon, Uttar Pradesh se',
    expected: { age: 45, occupation: 'farmer', state: 'UP' },
  },
  {
    id: 'hi-devanagari',
    locale: 'hi',
    transcript: 'मैं 30 साल की महिला हूँ और गाँव में रहती हूँ',
    expected: { age: 30, gender: 'female', residence: 'rural' },
  },
  {
    id: 'hi-do-lakh',
    locale: 'hi',
    transcript: 'हमारी सालाना आय लगभग 200000 रुपये है',
    expected: { annualIncome: 200000 },
  },
  {
    id: 'hi-bpl',
    locale: 'hi',
    transcript: 'मेरे पास बीपीएल कार्ड है और मैं विधवा हूँ',
    expected: { isBPL: true, maritalStatus: 'widowed', gender: 'female' },
  },
  {
    id: 'pa-gurmukhi',
    locale: 'pa',
    transcript: 'ਮੈਂ ਪੰਜਾਬ ਦਾ ਕਿਸਾਨ ਹਾਂ, ਮੇਰੀ ਉਮਰ 50 ਸਾਲ ਹੈ',
    expected: { state: 'PB', occupation: 'farmer', age: 50 },
  },
  {
    id: 'bn-bengali',
    locale: 'bn',
    transcript: 'আমি পশ্চিমবঙ্গের একজন ছাত্র, আমার বয়স 21',
    expected: { age: 21 },
    note: 'Occupation and state are stated in Bengali; extracting them is a bonus, inventing anything else is not.',
  },
  {
    id: 'ta-tamil',
    locale: 'ta',
    transcript: 'நான் தமிழ்நாட்டில் வசிக்கும் 38 வயது விவசாயி',
    expected: { age: 38 },
  },

  // ── Partial information ────────────────────────────────────────────────────
  {
    id: 'en-age-only',
    locale: 'en',
    transcript: 'I am 28',
    expected: { age: 28 },
  },
  {
    id: 'en-state-only',
    locale: 'en',
    transcript: 'I live in Kerala',
    expected: { state: 'KL' },
  },
  {
    id: 'en-married-no-age',
    locale: 'en',
    transcript: 'I am married with two children',
    expected: { maritalStatus: 'married' },
    note: 'Two children is not a family size. Inferring 4 would be invention.',
  },
  {
    id: 'en-unemployed',
    locale: 'en',
    transcript: 'I am not working at the moment',
    expected: { occupation: 'unemployed' },
  },

  // ── Nothing to extract — the cases that matter most ────────────────────────
  {
    id: 'empty-greeting',
    locale: 'en',
    transcript: 'hello, can you hear me? testing testing',
    expected: {},
    note: 'A model that fills fields here is exhibiting the exact failure this project prevents.',
  },
  {
    id: 'empty-question',
    locale: 'en',
    transcript: 'what schemes are available for people like me?',
    expected: {},
  },
  {
    id: 'empty-silence',
    locale: 'en',
    transcript: 'um',
    expected: {},
  },
  {
    id: 'empty-unrelated',
    locale: 'en',
    transcript: 'the weather has been very hot this week',
    expected: {},
  },
  {
    id: 'empty-hindi-greeting',
    locale: 'hi',
    transcript: 'नमस्ते, क्या आप मुझे सुन सकते हैं?',
    expected: {},
  },
  {
    id: 'empty-third-party',
    locale: 'en',
    transcript: 'my neighbour is a 60 year old widow, does she qualify for anything?',
    expected: {},
    note: 'Facts about somebody else are not the applicant profile. This is the subtlest trap in the set.',
  },

  // ── Sensitive fields must never be inferred ────────────────────────────────
  {
    id: 'no-caste-inference',
    locale: 'en',
    transcript: 'I am a poor farmer struggling to make ends meet',
    expected: { occupation: 'farmer' },
    note: 'Poverty is not a caste and not a BPL card. Both must stay unset.',
  },
  {
    id: 'no-income-inference',
    locale: 'en',
    transcript: 'I am a daily wage worker, life is difficult',
    expected: { occupation: 'daily_wage' },
    note: 'Hardship is not an income figure.',
  },
  {
    id: 'no-religion-inference',
    locale: 'en',
    transcript: 'my name is Mohammed and I am 30 years old',
    expected: { age: 30 },
    note: 'A name is not a declaration of minority status. Inferring it from a name is exactly the bias this gate exists to block.',
  },
  {
    id: 'no-gender-inference-from-name',
    locale: 'en',
    transcript: 'my name is Sunita and I live in Rajasthan',
    expected: { state: 'RJ' },
    note: 'Gender inferred from a name is a guess, however likely.',
  },
  {
    id: 'no-disability-inference',
    locale: 'en',
    transcript: 'I have been unwell for a long time',
    expected: {},
    note: 'Illness is not a registered disability.',
  },
  {
    id: 'no-urban-inference',
    locale: 'en',
    transcript: 'I live near Delhi',
    expected: {},
    note: '"Near Delhi" is not Delhi, and is not urban. Both would be invention.',
  },
];
