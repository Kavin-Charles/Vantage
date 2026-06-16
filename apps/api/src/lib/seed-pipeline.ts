import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

const DEFAULT_STAGES = [
  { name: 'Lead',       color: '#6366f1', position: 1, is_won: false, is_lost: false },
  { name: 'Qualifying', color: '#8b5cf6', position: 2, is_won: false, is_lost: false },
  { name: 'Proposal',   color: '#a855f7', position: 3, is_won: false, is_lost: false },
  { name: 'Closing',    color: '#ec4899', position: 4, is_won: false, is_lost: false },
  { name: 'Won',        color: '#22c55e', position: 5, is_won: true,  is_lost: false },
  { name: 'Lost',       color: '#ef4444', position: 6, is_won: false, is_lost: true  },
] as const;

export async function seedDefaultPipeline(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<void> {
  const existing = await db
    .selectFrom('pipelines')
    .where('workspace_id', '=', workspaceId)
    .select(['id'])
    .executeTakeFirst();

  if (existing) return;

  const pipeline = await db
    .insertInto('pipelines')
    .values({
      workspace_id: workspaceId,
      name: 'Sales',
      is_default: true,
      position: 0,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  await db
    .insertInto('pipeline_stages')
    .values(DEFAULT_STAGES.map(s => ({ ...s, pipeline_id: pipeline.id })))
    .execute();

  logger.info({ pipelineId: pipeline.id }, '[Vencore] Default pipeline seeded');
}
