import { type Kysely, sql } from 'kysely';

const OLD_MODULE_IDS = ['contacts', 'companies', 'pipelines', 'tasks'] as const;

// Old top-level sidebar key -> new nested CRM key. Each CRM page keeps its own
// sidebar entry (not a single merged /crm item), so keys map one-to-one.
const ITEM_KEY_MAP: Record<string, string> = {
  '/pipeline': '/crm/pipeline',
  '/contacts': '/crm/contacts',
  '/companies': '/crm/companies',
  '/tasks': '/crm/tasks',
};

// The `crm` parent module is enabled when ANY of the four old modules was
// enabled; a missing old row counts as enabled (all four had defaultEnabled).
export function deriveCrmEnabled(enabledByModule: Record<string, boolean | undefined>): boolean {
  return OLD_MODULE_IDS.some(id => enabledByModule[id] !== false);
}

export function rewriteKeysForCrm(keys: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const mapped = ITEM_KEY_MAP[key] ?? key;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Split the four old CRM modules into a `crm` parent plus per-page child
  //    modules. Each child (crm:pipeline/contacts/companies/tasks) preserves the
  //    old module's exact enabled state; the parent is enabled when ANY old
  //    module was enabled (missing rows counted as enabled).
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id,
      case module_id
        when 'contacts'  then 'crm:contacts'
        when 'companies' then 'crm:companies'
        when 'pipelines' then 'crm:pipeline'
        when 'tasks'     then 'crm:tasks'
      end,
      enabled
    from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id, 'crm', bool_or(enabled)
    from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  // 1b. Safety net: give every workspace any crm parent/child row it still
  //     lacks (defaulting to enabled). Covers workspaces that had none of the
  //     four old rows, and legacy workspaces that only had some of them — a
  //     missing old row meant that module was at defaultEnabled: true. The
  //     child-split above ran first with DO NOTHING, so explicitly-disabled
  //     children are never overwritten here.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select w.id, m.mid, true
    from workspaces w
    cross join (values ('crm'), ('crm:pipeline'), ('crm:contacts'), ('crm:companies'), ('crm:tasks')) as m(mid)
    where not exists (
      select 1 from workspace_modules wm
      where wm.workspace_id = w.id and wm.module_id = m.mid
    )
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
  `.execute(db);

  // 1c. Consolidate module_event_settings: crm row aggregates activity_on and
  //     alerts_on from the four old modules with bool_and (crm only stays on
  //     when every old module was on). No safety-net insert here, unlike
  //     workspace_modules above — a missing module_event_settings row already
  //     defaults to enabled (`?? true` in log-activity.ts / alert-service.ts),
  //     so workspaces with none of the four old rows correctly need no crm row.
  await sql`
    insert into module_event_settings (workspace_id, module_id, activity_on, alerts_on)
    select workspace_id, 'crm', bool_and(activity_on), bool_and(alerts_on)
    from module_event_settings
    where module_id in ('contacts', 'companies', 'pipelines', 'tasks')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from module_event_settings
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
  // Re-expand the crm child modules back into the four old top-level modules,
  // preserving each child's enabled state.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id,
      case module_id
        when 'crm:pipeline'  then 'pipelines'
        when 'crm:contacts'  then 'contacts'
        when 'crm:companies' then 'companies'
        when 'crm:tasks'     then 'tasks'
      end,
      enabled
    from workspace_modules
    where module_id in ('crm:pipeline', 'crm:contacts', 'crm:companies', 'crm:tasks')
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('crm', 'crm:pipeline', 'crm:contacts', 'crm:companies', 'crm:tasks')
  `.execute(db);

  // Re-expand crm module_event_settings into the four modules with crm's values.
  await sql`
    insert into module_event_settings (workspace_id, module_id, activity_on, alerts_on)
    select mes.workspace_id, old.module_id, mes.activity_on, mes.alerts_on
    from module_event_settings mes
    cross join (values ('contacts'), ('companies'), ('pipelines'), ('tasks')) as old(module_id)
    where mes.module_id = 'crm'
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`delete from module_event_settings where module_id = 'crm'`.execute(db);

  // Map the nested '/crm/*' keys back to the old top-level keys in layouts/pins.
  const REVERSE_KEY_MAP: Record<string, string> = {
    '/crm/pipeline': '/pipeline',
    '/crm/contacts': '/contacts',
    '/crm/companies': '/companies',
    '/crm/tasks': '/tasks',
  };
  const reverseKeys = (keys: string[]): string[] => keys.map(k => REVERSE_KEY_MAP[k] ?? k);

  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    const next = reverseKeys(row.item_keys);
    if (JSON.stringify(next) === JSON.stringify(row.item_keys)) continue;
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
    const next = reverseKeys(row.pinned_keys);
    if (JSON.stringify(next) === JSON.stringify(row.pinned_keys)) continue;
    await sql`
      update user_sidebar_prefs
      set pinned_keys = ${JSON.stringify(next)}::jsonb, updated_at = now()
      where user_id = ${row.user_id} and workspace_id = ${row.workspace_id}
    `.execute(db);
  }
}
