/**
 * Data provider selection API (switch model).
 *
 *   GET /api/settings/hub-providers          — groups, active provider, candidates
 *   PUT /api/settings/hub-providers/:group   — admin selects the active provider
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest } from '@vencore/plugin-types';
import {
  CONTRACT_GROUPS,
  getContractGroup,
  groupsServedBy,
  getActiveProvider,
  setActiveProvider,
  getPendingSelections,
  countBuiltinCrm,
} from '@vencore/plugin-runtime';
import type { AuthenticatedRequest } from '../middleware/auth';

const putSchema = z.object({
  provider_id: z.string().min(1).max(128),
});

interface Candidate {
  id: string;
  name: string;
  builtin: boolean;
  record_count: number;
}

async function candidatesForGroup(
  db: Kysely<Database>,
  workspaceId: string,
  groupId: string,
): Promise<Candidate[]> {
  const group = getContractGroup(groupId)!;

  const builtinCount = await countBuiltinCrm(db as Kysely<any>, workspaceId, group.required[0] ?? '');
  const result: Candidate[] = [
    { id: group.builtin_provider, name: 'Vencore CRM', builtin: true, record_count: builtinCount },
  ];

  const plugins = await db.selectFrom('workspace_plugins')
    .select(['plugin_id', 'name', 'manifest'])
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .execute();

  for (const p of plugins) {
    const mf = p.manifest as unknown as PluginManifest;
    const provided = (mf.provides ?? []).map((pr) => pr.contract);
    if (!groupsServedBy(provided).some((g) => g.id === groupId)) continue;

    const stat = await db.selectFrom('plugin_hub_records')
      .select((eb) => eb.fn.count('id').as('n'))
      .where('workspace_id', '=', workspaceId)
      .where('provider_plugin_id', '=', p.plugin_id)
      .where('contract', 'in', [...group.required, ...group.optional])
      .executeTakeFirst();
    result.push({ id: p.plugin_id, name: p.name, builtin: false, record_count: Number(stat?.n ?? 0) });
  }
  return result;
}

export function createHubProvidersRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get('/hub-providers', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        return res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
      }

      const pending = await getPendingSelections(db as Kysely<any>, workspace.id);
      const pendingByGroup = new Map(pending.map((p) => [p.group.id, p]));

      const data = await Promise.all(CONTRACT_GROUPS.map(async (group) => {
        const active = await getActiveProvider(db as Kysely<any>, workspace.id, group.id);
        const candidates = await candidatesForGroup(db, workspace.id, group.id);
        const pendingEntry = pendingByGroup.get(group.id);
        return {
          group: group.id,
          label: group.label,
          contracts: { required: group.required, optional: group.optional },
          status: active.status,
          active_provider: candidates.find((c) => c.id === active.provider)
            ?? { id: active.provider, name: active.provider, builtin: false, record_count: 0 },
          pending_candidate: pendingEntry
            ? candidates.find((c) => c.id === pendingEntry.candidate)
              ?? { id: pendingEntry.candidate, name: pendingEntry.candidate, builtin: false, record_count: 0 }
            : null,
          candidates,
        };
      }));

      return res.json({ data, error: null });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/hub-providers/:group', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        return res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
      }

      const groupId = req.params['group']!;
      const group = getContractGroup(groupId);
      if (!group) {
        return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: `Unknown contract group '${groupId}'` } });
      }

      const parsed = putSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ data: null, error: { code: 'INVALID_BODY', message: parsed.error.message } });
      }

      const candidates = await candidatesForGroup(db, workspace.id, groupId);
      if (!candidates.some((c) => c.id === parsed.data.provider_id)) {
        return res.status(422).json({
          data: null,
          error: { code: 'INVALID_PROVIDER', message: 'Provider is not installed or does not serve this contract group' },
        });
      }

      await setActiveProvider(db as Kysely<any>, workspace.id, groupId, parsed.data.provider_id);
      const active = await getActiveProvider(db as Kysely<any>, workspace.id, groupId);
      return res.json({ data: { group: groupId, active_provider_id: active.provider, status: active.status }, error: null });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
