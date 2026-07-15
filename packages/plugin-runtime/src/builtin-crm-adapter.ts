/**
 * Builtin Vencore CRM live adapter — serves core CRM tables through the hub
 * contract interface with zero data duplication. When 'vencore-crm' is the
 * active provider for the crm group, hub.query reads through here instead of
 * plugin_hub_records.
 *
 * Record identity: external_id = the core row uuid. Deals map from
 * pipeline_items (+ stage), matching how the rest of the platform treats
 * deals since the pipelines rework.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export const BUILTIN_CRM_PROVIDER_ID = 'vencore-crm';

export interface AdapterPage {
  records: Array<{ provider: string; external_id: string; data: Record<string, unknown>; updated_at: string }>;
  next_cursor: string | null;
}

interface QueryOpts {
  cursor?: string;
  limit: number;
  filter?: Record<string, unknown>;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseCursor(cursor?: string): { ts: Date; id: string } | null {
  if (!cursor) return null;
  const [ts, id] = cursor.split('|');
  if (!ts || !id) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : { ts: d, id };
}

function applyKeyset(q: any, c: { ts: Date; id: string } | null, tsCol: string, idCol: string): any {
  if (!c) return q;
  return q.where((eb: any) => eb.or([
    eb(tsCol, '<', c.ts),
    eb.and([eb(tsCol, '=', c.ts), eb(idCol, '<', c.id)]),
  ]));
}

function postFilter(
  records: AdapterPage['records'],
  filter?: Record<string, unknown>,
): AdapterPage['records'] {
  if (!filter || Object.keys(filter).length === 0) return records;
  return records.filter((r) =>
    Object.entries(filter).every(([k, v]) => String(r.data[k] ?? '') === String(v)),
  );
}

function page(
  rows: Array<{ id: string; updated: unknown; data: Record<string, unknown> }>,
  limit: number,
  filter?: Record<string, unknown>,
): AdapterPage {
  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);
  const last = slice[slice.length - 1];
  const records = slice.map((r) => ({
    provider: BUILTIN_CRM_PROVIDER_ID,
    external_id: r.id,
    data: { ...r.data, external_id: r.id },
    updated_at: iso(r.updated) ?? new Date(0).toISOString(),
  }));
  return {
    // Filters are applied post-map (page may under-fill; callers paginate on)
    records: postFilter(records, filter),
    next_cursor: hasMore && last ? `${iso(last.updated)}|${last.id}` : null,
  };
}

async function queryContacts(db: Kysely<any>, workspaceId: string, opts: QueryOpts): Promise<AdapterPage> {
  let q = db.selectFrom('contacts')
    .leftJoin('companies', 'companies.id', 'contacts.company_id')
    .leftJoin('users', 'users.id', 'contacts.owner_id')
    .select([
      'contacts.id as id', 'contacts.name as name', 'contacts.email as email',
      'contacts.phone as phone', 'contacts.status as status',
      'contacts.last_contacted_at as last_contacted_at', 'contacts.updated_at as updated_at',
      'companies.name as company_name', 'users.name as owner_name',
    ])
    .where('contacts.workspace_id', '=', workspaceId)
    .where('contacts.deleted_at', 'is', null)
    .orderBy('contacts.updated_at', 'desc')
    .orderBy('contacts.id', 'desc')
    .limit(opts.limit + 1);
  q = applyKeyset(q, parseCursor(opts.cursor), 'contacts.updated_at', 'contacts.id');

  const rows = await q.execute() as Array<Record<string, unknown>>;
  return page(rows.map((r) => ({
    id: String(r['id']),
    updated: r['updated_at'],
    data: {
      name: r['name'],
      email: r['email'] ?? null,
      phone: r['phone'] ?? null,
      status: r['status'] ?? null,
      company_name: r['company_name'] ?? null,
      owner_name: r['owner_name'] ?? null,
      url: null,
      modified_at: iso(r['updated_at']),
      extras: { last_contacted_at: iso(r['last_contacted_at']) },
    },
  })), opts.limit, opts.filter);
}

async function queryCompanies(db: Kysely<any>, workspaceId: string, opts: QueryOpts): Promise<AdapterPage> {
  let q = db.selectFrom('companies')
    .select(['id', 'name', 'industry', 'location', 'website', 'employee_count', 'updated_at'])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .orderBy('updated_at', 'desc')
    .orderBy('id', 'desc')
    .limit(opts.limit + 1);
  q = applyKeyset(q, parseCursor(opts.cursor), 'updated_at', 'id');

  const rows = await q.execute() as Array<Record<string, unknown>>;
  return page(rows.map((r) => ({
    id: String(r['id']),
    updated: r['updated_at'],
    data: {
      name: r['name'],
      industry: r['industry'] ?? null,
      website: r['website'] ?? null,
      location: r['location'] ?? null,
      employee_count: r['employee_count'] ?? null,
      url: null,
      modified_at: iso(r['updated_at']),
      extras: {},
    },
  })), opts.limit, opts.filter);
}

async function queryDeals(db: Kysely<any>, workspaceId: string, opts: QueryOpts): Promise<AdapterPage> {
  let q = db.selectFrom('pipeline_items')
    .leftJoin('pipeline_stages', 'pipeline_stages.id', 'pipeline_items.stage_id')
    .select([
      'pipeline_items.id as id',
      'pipeline_items.field_values as field_values',
      'pipeline_items.updated_at as updated_at',
      'pipeline_stages.name as stage_name',
      'pipeline_stages.is_won as is_won',
    ])
    .where('pipeline_items.workspace_id', '=', workspaceId)
    .where('pipeline_items.deleted_at', 'is', null)
    .orderBy('pipeline_items.updated_at', 'desc')
    .orderBy('pipeline_items.id', 'desc')
    .limit(opts.limit + 1);
  q = applyKeyset(q, parseCursor(opts.cursor), 'pipeline_items.updated_at', 'pipeline_items.id');

  const rows = await q.execute() as Array<Record<string, unknown>>;
  return page(rows.map((r) => {
    const fv = (r['field_values'] ?? {}) as Record<string, unknown>;
    const value = fv['value'] != null && Number.isFinite(Number(fv['value'])) ? Number(fv['value']) : null;
    return {
      id: String(r['id']),
      updated: r['updated_at'],
      data: {
        name: String(fv['name'] ?? fv['title'] ?? 'Untitled deal'),
        value,
        currency: null,
        stage: r['stage_name'] ?? null,
        is_won: Boolean(r['is_won']),
        is_closed: Boolean(r['is_won']),
        probability: null,
        close_date: (fv['close_date'] as string | undefined) ?? null,
        contact_external_id: (fv['contact_id'] as string | undefined) ?? null,
        company_external_id: (fv['company_id'] as string | undefined) ?? null,
        owner_name: null,
        url: null,
        modified_at: iso(r['updated_at']),
        extras: {},
      },
    };
  }), opts.limit, opts.filter);
}

async function queryActivity(db: Kysely<any>, workspaceId: string, opts: QueryOpts): Promise<AdapterPage> {
  let q = db.selectFrom('activities')
    .select(['id', 'type', 'body', 'contact_id', 'created_at'])
    .where('workspace_id', '=', workspaceId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(opts.limit + 1);
  q = applyKeyset(q, parseCursor(opts.cursor), 'created_at', 'id');

  const rows = await q.execute() as Array<Record<string, unknown>>;
  return page(rows.map((r) => ({
    id: String(r['id']),
    updated: r['created_at'],
    data: {
      type: String(r['type'] ?? 'note'),
      subject: null,
      body: r['body'] ?? null,
      contact_external_id: r['contact_id'] ?? null,
      deal_external_id: null,
      occurred_at: iso(r['created_at']),
      url: null,
      extras: {},
    },
  })), opts.limit, opts.filter);
}

const HANDLERS: Record<string, (db: Kysely<any>, ws: string, opts: QueryOpts) => Promise<AdapterPage>> = {
  'crm.contact@v1': queryContacts,
  'crm.company@v1': queryCompanies,
  'crm.deal@v1': queryDeals,
  'crm.activity@v1': queryActivity,
};

export function builtinAdapterSupports(contractId: string): boolean {
  return contractId in HANDLERS;
}

export async function queryBuiltinCrm(
  db: Kysely<any>,
  workspaceId: string,
  contractId: string,
  opts: QueryOpts,
): Promise<AdapterPage> {
  const handler = HANDLERS[contractId];
  if (!handler) return { records: [], next_cursor: null };
  return handler(db, workspaceId, opts);
}

export async function countBuiltinCrm(
  db: Kysely<any>,
  workspaceId: string,
  contractId: string,
): Promise<number> {
  const table = contractId === 'crm.contact@v1' ? 'contacts'
    : contractId === 'crm.company@v1' ? 'companies'
    : contractId === 'crm.deal@v1' ? 'pipeline_items'
    : contractId === 'crm.activity@v1' ? 'activities'
    : null;
  if (!table) return 0;
  let q = db.selectFrom(table).select(sql<number>`count(*)`.as('n')).where('workspace_id', '=', workspaceId);
  if (table !== 'activities') q = q.where('deleted_at', 'is', null);
  const row = await q.executeTakeFirst() as { n: unknown } | undefined;
  return Number(row?.n ?? 0);
}
