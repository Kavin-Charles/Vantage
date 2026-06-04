import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export const WEBHOOK_EVENTS = [
  'contact.created',
  'contact.updated',
  'deal.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'task.created',
  'task.completed',
  'alert.created',
  'alert.resolved',
  'item.moved',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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
