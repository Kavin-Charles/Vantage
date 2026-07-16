/**
 * Section resolver — returns the UI sections that should render on a page,
 * ordered and filtered. The frontend uses this to decide which registered
 * section components to mount and in what order.
 *
 * Two sources merge here:
 *  - plugin sections (manifest `sections`, gated by requires_contract)
 *  - builtin module sections (BUILTIN_ANALYTICS_SECTIONS, gated by
 *    requires_contract or requires_module)
 *
 * Additive by design: core page content is untouched; sections fill declared
 * slots around it. A plugin section targeting an unknown slot is redirected to
 * the page's `extras` slot rather than dropped.
 */
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest } from '@vencore/plugin-types';
import { SLOT_CATALOG, isKnownSlot } from '@vencore/plugin-types';
import { getActiveProviderForContract } from '@vencore/plugin-runtime';
import type { AuthenticatedRequest } from '../middleware/auth';
import { resolveBuiltinSections, requiredContracts } from '../lib/builtin-sections';

interface ResolvedSection {
  kind: 'builtin' | 'plugin';
  plugin_id: string;
  id: string;
  slot_id: string;
  label: string | null;
  priority: number;
}

export function createHubSectionsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/hub/sections/:page
  router.get('/:page', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const page = req.params['page']!;
      if (!SLOT_CATALOG[page]) {
        res.json({ data: [], error: null });
        return;
      }

      const resolved: ResolvedSection[] = [];

      // ── Builtin module sections ─────────────────────────────────────────
      const moduleRows = await db.selectFrom('workspace_modules')
        .select('module_id')
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();
      const enabledModules = new Set(moduleRows.map(r => r.module_id));

      const activeContracts = new Set<string>();
      for (const contract of requiredContracts()) {
        const active = await getActiveProviderForContract(db as Kysely<any>, workspace.id, contract);
        if (active) activeContracts.add(contract);
      }

      resolved.push(...resolveBuiltinSections(page, { enabledModules, activeContracts }));

      // ── Plugin sections ─────────────────────────────────────────────────
      const plugins = await db.selectFrom('workspace_plugins')
        .select(['plugin_id', 'manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();

      for (const p of plugins) {
        const mf = p.manifest as unknown as PluginManifest;
        for (const section of mf.sections ?? []) {
          const [slotPage, slotId] = section.slot.split(':');
          if (slotPage !== page) continue;

          // Contract-dependent sections only render when a provider is active
          if (section.requires_contract) {
            const active = await getActiveProviderForContract(db as Kysely<any>, workspace.id, section.requires_contract);
            if (!active) continue;
          }

          // Unknown slot → route to the page's extras slot
          const targetSlot = isKnownSlot(section.slot) ? slotId! : 'extras';
          resolved.push({
            kind: 'plugin',
            plugin_id: p.plugin_id,
            id: section.id,
            slot_id: targetSlot,
            label: section.label ?? null,
            priority: section.priority ?? 100,
          });
        }
      }

      resolved.sort((a, b) => a.priority - b.priority || a.plugin_id.localeCompare(b.plugin_id));
      res.json({ data: resolved, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
