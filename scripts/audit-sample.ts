import { sql } from 'drizzle-orm';
import { config as loadEnv } from 'dotenv';
import { getDb, schema } from '../src/db';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

/**
 * Prints a random sample of schemes with their source prose beside the rule
 * tree that was synthesised from it.
 *
 * WHY THIS EXISTS
 *
 * Every automated gate checks that a rule is well-formed, that its bounds are
 * grounded in the prose, and that the prose was stored at all. None of them can
 * check whether the rule means what the sentence means. A clause can be valid
 * Zod, correctly grounded in a number that genuinely appears, and still be about
 * the wrong thing entirely.
 *
 * That is the failure this sample is for, and it needs a person: the whole point
 * is that a human reads the government's sentence and the machine's
 * interpretation of it side by side and says whether they agree.
 *
 * The sample is deterministic given a seed, so a finding can be re-examined and
 * an audit can be repeated exactly.
 *
 *   pnpm audit:sample            # 15 schemes, seed 1
 *   pnpm audit:sample 25 7       # 25 schemes, seed 7
 */

const OPS_WITH_BOUNDS = new Set(['between', 'lt', 'lte', 'gt', 'gte', 'eq', 'in']);

type Clause = {
  op: string;
  field?: string;
  value?: unknown;
  values?: unknown[];
  min?: number;
  max?: number;
  reason?: string;
  sourceText?: string;
  clauses?: Clause[];
};

/** Mulberry32 — small, seeded, and good enough to pick rows reproducibly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function describe(clause: Clause, depth = 0): string[] {
  const pad = '  '.repeat(depth);

  if (clause.op === 'AND' || clause.op === 'OR') {
    const lines = [`${pad}${clause.op}`];
    for (const child of clause.clauses ?? []) lines.push(...describe(child, depth + 1));
    return lines;
  }

  if (clause.op === 'WILDCARD') {
    // Not modelled on purpose. Shown because a wildcard that should have been
    // modelled is a finding, and one that should not is reassurance.
    return [`${pad}WILDCARD (${clause.reason ?? 'no reason'})`, `${pad}  ← "${clause.sourceText ?? ''}"`];
  }

  const bounds: string[] = [];
  if (clause.min !== undefined) bounds.push(`min ${clause.min}`);
  if (clause.max !== undefined) bounds.push(`max ${clause.max}`);
  if (clause.value !== undefined) bounds.push(`= ${JSON.stringify(clause.value)}`);
  if (clause.values !== undefined) bounds.push(`one of ${JSON.stringify(clause.values)}`);

  const flag = OPS_WITH_BOUNDS.has(clause.op) ? '' : '  [unrecognised op]';
  return [`${pad}${clause.field ?? '?'} ${clause.op} ${bounds.join(', ')}${flag}`];
}

function countClauses(clause: Clause): { total: number; wildcard: number } {
  if (clause.clauses?.length) {
    return clause.clauses.reduce(
      (acc, child) => {
        const sub = countClauses(child);
        return { total: acc.total + sub.total, wildcard: acc.wildcard + sub.wildcard };
      },
      { total: 0, wildcard: 0 },
    );
  }
  return { total: 1, wildcard: clause.op === 'WILDCARD' ? 1 : 0 };
}

async function main() {
  const size = Number.parseInt(process.argv[2] ?? '15', 10);
  const seed = Number.parseInt(process.argv[3] ?? '1', 10);

  const db = getDb();
  const rows = await db
    .select({
      slug: schema.schemes.slug,
      name: schema.schemes.name,
      state: schema.schemes.state,
      prose: schema.schemes.sourceProse,
      url: schema.schemes.sourceUrl,
      eligibility: schema.schemes.eligibility,
    })
    .from(schema.schemes)
    .orderBy(sql`slug`);

  const random = seeded(seed);
  const picked = [...rows]
    .map((row) => ({ row, key: random() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, size)
    .map((entry) => entry.row);

  console.log(`AUDIT SAMPLE — ${picked.length} of ${rows.length} schemes, seed ${seed}`);
  console.log('Read each pair and decide whether the rule says what the sentence says.\n');

  for (const [index, row] of picked.entries()) {
    const tree = row.eligibility as unknown as Clause;
    const counts = countClauses(tree);
    const title = (row.name as Record<string, string>).en ?? row.slug;

    console.log('='.repeat(78));
    console.log(`${index + 1}. ${title}  [${row.slug}]  ${row.state ?? '(national)'}`);
    console.log(`   ${row.url}`);
    console.log(`   ${counts.total} clauses, ${counts.wildcard} wildcard`);
    console.log('\n--- THE GOVERNMENT SAID ---');
    console.log(
      row.prose
        .split(/\r?\n/)
        .map((line) => '  ' + line.trim())
        .filter((line) => line.trim())
        .join('\n'),
    );
    console.log('\n--- WE MODELLED ---');
    console.log(describe(tree).join('\n'));
    console.log();
  }

  await db.$client.end({ timeout: 5 });
}

void main();
