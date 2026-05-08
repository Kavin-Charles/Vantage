import { db } from '../lib/db';
import { logger } from '../lib/logger';

export async function runUsageSnapshot(): Promise<void> {
  const workspaces = await db
    .selectFrom('workspaces')
    .where('plan', '!=', 'cancelled')
    .selectAll()
    .execute();

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  for (const workspace of workspaces) {
    try {
      const base = 79_00;
      const contactOverage = Math.max(0, workspace.contact_count - 1000);
      const serverOverage = Math.max(0, workspace.server_count - 5);
      const dbOverage = Math.max(0, workspace.db_count - 3);
      const seatOverage = Math.max(0, workspace.seat_count - 5);
      const overageCents =
        Math.ceil(contactOverage / 500) * 10_00 +
        serverOverage * 8_00 +
        dbOverage * 6_00 +
        seatOverage * 12_00;
      const totalCents = base + overageCents;

      await db
        .insertInto('usage_meters')
        .values({
          workspace_id: workspace.id,
          period_start: periodStart,
          period_end: periodEnd,
          contact_count_peak: workspace.contact_count,
          server_count_peak: workspace.server_count,
          db_count_peak: workspace.db_count,
          seat_count_peak: workspace.seat_count,
          base_fee: base / 100,
          overage_total: overageCents / 100,
          total_bill: totalCents / 100,
          status: 'pending',
        })
        .onConflict(oc => oc.columns(['workspace_id', 'period_start']).doUpdateSet({
          contact_count_peak: workspace.contact_count,
          server_count_peak: workspace.server_count,
          db_count_peak: workspace.db_count,
          seat_count_peak: workspace.seat_count,
          total_bill: totalCents / 100,
          overage_total: overageCents / 100,
        }))
        .execute();

      logger.info({ workspaceId: workspace.id, totalCents }, 'usage snapshot recorded');
    } catch (err) {
      logger.error({ err, workspaceId: workspace.id }, 'usage snapshot error');
    }
  }
}
