/**
 * Contract-based event naming.
 *
 * Events are contract-scoped and provider-agnostic: `<contract>:<action>`,
 * e.g. `crm.contact@v1:created`. Whichever provider is active emits them, so
 * a consumer subscribes to the contract event and never knows (or cares)
 * which provider produced it.
 *
 * Standard actions: created | updated | deleted. Some contracts define extra
 * actions (deals emit `stage_changed`). The host emits contract events only
 * from the ACTIVE provider for a group so consumers see a single stream.
 */
import type { Kysely } from 'kysely';
import { groupForContract } from './contracts';
import { getActiveProviderForContract } from './provider-selection';
import { pluginEventBus } from './bus';

export type ContractAction = 'created' | 'updated' | 'deleted' | 'stage_changed' | (string & {});

/** Legacy hook/event names (pre-hub) mapped to contract-based names. */
export const CONTRACT_EVENT_ALIASES: Record<string, string> = {
  'contact.created': 'crm.contact@v1:created',
  'contact.updated': 'crm.contact@v1:updated',
  'contact.deleted': 'crm.contact@v1:deleted',
  'company.created': 'crm.company@v1:created',
  'company.updated': 'crm.company@v1:updated',
  'company.deleted': 'crm.company@v1:deleted',
  'deal.created': 'crm.deal@v1:created',
  'deal.updated': 'crm.deal@v1:updated',
  'deal.deleted': 'crm.deal@v1:deleted',
  'deal.stage_changed': 'crm.deal@v1:stage_changed',
  'activity.created': 'crm.activity@v1:created',
};

/**
 * Translates a plugin's declared listen topics: legacy names become their
 * contract-based equivalents, unknown names pass through unchanged. Keeps old
 * manifests (`hooks: ["contact.created"]`) working after the rename.
 */
export function expandListenTopics(topics: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of topics) {
    out.add(CONTRACT_EVENT_ALIASES[t] ?? t);
  }
  return [...out];
}

/**
 * Emits a contract event for the ACTIVE provider only. Grouped contracts check
 * the workspace's active provider; standalone contracts always emit.
 *
 * @param sourceProvider the provider attempting to emit (plugin id, or
 *   'vencore-crm' for core mutations)
 */
export async function emitContractEvent(
  db: Kysely<any>,
  workspaceId: string,
  contract: string,
  action: ContractAction,
  payload: Record<string, unknown>,
  sourceProvider: string,
): Promise<void> {
  const group = groupForContract(contract);
  if (group) {
    const active = await getActiveProviderForContract(db, workspaceId, contract);
    if (active && active.provider !== sourceProvider) return; // not the active source
  }
  await pluginEventBus.forWorkspace(workspaceId).emit(`${contract}:${action}`, {
    contract,
    action,
    provider: sourceProvider,
    ...payload,
  });
}
