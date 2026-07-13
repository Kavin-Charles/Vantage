import { type Kysely, sql } from 'kysely';

const OLD_MODULE_IDS = ['servers', 'databases', 'websites', 'alerts'] as const;

// Old top-level sidebar key -> new nested infra key. Each infra page keeps its
// own sidebar entry, so keys map one-to-one.
const ITEM_KEY_MAP: Record<string, string> = {
  '/servers': '/infra/servers',
  '/databases': '/infra/databases',
  '/websites': '/infra/websites',
  '/alerts': '/infra/alerts',
};

// The `infra` parent module is enabled when ANY of the four old modules was
// enabled; a missing old row counts as enabled (all four had defaultEnabled).
export function deriveInfraEnabled(enabledByModule: Record<string, boolean | undefined>): boolean {
  return OLD_MODULE_IDS.some(id => enabledByModule[id] !== false);
}

export function rewriteKeysForInfra(keys: string[]): string[] {
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
  // 1. Split the four old infra modules into an `infra` parent plus per-page
  //    child modules. Each child preserves the old module's exact enabled
  //    state; the parent is enabled when ANY old module was enabled (missing
  //    rows counted as enabled).
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id,
      case module_id
        when 'servers'   then 'infra:servers'
        when 'databases' then 'infra:databases'
        when 'websites'  then 'infra:websites'
        when 'alerts'    then 'infra:alerts'
      end,
      enabled
    from workspace_modules
    where module_id in ('servers', 'databases', 'websites', 'alerts')
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id, 'infra', bool_or(enabled)
    from workspace_modules
    where module_id in ('servers', 'databases', 'websites', 'alerts')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  // 1b. Safety net: give every workspace any infra parent/child row it still
  //     lacks (defaulting to enabled). Covers workspaces that had none of the
  //     four old rows, and legacy workspaces that only had some of them — a
  //     missing old row meant that module was at defaultEnabled: true. The
  //     child-split above ran first with DO NOTHING, so explicitly-disabled
  //     children are never overwritten here.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select w.id, m.mid, true
    from workspaces w
    cross join (values ('infra'), ('infra:servers'), ('infra:databases'), ('infra:websites'), ('infra:alerts')) as m(mid)
    where not exists (
      select 1 from workspace_modules wm
      where wm.workspace_id = w.id and wm.module_id = m.mid
    )
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('servers', 'databases', 'websites', 'alerts')
  `.execute(db);

  // 1c. Consolidate module_event_settings: infra row aggregates activity_on
  //     and alerts_on from the four old modules with bool_and (infra only
  //     stays on when every old module was on). No safety-net insert — a
  //     missing module_event_settings row already defaults to enabled
  //     (`?? true` in log-activity.ts / alert-service.ts).
  await sql`
    insert into module_event_settings (workspace_id, module_id, activity_on, alerts_on)
    select workspace_id, 'infra', bool_and(activity_on), bool_and(alerts_on)
    from module_event_settings
    where module_id in ('servers', 'databases', 'websites', 'alerts')
    group by workspace_id
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from module_event_settings
    where module_id in ('servers', 'databases', 'websites', 'alerts')
  `.execute(db);

  // 2. Rewrite sidebar group item keys.
  const groups = await sql<{ id: string; item_keys: string[] }>`
    select id, item_keys from workspace_sidebar_groups
  `.execute(db);
  for (const row of groups.rows) {
    const next = rewriteKeysForInfra(row.item_keys);
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
    const next = rewriteKeysForInfra(row.pinned_keys);
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
  // Re-expand the infra child modules back into the four old top-level
  // modules, preserving each child's enabled state.
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select workspace_id,
      case module_id
        when 'infra:servers'   then 'servers'
        when 'infra:databases' then 'databases'
        when 'infra:websites'  then 'websites'
        when 'infra:alerts'    then 'alerts'
      end,
      enabled
    from workspace_modules
    where module_id in ('infra:servers', 'infra:databases', 'infra:websites', 'infra:alerts')
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`
    delete from workspace_modules
    where module_id in ('infra', 'infra:servers', 'infra:databases', 'infra:websites', 'infra:alerts')
  `.execute(db);

  // Re-expand infra module_event_settings into the four modules with infra's values.
  await sql`
    insert into module_event_settings (workspace_id, module_id, activity_on, alerts_on)
    select mes.workspace_id, old.module_id, mes.activity_on, mes.alerts_on
    from module_event_settings mes
    cross join (values ('servers'), ('databases'), ('websites'), ('alerts')) as old(module_id)
    where mes.module_id = 'infra'
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  await sql`delete from module_event_settings where module_id = 'infra'`.execute(db);

  // Map the nested '/infra/*' keys back to the old top-level keys in layouts/pins.
  const REVERSE_KEY_MAP: Record<string, string> = {
    '/infra/servers': '/servers',
    '/infra/databases': '/databases',
    '/infra/websites': '/websites',
    '/infra/alerts': '/alerts',
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
