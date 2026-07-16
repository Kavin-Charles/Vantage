import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { summarizeInfra, summarizePm } from '../lib/analytics-summaries';

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
      const periodEnd = new Date();

      // Query 1: Won records in period (for revenue KPIs)
      const wonRows = await db
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
        .where('pr.created_at', '<', periodEnd as never)
        .executeTakeFirstOrThrow();

      // Query 2: Lost records in period (for win rate denominator)
      const lostCount = await db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .select(sql<string>`COUNT(*)`.as('lost_count'))
        .where('pr.workspace_id', '=', workspace.id)
        .where('ps.is_lost', '=', true)
        .where('pr.deleted_at', 'is', null)
        .where('pr.created_at', '>=', periodStart as never)
        .where('pr.created_at', '<', periodEnd as never)
        .executeTakeFirstOrThrow();

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

      const seriesRows = await db
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
        .where('pr.created_at', '<', periodEnd as never)
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
      const { period } = periodSchema.parse(req.query);
      const periodStart = getPeriodStart(period);

      const stageRows = await db
        .selectFrom('pipeline_records as pr')
        .innerJoin('pipeline_stages as ps', 'ps.id', 'pr.stage_id')
        .leftJoin('record_field_values as rfv', join => join.onRef('rfv.record_id', '=', 'pr.id'))
        .leftJoin('record_type_fields as rtf', join =>
          join.onRef('rtf.id', '=', 'rfv.field_id').on('rtf.label', '=', 'value')
        )
        .where('pr.workspace_id', '=', workspace.id)
        .where('pr.deleted_at', 'is', null)
        .where('pr.updated_at', '>=', periodStart as never)
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

  // GET /api/analytics/infra?period= — infra rollup is a current-state snapshot
  // (servers/websites/open alerts); period is accepted for interface consistency only
  router.get('/infra', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      periodSchema.parse(req.query);

      const servers = await db.selectFrom('servers')
        .select(['status', 'cpu_pct', 'mem_pct', 'disk_pct'])
        .where('workspace_id', '=', workspace.id)
        .execute();

      const websites = await db.selectFrom('websites')
        .select(['uptime_pct_30d', 'ssl_expiry_date'])
        .where('workspace_id', '=', workspace.id)
        .execute();

      const alerts = await db.selectFrom('alerts')
        .select(['severity', sql<string>`COUNT(*)`.as('count')])
        .where('workspace_id', '=', workspace.id)
        .where('resolved', '=', false)
        .groupBy('severity')
        .execute();

      res.json({ data: summarizeInfra(servers, websites, alerts), error: null });
    } catch (err) { next(err); }
  });

  // GET /api/analytics/pm?period= — workspace-wide project management rollup
  router.get('/pm', requirePermission('analytics:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      periodSchema.parse(req.query); // accepted for interface consistency

      const activeProjects = await db.selectFrom('projects')
        .select(sql<string>`COUNT(*)`.as('count'))
        .where('workspace_id', '=', workspace.id)
        .where('status', '=', 'ACTIVE')
        .executeTakeFirstOrThrow();

      const taskStats = await db.selectFrom('project_tasks as t')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED')
        .select([
          sql<string>`COUNT(t.id)`.as('total'),
          sql<string>`COUNT(CASE WHEN s.is_done THEN t.id END)`.as('done'),
          sql<string>`COUNT(CASE WHEN t.due_date < NOW() AND NOT s.is_done THEN t.id END)`.as('overdue'),
          sql<string>`COUNT(CASE WHEN NOT s.is_done THEN t.id END)`.as('open'),
        ])
        .executeTakeFirst();

      const velocityRows = await db.selectFrom('sprints as sp')
        .innerJoin('projects as p', 'p.id', 'sp.project_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED')
        .where('sp.status', 'in', ['COMPLETED', 'ACTIVE'])
        .select(['sp.name', 'sp.velocity', 'sp.end_date'])
        .orderBy('sp.end_date', 'desc')
        .limit(8)
        .execute();

      const workloadRows = await db.selectFrom('project_task_assignees as a')
        .innerJoin('project_tasks as t', 't.id', 'a.task_id')
        .innerJoin('projects as p', 'p.id', 't.project_id')
        .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .where('p.workspace_id', '=', workspace.id)
        .where('p.status', '!=', 'DELETED')
        .groupBy(['a.user_id', 'u.name'])
        .select([
          'a.user_id',
          'u.name',
          sql<string>`COUNT(t.id)`.as('total'),
          sql<string>`COUNT(CASE WHEN s.is_done THEN t.id END)`.as('done'),
          sql<string>`COUNT(CASE WHEN t.due_date < NOW() AND NOT s.is_done THEN t.id END)`.as('overdue'),
        ])
        .orderBy(sql`COUNT(CASE WHEN NOT s.is_done THEN t.id END)`, 'desc')
        .limit(8)
        .execute();

      res.json({
        data: summarizePm(activeProjects.count, taskStats, velocityRows, workloadRows),
        error: null,
      });
    } catch (err) { next(err); }
  });

  return router;
}
