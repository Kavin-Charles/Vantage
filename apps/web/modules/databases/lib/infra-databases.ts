import { apiFetch } from '@/modules/shared/lib/api';
import type {
  InfraDatabase,
  InfraDatabaseConnectionTestResult,
  InfraDatabaseRows,
  InfraDatabaseSqlResult,
  InfraDatabaseTable,
} from '@vantage/types';

export interface InfraDatabaseInput {
  name: string;
  engine: string;
  host?: string;
  port?: number;
  db_user?: string;
  db_password?: string;
  database_name?: string;
  use_ssl?: boolean;
}

export async function listInfraDatabases(token: string) {
  return apiFetch<{ data: InfraDatabase[]; total: number; error: null }>('/api/databases', { token });
}

export async function getInfraDatabase(token: string, id: string) {
  return apiFetch<{ data: InfraDatabase; error: null }>(`/api/databases/${id}`, { token });
}

export async function createInfraDatabase(token: string, body: InfraDatabaseInput) {
  return apiFetch<{ data: InfraDatabase; error: null }>('/api/databases', { method: 'POST', body: JSON.stringify(body), token });
}

export async function updateInfraDatabase(token: string, id: string, body: Partial<InfraDatabaseInput>) {
  return apiFetch<{ data: InfraDatabase; error: null }>(`/api/databases/${id}`, { method: 'PATCH', body: JSON.stringify(body), token });
}

export async function testInfraDatabaseConnection(token: string, id: string, dbPassword?: string) {
  return apiFetch<{ data: InfraDatabaseConnectionTestResult; error: null }>(`/api/databases/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({ db_password: dbPassword || undefined }),
    token,
  });
}

export async function listInfraDatabaseSchema(token: string, id: string) {
  return apiFetch<{ data: InfraDatabaseTable[]; error: null }>(`/api/databases/${id}/schema`, { token });
}

export async function listInfraDatabaseRows(token: string, id: string, table: string, schema: string, page: number, limit: number) {
  const qs = new URLSearchParams({ schema, page: String(page), limit: String(limit) });
  return apiFetch<{ data: InfraDatabaseRows; error: null }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/rows?${qs}`, { token });
}

export async function updateInfraDatabaseRow(
  token: string,
  id: string,
  table: string,
  body: { schema: string; original: Record<string, unknown>; changes: Record<string, unknown> },
) {
  return apiFetch<{ data: { ok: true }; error: null }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/rows`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function runInfraDatabaseSql(token: string, id: string, sql: string, confirmed?: boolean) {
  return apiFetch<{ data: InfraDatabaseSqlResult; error: null }>(`/api/databases/${id}/sql`, {
    method: 'POST',
    body: JSON.stringify({ sql, confirmed }),
    token,
  });
}

export async function deleteInfraDatabase(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/databases/${id}`, { method: 'DELETE', token });
}

export async function runMongoDbQuery(token: string, id: string, collection: string, query: string) {
  return apiFetch<{ data: InfraDatabaseSqlResult; error: null }>(`/api/databases/${id}/mongo-query`, {
    method: 'POST',
    body: JSON.stringify({ collection, query }),
    token,
  });
}
