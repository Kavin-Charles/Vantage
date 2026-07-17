import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const periodSchema = z.object({
  period: z.enum(['30d', '90d', '12m']).default('30d'),
});

const revenueQuerySchema = periodSchema.extend({
  owner_id: z.string().uuid().optional(),
});

const pipelineQuerySchema = periodSchema.extend({
  owner_id: z.string().uuid().optional(),
  stage: z.string().max(100).optional(),
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
      const { period, owner_id: revenueOwnerId } = revenueQuerySchema.parse(req.query);
      const periodStart = getPeriodStart(period);
      const periodEnd = new Date();

      // Query 1: Won records in period (for revenue KPIs)
      let wonQ = db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
        .leftJoin('record_type_fields as rtf', join =>
          join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
        )
        .select([
          sql<string>`COUNT(DISTINCT pr.id)`.as('deals_won'),
          sql<string>`COALESCE(SUM((rfv.value #>> '{}')::numeric), 0)`.as('total_revenue'),
          sql<string>`COALESCE(AVG((rfv.value #>> '{}')::numeric), 0)`.as('avg_deal_size'),
        ])
        .where('pr.workspace_id', '=', workspace.id)
        .where('ps.is_won', '=', true)
        .where('pr.deleted_at', 'is', null)
        .where('pr.created_at', '>=', periodStart as never)
        .where('pr.created_at', '<', periodEnd as never);
      if (revenueOwnerId) wonQ = wonQ.where('pr.owner_id', '=', revenueOwnerId);
      const wonRows = await wonQ.executeTakeFirstOrThrow();

      // Query 2: Lost records in period (for win rate denominator)
      let lostQ = db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .select(sql<string>`COUNT(*)`.as('lost_count'))
        .where('pr.workspace_id', '=', workspace.id)
        .where('ps.is_lost', '=', true)
        .where('pr.deleted_at', 'is', null)
        .where('pr.created_at', '>=', periodStart as never)
        .where('pr.created_at', '<', periodEnd as never);
      if (revenueOwnerId) lostQ = lostQ.where('pr.owner_id', '=', revenueOwnerId);
      const lostCount = await lostQ.executeTakeFirstOrThrow();

      const dealsWon = Number(wonRows.deals_won);
      const dealsLost = Number(lostCount.lost_count);
      const totalClosed = dealsWon + dealsLost;
      const totalRevenue = Number(wonRows.total_revenue);
      const avgDealSize = Number(wonRows.avg_deal_size);
      const winRate = totalClosed > 0 ? dealsWon / totalClosed : 0;

      // Time series: bucket won records by week (30d/90d) or month (12m)
      const bucketExpr = period === '12m'
        ? sql<string>`DATE_TRUNC('month', pr.created_at)`
        : sql<string>`DATE_TRUNC('week', pr.created_at)`;

      let seriesQ = db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
        .leftJoin('record_type_fields as rtf', join =>
          join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
        )
        .where('pr.workspace_id', '=', workspace.id)
        .where('ps.is_won', '=', true)
        .where('pr.deleted_at', 'is', null)
        .where('pr.created_at', '>=', periodStart as never)
        .where('pr.created_at', '<', periodEnd as never);
      if (revenueOwnerId) seriesQ = seriesQ.where('pr.owner_id', '=', revenueOwnerId);
      const seriesRows = await seriesQ
        .select([
          bucketExpr.as('bucket'),
          sql<string>`COALESCE(SUM((rfv.value #>> '{}')::numeric), 0)`.as('revenue'),
          sql<string>`COUNT(DISTINCT pr.id)`.as('count'),
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
      const { period, owner_id: pipelineOwnerId, stage: stageFilter } = pipelineQuerySchema.parse(req.query);
      const periodStart = getPeriodStart(period);

      let stageQ = db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
        .leftJoin('record_type_fields as rtf', join =>
          join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
        )
        .where('pr.workspace_id', '=', workspace.id)
        .where('pr.deleted_at', 'is', null)
        .where('pr.updated_at', '>=', periodStart as never);
      if (pipelineOwnerId) stageQ = stageQ.where('pr.owner_id', '=', pipelineOwnerId);
      if (stageFilter) stageQ = stageQ.where(sql`lower(ps.name)` as never, '=', stageFilter.toLowerCase() as never);
      const stageRows = await stageQ
        .select([
          'pr.stage_id',
          'ps.name as stage_name',
          'ps.color as stage_color',
          'ps.position',
          sql<string>`COUNT(DISTINCT pr.id)`.as('count'),
          sql<string>`COALESCE(SUM((rfv.value #>> '{}')::numeric), 0)`.as('value'),
        ])
        .groupBy(['pr.stage_id', 'ps.name', 'ps.color', 'ps.position'])
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
      const periodEnd = new Date();

      const teamRows = await db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .innerJoin('users as u', 'u.id', 'pr.owner_id')
        .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
        .leftJoin('record_type_fields as rtf', join =>
          join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
        )
        .select([
          'u.id as owner_id',
          'u.name as owner_name',
          sql<string>`COUNT(DISTINCT pr.id)`.as('total_records'),
          sql<string>`COUNT(DISTINCT pr.id) FILTER (WHERE ps.is_won)`.as('deals_won'),
          sql<string>`COALESCE(SUM((rfv.value #>> '{}')::numeric) FILTER (WHERE ps.is_won), 0)`.as('total_revenue'),
          sql<string>`COUNT(DISTINCT pr.id) FILTER (WHERE ps.is_lost)`.as('deals_lost'),
        ])
        .where('pr.workspace_id', '=', workspace.id)
        .where('pr.deleted_at', 'is', null)
        .where('pr.created_at', '>=', periodStart as never)
        .where('pr.created_at', '<', periodEnd as never)
        .groupBy(['u.id', 'u.name'])
        .execute();

      const reps = teamRows.map(r => ({
        user_id: r.owner_id,
        name: r.owner_name,
        deals_won: Number(r.deals_won),
        revenue: Number(r.total_revenue),
        win_rate: Number(r.total_records) > 0 ? Number(r.deals_won) / Number(r.total_records) : 0,
      }));

      res.json({ data: { reps }, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
