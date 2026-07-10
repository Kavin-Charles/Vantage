/**
 * Core CRM → contract event bridge.
 *
 * When core CRM records change, emit the same contract-based events a plugin
 * provider would (`crm.contact@v1:created`, `crm.deal@v1:stage_changed`, …).
 * emitContractEvent gates on the active provider, so these only reach
 * consumers when Vencore CRM is the active provider for the group — keeping a
 * single event stream under the switch model.
 *
 * Fire-and-forget: a failed emit must never break the mutation.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { emitContractEvent, BUILTIN_CRM_PROVIDER_ID, type ContractAction } from '@vencore/plugin-runtime';
import { logger } from './logger';

export function emitCrmEvent(
  db: Kysely<Database>,
  workspaceId: string,
  contract: 'crm.contact@v1' | 'crm.company@v1' | 'crm.deal@v1' | 'crm.activity@v1',
  action: ContractAction,
  recordId: string,
  extra: Record<string, unknown> = {},
): void {
  void emitContractEvent(
    db as Kysely<any>,
    workspaceId,
    contract,
    action,
    { external_ids: [recordId], count: 1, ...extra },
    BUILTIN_CRM_PROVIDER_ID,
  ).catch((err) => logger.warn({ err, contract, action }, 'emitCrmEvent failed'));
}
