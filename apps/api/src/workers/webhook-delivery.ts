// Polls webhook_deliveries every 10 seconds and delivers pending webhooks.
import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

const INTERVAL_MS = 10_000;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;

// Delay in seconds after each failed attempt (index = attempt count after failure, 1-based)
const BACKOFF_SECONDS = [30, 300, 1800, 7200] as const;

function nextAttemptAt(attemptCount: number): string {
  const delaySecs = BACKOFF_SECONDS[attemptCount - 1] ?? 7200;
  return new Date(Date.now() + delaySecs * 1000).toISOString();
}

export interface DeliveryRow {
  id: string;
  attempts: number;
  payload: string;
  event: string;
  target_url: string;
  secret: string;
}

export async function deliverOne(db: Kysely<Database>, delivery: DeliveryRow): Promise<void> {
  const { id, attempts, payload, event, target_url, secret } = delivery;

  const signature = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let success = false;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vantage-Signature': signature,
        'X-Vantage-Event': event,
        'X-Vantage-Delivery': id,
      },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      success = true;
    } else {
      errorMsg = `HTTP ${res.status}`;
    }
  } catch (err) {
    clearTimeout(timer);
    errorMsg = err instanceof Error ? err.message : 'Unknown error';
  }

  if (success) {
    await db
      .updateTable('webhook_deliveries')
      .set({ status: 'delivered', delivered_at: new Date().toISOString(), attempts: attempts + 1 })
      .where('id', '=', id)
      .execute();
  } else {
    const newAttempts = attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await db
        .updateTable('webhook_deliveries')
        .set({ status: 'failed', attempts: newAttempts, last_error: errorMsg })
        .where('id', '=', id)
        .execute();
    } else {
      await db
        .updateTable('webhook_deliveries')
        .set({
          attempts: newAttempts,
          next_attempt_at: nextAttemptAt(newAttempts),
          last_error: errorMsg,
        })
        .where('id', '=', id)
        .execute();
    }
  }
}

async function runDeliveries(db: Kysely<Database>): Promise<void> {
  const result = await sql<DeliveryRow>`
    SELECT wd.id, wd.attempts, wd.payload, wd.event, ws.target_url, ws.secret
    FROM webhook_deliveries wd
    JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
    WHERE wd.status = 'pending'
      AND wd.next_attempt_at <= NOW()
    ORDER BY wd.next_attempt_at ASC
    LIMIT 20
    FOR UPDATE OF wd SKIP LOCKED
  `.execute(db);

  if (result.rows.length === 0) return;

  await Promise.allSettled(
    result.rows.map(row =>
      deliverOne(db, row).catch(err =>
        logger.error({ err, delivery_id: row.id }, '[webhook-delivery] deliver failed'),
      ),
    ),
  );
}

let isRunning = false;

export function startWebhookDelivery(db: Kysely<Database>): void {
  const tick = () => {
    if (isRunning) return;
    isRunning = true;
    runDeliveries(db)
      .catch(err => logger.error({ err }, '[webhook-delivery] run failed'))
      .finally(() => {
        isRunning = false;
      });
  };

  tick();
  setInterval(tick, INTERVAL_MS);
  logger.info('webhook delivery worker started (10-s polling)');
}
