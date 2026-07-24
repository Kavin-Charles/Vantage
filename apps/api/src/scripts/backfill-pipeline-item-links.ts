// apps/api/src/scripts/backfill-pipeline-item-links.ts
/**
 * One-time backfill: sets contact_id/company_id on existing pipeline_items
 * rows that predate the 20260724_001_pipeline_items_links migration.
 *
 * Matches the company-name prefix of field_values.name (deals are named
 * "<Company> — <Plan>", e.g. "Stackline — Developer Plan") against
 * companies.name (ilike prefix match), sets company_id, and sets contact_id
 * to that company's first contact.
 *
 * Safe to re-run — only touches rows where contact_id IS NULL.
 * Usage: DATABASE_URL=postgres://... pnpm --filter @vencore/api exec tsx src/scripts/backfill-pipeline-item-links.ts
 */
import path from 'node:path';
import { createDb } from '@vencore/db';
import { logger } from '../lib/logger';

// Load the repo-root .env the same way `pnpm dev` does (--env-file=../../.env
// from apps/api). Resolved from this file's own location so it works
// regardless of the invoking shell's cwd.
const repoRootEnv = path.resolve(__dirname, '../../../../.env');
if (!process.env['DATABASE_URL']) {
  process.loadEnvFile(repoRootEnv);
}

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL env var required');
const db = createDb(DATABASE_URL);

async function backfill() {
  const workspaces = await db.selectFrom('workspaces').select(['id']).execute();
  logger.info({ workspaceCount: workspaces.length }, '[Backfill] Starting pipeline_items contact/company link backfill');

  let totalLinked = 0;
  let totalSkipped = 0;

  for (const ws of workspaces) {
    const items = await db
      .selectFrom('pipeline_items')
      .select(['id', 'field_values'])
      .where('workspace_id', '=', ws.id)
      .where('contact_id', 'is', null)
      .where('deleted_at', 'is', null)
      .execute();

    if (items.length === 0) continue;

    let linked = 0;
    let skipped = 0;

    for (const item of items) {
      const fieldValues = item.field_values as Record<string, unknown>;
      const name = typeof fieldValues['name'] === 'string' ? fieldValues['name'] : null;

      if (!name || !name.includes(' — ')) {
        skipped++;
        continue;
      }

      const prefix = name.split(' — ')[0]!.trim();
      if (!prefix) {
        skipped++;
        continue;
      }

      const company = await db
        .selectFrom('companies')
        .select(['id'])
        .where('workspace_id', '=', ws.id)
        .where('name', 'ilike', `${prefix}%`)
        .executeTakeFirst();

      if (!company) {
        skipped++;
        continue;
      }

      const contact = await db
        .selectFrom('contacts')
        .select(['id'])
        .where('workspace_id', '=', ws.id)
        .where('company_id', '=', company.id)
        .executeTakeFirst();

      await db
        .updateTable('pipeline_items')
        .set({ company_id: company.id, contact_id: contact?.id ?? null })
        .where('id', '=', item.id)
        .where('workspace_id', '=', ws.id)
        .execute();

      linked++;
    }

    totalLinked += linked;
    totalSkipped += skipped;
    logger.info({ workspaceId: ws.id, itemsSeen: items.length, linked, skipped }, '[Backfill] Workspace processed');
  }

  logger.info({ totalLinked, totalSkipped }, '[Backfill] Complete');
  await db.destroy();
}

backfill().catch(err => {
  logger.error({ err }, '[Backfill] Failed');
  process.exit(1);
});
