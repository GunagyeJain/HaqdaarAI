import { STATE_LABELS } from '@/lib/state-labels';
import type { ProfileField } from '../rules/types';

/**
 * Words that would justify an extracted value.
 *
 * These do not extract anything — the model does that. They are the evidence a
 * value must have in the transcript before it is allowed through
 * (./extraction.ts). Deliberately generous within a value and strict between
 * values: missing a synonym drops a correct field, which degrades to UNKNOWN
 * and prompts a question. Sharing a synonym between two values would let an
 * invented one through, which is the harm.
 *
 * Indic terms are included because a citizen speaking Hindi or Punjabi produces
 * a Hindi or Punjabi transcript, and grounding it against English words alone
 * would silently discard everything they said.
 */
export const ENUM_TERMS: Partial<Record<ProfileField, Record<string, string[]>>> = {
  gender: {
    male: ['man', 'male', 'boy', 'husband', 'father', 'son', 'पुरुष', 'आदमी', 'ਪੁਰਸ਼', 'ਆਦਮੀ'],
    female: [
      'woman', 'women', 'female', 'girl', 'lady', 'wife', 'mother', 'daughter', 'widow',
      'महिला', 'औरत', 'स्त्री', 'विधवा', 'ਔਰਤ', 'ਮਹਿਲਾ', 'ਵਿਧਵਾ',
    ],
    transgender: ['transgender', 'trans', 'kinnar', 'किन्नर', 'ट्रांसजेंडर'],
  },
  residence: {
    urban: ['urban', 'city', 'town', 'शहर', 'नगर', 'ਸ਼ਹਿਰ'],
    rural: ['rural', 'village', 'गाँव', 'गांव', 'ग्रामीण', 'ਪਿੰਡ'],
  },
  category: {
    general: ['general category', 'general caste', 'सामान्य', 'ਜਨਰਲ'],
    obc: ['obc', 'backward', 'ओबीसी', 'पिछड़ा', 'ਓਬੀਸੀ'],
    sc: ['sc', 'scheduled caste', 'dalit', 'अनुसूचित जाति', 'दलित', 'ਅਨੁਸੂਚਿਤ ਜਾਤੀ'],
    st: ['st', 'scheduled tribe', 'adivasi', 'tribal', 'अनुसूचित जनजाति', 'आदिवासी'],
    ews: ['ews', 'economically weaker', 'ईडब्ल्यूएस'],
  },
  occupation: {
    farmer: ['farmer', 'farming', 'agriculture', 'kisan', 'किसान', 'खेती', 'ਕਿਸਾਨ', 'ਖੇਤੀ'],
    student: ['student', 'studying', 'college', 'school', 'छात्र', 'पढ़', 'ਵਿਦਿਆਰਥੀ'],
    unemployed: ['unemployed', 'no job', 'jobless', 'not working', 'बेरोज़गार', 'बेरोजगार'],
    salaried: ['salaried', 'salary', 'job', 'employee', 'service', 'नौकरी', 'ਨੌਕਰੀ'],
    self_employed: ['self employed', 'self-employed', 'own business', 'shop', 'व्यापार', 'दुकान'],
    daily_wage: ['daily wage', 'labour', 'labor', 'mazdoor', 'दिहाड़ी', 'मजदूर', 'ਮਜ਼ਦੂਰ'],
    artisan: ['artisan', 'craft', 'weaver', 'potter', 'कारीगर', 'बुनकर', 'ਕਾਰੀਗਰ'],
    fisherman: ['fisherman', 'fishing', 'मछुआरा', 'मछली'],
    homemaker: ['homemaker', 'housewife', 'household work', 'गृहिणी', 'ਘਰੇਲੂ'],
    retired: ['retired', 'pension', 'सेवानिवृत्त', 'पेंशन', 'ਸੇਵਾਮੁਕਤ'],
  },
  education: {
    none: ['no schooling', 'never went to school', 'illiterate', 'निरक्षर', 'नहीं पढ़ा'],
    primary: ['primary', 'प्राथमिक', 'ਪ੍ਰਾਇਮਰੀ'],
    secondary: ['class 10', '10th', 'matric', 'secondary', 'दसवीं', 'ਦਸਵੀਂ'],
    higher_secondary: ['class 12', '12th', 'higher secondary', 'intermediate', 'बारहवीं'],
    graduate: ['graduate', 'degree', 'bachelor', 'स्नातक', 'ਗ੍ਰੈਜੂਏਟ'],
    postgraduate: ['postgraduate', 'masters', 'post graduate', 'स्नातकोत्तर'],
  },
  maritalStatus: {
    single: ['unmarried', 'single', 'not married', 'अविवाहित', 'ਅਣਵਿਆਹੇ'],
    married: ['married', 'wife', 'husband', 'विवाहित', 'शादीशुदा', 'ਵਿਆਹੇ'],
    widowed: ['widow', 'widowed', 'widower', 'विधवा', 'ਵਿਧਵਾ'],
    divorced: ['divorced', 'divorce', 'तलाक', 'ਤਲਾਕ'],
  },
};

/** Boolean fields need an affirmative signal; silence is never a "yes". */
export const BOOLEAN_TERMS: Partial<Record<ProfileField, string[]>> = {
  isBPL: ['bpl', 'below poverty line', 'poverty line', 'गरीबी रेखा', 'ਗਰੀਬੀ ਰੇਖਾ'],
  isDisabled: [
    'disabled', 'disability', 'handicap', 'divyang', 'differently abled', 'blind', 'deaf',
    'दिव्यांग', 'विकलांग', 'ਦਿਵਿਆਂਗ', 'ਅਪਾਹਜ',
  ],
  isMinority: [
    'minority', 'muslim', 'christian', 'sikh', 'buddhist', 'jain', 'parsi',
    'अल्पसंख्यक', 'मुस्लिम', 'ਘੱਟ ਗਿਣਤੀ',
  ],
};

/**
 * State names only — never the bare two-letter code.
 *
 * A citizen says "Punjab", not "PB". Accepting the code as evidence made
 * ordinary words into state mentions: "ld" is inside "old", "children" and
 * "world"; "as" inside "as"; "up" inside "up". Each of those grounded a state
 * nobody named, and a wrong state clause disqualifies someone from every scheme
 * in the state they actually live in.
 *
 * Found by the adversarial eval in tests/eval/hallucination.test.ts.
 */
export const STATE_TERMS: Record<string, string[]> = Object.fromEntries(
  Object.entries(STATE_LABELS).map(([code, label]) => [code, [label.toLowerCase()]]),
);
