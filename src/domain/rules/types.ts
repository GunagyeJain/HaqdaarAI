/**
 * Rule DSL types. Specification: docs/DATA-MODEL.md.
 *
 * These are the single source of truth for what an eligibility rule can express.
 * The Zod schemas in ./schema.ts validate against them, and match_schemes() in
 * SQL implements the same semantics.
 */

// ─── Profile value domains ───────────────────────────────────────────────────

export const GENDERS = ['male', 'female', 'transgender'] as const;
export const RESIDENCES = ['urban', 'rural'] as const;
export const CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews'] as const;
export const MARITAL_STATUSES = ['single', 'married', 'widowed', 'divorced'] as const;

export const OCCUPATIONS = [
  'farmer', 'student', 'unemployed', 'salaried', 'self_employed',
  'daily_wage', 'artisan', 'fisherman', 'homemaker', 'retired',
] as const;

export const EDUCATION_LEVELS = [
  'none', 'primary', 'secondary', 'higher_secondary', 'graduate', 'postgraduate',
] as const;

/** 28 states followed by 8 union territories. */
export const STATE_CODES = [
  'AP', 'AR', 'AS', 'BR', 'CG', 'GA', 'GJ', 'HR', 'HP', 'JH', 'KA', 'KL',
  'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PB', 'RJ', 'SK', 'TN', 'TS',
  'TR', 'UP', 'UK', 'WB',
  'AN', 'CH', 'DH', 'DL', 'JK', 'LA', 'LD', 'PY',
] as const;

export type Gender = (typeof GENDERS)[number];
export type Residence = (typeof RESIDENCES)[number];
export type Category = (typeof CATEGORIES)[number];
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export type Occupation = (typeof OCCUPATIONS)[number];
export type Education = (typeof EDUCATION_LEVELS)[number];
export type StateCode = (typeof STATE_CODES)[number];

// ─── Applicant profile ───────────────────────────────────────────────────────

/**
 * Every field is optional. Absence is meaningful: it is what produces UNKNOWN
 * verdicts and drives the next question.
 *
 * INVARIANT 5: this is never persisted. Session-only.
 */
export interface Profile {
  age?: number;
  gender?: Gender;
  state?: StateCode;
  district?: string;
  residence?: Residence;
  annualIncome?: number;
  category?: Category;
  isMinority?: boolean;
  occupation?: Occupation;
  education?: Education;
  maritalStatus?: MaritalStatus;
  isDisabled?: boolean;
  disabilityPercentage?: number;
  isBPL?: boolean;
  landHoldingHectares?: number;
  familySize?: number;
}

/**
 * The kind of each field, used to reject nonsensical rules at validation time
 * (a numeric comparison against `gender`, say) rather than at evaluation time.
 */
export const FIELD_KINDS = {
  age: 'number',
  gender: 'enum',
  state: 'enum',
  district: 'string',
  residence: 'enum',
  annualIncome: 'number',
  category: 'enum',
  isMinority: 'boolean',
  occupation: 'enum',
  education: 'enum',
  maritalStatus: 'enum',
  isDisabled: 'boolean',
  disabilityPercentage: 'number',
  isBPL: 'boolean',
  landHoldingHectares: 'number',
  familySize: 'number',
} as const satisfies Record<keyof Profile, 'number' | 'enum' | 'boolean' | 'string'>;

export type ProfileField = keyof typeof FIELD_KINDS;

export const PROFILE_FIELDS = Object.keys(FIELD_KINDS) as ProfileField[];

// ─── Rule tree ───────────────────────────────────────────────────────────────

export type LeafValue = string | number | boolean;

export type ComparisonOp = 'eq' | 'neq';
export type NumericOp = 'lt' | 'lte' | 'gt' | 'gte';
export type SetOp = 'in' | 'not_in';

export type LeafClause =
  | { field: ProfileField; op: ComparisonOp; value: LeafValue }
  | { field: ProfileField; op: NumericOp; value: number }
  | { field: ProfileField; op: 'between'; min: number; max: number }
  | { field: ProfileField; op: SetOp; values: LeafValue[] };

export type WildcardReason = 'unmodellable' | 'ambiguous' | 'ungrounded';

/**
 * A clause we deliberately refuse to model. Always evaluates to UNKNOWN --
 * never guessed at, never dropped. Carries the prose it came from so a reviewer
 * can see exactly what we could not express.
 */
export interface WildcardClause {
  op: 'WILDCARD';
  sourceText: string;
  reason: WildcardReason;
}

export type RuleNode =
  | { op: 'AND'; clauses: RuleNode[] }
  | { op: 'OR'; clauses: RuleNode[] }
  | { op: 'NOT'; clause: RuleNode }
  | WildcardClause
  | LeafClause;

// ─── Evaluation ──────────────────────────────────────────────────────────────

export type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface EvaluationResult {
  verdict: Verdict;
  /** Leaf clauses that evaluated TRUE -- why the citizen qualifies. */
  matchedClauses: LeafClause[];
  /** Leaf clauses that evaluated FALSE -- why they do not. */
  failedClauses: LeafClause[];
  /** Fields whose absence left a clause undecided -- what to ask next. */
  unknownFields: ProfileField[];
}
