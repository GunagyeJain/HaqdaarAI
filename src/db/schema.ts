import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Placeholder rule-tree type. Phase 1 replaces this with the real discriminated
 * union defined in src/domain/rules, derived from RuleTreeSchema.
 *
 * The `$type<>()` generic is the reason this project uses Drizzle rather than
 * Prisma — see docs/DECISIONS.md ADR-002.
 */
type RuleTreePlaceholder = { op: string; [key: string]: unknown };

/** Localized string, keyed by locale. Falls back to `en` when a translation is absent. */
type Localized = Record<string, string>;

export const schemes = pgTable(
  'schemes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),

    name: jsonb('name').$type<Localized>().notNull(),
    summary: jsonb('summary').$type<Localized>().notNull(),

    ministry: text('ministry'),
    /** NULL means a central scheme. */
    state: text('state'),

    /** The predicate tree. See docs/DATA-MODEL.md §2. */
    eligibility: jsonb('eligibility').$type<RuleTreePlaceholder>().notNull(),

    /** INVARIANT 4: every structured rule keeps the prose it came from. */
    sourceProse: text('source_prose').notNull(),
    sourceUrl: text('source_url').notNull(),

    benefits: jsonb('benefits').$type<Localized>(),
    documents: jsonb('documents').$type<string[]>(),

    scrapedAt: timestamp('scraped_at', { withTimezone: true }).notNull().defaultNow(),

    /** True when the rule tree contains any WILDCARD clause. A work queue, not an error. */
    needsReview: boolean('needs_review').notNull().default(false),
  },
  (table) => [
    // Accelerates containment (@>) — enum/boolean equality, not range predicates.
    // Load-bearing for the scalability argument, not for the 150-row benchmark.
    // See docs/DECISIONS.md ADR-007.
    index('schemes_eligibility_gin').using('gin', table.eligibility.op('jsonb_path_ops')),
    index('schemes_state_idx').on(table.state),
  ],
);

export type Scheme = typeof schemes.$inferSelect;
export type NewScheme = typeof schemes.$inferInsert;
