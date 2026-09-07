import { z } from 'zod';
import type { RuleNode, WildcardReason } from '../rules/types';
import { synthesizeRuleTree } from './clauses';
import { groundRuleTree } from './grounding';
import { toStateCode } from './states';

/**
 * Turns one raw myscheme detail payload into a row we can store.
 *
 * The Zod schema here is deliberately strict about the fields we depend on and
 * permissive about the rest. myscheme returns a large payload we mostly ignore,
 * but if the parts we *do* rely on change shape, normalization must fail loudly
 * rather than quietly produce a scheme with no eligibility rules
 * (docs/SCRAPER.md, "Fail loudly").
 */

/** myscheme returns many enum-ish fields as { value, label }. */
const LabelledSchema = z.object({
  value: z.unknown().optional(),
  label: z.string().optional(),
});

const DetailPayloadSchema = z.object({
  data: z.object({
    slug: z.string().min(1),
    en: z.object({
      basicDetails: z.object({
        schemeName: z.string().min(1),
        level: LabelledSchema.nullish(),
        // Null for state schemes, which carry a department instead.
        nodalMinistryName: LabelledSchema.nullish(),
        nodalDepartmentName: LabelledSchema.nullish(),
        // State schemes carry `state`. `beneficiaryState` appears in the search
        // listing but not on the detail payload; it is accepted as a fallback.
        state: LabelledSchema.nullish(),
        beneficiaryState: z.array(LabelledSchema).nullish(),
      }),
      schemeContent: z
        .object({
          briefDescription: z.string().optional(),
          benefits_md: z.string().optional(),
        })
        .optional(),
      eligibilityCriteria: z.object({
        eligibilityDescription_md: z.string(),
      }),
    }),
  }),
});

export interface NormalizedScheme {
  slug: string;
  name: Record<string, string>;
  summary: Record<string, string>;
  ministry: string | null;
  state: string | null;
  eligibility: RuleNode;
  sourceProse: string;
  sourceUrl: string;
  benefits: Record<string, string> | null;
  needsReview: boolean;
}

export interface NormalizationStats {
  wildcardsByReason: Record<WildcardReason, number>;
  ungroundedValues: number[];
  clauseCount: number;
}

export type NormalizationResult =
  | { ok: true; scheme: NormalizedScheme; stats: NormalizationStats }
  | { ok: false; error: string };

function countWildcards(node: RuleNode): Record<WildcardReason, number> {
  const counts: Record<WildcardReason, number> = {
    unmodellable: 0,
    ambiguous: 0,
    ungrounded: 0,
  };

  const walk = (current: RuleNode): void => {
    if (current.op === 'AND' || current.op === 'OR') {
      current.clauses.forEach(walk);
    } else if (current.op === 'NOT') {
      walk(current.clause);
    } else if (current.op === 'WILDCARD') {
      counts[current.reason] += 1;
    }
  };

  walk(node);
  return counts;
}

function countClauses(node: RuleNode): number {
  if (node.op === 'AND' || node.op === 'OR') {
    return node.clauses.reduce((total, clause) => total + countClauses(clause), 0);
  }
  if (node.op === 'NOT') return countClauses(node.clause);
  return 1;
}

export function normalizeDetail(payload: unknown, locale = 'en'): NormalizationResult {
  const parsed = DetailPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: `detail payload did not match expected shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    };
  }

  const { slug, en } = parsed.data.data;
  const prose = en.eligibilityCriteria.eligibilityDescription_md;

  // Structured state facet -> a state restriction. This comes from myscheme's
  // own metadata rather than parsed prose, so it is high-confidence in a way a
  // regex over sentences is not. An unrecognised name yields no clause at all,
  // never a guess.
  const isCentral = String(en.basicDetails.level?.value ?? '').toLowerCase() === 'central';
  const stateLabel =
    en.basicDetails.state?.label ?? en.basicDetails.beneficiaryState?.[0]?.label ?? null;
  const stateCode = isCentral ? null : toStateCode(stateLabel);

  const fromProse = synthesizeRuleTree(prose);
  const proseClauses = fromProse.op === 'AND' ? fromProse.clauses : [fromProse];

  const combined: RuleNode = {
    op: 'AND',
    clauses: stateCode
      ? [{ field: 'state', op: 'in', values: [stateCode] }, ...proseClauses]
      : proseClauses,
  };

  // THE CORRECTNESS GATE: any numeric bound not locatable in the prose is
  // replaced by a WILDCARD before this scheme can be stored.
  const grounded = groundRuleTree(combined, prose);

  const scheme: NormalizedScheme = {
    slug,
    name: { [locale]: en.basicDetails.schemeName },
    summary: { [locale]: en.schemeContent?.briefDescription ?? '' },
    ministry:
      en.basicDetails.nodalMinistryName?.label ?? en.basicDetails.nodalDepartmentName?.label ?? null,
    state: stateCode,
    eligibility: grounded.tree,
    // INVARIANT 4: the prose every rule came from, stored verbatim.
    sourceProse: prose,
    sourceUrl: `https://www.myscheme.gov.in/schemes/${slug}`,
    benefits: en.schemeContent?.benefits_md ? { [locale]: en.schemeContent.benefits_md } : null,
    needsReview: grounded.needsReview,
  };

  return {
    ok: true,
    scheme,
    stats: {
      wildcardsByReason: countWildcards(grounded.tree),
      ungroundedValues: grounded.ungroundedValues,
      clauseCount: countClauses(grounded.tree),
    },
  };
}
