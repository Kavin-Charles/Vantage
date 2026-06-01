import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const periodSchema = z.object({
  period: z.enum(['30d', '90d', '12m']).default('30d'),
});

function getPeriodStart(period: '30d' | '90d' | '12m'): Date {
  const d = new Date();
  if (period === '30d') d.setDate(d.getDate() - 30);
  else if (period === '90d') d.setDate(d.getDate() - 90);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

export function createAnalyticsRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // GET /api/analytics/revenue?period=30d|90d|12m
  router.get('/revenue', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { period } = periodSchema.parse(req.query);
      const periodStart = getPeriodStart(period);

      // Query 1: Won deals in period (for revenue KPIs)
      const wonRows = await db
        .selectFrom('deals as d')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'd.stage_id')
        .where('d.workspace_id', '=', workspace.id)
        .where('d.deleted_at', 'is', null)
        .where('ps.is_won', '=', true)
        .where(sql<boolean>`d.close_date IS NOT NULL AND d.close_date >= ${periodStart.toISOString()}`)
        .select([
          sql<string>`COUNT(*)`.as('deals_won'),
          sql<string>`COALESCE(SUM(d.value), 0)`.as('total_revenue'),
          sql<string>`COALESCE(AVG(d.value), 0)`.as('avg_deal_size'),
        ])
        .executeTakeFirstOrThrow();

      // Query 2: Lost deals in period (for win rate denominator)
      const lostCount = await db
        .selectFrom('deals as d')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'd.stage_id')
        .where('d.workspace_id', '=', workspace.id)
        .where('d.deleted_at', 'is', null)
        .where('ps.is_lost', '=', true)
        .where(sql<boolean>`d.close_date IS NOT NULL AND d.close_date >= ${periodStart.toISOString()}`)
        .select(sql<string>`COUNT(*)`.as('lost_count'))
        .executeTakeFirstOrThrow();

      const dealsWon = Number(wonRows.deals_won);
      const dealsLost = Number(lostCount.lost_count);
      const totalClosed = dealsWon + dealsLost;
      const totalRevenue = Number(wonRows.total_revenue);
      const avgDealSize = Number(wonRows.avg_deal_size);
      const winRate = totalClosed > 0 ? dealsWon / totalClosed : 0;

      // Time series: bucket won deals by week (30d/90d) or month (12m)
      const bucketExpr = period === '12m'
        ? sql<string>`DATE_TRUNC('month', d.close_date)`
        : sql<string>`DATE_TRUNC('week', d.close_date)`;

      const seriesRows = await db
        .selectFrom('deals as d')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'd.stage_id')
        .where('d.workspace_id', '=', workspace.id)
        .where('d.deleted_at', 'is', null)
        .where('ps.is_won', '=', true)
        .where(sql<boolean>`d.close_date IS NOT NULL AND d.close_date >= ${periodStart.toISOString()}`)
        .select([
          bucketExpr.as('bucket'),
          sql<string>`COALESCE(SUM(d.value), 0)`.as('revenue'),
          sql<string>`COUNT(*)`.as('count'),
        ])
        .groupBy(bucketExpr)
        .orderBy(bucketExpr)
        .execute();

      const series = seriesRows.map(row => ({
        label: new Date(row.bucket).toISOString(),
        revenue: Number(row.revenue),
        count: Number(row.count),
      }));

      res.json({
        data: { total_revenue: totalRevenue, deals_won: dealsWon, win_rate: winRate, avg_deal_size: avgDealSize, series },
        error: null,
      });
    } catch (err) { next(err); }
  });

  // GET /api/analytics/pipeline?period=
  router.get('/pipeline', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { period } = periodSchema.parse(req.query);
      const periodStart = getPeriodStart(period);

      const stageRows = await db
        .selectFrom('deals as d')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'd.stage_id')
        .where('d.workspace_id', '=', workspace.id)
        .where('d.deleted_at', 'is', null)
        .where(sql<boolean>`d.updated_at >= ${periodStart.toISOString()}`)
        .select([
          'd.stage_id',
          'ps.name as stage_name',
          'ps.color as stage_color',
          'ps.position',
          sql<string>`COUNT(*)`.as('count'),
          sql<string>`COALESCE(SUM(d.value), 0)`.as('value'),
        ])
        .groupBy(['d.stage_id', 'ps.name', 'ps.color', 'ps.position'])
        .orderBy('ps.position', 'asc')
        .execute();

      const stages = stageRows.map(s => ({
        stage_id: s.stage_id,
        stage_name: s.stage_name,
        stage_color: s.stage_color,
        count: Number(s.count),
        value: Number(s.value),
      }));

      res.json({ data: { stages }, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/analytics/team?period=
  router.get('/team', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { period } = periodSchema.parse(req.query);
      const periodStart = getPeriodStart(period);

      const repRows = await db
        .selectFrom('deals as d')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'd.stage_id')
        .innerJoin('users as u', 'u.id', 'd.owner_id')
        .where('d.workspace_id', '=', workspace.id)
        .where('d.deleted_at', 'is', null)
        .where(eb => eb.or([eb('ps.is_won', '=', true), eb('ps.is_lost', '=', true)]))
        .where(sql<boolean>`d.updated_at >= ${periodStart.toISOString()}`)
        .select([
          'd.owner_id as user_id',
          'u.name',
          sql<string>`COUNT(*) FILTER (WHERE ps.is_won = true)`.as('deals_won'),
          sql<string>`COALESCE(SUM(d.value) FILTER (WHERE ps.is_won = true), 0)`.as('revenue'),
          sql<string>`COUNT(*)`.as('total_closed'),
        ])
        .groupBy(['d.owner_id', 'u.name'])
        .orderBy(
          sql<string>`COUNT(*) FILTER (WHERE ps.is_won = true)`,
          'desc'
        )
        .execute();

      const reps = repRows.map(r => ({
        user_id: r.user_id,
        name: r.name,
        deals_won: Number(r.deals_won),
        revenue: Number(r.revenue),
        win_rate: Number(r.total_closed) > 0 ? Number(r.deals_won) / Number(r.total_closed) : 0,
      }));

      res.json({ data: { reps }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
