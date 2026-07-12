/**
 * Domain settings contributions — feature settings plugins add to a domain
 * settings page (crm / infra / general). Distinct from plugin-private auth
 * config (that stays on the plugin's own settings page). Values live in
 * plugin_hub_settings so they're queryable by domain and by plugin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { PluginManifest } from '@vencore/plugin-types';
import type { AuthenticatedRequest } from '../middleware/auth';

const DOMAINS = new Set(['crm', 'infra', 'general']);

export function createHubSettingsRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET /api/settings/domains — every contributed section across all domains.
  // Powers the Integrations page without hardcoding any domain or plugin.
  router.get('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const plugins = await db.selectFrom('workspace_plugins')
        .select(['plugin_id', 'name', 'manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();

      const values = await db.selectFrom('plugin_hub_settings')
        .select(['plugin_id', 'domain', 'key', 'value'])
        .where('workspace_id', '=', workspace.id)
        .execute();
      const valueMap = new Map(values.map(v => [`${v.plugin_id}:${v.domain}:${v.key}`, v.value]));

      const sections = [];
      for (const p of plugins) {
        const mf = p.manifest as unknown as PluginManifest;
        for (const contribution of mf.settings_contributions ?? []) {
          sections.push({
            plugin_id: p.plugin_id,
            plugin_name: p.name,
            domain: contribution.domain,
            section: contribution.section,
            label: contribution.label,
            fields: contribution.fields.map((f) => ({
              ...f,
              value: valueMap.get(`${p.plugin_id}:${contribution.domain}:${f.key}`) ?? f.default ?? null,
            })),
          });
        }
      }

      res.json({ data: { sections }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/settings/domain/:domain — contributed sections + current values
  router.get('/:domain', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }
      const domain = req.params['domain']!;
      if (!DOMAINS.has(domain)) {
        res.json({ data: { sections: [] }, error: null });
        return;
      }

      const plugins = await db.selectFrom('workspace_plugins')
        .select(['plugin_id', 'name', 'manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('enabled', '=', true)
        .execute();

      const values = await db.selectFrom('plugin_hub_settings')
        .select(['plugin_id', 'key', 'value'])
        .where('workspace_id', '=', workspace.id)
        .where('domain', '=', domain)
        .execute();
      const valueMap = new Map(values.map(v => [`${v.plugin_id}:${v.key}`, v.value]));

      const sections = [];
      for (const p of plugins) {
        const mf = p.manifest as unknown as PluginManifest;
        for (const contribution of mf.settings_contributions ?? []) {
          if (contribution.domain !== domain) continue;
          sections.push({
            plugin_id: p.plugin_id,
            plugin_name: p.name,
            section: contribution.section,
            label: contribution.label,
            fields: contribution.fields.map((f) => ({
              ...f,
              value: valueMap.get(`${p.plugin_id}:${f.key}`) ?? f.default ?? null,
            })),
          });
        }
      }

      res.json({ data: { domain, sections }, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/settings/domain/:domain — save contributed values
  router.put('/:domain', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }
      const domain = req.params['domain']!;
      const parsed = z.object({
        plugin_id: z.string().min(1),
        values: z.record(z.unknown()),
      }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }
      const { plugin_id, values } = parsed.data;

      const plugin = await db.selectFrom('workspace_plugins')
        .select(['manifest'])
        .where('workspace_id', '=', workspace.id)
        .where('plugin_id', '=', plugin_id)
        .where('enabled', '=', true)
        .executeTakeFirst();
      if (!plugin) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Plugin not found' } });
        return;
      }

      const mf = plugin.manifest as unknown as PluginManifest;
      // Build the set of valid keys + their shared flag for this domain
      const fieldMeta = new Map<string, { shared: boolean }>();
      for (const c of mf.settings_contributions ?? []) {
        if (c.domain !== domain) continue;
        for (const f of c.fields) fieldMeta.set(f.key, { shared: f.shared ?? false });
      }

      for (const [key, value] of Object.entries(values)) {
        const meta = fieldMeta.get(key);
        if (!meta) continue; // ignore unknown keys
        const jsonb = sql`${JSON.stringify(value)}::jsonb`;
        await db.insertInto('plugin_hub_settings')
          .values({
            workspace_id: workspace.id, plugin_id, domain, key,
            value: jsonb as never, shared: meta.shared, updated_at: new Date(),
          })
          .onConflict(oc => oc.columns(['workspace_id', 'plugin_id', 'key'])
            .doUpdateSet({ value: jsonb as never, domain, shared: meta.shared, updated_at: new Date() }))
          .execute();
      }

      res.json({ data: { ok: true }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
