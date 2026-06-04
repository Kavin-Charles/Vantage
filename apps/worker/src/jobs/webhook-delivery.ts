import { createHmac } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

// Backoff: attempts=1 → 2min, attempts=2 → 8min
function nextAttemptOffset(attempts: number): number {
  return attempts * attempts * 2 * 60 * 1000;
}

export async function runWebhookDelivery(db: Kysely<Database>): Promise<void> {
  const now = new Date().toISOString();

  const pending = await db
    .selectFrom('webhook_deliveries as wd')
    .innerJoin('webhook_subscriptions as ws', 'ws.id', 'wd.subscription_id')
    .select([
      'wd.id',
      'wd.subscription_id',
      'wd.event',
      'wd.payload',
      'wd.attempts',
      'ws.target_url',
      'ws.secret',
    ])
    .where('wd.status', '=', 'pending')
    .where('wd.next_attempt_at', '<=', now)
    .limit(50)
    .execute();

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, 'processing webhook deliveries');

  for (const row of pending) {
    const body = JSON.stringify({
      event: row.event,
      payload: row.payload,
      created_at: new Date().toISOString(),
    });

    const signature = 'sha256=' + createHmac('sha256', row.secret).update(body).digest('hex');

    let success = false;
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      const response = await fetch(row.target_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vencore-Signature': signature,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      success = response.ok;
      if (!success) {
        errorMessage = `HTTP ${response.status}`;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const newAttempts = row.attempts + 1;

    if (success) {
      await db
        .updateTable('webhook_deliveries')
        .set({ status: 'delivered', delivered_at: new Date().toISOString() })
        .where('id', '=', row.id)
        .execute();
    } else if (newAttempts >= MAX_ATTEMPTS) {
      await db
        .updateTable('webhook_deliveries')
        .set({ status: 'failed', attempts: newAttempts, last_error: errorMessage })
        .where('id', '=', row.id)
        .execute();
      logger.warn({ id: row.id, target_url: row.target_url, error: errorMessage }, 'webhook delivery permanently failed');
    } else {
      const nextAt = new Date(Date.now() + nextAttemptOffset(newAttempts)).toISOString();
      await db
        .updateTable('webhook_deliveries')
        .set({ attempts: newAttempts, next_attempt_at: nextAt, last_error: errorMessage })
        .where('id', '=', row.id)
        .execute();
      logger.warn({ id: row.id, attempts: newAttempts, next_at: nextAt }, 'webhook delivery failed, will retry');
    }
  }
}
