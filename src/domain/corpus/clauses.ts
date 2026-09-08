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

/**
 * Language that waives, relaxes, or carves an exception out of a criterion.
 *
 * A cap that does not apply to everyone is not a cap. The Udyogini Scheme caps
 * family income at ₹1,50,000 and then says "No limit on family income for
 * widowed or disabled women" — emitting the cap alone would wrongly exclude
 * exactly the applicants the exception exists to protect.
 *
 * We do not model exception scope, so any bullet carrying one is undecidable.
 */
const EXCEPTION_MARKERS =
  /\b(?:no\s+limit|except|exempt\w*|relaxa\w*|relaxable|not\s+applicable|waived|shall\s+not\s+apply|other\s+than)\b/i;

/**
 * A genuine "either/or" between criteria.
 *
 * One sentence can state several requirements, and conjoining them is right
 * when they are joined by "and". Conjoining *alternatives* is not: turning
 * "a woman or an SC applicant" into "a woman AND an SC applicant" wrongly
 * excludes anyone satisfying only one — the false negative this project exists
 * to prevent. Structure we cannot read is UNKNOWN, never a guess.
 *
 * The lookahead exempts comparison idioms: "40% or more" and "60 years or
 * above" are single bounds, not choices.
 */
const DISJUNCTION_MARKERS =
  /\b(?:or|either)\b(?!\s*(?:more|above|higher|greater|less|below|lower|fewer|older|younger|equal|over|under|before|after|上))/i;

/**
 * The same either/or, written with a slash rather than the word.
 *
 * "an Ex-serviceman/Widow of an Ex-serviceman" offers two eligible groups.
 * Read as a conjunction it asserted `gender = female` and failed every male
 * ex-serviceman, on a scheme that names them first (audit finding F2).
 *
 * Only a slash joining two words counts. This corpus uses slashes constantly
 * for things that are not choices — "₹15,000/-" ends in a hyphen, and link
 * targets and URLs are full of them — and treating those as alternatives
 * would discard sound clauses. URLs are stripped before the test rather than
 * pattern-matched around.
 */
const SLASH_ALTERNATION = /(?<=\w)\s*\/\s*(?=\w)/;

/**
 * Unwraps markdown links to their label and drops bare URLs.
 *
 * The label has to survive intact. Removing only the target leaves
 * "[Ex-serviceman]/Widow", where the character before the slash is a bracket,
 * and an alternation between two words stops looking like one.
 */
const stripLinks = (text: string): string =>
  text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '');

const AGE_CONTEXT = /\b(?:age|aged|years?|yrs?)\b/i;
const INCOME_CONTEXT = /\bincome\b/i;

/**
 * A monthly income limit, which must be annualised because the profile field
 * is annual (audit finding F1, docs/AUDIT.md).
 *
 * Until this existed, "monthly income of ₹15,000 or below" was stored as
 * `annualIncome < 15000` and rejected everyone earning between ₹15,001 and
 * ₹1,80,000 a year — which is the entire population such a scheme is for.
 * The number was extracted correctly and its meaning was not.
 *
 * Only an explicit period converts. An unqualified figure is read as written,
 * because inventing a limit twelve times larger than the government wrote
 * would be the same defect pointing the other way.
 */
const MONTHLY = /\b(?:monthly|per\s+month|a\s+month|p\.?\s?m\.?)(?=\b|$)/i;

const MONTHS_PER_YEAR = 12;

/** Converts a monthly figure to the annual one the profile stores. */
const annualise = (value: number, prose: string): number =>
  MONTHLY.test(prose) ? value * MONTHS_PER_YEAR : value;

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
    // "60 years and above", "60 years or older", "aged 60 and above".
    pattern:
      /(\d+)\s*(?:years|yrs)?\s*(?:and|or)\s+(?:above|older|more|over)/i,
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
      if (value === undefined) return null;
      return { field: 'annualIncome', op: 'lte', value: annualise(value, prose) };
    },
  },
  {
    context: INCOME_CONTEXT,
    pattern: /(?:less\s+than|below|under)/i,
    build: (_m, prose) => {
      const [value] = extractNumbers(prose);
      if (value === undefined) return null;
      return { field: 'annualIncome', op: 'lt', value: annualise(value, prose) };
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
 * Synthesises the clauses stated by one bullet of eligibility prose.
 *
 * A single sentence often states several criteria — "All women of 60 years and
 * above residing in Punjab" states three — so this returns every high-confidence
 * pattern that matches, at most one per profile field. Returning only the first
 * silently dropped the rest, which told a 42-year-old woman she qualified for a
 * scheme restricted to women over 60.
 *
 * Always returns at least one node: unrecognised prose becomes a WILDCARD,
 * never nothing.
 */
export function synthesizeClauses(prose: string): RuleNode[] {
  const text = prose.trim();

  // Qualified, conditional, or partially-waived prose is not safely reducible
  // to clauses, however parseable its parts look.
  if (AMBIGUITY_MARKERS.test(text) || EXCEPTION_MARKERS.test(text)) {
    return [wildcard(text, 'ambiguous')];
  }

  const found: RuleNode[] = [];
  const claimed = new Set<string>();

  for (const { context, pattern, build } of PATTERNS) {
    if (context && !context.test(text)) continue;

    const match = text.match(pattern);
    if (!match) continue;

    const node = build(match, text);
    if (!node || !('field' in node)) continue;

    // PATTERNS is ordered most-specific first, so the first pattern to claim a
    // field wins and later, looser patterns for the same field are skipped.
    if (claimed.has(node.field)) continue;

    claimed.add(node.field);
    found.push(node);
  }

  if (found.length === 0) {
    return [wildcard(text, 'unmodellable')];
  }

  // The disjunction guard applies only where we are about to assert something.
  // "must not be in default to any bank or financial institution" alternates
  // nouns inside a clause we cannot model anyway — harmless. But "must be SC or
  // OBC" would assert only the first alternative and wrongly exclude the other,
  // and "a woman or an SC applicant" would conjoin two alternatives into a
  // requirement to be both. Either is a false negative, so when a disjunction
  // sits alongside something we matched, we decline to assert it.
  // Tested against link-free text: a URL is not an offer of alternatives.
  const readable = stripLinks(text);

  // Scoped to gender, and the scoping is the whole point.
  //
  // A clause anchored to a NUMBER is unharmed by a slash between nouns: the
  // ₹60,000 cap in "Annual Income of Parents/Guardian should not be more than
  // Rs. 60,000" is the same cap whoever earns it. "Parents/Guardian",
  // "he/she" and "professional/Non-Professional" are compounds, not choices,
  // and they are everywhere in this corpus — an unscoped slash rule discarded
  // 76 sound clauses, most of them income bounds, which are the most
  // decision-relevant field there is.
  //
  // A clause anchored to a BARE NOUN is exactly what alternation breaks. One
  // word anywhere in the sentence asserts gender, so "Ex-serviceman/Widow"
  // keeps the second branch and silently drops the first.
  //
  // "SC/ST category" is safe either way: it becomes `category in [sc, st]`,
  // which represents the choice rather than picking from it.
  const assertsGender = found.some((node) => 'field' in node && node.field === 'gender');
  const slashSplitsCriteria = assertsGender && SLASH_ALTERNATION.test(readable);

  if (DISJUNCTION_MARKERS.test(readable) || slashSplitsCriteria) {
    return [wildcard(text, 'ambiguous')];
  }

  return found;
}

/** Strips a markdown list marker. Returns null for a line that is not a bullet. */
function bulletText(line: string): string | null {
  const match = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
  const text = match?.[1]?.trim();
  return text ? text : null;
}

/** Splits a paragraph into sentences, for prose that is not a bullet list. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Synthesises a rule tree from a scheme's `eligibilityDescription_md`.
 *
 * Criteria are conjoined: myscheme lists them as requirements a citizen must
 * satisfy together.
 *
 * Not every scheme uses bullets — Pradhan Mantri Suraksha Bima Yojana states
 * real age bounds in a single paragraph — so unbulleted prose falls back to
 * sentence splitting.
 *
 * THE EMPTY-AND HAZARD: an empty AND is vacuously PASS. That is correct only
 * when the scheme genuinely states no criteria. If prose was present and we
 * simply could not read it, returning an empty AND would tell every citizen
 * they qualify for a scheme whose requirements we never parsed. In that case we
 * emit a WILDCARD instead, so the scheme reads UNKNOWN — the honest answer.
 */
export function synthesizeRuleTree(markdown: string): RuleNode {
  const text = markdown.trim();
  if (text.length === 0) {
    // No criteria stated at all: nothing disqualifies anyone. Vacuous PASS is right.
    return { op: 'AND', clauses: [] };
  }

  const bullets = markdown
    .split('\n')
    .map(bulletText)
    .filter((line): line is string => line !== null);

  const segments = bullets.length > 0 ? bullets : sentences(text);
  const clauses = segments.flatMap(synthesizeClauses);

  if (clauses.length === 0) {
    return { op: 'AND', clauses: [wildcard(text, 'unmodellable')] };
  }

  return { op: 'AND', clauses };
}
