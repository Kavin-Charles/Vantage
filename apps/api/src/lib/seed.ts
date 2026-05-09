import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { VantageConfig } from '@vantage/config';
import { logger } from './logger';
import { seedDefaultPipeline } from './seed-pipeline';

export async function seedOnFirstBoot(
  db: Kysely<Database>,
  config: VantageConfig,
): Promise<void> {
  // Workspace
  let workspace = await db
    .selectFrom('workspaces')
    .select(['id'])
    .executeTakeFirst();

  if (!workspace) {
    workspace = await db
      .insertInto('workspaces')
      .values({ name: config.app.name, domain: config.app.domain ?? null })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    logger.info({ workspaceId: workspace.id }, '[Vantage] Workspace seeded');
  }

  // Default pipeline
  await seedDefaultPipeline(db, workspace.id);

  // Admin user
  const userCount = await db
    .selectFrom('users')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirst();

  if (!userCount || Number(userCount.count) === 0) {
    const password = crypto
      .randomBytes(12)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const hash = await bcrypt.hash(password, 12);
    const adminEmail = `admin@${config.app.domain ?? 'localhost'}`;

    await db
      .insertInto('users')
      .values({
        workspace_id: workspace.id,
        name: 'Admin',
        email: adminEmail,
        password_hash: hash,
        role: 'admin',
      })
      .execute();

    // Print once to stdout — shown only on first boot
    console.log(`\n[VANTAGE] First boot admin password: ${password}\n`);
    logger.info({ email: adminEmail }, '[Vantage] Admin user seeded');
  }

  // Seed databases from config (idempotent — skips if host+port already exists)
  for (const dbSeed of config.databases) {
    const existing = await db
      .selectFrom('infra_databases')
      .where('host', '=', dbSeed.host)
      .where('port', '=', dbSeed.port)
      .select(['id'])
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto('infra_databases')
        .values({
          workspace_id: workspace.id,
          name: dbSeed.name,
          engine: dbSeed.engine,
          host: dbSeed.host,
          port: dbSeed.port,
          db_user: dbSeed.db_user,
          db_password: dbSeed.db_password,
          database_name: dbSeed.database_name,
          use_ssl: dbSeed.use_ssl,
        })
        .execute();
      logger.info({ name: dbSeed.name }, '[Vantage] DB seeded from config');
    }
  }
}
