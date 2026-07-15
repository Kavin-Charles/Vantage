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

// ── Contract groups ───────────────────────────────────────────────────────────
// Contracts in a group switch providers together (you wouldn't use Zoho
// contacts with Vencore deals). A provider must provide every `required`
// member to serve the group; `optional` members are served when available and
// features that need a missing optional contract simply stay unavailable.

export interface ContractGroupDef {
  id: string;
  label: string;
  /** Builtin provider id that serves this group by default. */
  builtin_provider: string;
  /** Display name for the builtin provider (shown in the UI). */
  builtin_provider_name: string;
  required: string[];
  optional: string[];
}

export const CONTRACT_GROUPS: ContractGroupDef[] = [
  {
    id: 'crm',
    label: 'CRM',
    builtin_provider: 'vencore-crm',
    builtin_provider_name: 'Vencore CRM',
    required: ['crm.contact@v1', 'crm.company@v1', 'crm.deal@v1'],
    optional: ['crm.activity@v1'],
  },
];

export function getContractGroup(groupId: string): ContractGroupDef | undefined {
  return CONTRACT_GROUPS.find((g) => g.id === groupId);
}

export function groupForContract(contractId: string): ContractGroupDef | undefined {
  return CONTRACT_GROUPS.find(
    (g) => g.required.includes(contractId) || g.optional.includes(contractId),
  );
}

/**
 * Groups this manifest fully serves: the plugin provides every required
 * member. Partial coverage of a group's required set is rejected at upload.
 */
export function groupsServedBy(providedContracts: readonly string[]): ContractGroupDef[] {
  return CONTRACT_GROUPS.filter((g) => g.required.every((c) => providedContracts.includes(c)));
}

/**
 * Returns an error when the manifest partially covers a group's required
 * contracts — all-or-nothing per group.
 */
export function validateGroupCoverage(providedContracts: readonly string[]): string | null {
  for (const g of CONTRACT_GROUPS) {
    const covered = g.required.filter((c) => providedContracts.includes(c));
    if (covered.length > 0 && covered.length < g.required.length) {
      const missing = g.required.filter((c) => !providedContracts.includes(c));
      return `Contract group '${g.id}' requires all of: ${g.required.join(', ')}. Missing: ${missing.join(', ')}`;
    }
  }
  return null;
}

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
