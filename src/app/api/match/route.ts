import { z } from 'zod';
import { matchProfile } from '@/domain/matching/match';
import { selectNextQuestion } from '@/domain/questions/select';
import { ProfileSchema } from '@/domain/rules/schema';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

/**
 * The matching endpoint. Tier 2.
 *
 * INVARIANT 5: the profile arrives in the request body and is never persisted.
 * There is no user table, no session store, and nothing here writes.
 *
 * No AI provider is involved at any point in this path, which is what makes
 * invariant 2 true: with every API key removed, this endpoint still works.
 */

const RequestSchema = z.object({
  profile: ProfileSchema,
  locale: z.enum(routing.locales).default(routing.defaultLocale),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    // A rejected field is surfaced, not silently dropped — the voice path in
    // Phase 4 depends on invalid extraction being a visible error.
    return Response.json(
      {
        error: 'invalid profile',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const { profile, locale } = parsed.data;

  try {
    const result = await matchProfile(profile, locale);
    const nextQuestion = selectNextQuestion([...result.pass, ...result.unknown, ...result.fail], profile);

    return Response.json({ result, nextQuestion });
  } catch (error) {
    console.error('match failed', error);
    return Response.json({ error: 'matching failed' }, { status: 503 });
  }
}
