import { createDb } from '@vencore/db';
import type { Database } from '@vencore/db';
import type { Kysely } from 'kysely';
import { apiEnvSchema } from '@vencore/config';

const env = apiEnvSchema.parse(process.env);
export const db: Kysely<Database> = createDb(env.DATABASE_URL);
