import { apiFetch } from '@/modules/shared/lib/api';
import type {
  InfraDatabase,
  InfraDatabaseConnectionTestResult,
  InfraDatabaseRows,
  InfraDatabaseSqlResult,
  InfraDatabaseTable,
} from '@vencore/types';

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

export async function getInfraDatabaseConnectionString(token: string, id: string, reveal: boolean) {
  return apiFetch<{ data: { connection_string: string; revealed: boolean }; error: null }>(
    `/api/databases/${id}/connection-string${reveal ? '?reveal=true' : ''}`,
    { token },
  );
}

export async function listInfraDatabaseAlerts(token: string, id: string, resolved?: boolean) {
  const qs = resolved !== undefined ? `?resolved=${resolved}` : '';
  return apiFetch<{ data: Alert[]; error: null }>(`/api/databases/${id}/alerts${qs}`, { token });
}

export async function listInfraDatabaseQueryHistory(token: string, id: string) {
  return apiFetch<{ data: QueryHistoryEntry[]; error: null }>(`/api/databases/${id}/query-history`, { token });
}

export async function clearInfraDatabaseQueryHistory(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/databases/${id}/query-history`, { method: 'DELETE', token });
}

export async function getInfraDatabaseThresholds(token: string, id: string) {
  return apiFetch<{ data: DbThresholdsResponse; error: null }>(`/api/databases/${id}/thresholds`, { token });
}

export async function setInfraDatabaseThresholds(token: string, id: string, body: DbThresholdInput) {
  return apiFetch<{ data: unknown; error: null }>(`/api/databases/${id}/thresholds`, { method: 'PUT', body: JSON.stringify(body), token });
}

export async function clearInfraDatabaseThresholds(token: string, id: string) {
  return apiFetch<{ data: { ok: boolean }; error: null }>(`/api/databases/${id}/thresholds`, { method: 'DELETE', token });
}

export async function getWorkspaceDbThresholdDefaults(token: string) {
  return apiFetch<{ data: DbThresholdValues; error: null }>('/api/databases/thresholds/defaults', { token });
}

export async function setWorkspaceDbThresholdDefaults(token: string, body: DbThresholdInput) {
  return apiFetch<{ data: unknown; error: null }>('/api/databases/thresholds/defaults', { method: 'PUT', body: JSON.stringify(body), token });
}

export interface DbThresholdValues {
  connection_count_max: number;
  replication_lag_s_max: number;
  storage_gb_max: number;
}

export interface DbThresholdInput {
  connection_count_max?: number;
  replication_lag_s_max?: number;
  storage_gb_max?: number;
}

export interface DbThresholdsResponse {
  effective: DbThresholdValues;
  override: (DbThresholdValues & { id: string }) | null;
  workspace_default: (DbThresholdValues & { id: string }) | null;
}

export interface QueryHistoryEntry {
  id: string;
  query_text: string;
  query_type: 'sql' | 'mongo';
  executed_at: string;
  row_count: number | null;
  duration_ms: number | null;
}

export interface Alert {
  id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string | null;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  acknowledged: boolean;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}
