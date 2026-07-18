import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { createRequirePermission, resolveUserPermissions, getEnabledModuleIds } from '../middleware/permission';

const dashboardNameSchema = z.object({
  name: z.string().min(1).max(100),
});

const widgetConfigSchema = z.object({
  timeRange: z.enum(['1d', '7d', '30d']).optional(),
  limit: z.number().int().min(1).optional(),
  compactMode: z.boolean().optional(),
  chartType: z.enum(['line', 'bar', 'pie', 'area']).optional(),
  refreshInterval: z.number().int().min(1).optional(),
  filters: z.record(z.string(), z.string()).optional(),
}).passthrough();

const layoutWidgetSchema = z.object({
  widget_id: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  min_w: z.number().int().min(1).nullable().optional(),
  min_h: z.number().int().min(1).nullable().optional(),
  permission_key: z.string().nullable().optional(),
  config: widgetConfigSchema.optional(),
});

const saveLayoutSchema = z.object({
  widgets: z.array(layoutWidgetSchema),
});

const assignGroupsSchema = z.object({
  group_ids: z.array(z.string().uuid()),
});

async function getUserRoleIds(
  db: Kysely<Database>,
  userId: string,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('user_roles')
    .where('user_id', '=', userId)
    .where('workspace_id', '=', workspaceId)
    .select('role_id')
    .execute();
  return rows.map(r => r.role_id);
}

async function canAccessDashboard(
  db: Kysely<Database>,
  dashboardId: string,
  userId: string,
  workspaceId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const roleIds = await getUserRoleIds(db, userId, workspaceId);
  if (roleIds.length === 0) return false;
  const row = await db
    .selectFrom('dashboard_group_assignments')
    .where('dashboard_id', '=', dashboardId)
    .where('role_id', 'in', roleIds)
    .select('dashboard_id')
    .executeTakeFirst();
  return !!row;
}

export function createDashboardsRouter(db: Kysely<Database>): Router {
  const router = Router();
  const requirePermission = createRequirePermission(db);

  // GET /api/dashboards — list dashboards visible to current user
  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace, isAdmin } = req as unknown as AuthenticatedRequest;

      if (isAdmin) {
        const dashboards = await db
          .selectFrom('dashboards')
          .where('workspace_id', '=', workspace.id)
          .selectAll()
          .orderBy('created_at', 'asc')
          .execute();
        return res.json({ data: dashboards, error: null });
      }

      const roleIds = await getUserRoleIds(db, user.id, workspace.id);
      if (roleIds.length === 0) return res.json({ data: [], error: null });

      const assigned = await db
        .selectFrom('dashboard_group_assignments')
        .where('role_id', 'in', roleIds)
        .select('dashboard_id')
        .execute();
      const ids = [...new Set(assigned.map(r => r.dashboard_id))];
      if (ids.length === 0) return res.json({ data: [], error: null });

      const dashboards = await db
        .selectFrom('dashboards')
        .where('workspace_id', '=', workspace.id)
        .where('id', 'in', ids)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: dashboards, error: null });
    } catch (err) { next(err); }
  });

  // POST /api/dashboards — create dashboard [workspace:manage]
  router.post('/', requirePermission('workspace:manage'), async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;
      const parsed = dashboardNameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }
      const dashboard = await db
        .insertInto('dashboards')
        .values({
          workspace_id: workspace.id,
          name: parsed.data.name,
          created_by: user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      res.status(201).json({ data: dashboard, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/dashboards/group-assignments — roles with their assigned dashboard, plus all dashboards [workspace:manage]
  router.get('/group-assignments', requirePermission('workspace:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const groups = await db
        .selectFrom('roles as g')
        .leftJoin('dashboard_group_assignments as dga', 'dga.role_id', 'g.id')
        .where('g.workspace_id', '=', workspace.id)
        .select(['g.id', 'g.name', 'g.color', 'dga.dashboard_id'])
        .orderBy('g.name', 'asc')
        .execute();

      const dashboards = await db
        .selectFrom('dashboards')
        .where('workspace_id', '=', workspace.id)
        .select(['id', 'name'])
        .orderBy('name', 'asc')
        .execute();

      res.json({ data: { groups, dashboards }, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/dashboards/:id — get dashboard + layout + groups (permission-filtered)
  router.get('/:id', async (req, res, next) => {
    try {
      const { user, workspace, isAdmin } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const dashboard = await db
        .selectFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();
      if (!dashboard) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }

      const canAccess = await canAccessDashboard(db, id, user.id, workspace.id, isAdmin);
      if (!canAccess) {
        return res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
      }

      let layoutRows = await db
        .selectFrom('dashboard_layouts')
        .where('dashboard_id', '=', id)
        .selectAll()
        .execute();

      if (!isAdmin) {
        const enabledModuleIds = await getEnabledModuleIds(db, workspace.id);
        const resolved = await resolveUserPermissions(db, user.id, workspace.id, enabledModuleIds);
        layoutRows = layoutRows.filter(
          row => row.permission_key === null || resolved.permissions.has(row.permission_key),
        );
      }

      const groups = await db
        .selectFrom('dashboard_group_assignments')
        .where('dashboard_id', '=', id)
        .select('role_id')
        .execute();

      res.json({
        data: {
          ...dashboard,
          layout: layoutRows,
          group_ids: groups.map(g => g.role_id),
        },
        error: null,
      });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id — rename dashboard [workspace:manage]
  router.put('/:id', requirePermission('workspace:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const parsed = dashboardNameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }
      const dashboard = await db
        .updateTable('dashboards')
        .set({ name: parsed.data.name, updated_at: new Date() })
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!dashboard) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }
      res.json({ data: dashboard, error: null });
    } catch (err) { next(err); }
  });

  // DELETE /api/dashboards/:id — delete dashboard [workspace:manage]
  router.delete('/:id', requirePermission('workspace:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const deleted = await db
        .deleteFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!deleted) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id/layout — replace all layout rows [workspace:manage]
  router.put('/:id/layout', requirePermission('workspace:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const parsed = saveLayoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }

      const exists = await db
        .selectFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!exists) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }

      await db.transaction().execute(async trx => {
        await trx.deleteFrom('dashboard_layouts').where('dashboard_id', '=', id).execute();
        if (parsed.data.widgets.length > 0) {
          await trx
            .insertInto('dashboard_layouts')
            .values(
              parsed.data.widgets.map(w => ({
                dashboard_id: id,
                widget_id: w.widget_id,
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
                min_w: w.min_w ?? null,
                min_h: w.min_h ?? null,
                permission_key: w.permission_key ?? null,
                config: w.config ?? {},
              })),
            )
            .execute();
        }
      });

      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id/groups — set role assignments [workspace:manage]
  router.put('/:id/groups', requirePermission('workspace:manage'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const parsed = assignGroupsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error } });
      }

      const exists = await db
        .selectFrom('dashboards')
        .where('id', '=', id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!exists) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
      }

      await db.transaction().execute(async trx => {
        await trx
          .deleteFrom('dashboard_group_assignments')
          .where('dashboard_id', '=', id)
          .execute();
        if (parsed.data.group_ids.length > 0) {
          await trx
            .insertInto('dashboard_group_assignments')
            .values(parsed.data.group_ids.map(rid => ({ dashboard_id: id, role_id: rid })))
            .execute();
        }
      });

      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
