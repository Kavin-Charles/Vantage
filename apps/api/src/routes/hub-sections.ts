/**
 * Section resolver — returns the plugin UI sections that should render on a
 * page, ordered and filtered. The frontend SlotOutlet uses this to decide
 * which registered section components to mount and in what order.
 *
 * Additive by design: core page content is untouched; sections fill declared
 * slots around it. A section targeting an unknown slot is redirected to the
 * page's `extras` slot rather than dropped.
 */
import { Router } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest } from '@vencore/plugin-types';
import { SLOT_CATALOG, isKnownSlot } from '@vencore/plugin-types';
import { getActiveProviderForContract } from '@vencore/plugin-runtime';
import type { AuthenticatedRequest } from '../middleware/auth';

interface ResolvedSection {
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

      const plugins = await db.selectFrom('workspace_plugins')
        .select(['plugin_id', 'manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();

      const resolved: ResolvedSection[] = [];
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
