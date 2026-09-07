import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | undefined;

/**
 * Lazily constructed so that importing this module never opens a connection.
 * Build-time and unit-test contexts must be able to import the schema without a
 * running database.
 */
export function getDb(): Db {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');
  }

  const client = postgres(url, { max: 10 });
  cached = drizzle(client, { schema });
  return cached;
}

export { schema };
