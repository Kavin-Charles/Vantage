import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { VencoreConfig } from '@vencore/config';
import { logger } from './logger';
import { seedDefaultPipeline } from './seed-pipeline';
import { seedWorkspaceModules } from './seed-modules';

export async function seedOnFirstBoot(
  db: Kysely<Database>,
  config: VencoreConfig,
): Promise<void> {
  // Workspace
  let workspace = await db
    .selectFrom('workspaces')
    .select(['id'])
    .executeTakeFirst();

  if (!workspace) {
    workspace = await db
      .insertInto('workspaces')
      .values({
          name: config.app.name,
          domain: config.app.domain ?? config.app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    logger.info({ workspaceId: workspace.id }, '[Vencore] Workspace seeded');
  }

  // Seed module toggles (idempotent)
  await seedWorkspaceModules(db, workspace.id);

  // Default pipeline
  await seedDefaultPipeline(db, workspace.id);

  // Admin user
  const userCount = await db
    .selectFrom('users')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirst();

  if (!userCount || Number(userCount.count) === 0) {
    const isDev = process.env['NODE_ENV'] !== 'production';
    // Dev: fixed credentials for easy testing. Production: random password printed once.
    const password = isDev ? 'admin123' : crypto
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

    console.log(`\n[VENCORE] First boot admin: ${adminEmail} / ${password}\n`);
    logger.info({ email: adminEmail }, '[Vencore] Admin user seeded');
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
      logger.info({ name: dbSeed.name }, '[Vencore] DB seeded from config');
    }
  }
}
