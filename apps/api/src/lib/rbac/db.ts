import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { MODULE_REGISTRY } from '@vencore/modules';
import { authorizedRoleClosure, type InheritanceEdge } from './closure';
import type { ConstraintSet } from './constraints';

export type GroupedPermission = { key: string; label: string; granted: boolean; inherited: boolean };
export type GroupedModule = {
  id: string; name: string;
  groups: { id: string; label: string; permissions: GroupedPermission[] }[];
};

export function buildGroupedPermissions(grantedKeys: Set<string>, inheritedKeys: Set<string>): GroupedModule[] {
  return MODULE_REGISTRY.map(mod => {
    const groupDefs = mod.permissionGroups ?? [];
    const groupMap = new Map<string, { id: string; label: string; permissions: GroupedPermission[] }>();
    const groupOf = (perm: { group?: string }) => perm.group ?? 'general';
    const labelOf = (id: string) => groupDefs.find(g => g.id === id)?.label ?? 'General';
    for (const p of mod.permissions) {
      const gid = groupOf(p);
      if (!groupMap.has(gid)) groupMap.set(gid, { id: gid, label: labelOf(gid), permissions: [] });
      groupMap.get(gid)!.permissions.push({
        key: p.key, label: p.label,
        granted: grantedKeys.has(p.key), inherited: inheritedKeys.has(p.key) && !grantedKeys.has(p.key),
      });
    }
    return { id: mod.id, name: mod.name, groups: [...groupMap.values()] };
  });
}

export async function loadInheritanceEdges(db: Kysely<Database>): Promise<InheritanceEdge[]> {
  const rows = await db.selectFrom('role_inheritance').selectAll().execute();
  return rows.map(r => ({ parent: r.parent_role_id, child: r.child_role_id }));
}

export async function authorizedClosureForUser(db: Kysely<Database>, userId: string, workspaceId: string): Promise<Set<string>> {
  const assigned = await db.selectFrom('user_roles')
    .where('user_id', '=', userId).where('workspace_id', '=', workspaceId).select('role_id').execute();
  return authorizedRoleClosure(assigned.map(r => r.role_id), await loadInheritanceEdges(db));
}

export async function activeClosureForUser(db: Kysely<Database>, userId: string): Promise<Set<string>> {
  const active = await db.selectFrom('user_session_roles')
    .where('user_id', '=', userId).where('active', '=', true).select('role_id').execute();
  return authorizedRoleClosure(active.map(r => r.role_id), await loadInheritanceEdges(db));
}

async function loadSets(db: Kysely<Database>, workspaceId: string, table: 'ssd_sets' | 'dsd_sets', joinTable: 'ssd_set_roles' | 'dsd_set_roles'): Promise<ConstraintSet[]> {
  const sets = await db.selectFrom(table).where('workspace_id', '=', workspaceId).select(['id', 'name', 'cardinality']).execute();
  const result: ConstraintSet[] = [];
  for (const s of sets) {
    const roles = await db.selectFrom(joinTable).where('set_id', '=', s.id).select('role_id').execute();
    result.push({ id: s.id, name: s.name, cardinality: s.cardinality, roleIds: roles.map(r => r.role_id) });
  }
  return result;
}
export const loadSsdSets = (db: Kysely<Database>, ws: string): Promise<ConstraintSet[]> => loadSets(db, ws, 'ssd_sets', 'ssd_set_roles');
export const loadDsdSets = (db: Kysely<Database>, ws: string): Promise<ConstraintSet[]> => loadSets(db, ws, 'dsd_sets', 'dsd_set_roles');
