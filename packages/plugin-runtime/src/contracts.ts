/**
 * Contract registry — versioned data shapes for cross-plugin data sharing.
 *
 * A contract is the unit of interoperability: providers publish records that
 * match a contract's schema, consumers query by contract id and never by
 * provider name. Core contracts ship with the platform and mirror the core
 * CRM models with a minimal required core (external_id + name) so any
 * external system can satisfy them. Provider-specific fields that don't fit
 * go into the `extras` escape hatch.
 *
 * Versioning: a contract version is immutable. Additive optional fields are
 * allowed within a version; breaking changes require a new @vN contract.
 */
import { z } from 'zod';

export interface ContractDef {
  /** Full versioned id, e.g. "crm.contact@v1". */
  id: string;
  /** Human-readable label shown in admin UI. */
  label: string;
  description: string;
  schema: z.ZodType<Record<string, unknown>>;
}

const extras = z.record(z.unknown()).optional();

export const crmContactV1 = z.object({
  external_id: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  email: z.string().max(320).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  company_name: z.string().max(500).nullable().optional(),
  status: z.string().max(64).nullable().optional(),
  owner_name: z.string().max(255).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  modified_at: z.string().max(64).nullable().optional(),
  extras,
}).strict();

export const crmCompanyV1 = z.object({
  external_id: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  industry: z.string().max(255).nullable().optional(),
  website: z.string().max(2000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  employee_count: z.number().int().nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  modified_at: z.string().max(64).nullable().optional(),
  extras,
}).strict();

export const crmDealV1 = z.object({
  external_id: z.string().min(1).max(255),
  name: z.string().min(1).max(500),
  value: z.number().nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  stage: z.string().max(255).nullable().optional(),
  /** True when the deal reached a won stage in the source system. */
  is_won: z.boolean().nullable().optional(),
  is_closed: z.boolean().nullable().optional(),
  probability: z.number().min(0).max(100).nullable().optional(),
  close_date: z.string().max(64).nullable().optional(),
  contact_external_id: z.string().max(255).nullable().optional(),
  company_external_id: z.string().max(255).nullable().optional(),
  owner_name: z.string().max(255).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  modified_at: z.string().max(64).nullable().optional(),
  extras,
}).strict();

export const crmActivityV1 = z.object({
  external_id: z.string().min(1).max(255),
  type: z.string().min(1).max(64),
  subject: z.string().max(1000).nullable().optional(),
  body: z.string().max(20000).nullable().optional(),
  contact_external_id: z.string().max(255).nullable().optional(),
  deal_external_id: z.string().max(255).nullable().optional(),
  occurred_at: z.string().max(64).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  extras,
}).strict();

const CORE_CONTRACTS: ContractDef[] = [
  {
    id: 'crm.contact@v1',
    label: 'CRM contacts',
    description: 'People records from a CRM system.',
    schema: crmContactV1 as z.ZodType<Record<string, unknown>>,
  },
  {
    id: 'crm.company@v1',
    label: 'CRM companies',
    description: 'Company / account records from a CRM system.',
    schema: crmCompanyV1 as z.ZodType<Record<string, unknown>>,
  },
  {
    id: 'crm.deal@v1',
    label: 'CRM deals',
    description: 'Deal / opportunity records from a CRM system.',
    schema: crmDealV1 as z.ZodType<Record<string, unknown>>,
  },
  {
    id: 'crm.activity@v1',
    label: 'CRM activity',
    description: 'Activity timeline entries (calls, emails, notes) from a CRM system.',
    schema: crmActivityV1 as z.ZodType<Record<string, unknown>>,
  },
];

const registry = new Map<string, ContractDef>(CORE_CONTRACTS.map((c) => [c.id, c]));

export function getContract(id: string): ContractDef | undefined {
  return registry.get(id);
}

export function isKnownContract(id: string): boolean {
  return registry.has(id);
}

export function listContracts(): ContractDef[] {
  return [...registry.values()];
}

/** Valid contract id shape: namespace.name@vN */
export const CONTRACT_ID_RE = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+@v\d+$/;

export interface ContractViolation {
  index: number;
  path: string;
  message: string;
}

/**
 * Validates a batch of records against a contract schema.
 * Returns violations (empty array = all valid). The whole batch is meant to
 * be rejected when any record fails — partial publishes make sync state
 * impossible to reason about.
 */
export function validateRecords(
  contractId: string,
  records: unknown[],
): { violations: ContractViolation[] } {
  const def = registry.get(contractId);
  if (!def) {
    return { violations: [{ index: -1, path: '', message: `Unknown contract '${contractId}'` }] };
  }
  const violations: ContractViolation[] = [];
  for (let i = 0; i < records.length; i++) {
    const result = def.schema.safeParse(records[i]);
    if (!result.success) {
      for (const issue of result.error.issues.slice(0, 5)) {
        violations.push({ index: i, path: issue.path.join('.'), message: issue.message });
      }
    }
  }
  return { violations };
}
