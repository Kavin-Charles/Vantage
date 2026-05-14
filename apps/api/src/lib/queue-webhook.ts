import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';

export type WebhookEvent = 'deal.stage_changed' | 'item.moved';

export async function queueWebhook(
  db: Kysely<Database>,
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await db
    .selectFrom('webhook_subscriptions')
    .select(['id'])
    .where('workspace_id', '=', workspaceId)
    .where('event', '=', event)
    .execute();

  if (subscriptions.length === 0) return;

  const now = new Date().toISOString();
  await db
    .insertInto('webhook_deliveries')
    .values(
      subscriptions.map(sub => ({
        subscription_id: sub.id,
        event,
        payload: JSON.stringify(payload),
        next_attempt_at: now,
      })),
    )
    .execute();
}
