import type { RuleNode, WildcardClause } from '../rules/types';
import { extractNumbers } from './numerals';

/**
 * Turns one bullet of eligibility prose into one rule clause.
 *
 * THE ASYMMETRY THAT GOVERNS THIS MODULE:
 *
 *   A missed clause degrades the scheme to UNKNOWN. That is safe — it prompts a
 *   question and keeps the scheme in front of the citizen.
 *
 *   A wrong clause silently disqualifies an eligible citizen. That is the exact
 *   harm this project exists to prevent.
 *
 * So synthesis recognises a deliberately small set of high-confidence patterns
 * and routes everything else to WILDCARD. Low recall is an acceptable cost;
 * low precision is not. When adding a pattern, ask whether it could ever fire
 * on prose that does not actually assert it — if so, do not add it.
 */

/**
 * Prose that qualifies, conditions, or defers a criterion. We do not model
 * scope, so a bullet containing any of these is not safely reducible to a
 * single clause — however parseable its individual parts look.
 */
const AMBIGUITY_MARKERS =
  /\b(?:if|unless|provided\s+that|in\s+case|subject\s+to|discretion|preference|whichever|either|as\s+decided|may\s+be)\b/i;

const AGE_CONTEXT = /\b(?:age|aged|years?|yrs?)\b/i;
const INCOME_CONTEXT = /\bincome\b/i;

type Builder = (match: RegExpMatchArray, prose: string) => RuleNode | null;

interface Pattern {
  /** Extra guard the whole bullet must satisfy before the pattern is tried. */
  context?: RegExp;
  pattern: RegExp;
  build: Builder;
}

const num = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
};

/**
 * Ordered. The first match wins, so more specific patterns must precede more
 * general ones — "not less than" before "less than", and the percentage form of
 * disability before the boolean form.
 */
const PATTERNS: Pattern[] = [
  // ── Age ────────────────────────────────────────────────────────────────────
  {
    context: AGE_CONTEXT,
    pattern: /between\s+(\d+)\s*(?:and|to|–|-)\s*(\d+)\s*(?:years|yrs)/i,
    build: (m) => {
      const min = num(m[1]);
      const max = num(m[2]);
      return min !== null && max !== null && min <= max
        ? { field: 'age', op: 'between', min, max }
        : null;
    },
  },
  {
    context: AGE_CONTEXT,
    // "not (be) less than N years" is a lower bound. Must precede "less than".
    pattern: /not\s+(?:be\s+)?less\s+than\s+(\d+)\s*(?:years|yrs)/i,
    build: (m) => {
      const value = num(m[1]);
      return value === null ? null : { field: 'age', op: 'gte', value };
    },
  },
  {
    context: AGE_CONTEXT,
    pattern: /(?:at\s+least|minimum(?:\s+age)?(?:\s+(?:of|is))?)\s+(\d+)\s*(?:years|yrs)/i,
    build: (m) => {
      const value = num(m[1]);
      return value === null ? null : { field: 'age', op: 'gte', value };
    },
  },
  {
    context: AGE_CONTEXT,
    // Inclusive upper bounds. Must precede the exclusive forms below.
    pattern:
      /(?:not\s+(?:be\s+)?(?:exceed|more\s+than)|up\s+to|at\s+most)\s+(\d+)\s*(?:years|yrs)/i,
    build: (m) => {
      const value = num(m[1]);
      return value === null ? null : { field: 'age', op: 'lte', value };
    },
  },
  {
    context: AGE_CONTEXT,
    pattern: /maximum\s+age\s+(?:is\s+|of\s+)?(\d+)/i,
    build: (m) => {
      const value = num(m[1]);
      return value === null ? null : { field: 'age', op: 'lte', value };
    },
  },
  {
    context: AGE_CONTEXT,
    // Exclusive upper bounds. "below 35" excludes exactly-35; conflating this
    // with "not more than 35" shifts the boundary and wrongly excludes people
    // sitting on it.
    pattern: /(?:below|under|less\s+than)\s+(\d+)\s*(?:years|yrs)/i,
    build: (m) => {
      const value = num(m[1]);
      return value === null ? null : { field: 'age', op: 'lt', value };
    },
  },

  // ── Income ─────────────────────────────────────────────────────────────────
  // Guarded on the word "income" so a benefit amount is never read as a cap.
  {
    context: INCOME_CONTEXT,
    pattern: /not\s+(?:be\s+)?(?:exceed|more\s+than)|up\s+to|not\s+above|maximum|at\s+most/i,
    build: (_m, prose) => {
      const [value] = extractNumbers(prose);
      return value === undefined ? null : { field: 'annualIncome', op: 'lte', value };
    },
  },
  {
    context: INCOME_CONTEXT,
    pattern: /(?:less\s+than|below|under)/i,
    build: (_m, prose) => {
      const [value] = extractNumbers(prose);
      return value === undefined ? null : { field: 'annualIncome', op: 'lt', value };
    },
  },

  // ── Disability ─────────────────────────────────────────────────────────────
  {
    pattern: /disabilit\w*\s+of\s+(\d+)\s*%|(\d+)\s*%\s*(?:or\s+more\s+)?(?:of\s+)?disabilit/i,
    build: (m) => {
      const value = num(m[1] ?? m[2]);
      return value === null ? null : { field: 'disabilityPercentage', op: 'gte', value };
    },
  },
  {
    pattern: /person\s+with\s+disabilit|differently[\s-]abled|\bPwD\b|\bdivyang\b/i,
    build: () => ({ field: 'isDisabled', op: 'eq', value: true }),
  },

  // ── Social category ────────────────────────────────────────────────────────
  {
    // Combined SC/ST must precede the individual forms.
    pattern: /\bSC\s*[/&]\s*ST\b|\bSC\s+(?:and|or)\s+ST\b|scheduled\s+castes?\s*[/&]\s*scheduled\s+tribes?/i,
    build: () => ({ field: 'category', op: 'in', values: ['sc', 'st'] }),
  },
  {
    pattern: /\bOBC\b|other\s+backward\s+class/i,
    build: () => ({ field: 'category', op: 'in', values: ['obc'] }),
  },
  {
    pattern: /\bEWS\b|economically\s+weaker\s+section/i,
    build: () => ({ field: 'category', op: 'in', values: ['ews'] }),
  },
  {
    pattern: /\bSC\b|scheduled\s+caste/i,
    build: () => ({ field: 'category', op: 'in', values: ['sc'] }),
  },
  {
    pattern: /\bST\b|scheduled\s+tribe/i,
    build: () => ({ field: 'category', op: 'in', values: ['st'] }),
  },

  // ── Gender ─────────────────────────────────────────────────────────────────
  {
    // Female first: "female" contains "male".
    pattern: /\b(?:woman|women|female|girls?|widows?)\b/i,
    build: () => ({ field: 'gender', op: 'eq', value: 'female' }),
  },
  {
    pattern: /(?<!fe)\b(?:man|men|male|boys?)\b/i,
    build: () => ({ field: 'gender', op: 'eq', value: 'male' }),
  },

  // ── Residence and poverty line ─────────────────────────────────────────────
  {
    pattern: /\brural\b/i,
    build: () => ({ field: 'residence', op: 'eq', value: 'rural' }),
  },
  {
    pattern: /\burban\b/i,
    build: () => ({ field: 'residence', op: 'eq', value: 'urban' }),
  },
  {
    pattern: /below\s+poverty\s+line|\bBPL\b/i,
    build: () => ({ field: 'isBPL', op: 'eq', value: true }),
  },
];

const wildcard = (sourceText: string, reason: WildcardClause['reason']): WildcardClause => ({
  op: 'WILDCARD',
  sourceText,
  reason,
});

/**
 * Synthesises a single clause from one bullet of eligibility prose.
 * Always returns a node — unrecognised prose becomes a WILDCARD, never nothing.
 */
export function synthesizeClause(prose: string): RuleNode {
  const text = prose.trim();

  // Qualified or conditional prose is not safely reducible to one clause, even
  // when its parts look parseable. This guard runs first for that reason.
  if (AMBIGUITY_MARKERS.test(text)) {
    return wildcard(text, 'ambiguous');
  }

  for (const { context, pattern, build } of PATTERNS) {
    if (context && !context.test(text)) continue;

    const match = text.match(pattern);
    if (!match) continue;

    const node = build(match, text);
    if (node) return node;
  }

  return wildcard(text, 'unmodellable');
}

/** Strips a markdown list marker. Returns null for a line that is not a bullet. */
function bulletText(line: string): string | null {
  const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
  const text = match?.[1]?.trim();
  return text ? text : null;
}

/**
 * Synthesises a rule tree from a scheme's `eligibilityDescription_md`.
 *
 * Criteria are conjoined: myscheme lists them as requirements a citizen must
 * satisfy together. An empty section yields an empty AND, which is vacuously
 * PASS — correct, because a scheme that states no criteria disqualifies nobody.
 */
export function synthesizeRuleTree(markdown: string): RuleNode {
  const clauses = markdown
    .split('\n')
    .map(bulletText)
    .filter((text): text is string => text !== null)
    .map(synthesizeClause);

  return { op: 'AND', clauses };
}
