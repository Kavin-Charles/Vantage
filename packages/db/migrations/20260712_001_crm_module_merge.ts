import { type Kysely, sql } from 'kysely';

const OLD_MODULE_IDS = ['contacts', 'companies', 'pipelines', 'tasks'] as const;
const OLD_ITEM_KEYS = ['/pipeline', '/contacts', '/companies', '/tasks'] as const;

export function deriveCrmEnabled(enabledByModule: Record<string, boolean | undefined>): boolean {
  return OLD_MODULE_IDS.every(id => enabledByModule[id] !== false);
}

export function rewriteKeysForCrm(keys: string[]): string[] {
  const out: string[] = [];
  let placed = keys.includes('/crm');
  for (const key of keys) {
    if ((OLD_ITEM_KEYS as readonly string[]).includes(key)) {
      if (!placed) {
        out.push('/crm');
        placed = true;
      }
      continue;
    }
    out.push(key);
  }
  return out;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Consolidate workspace_modules: crm enabled only when all four were enabled.
  //    Missing rows count as enabled (all four had defaultEnabled: true), which
  //    bool_and over present rows matches.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id, 'crm', bool_and(enabled)
    from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
  `.execute(db);

  // 2. Rewrite sidebar group item keys.
  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    const next = rewriteKeysForCrm(row.item_keys);
    if (JSON.stringify(next) !== JSON.stringify(row.item_keys)) {
      await sql`
        update workspace_sidebar_groups
        set item_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
        where id = ${row.id}
      `.execute(db);
    }
  }

  // 3. Rewrite pinned keys.
  const prefs = await sql<{ user_id: string; workspace_id: string; pinned_keys: string[] }>`
    select user_id, workspace_id, pinned_keys from user_sidebar_prefs
  `.execute(db);
  for (const row of prefs.rows) {
    const next = rewriteKeysForCrm(row.pinned_keys);
    if (JSON.stringify(next) !== JSON.stringify(row.pinned_keys)) {
      await sql`
        update user_sidebar_prefs
        set pinned_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
        where user_id = ${row.user_id} and workspace_id = ${row.workspace_id}
      `.execute(db);
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-expand crm into the four modules with crm's enabled value.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select wm.workspace_id, old.module_id, wm.enabled
    from workspace_modules wm
    cross join (values ('contacts'), ('companies'), ('pipelines'), ('tasks')) as old(module_id)
    where wm.module_id = 'crm'
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`delete from workspace_modules where module_id = 'crm'`.execute(db);

  // Expand '/crm' back to the four keys in stored layouts and pins.
  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    if (!row.item_keys.includes('/crm')) continue;
    const next = row.item_keys.flatMap(k =>
      k === '/crm' ? ['/pipeline', '/contacts', '/companies', '/tasks'] : [k],
    );
    await sql`
      update workspace_sidebar_groups
      set item_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
      where id = ${row.id}
    `.execute(db);
  }

  const prefs = await sql<{ user_id: string; workspace_id: string; pinned_keys: string[] }>`
    select user_id, workspace_id, pinned_keys from user_sidebar_prefs
  `.execute(db);
  for (const row of prefs.rows) {
    if (!row.pinned_keys.includes('/crm')) continue;
    const next = row.pinned_keys.flatMap(k =>
      k === '/crm' ? ['/pipeline', '/contacts', '/companies', '/tasks'] : [k],
    );
    await sql`
      update user_sidebar_prefs
      set pinned_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
      where user_id = ${row.user_id} and workspace_id = ${row.workspace_id}
    `.execute(db);
  }
}
