import { config } from 'dotenv';

// CI supplies env vars directly; locally we read .env.local.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
