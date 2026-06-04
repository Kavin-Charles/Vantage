import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';

// Servers not pinged in this window are marked offline
const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export async function runServerStaleness(db: Kysely<Database>): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  // Find servers that have gone stale (last_ping_at too old) but aren't already offline/stopped
  const staleServers = await db
    .selectFrom('servers')
    .select(['id', 'workspace_id', 'name', 'status'])
    .where('last_ping_at', 'is not', null)
    .where('last_ping_at', '<', cutoff)
    .where('status', 'not in', ['offline', 'stopped'])
    .execute();

  if (staleServers.length === 0) return;

  logger.info({ count: staleServers.length }, 'marking stale servers offline');

  for (const server of staleServers) {
    const now = new Date().toISOString();

    // Mark offline
    await db
      .updateTable('servers')
      .set({ status: 'offline', updated_at: now })
      .where('id', '=', server.id)
      .execute();

    // Create alert if no existing unresolved server-offline alert for this server
    const existing = await db
      .selectFrom('alerts')
      .select(['id'])
      .where('workspace_id', '=', server.workspace_id)
      .where('resource_type', '=', 'server')
      .where('resource_id', '=', server.id)
      .where('resolved', '=', false)
      .where('message', 'like', 'Server offline%')
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto('alerts')
        .values({
          workspace_id: server.workspace_id,
          resource_type: 'server',
          resource_id: server.id,
          severity: 'critical',
          message: `Server offline: "${server.name}" has not reported in over 3 minutes`,
        })
        .execute();
    }
  }
}
