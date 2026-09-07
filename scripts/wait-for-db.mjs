#!/usr/bin/env node
/** Blocks until Postgres accepts a connection. Used by CI and by `pnpm db:up`. */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL ?? 'postgresql://haqdaar:haqdaar@localhost:5433/haqdaar';
const timeoutMs = 60_000;
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  const client = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await client`select 1`;
    await client.end({ timeout: 1 });
    console.log(`Database ready after ${Date.now() - startedAt}ms.`);
    process.exit(0);
  } catch {
    await client.end({ timeout: 1 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

console.error(`Database not reachable at ${url} after ${timeoutMs}ms.`);
process.exit(1);
