import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';
import { resolvePermissions } from '../middleware/permission';

const dashboardNameSchema = z.object({
  name: z.string().min(1).max(100),
});

const layoutWidgetSchema = z.object({
  widget_id: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  min_w: z.number().int().min(1).nullable().optional(),
  min_h: z.number().int().min(1).nullable().optional(),
  permission_key: z.string().nullable().optional(),
});

const saveLayoutSchema = z.object({
  widgets: z.array(layoutWidgetSchema),
});

const assignGroupsSchema = z.object({
  group_ids: z.array(z.string().uuid()),
});

async function getUserGroupIds(
  db: Kysely<Database>,
  userId: string,
  workspaceId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('group_members')
    .where('user_id', '=', userId)
    .where('workspace_id', '=', workspaceId)
    .select('group_id')
    .execute();
  return rows.map(r => r.group_id);
}

async function canAccessDashboard(
  db: Kysely<Database>,
  dashboardId: string,
  userId: string,
  workspaceId: string,
  role: 'admin' | 'member',
): Promise<boolean> {
  if (role === 'admin') return true;
  const groupIds = await getUserGroupIds(db, userId, workspaceId);
  if (groupIds.length === 0) return false;
  const row = await db
    .selectFrom('dashboard_group_assignments')
    .where('dashboard_id', '=', dashboardId)
    .where('group_id', 'in', groupIds)
    .select('dashboard_id')
    .executeTakeFirst();
  return !!row;
}

export function createDashboardsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/dashboards — list dashboards visible to current user
  router.get('/', async (req, res, next) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest;

      if (user.role === 'admin') {
        const dashboards = await db
          .selectFrom('dashboards')
          .where('workspace_id', '=', workspace.id)
          .selectAll()
          .orderBy('created_at', 'asc')
          .execute();
        return res.json({ data: dashboards, error: null });
      }

      const groupIds = await getUserGroupIds(db, user.id, workspace.id);
      if (groupIds.length === 0) return res.json({ data: [], error: null });

      const assigned = await db
        .selectFrom('dashboard_group_assignments')
        .where('group_id', 'in', groupIds)
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

  // POST /api/dashboards — create dashboard [admin]
  router.post('/', requireAdmin, async (req, res, next) => {
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

  // GET /api/dashboards/group-assignments — groups with their assigned dashboard, plus all dashboards [admin]
  router.get('/group-assignments', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const groups = await db
        .selectFrom('groups as g')
        .leftJoin('dashboard_group_assignments as dga', 'dga.group_id', 'g.id')
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
      const { user, workspace } = req as unknown as AuthenticatedRequest;
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

      const canAccess = await canAccessDashboard(db, id, user.id, workspace.id, user.role);
      if (!canAccess) {
        return res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
      }

      let layoutRows = await db
        .selectFrom('dashboard_layouts')
        .where('dashboard_id', '=', id)
        .selectAll()
        .execute();

      if (user.role !== 'admin') {
        const enabledModuleIds = (
          await db
            .selectFrom('workspace_modules')
            .where('workspace_id', '=', workspace.id)
            .where('enabled', '=', true)
            .select('module_id')
            .execute()
        ).map(r => r.module_id);

        const userPerms = await resolvePermissions(
          db,
          user.id,
          workspace.id,
          user.role,
          enabledModuleIds,
        );
        layoutRows = layoutRows.filter(
          row => row.permission_key === null || userPerms.has(row.permission_key),
        );
      }

      const groups = await db
        .selectFrom('dashboard_group_assignments')
        .where('dashboard_id', '=', id)
        .select('group_id')
        .execute();

      res.json({
        data: {
          ...dashboard,
          layout: layoutRows,
          group_ids: groups.map(g => g.group_id),
        },
        error: null,
      });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id — rename dashboard [admin]
  router.put('/:id', requireAdmin, async (req, res, next) => {
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

  // DELETE /api/dashboards/:id — delete dashboard [admin]
  router.delete('/:id', requireAdmin, async (req, res, next) => {
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

  // PUT /api/dashboards/:id/layout — replace all layout rows [admin]
  router.put('/:id/layout', requireAdmin, async (req, res, next) => {
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
              })),
            )
            .execute();
        }
      });

      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/dashboards/:id/groups — set group assignments [admin]
  router.put('/:id/groups', requireAdmin, async (req, res, next) => {
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
            .values(parsed.data.group_ids.map(gid => ({ dashboard_id: id, group_id: gid })))
            .execute();
        }
      });

      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
