import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { authorizedRoleClosure } from '../lib/rbac/closure';
import { loadInheritanceEdges } from '../lib/rbac/db';
import { checkSSD, checkDSD, type ConstraintSet } from '../lib/rbac/constraints';

const setSchema = z.object({
  name: z.string().min(1).max(100),
  cardinality: z.number().int().min(2),
  roleIds: z.array(z.string().uuid()).min(2),
});

const updateSetSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    cardinality: z.number().int().min(2).optional(),
    roleIds: z.array(z.string().uuid()).min(2).optional(),
  })
  .refine(o => Object.keys(o).length > 0, { message: 'No fields to update' });

type ClosureEntry = { userId: string; closure: Set<string> };
type ConflictEntry = { userId: string; sets: { setId: string; name: string }[] };

// One role_id row per (user, role) — collapse to each user's assigned role list, then
// expand through inheritance to the authorized closure used for SSD checks.
async function computeAuthorizedClosures(
  db: Kysely<Database>, workspaceId: string, edges: Awaited<ReturnType<typeof loadInheritanceEdges>>,
): Promise<ClosureEntry[]> {
  const rows = await db.selectFrom('user_roles')
    .where('workspace_id', '=', workspaceId)
    .select(['user_id', 'role_id'])
    .execute();
  const byUser = new Map<string, string[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.role_id);
    byUser.set(r.user_id, list);
  }
  return [...byUser.entries()].map(([userId, roleIds]) => ({ userId, closure: authorizedRoleClosure(roleIds, edges) }));
}

// Same shape, but sourced from ACTIVE session roles (user_session_roles.active = true),
// scoped to the workspace via the owning user — used for DSD checks.
async function computeActiveClosures(
  db: Kysely<Database>, workspaceId: string, edges: Awaited<ReturnType<typeof loadInheritanceEdges>>,
): Promise<ClosureEntry[]> {
  const rows = await db.selectFrom('user_session_roles as usr')
    .innerJoin('users as u', 'u.id', 'usr.user_id')
    .where('usr.active', '=', true)
    .where('u.workspace_id', '=', workspaceId)
    .select(['usr.user_id', 'usr.role_id'])
    .execute();
  const byUser = new Map<string, string[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.role_id);
    byUser.set(r.user_id, list);
  }
  return [...byUser.entries()].map(([userId, roleIds]) => ({ userId, closure: authorizedRoleClosure(roleIds, edges) }));
}

function findConflicts(
  closures: ClosureEntry[],
  candidate: ConstraintSet,
  check: (closure: Set<string>, sets: ConstraintSet[]) => { setId: string; name: string }[],
): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];
  for (const entry of closures) {
    const violations = check(entry.closure, [candidate]);
    if (violations.length > 0) conflicts.push({ userId: entry.userId, sets: violations });
  }
  return conflicts;
}

// Every role ID in a set's roleIds must belong to the caller's workspace — the set-role
// join tables have no workspace_id of their own and trust whatever IDs are passed in.
async function verifyRolesOwned(db: Kysely<Database>, workspaceId: string, roleIds: string[]): Promise<string[] | null> {
  const unique = [...new Set(roleIds)];
  const owned = await db.selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('id', 'in', unique)
    .select('id')
    .execute();
  return owned.length === unique.length ? unique : null;
}

export function createRbacConstraintsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => import('express').RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(requirePermission('roles:manage'));

  // ---------------------------------------------------------------------
  // SSD (static separation of duty) — checked against each user's AUTHORIZED
  // closure (assigned roles + inheritance descendants, from user_roles).
  // ---------------------------------------------------------------------

  router.get('/ssd-sets', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const sets = await db.selectFrom('ssd_sets').where('workspace_id', '=', workspace.id).selectAll().execute();
      const setIds = sets.map(s => s.id);
      const roleRows = setIds.length > 0
        ? await db.selectFrom('ssd_set_roles').where('set_id', 'in', setIds).select(['set_id', 'role_id']).execute()
        : [];
      const roleIdsBySet = new Map<string, string[]>();
      for (const r of roleRows) {
        const list = roleIdsBySet.get(r.set_id) ?? [];
        list.push(r.role_id);
        roleIdsBySet.set(r.set_id, list);
      }
      const data = sets.map(s => ({ ...s, roleIds: roleIdsBySet.get(s.id) ?? [] }));
      res.json({ data, error: null });
    } catch (err) { next(err); }
  });

  router.post('/ssd-sets', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = setSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      const roleIds = await verifyRolesOwned(db, workspace.id, parsed.data.roleIds);
      if (!roleIds || roleIds.length < 2) {
        res.status(400).json({ data: null, error: { code: 'INVALID_ROLE', message: 'One or more roles do not belong to this workspace.' } });
        return;
      }

      const candidate: ConstraintSet = { id: 'candidate', name: parsed.data.name, cardinality: parsed.data.cardinality, roleIds };
      const edges = await loadInheritanceEdges(db);
      const closures = await computeAuthorizedClosures(db, workspace.id, edges);
      const conflicts = findConflicts(closures, candidate, checkSSD);
      if (conflicts.length > 0) {
        res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts } });
        return;
      }

      const set = await db.insertInto('ssd_sets')
        .values({ workspace_id: workspace.id, name: parsed.data.name, cardinality: parsed.data.cardinality })
        .returning(['id', 'name', 'cardinality'])
        .executeTakeFirstOrThrow();
      await db.insertInto('ssd_set_roles').values(roleIds.map(roleId => ({ set_id: set.id, role_id: roleId }))).execute();

      res.status(201).json({ data: { ...set, roleIds }, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/ssd-sets/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const existing = await db.selectFrom('ssd_sets')
        .where('id', '=', id).where('workspace_id', '=', workspace.id).selectAll().executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const parsed = updateSetSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      let roleIds: string[];
      if (parsed.data.roleIds) {
        const owned = await verifyRolesOwned(db, workspace.id, parsed.data.roleIds);
        if (!owned || owned.length < 2) {
          res.status(400).json({ data: null, error: { code: 'INVALID_ROLE', message: 'One or more roles do not belong to this workspace.' } });
          return;
        }
        roleIds = owned;
      } else {
        const rows = await db.selectFrom('ssd_set_roles').where('set_id', '=', id).select('role_id').execute();
        roleIds = rows.map(r => r.role_id);
      }

      const name = parsed.data.name ?? existing.name;
      const cardinality = parsed.data.cardinality ?? existing.cardinality;
      const candidate: ConstraintSet = { id: existing.id, name, cardinality, roleIds };

      const edges = await loadInheritanceEdges(db);
      const closures = await computeAuthorizedClosures(db, workspace.id, edges);
      const conflicts = findConflicts(closures, candidate, checkSSD);
      if (conflicts.length > 0) {
        res.status(409).json({ data: null, error: { code: 'SSD_CONFLICT', conflicts } });
        return;
      }

      await db.updateTable('ssd_sets').set({ name, cardinality }).where('id', '=', id).where('workspace_id', '=', workspace.id).execute();
      if (parsed.data.roleIds) {
        await db.deleteFrom('ssd_set_roles').where('set_id', '=', id).execute();
        await db.insertInto('ssd_set_roles').values(roleIds.map(roleId => ({ set_id: id, role_id: roleId }))).execute();
      }

      res.json({ data: { id, name, cardinality, roleIds }, error: null });
    } catch (err) { next(err); }
  });

  router.delete('/ssd-sets/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const existing = await db.selectFrom('ssd_sets')
        .where('id', '=', id).where('workspace_id', '=', workspace.id).select('id').executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      await db.deleteFrom('ssd_set_roles').where('set_id', '=', id).execute();
      await db.deleteFrom('ssd_sets').where('id', '=', id).where('workspace_id', '=', workspace.id).execute();
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // ---------------------------------------------------------------------
  // DSD (dynamic separation of duty) — mirrors SSD but checked against each
  // user's ACTIVE closure (activated session roles + inheritance descendants).
  // ---------------------------------------------------------------------

  router.get('/dsd-sets', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const sets = await db.selectFrom('dsd_sets').where('workspace_id', '=', workspace.id).selectAll().execute();
      const setIds = sets.map(s => s.id);
      const roleRows = setIds.length > 0
        ? await db.selectFrom('dsd_set_roles').where('set_id', 'in', setIds).select(['set_id', 'role_id']).execute()
        : [];
      const roleIdsBySet = new Map<string, string[]>();
      for (const r of roleRows) {
        const list = roleIdsBySet.get(r.set_id) ?? [];
        list.push(r.role_id);
        roleIdsBySet.set(r.set_id, list);
      }
      const data = sets.map(s => ({ ...s, roleIds: roleIdsBySet.get(s.id) ?? [] }));
      res.json({ data, error: null });
    } catch (err) { next(err); }
  });

  router.post('/dsd-sets', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = setSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      const roleIds = await verifyRolesOwned(db, workspace.id, parsed.data.roleIds);
      if (!roleIds || roleIds.length < 2) {
        res.status(400).json({ data: null, error: { code: 'INVALID_ROLE', message: 'One or more roles do not belong to this workspace.' } });
        return;
      }

      const candidate: ConstraintSet = { id: 'candidate', name: parsed.data.name, cardinality: parsed.data.cardinality, roleIds };
      const edges = await loadInheritanceEdges(db);
      const closures = await computeActiveClosures(db, workspace.id, edges);
      const conflicts = findConflicts(closures, candidate, checkDSD);
      if (conflicts.length > 0) {
        res.status(409).json({ data: null, error: { code: 'DSD_CONFLICT', conflicts } });
        return;
      }

      const set = await db.insertInto('dsd_sets')
        .values({ workspace_id: workspace.id, name: parsed.data.name, cardinality: parsed.data.cardinality })
        .returning(['id', 'name', 'cardinality'])
        .executeTakeFirstOrThrow();
      await db.insertInto('dsd_set_roles').values(roleIds.map(roleId => ({ set_id: set.id, role_id: roleId }))).execute();

      res.status(201).json({ data: { ...set, roleIds }, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/dsd-sets/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const existing = await db.selectFrom('dsd_sets')
        .where('id', '=', id).where('workspace_id', '=', workspace.id).selectAll().executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      const parsed = updateSetSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', details: parsed.error.flatten() } });
        return;
      }

      let roleIds: string[];
      if (parsed.data.roleIds) {
        const owned = await verifyRolesOwned(db, workspace.id, parsed.data.roleIds);
        if (!owned || owned.length < 2) {
          res.status(400).json({ data: null, error: { code: 'INVALID_ROLE', message: 'One or more roles do not belong to this workspace.' } });
          return;
        }
        roleIds = owned;
      } else {
        const rows = await db.selectFrom('dsd_set_roles').where('set_id', '=', id).select('role_id').execute();
        roleIds = rows.map(r => r.role_id);
      }

      const name = parsed.data.name ?? existing.name;
      const cardinality = parsed.data.cardinality ?? existing.cardinality;
      const candidate: ConstraintSet = { id: existing.id, name, cardinality, roleIds };

      const edges = await loadInheritanceEdges(db);
      const closures = await computeActiveClosures(db, workspace.id, edges);
      const conflicts = findConflicts(closures, candidate, checkDSD);
      if (conflicts.length > 0) {
        res.status(409).json({ data: null, error: { code: 'DSD_CONFLICT', conflicts } });
        return;
      }

      await db.updateTable('dsd_sets').set({ name, cardinality }).where('id', '=', id).where('workspace_id', '=', workspace.id).execute();
      if (parsed.data.roleIds) {
        await db.deleteFrom('dsd_set_roles').where('set_id', '=', id).execute();
        await db.insertInto('dsd_set_roles').values(roleIds.map(roleId => ({ set_id: id, role_id: roleId }))).execute();
      }

      res.json({ data: { id, name, cardinality, roleIds }, error: null });
    } catch (err) { next(err); }
  });

  router.delete('/dsd-sets/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const id = req.params['id']!;

      const existing = await db.selectFrom('dsd_sets')
        .where('id', '=', id).where('workspace_id', '=', workspace.id).select('id').executeTakeFirst();
      if (!existing) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }

      await db.deleteFrom('dsd_set_roles').where('set_id', '=', id).execute();
      await db.deleteFrom('dsd_sets').where('id', '=', id).where('workspace_id', '=', workspace.id).execute();
      res.json({ data: null, error: null });
    } catch (err) { next(err); }
  });

  // GET /api/rbac/discarded-grants — per-user permission overrides discarded by the
  // groups->roles migration (packages/db/migrations/20260714_001_rbac3.ts step 8).
  router.get('/discarded-grants', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const rows = await db.selectFrom('migration_discarded_grants')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('user_id')
        .execute();
      res.json({ data: rows, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
