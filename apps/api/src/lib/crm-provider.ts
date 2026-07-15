/**
 * CRM provider read adapter — the single code path hook features use to read
 * CRM data, regardless of which provider the admin selected.
 *
 *   provider 'vencore-crm'  → live reads from core tables (no duplication)
 *   any plugin provider     → reads from plugin_hub_records (contract-shaped)
 *
 * Linked record ids: for the builtin provider they are core-table uuids; for
 * plugin providers they are plugin_hub_records row uuids. Both fit the uuid
 * FK columns on projects.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '@vencore/db';

export const BUILTIN_CRM_PROVIDER = 'vencore-crm';

export interface CrmLinkedRecord {
  id: string;
  source: string;
  external_id: string | null;
  url: string | null;
  [key: string]: unknown;
}

function hubRow(db: Kysely<Database>, workspaceId: string, contract: string, provider: string, id: string) {
  return db.selectFrom('plugin_hub_records')
    .select(['id', 'external_id', 'data', 'updated_at'])
    .where('id', '=', id)
    .where('workspace_id', '=', workspaceId)
    .where('contract', '=', contract)
    .where('provider_plugin_id', '=', provider)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
}

function mapHub(row: { id: string; external_id: string; data: unknown }, provider: string): CrmLinkedRecord {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return {
    ...data,
    id: row.id,
    source: provider,
    external_id: row.external_id,
    url: (data['url'] as string | undefined) ?? null,
  };
}

export async function getLinkedContact(
  db: Kysely<Database>,
  workspaceId: string,
  provider: string,
  contactId: string,
): Promise<CrmLinkedRecord | null> {
  if (provider === BUILTIN_CRM_PROVIDER) {
    const contact = await db.selectFrom('contacts')
      .select(['id', 'name', 'email', 'phone', 'status', 'last_contacted_at'])
      .where('id', '=', contactId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return contact ? { ...contact, source: BUILTIN_CRM_PROVIDER, external_id: null, url: null } : null;
  }
  const row = await hubRow(db, workspaceId, 'crm.contact@v1', provider, contactId);
  return row ? mapHub(row, provider) : null;
}

export async function getLinkedCompany(
  db: Kysely<Database>,
  workspaceId: string,
  provider: string,
  companyId: string,
): Promise<CrmLinkedRecord | null> {
  if (provider === BUILTIN_CRM_PROVIDER) {
    const company = await db.selectFrom('companies')
      .select(['id', 'name', 'industry', 'location', 'website', 'employee_count'])
      .where('id', '=', companyId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return company ? { ...company, source: BUILTIN_CRM_PROVIDER, external_id: null, url: null } : null;
  }
  const row = await hubRow(db, workspaceId, 'crm.company@v1', provider, companyId);
  return row ? mapHub(row, provider) : null;
}

export async function getLinkedDeal(
  db: Kysely<Database>,
  workspaceId: string,
  provider: string,
  itemId: string,
): Promise<CrmLinkedRecord | null> {
  if (provider === BUILTIN_CRM_PROVIDER) {
    const item = await db.selectFrom('pipeline_items')
      .select(['id', 'field_values', 'stage_id', 'pipeline_id'])
      .where('id', '=', itemId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return item ? { ...item, source: BUILTIN_CRM_PROVIDER, external_id: null, url: null } : null;
  }
  const row = await hubRow(db, workspaceId, 'crm.deal@v1', provider, itemId);
  return row ? mapHub(row, provider) : null;
}

export async function getContactActivity(
  db: Kysely<Database>,
  workspaceId: string,
  provider: string,
  contactId: string,
  page: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  if (provider === BUILTIN_CRM_PROVIDER) {
    return await db.selectFrom('activities')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('contact_id', '=', contactId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute() as unknown as Record<string, unknown>[];
  }

  // Plugin provider: contactId is a hub row id — resolve its external_id,
  // then page through crm.activity@v1 records referencing it.
  const contact = await hubRow(db, workspaceId, 'crm.contact@v1', provider, contactId);
  if (!contact) return [];

  const rows = await db.selectFrom('plugin_hub_records')
    .select(['id', 'external_id', 'data', 'updated_at'])
    .where('workspace_id', '=', workspaceId)
    .where('contract', '=', 'crm.activity@v1')
    .where('provider_plugin_id', '=', provider)
    .where('deleted_at', 'is', null)
    .where(sql<string>`data->>'contact_external_id'`, '=', contact.external_id)
    .orderBy('updated_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)
    .execute();

  return rows.map((r) => {
    const data = (r.data ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      type: data['type'] ?? 'note',
      body: data['body'] ?? data['subject'] ?? null,
      meta: { source: provider, url: data['url'] ?? null, subject: data['subject'] ?? null },
      contact_id: contactId,
      deal_id: null,
      user_id: null,
      created_at: data['occurred_at'] ?? r.updated_at,
    };
  });
}

/**
 * Searches linkable records for the project CRM tab comboboxes.
 * kind: 'contact' | 'company' | 'deal'
 */
export async function searchCrmRecords(
  db: Kysely<Database>,
  workspaceId: string,
  provider: string,
  kind: 'contact' | 'company' | 'deal',
  search: string,
  limit = 10,
): Promise<Array<{ id: string; label: string; sublabel: string | null }>> {
  if (provider === BUILTIN_CRM_PROVIDER) {
    if (kind === 'contact') {
      const rows = await db.selectFrom('contacts')
        .select(['id', 'name', 'email'])
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .where('name', 'ilike', `%${search}%`)
        .limit(limit)
        .execute();
      return rows.map((r) => ({ id: r.id, label: r.name, sublabel: r.email }));
    }
    if (kind === 'company') {
      const rows = await db.selectFrom('companies')
        .select(['id', 'name', 'industry'])
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .where('name', 'ilike', `%${search}%`)
        .limit(limit)
        .execute();
      return rows.map((r) => ({ id: r.id, label: r.name, sublabel: r.industry }));
    }
    const rows = await db.selectFrom('pipeline_items')
      .select(['id', 'field_values'])
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .where((eb) => eb(eb.ref('field_values', '->>').key('name'), 'ilike', `%${search}%`))
      .limit(limit)
      .execute();
    return rows.map((r) => {
      const fv = (r.field_values ?? {}) as Record<string, unknown>;
      return { id: r.id, label: String(fv['name'] ?? 'Untitled deal'), sublabel: fv['value'] != null ? String(fv['value']) : null };
    });
  }

  const contract = kind === 'contact' ? 'crm.contact@v1' : kind === 'company' ? 'crm.company@v1' : 'crm.deal@v1';
  const rows = await db.selectFrom('plugin_hub_records')
    .select(['id', 'external_id', 'data'])
    .where('workspace_id', '=', workspaceId)
    .where('contract', '=', contract)
    .where('provider_plugin_id', '=', provider)
    .where('deleted_at', 'is', null)
    .where(sql<string>`data->>'name'`, 'ilike', `%${search}%`)
    .limit(limit)
    .execute();

  return rows.map((r) => {
    const data = (r.data ?? {}) as Record<string, unknown>;
    const sublabel = kind === 'contact'
      ? (data['email'] as string | null ?? null)
      : kind === 'company'
        ? (data['industry'] as string | null ?? null)
        : (data['stage'] as string | null ?? null);
    return { id: r.id, label: String(data['name'] ?? r.external_id), sublabel };
  });
}
