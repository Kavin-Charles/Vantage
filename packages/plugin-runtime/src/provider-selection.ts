/**
 * Switch-model provider selection — one active provider per contract group
 * per workspace.
 *
 * Rules:
 * - No row for a group → the builtin provider is active (fresh workspaces
 *   need no prompt).
 * - Installing/enabling a plugin that serves an already-served group flips
 *   the row to 'pending_selection'; consumers keep the previous provider
 *   until the admin explicitly chooses.
 * - Removing the active provider falls back to the builtin.
 */
import type { Kysely } from 'kysely';
import type { PluginManifest } from '@vencore/plugin-types';
import { CONTRACT_GROUPS, getContractGroup, groupForContract, groupsServedBy, type ContractGroupDef } from './contracts';
import { pluginEventBus } from './bus';

export interface ActiveProvider {
  group: string;
  provider: string;
  status: 'active' | 'pending_selection';
}

interface SelectionRow {
  contract_group: string;
  active_provider_id: string;
  status: 'active' | 'pending_selection';
  previous_provider_id: string | null;
}

async function getSelectionRow(
  db: Kysely<any>,
  workspaceId: string,
  groupId: string,
): Promise<SelectionRow | undefined> {
  return await db.selectFrom('workspace_contract_providers')
    .select(['contract_group', 'active_provider_id', 'status', 'previous_provider_id'])
    .where('workspace_id', '=', workspaceId)
    .where('contract_group', '=', groupId)
    .executeTakeFirst() as SelectionRow | undefined;
}

/**
 * The provider currently serving a group for consumers. During
 * pending_selection the previous provider keeps serving (no interruption).
 */
export async function getActiveProvider(
  db: Kysely<any>,
  workspaceId: string,
  groupId: string,
): Promise<ActiveProvider> {
  const group = getContractGroup(groupId);
  const builtin = group?.builtin_provider ?? 'vencore-crm';
  const row = await getSelectionRow(db, workspaceId, groupId);
  if (!row) return { group: groupId, provider: builtin, status: 'active' };
  if (row.status === 'pending_selection') {
    return { group: groupId, provider: row.previous_provider_id ?? builtin, status: 'pending_selection' };
  }
  return { group: groupId, provider: row.active_provider_id, status: 'active' };
}

/**
 * Active provider for a single contract. Standalone contracts (no group)
 * return null — they keep the merge model (all providers served).
 */
export async function getActiveProviderForContract(
  db: Kysely<any>,
  workspaceId: string,
  contractId: string,
): Promise<ActiveProvider | null> {
  const group = groupForContract(contractId);
  if (!group) return null;
  return getActiveProvider(db, workspaceId, group.id);
}

/**
 * Admin selection. providerId must be the group's builtin or an enabled
 * workspace plugin that serves the group (validated by the caller against
 * workspace_plugins — this module has no manifest access).
 */
export async function setActiveProvider(
  db: Kysely<any>,
  workspaceId: string,
  groupId: string,
  providerId: string,
): Promise<void> {
  if (!getContractGroup(groupId)) {
    throw { code: 'UNKNOWN_GROUP', message: `Unknown contract group '${groupId}'` };
  }
  const now = new Date();
  await db.insertInto('workspace_contract_providers')
    .values({
      workspace_id: workspaceId,
      contract_group: groupId,
      active_provider_id: providerId,
      status: 'active',
      previous_provider_id: null,
      updated_at: now,
    })
    .onConflict((oc: any) =>
      oc.columns(['workspace_id', 'contract_group']).doUpdateSet({
        active_provider_id: providerId,
        status: 'active',
        previous_provider_id: null,
        updated_at: now,
      }),
    )
    .execute();

  const group = getContractGroup(groupId)!;
  for (const contract of [...group.required, ...group.optional]) {
    await pluginEventBus.forWorkspace(workspaceId).emit(`hub:${contract}:provider_switched`, {
      group: groupId,
      contract,
      provider: providerId,
    });
  }
}

/**
 * Called when a plugin that serves one or more groups is installed/enabled.
 * If the group is already served by a different provider, the group enters
 * pending_selection — the admin must choose. Returns the groups that now
 * need a decision.
 */
export async function detectProviderConflicts(
  db: Kysely<any>,
  workspaceId: string,
  manifest: Pick<PluginManifest, 'id' | 'provides'>,
): Promise<ContractGroupDef[]> {
  const provided = (manifest.provides ?? []).map((p) => p.contract);
  const served = groupsServedBy(provided);
  const conflicted: ContractGroupDef[] = [];

  for (const group of served) {
    const current = await getActiveProvider(db, workspaceId, group.id);
    if (current.provider === manifest.id) continue; // re-install of active provider
    if (current.status === 'pending_selection') {
      conflicted.push(group); // already pending — stays pending
      continue;
    }
    const now = new Date();
    await db.insertInto('workspace_contract_providers')
      .values({
        workspace_id: workspaceId,
        contract_group: group.id,
        active_provider_id: manifest.id,
        status: 'pending_selection',
        previous_provider_id: current.provider,
        updated_at: now,
      })
      .onConflict((oc: any) =>
        oc.columns(['workspace_id', 'contract_group']).doUpdateSet({
          active_provider_id: manifest.id,
          status: 'pending_selection',
          previous_provider_id: current.provider,
          updated_at: now,
        }),
      )
      .execute();
    conflicted.push(group);
  }
  return conflicted;
}

/**
 * Called when a provider plugin is disabled or uninstalled. Any group it was
 * serving (active or pending candidate) falls back to the builtin provider.
 * Returns the groups that fell back, for notification purposes.
 */
export async function deactivateProvider(
  db: Kysely<any>,
  workspaceId: string,
  pluginId: string,
): Promise<ContractGroupDef[]> {
  const affected: ContractGroupDef[] = [];
  for (const group of CONTRACT_GROUPS) {
    const row = await getSelectionRow(db, workspaceId, group.id);
    if (!row) continue;

    const isActive = row.status === 'active' && row.active_provider_id === pluginId;
    const isPendingCandidate = row.status === 'pending_selection' && row.active_provider_id === pluginId;
    const isPendingPrevious = row.status === 'pending_selection' && row.previous_provider_id === pluginId;
    if (!isActive && !isPendingCandidate && !isPendingPrevious) continue;

    const now = new Date();
    if (isPendingCandidate) {
      // The unchosen candidate went away — restore the previous provider
      await db.updateTable('workspace_contract_providers')
        .set({
          active_provider_id: row.previous_provider_id ?? group.builtin_provider,
          status: 'active',
          previous_provider_id: null,
          updated_at: now,
        })
        .where('workspace_id', '=', workspaceId)
        .where('contract_group', '=', group.id)
        .execute();
    } else {
      // Active (or pending-previous) provider removed — fall back to builtin
      await db.updateTable('workspace_contract_providers')
        .set({
          active_provider_id: group.builtin_provider,
          status: 'active',
          previous_provider_id: null,
          updated_at: now,
        })
        .where('workspace_id', '=', workspaceId)
        .where('contract_group', '=', group.id)
        .execute();
      affected.push(group);
    }

    for (const contract of [...group.required, ...group.optional]) {
      await pluginEventBus.forWorkspace(workspaceId).emit(`hub:${contract}:provider_switched`, {
        group: group.id,
        contract,
        provider: isPendingCandidate ? (row.previous_provider_id ?? group.builtin_provider) : group.builtin_provider,
      });
    }
  }
  return affected;
}

/**
 * Resolves a provider id to its display name for a workspace. Builtin ids use
 * the contract group's configured name; plugin ids use the installed plugin's
 * own name. Never returns a hardcoded plugin name and never invents one — an
 * unknown id falls back to the id itself.
 */
export async function resolveProviderName(
  db: Kysely<any>,
  workspaceId: string,
  providerId: string,
): Promise<string> {
  const group = CONTRACT_GROUPS.find((g) => g.builtin_provider === providerId);
  if (group) return group.builtin_provider_name;
  const row = await db.selectFrom('workspace_plugins')
    .select('name')
    .where('workspace_id', '=', workspaceId)
    .where('plugin_id', '=', providerId)
    .executeTakeFirst() as { name: string } | undefined;
  return row?.name ?? providerId;
}

/** Groups currently awaiting an admin decision in a workspace. */
export async function getPendingSelections(
  db: Kysely<any>,
  workspaceId: string,
): Promise<Array<{ group: ContractGroupDef; candidate: string; previous: string }>> {
  const rows = await db.selectFrom('workspace_contract_providers')
    .select(['contract_group', 'active_provider_id', 'previous_provider_id'])
    .where('workspace_id', '=', workspaceId)
    .where('status', '=', 'pending_selection')
    .execute() as Array<{ contract_group: string; active_provider_id: string; previous_provider_id: string | null }>;

  return rows
    .map((r) => {
      const group = getContractGroup(r.contract_group);
      if (!group) return null;
      return {
        group,
        candidate: r.active_provider_id,
        previous: r.previous_provider_id ?? group.builtin_provider,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
