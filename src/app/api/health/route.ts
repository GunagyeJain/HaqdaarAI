import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness + database reachability. Used by the Phase 0 smoke test and by
 * deployment checks. Deliberately reports database failure as a 503 with the
 * reason rather than throwing — a broken database should be legible, not a 500.
 */
export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`select 1`);

    return Response.json({ status: 'ok', database: 'reachable' });
  } catch (error) {
    return Response.json(
      {
        status: 'degraded',
        database: 'unreachable',
        reason: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 503 },
    );
  }
}
