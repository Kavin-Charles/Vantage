import { createDb } from '@vantage/db';
import type { Database } from '@vantage/db';
import type { Kysely } from 'kysely';
import { apiEnvSchema } from '@vantage/config';

const env = apiEnvSchema.parse(process.env);
export const db: Kysely<Database> = createDb(env.DATABASE_URL);
