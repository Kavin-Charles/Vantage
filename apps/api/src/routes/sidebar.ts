import { Router } from 'express'
import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { requireAdmin } from '../middleware/auth'
import {
  BUILTIN_ITEM_KEYS,
  seedGroups,
  mergeLayout,
  validateLayout,
  type SidebarGroupDto,
} from '../lib/sidebar-layout'

const putLayoutSchema = z.object({
  groups: z.array(z.object({
    id: z.string().min(1).optional(),
    label: z.string().max(40),
    item_keys: z.array(z.string().max(200)).max(100),
    is_default: z.boolean(),
  })).max(30),
})

const putPrefsSchema = z.object({
  pinned_keys: z.array(z.string().max(200)).max(50),
  collapsed_group_keys: z.array(z.string().max(100)).max(50),
})

interface PluginNavRow {
  plugin_id: string;
  manifest: Record<string, unknown> | null;
}

function pluginKeys(rows: PluginNavRow[]): string[] {
  return rows.flatMap((p) => {
    const m = p.manifest as {
      nav?: { href?: string };
      surfaces?: { nav?: { path: string }[] };
    } | null;
    const keys: string[] = [];
    if (m?.nav?.href) keys.push(m.nav.href);
    for (const item of m?.surfaces?.nav ?? []) keys.push(`/plugins/${p.plugin_id}${item.path}`);
    return keys;
  });
}

async function knownKeys(db: Kysely<Database>, workspaceId: string): Promise<string[]> {
  const plugins = await db
    .selectFrom('workspace_plugins')
    .select(['plugin_id', 'manifest'])
    .where('workspace_id', '=', workspaceId)
    .where('enabled', '=', true)
    .execute()
  return [...BUILTIN_ITEM_KEYS, ...pluginKeys(plugins as PluginNavRow[])]
}

async function loadLayout(db: Kysely<Database>, workspaceId: string): Promise<SidebarGroupDto[]> {
  const rows = await db
    .selectFrom('workspace_sidebar_groups')
    .select(['id', 'label', 'is_default', 'item_keys'])
    .where('workspace_id', '=', workspaceId)
    .orderBy('position', 'asc')
    .execute()
  const groups: SidebarGroupDto[] = rows.length > 0
    ? rows.map((r) => ({ id: r.id, label: r.label, is_default: r.is_default, item_keys: r.item_keys ?? [] }))
    : seedGroups()
  return mergeLayout(groups, await knownKeys(db, workspaceId))
}

export function createSidebarRouter(db: Kysely<Database>): Router {
  const router = Router()

  router.get('/layout', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const groups = await loadLayout(db, workspace.id)
      return res.json({ data: { groups }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.put('/layout', requireAdmin, async (req, res) => {
    const parsed = putLayoutSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    }
    const validationError = validateLayout(parsed.data.groups)
    if (validationError) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: validationError } })
    }
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const incoming = parsed.data.groups

      // Upsert keeps existing group ids stable so per-user collapse keys survive admin saves.
      await db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('workspace_sidebar_groups')
          .select(['id'])
          .where('workspace_id', '=', workspace.id)
          .execute()
        const incomingIds = new Set(incoming.map((g) => g.id).filter(Boolean))
        const staleIds = existing.map((r) => r.id).filter((id) => !incomingIds.has(id))

        if (staleIds.length > 0) {
          await trx
            .deleteFrom('workspace_sidebar_groups')
            .where('workspace_id', '=', workspace.id)
            .where('id', 'in', staleIds)
            .execute()
        }

        const existingIds = new Set(existing.map((r) => r.id))
        for (const [position, g] of incoming.entries()) {
          if (g.id && existingIds.has(g.id)) {
            await trx
              .updateTable('workspace_sidebar_groups')
              .set({
                label: g.label.trim(),
                position,
                is_default: g.is_default,
                item_keys: sql`${JSON.stringify(g.item_keys)}::jsonb`,
                updated_at: new Date(),
              })
              .where('workspace_id', '=', workspace.id)
              .where('id', '=', g.id)
              .execute()
          } else {
            await trx
              .insertInto('workspace_sidebar_groups')
              .values({
                workspace_id: workspace.id,
                label: g.label.trim(),
                position,
                is_default: g.is_default,
                item_keys: sql`${JSON.stringify(g.item_keys)}::jsonb`,
              })
              .execute()
          }
        }
      })

      const groups = await loadLayout(db, workspace.id)
      return res.json({ data: { groups }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.get('/prefs', async (req, res) => {
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest
      const row = await db
        .selectFrom('user_sidebar_prefs')
        .select(['pinned_keys', 'collapsed_group_keys'])
        .where('user_id', '=', user.id)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      return res.json({
        data: row ?? { pinned_keys: [], collapsed_group_keys: [] },
        error: null,
      })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.put('/prefs', async (req, res) => {
    const parsed = putPrefsSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    }
    try {
      const { user, workspace } = req as unknown as AuthenticatedRequest
      await db
        .insertInto('user_sidebar_prefs')
        .values({
          user_id: user.id,
          workspace_id: workspace.id,
          pinned_keys: sql`${JSON.stringify(parsed.data.pinned_keys)}::jsonb`,
          collapsed_group_keys: sql`${JSON.stringify(parsed.data.collapsed_group_keys)}::jsonb`,
          updated_at: new Date(),
        })
        .onConflict((oc) => oc.columns(['user_id', 'workspace_id']).doUpdateSet({
          pinned_keys: sql`${JSON.stringify(parsed.data.pinned_keys)}::jsonb`,
          collapsed_group_keys: sql`${JSON.stringify(parsed.data.collapsed_group_keys)}::jsonb`,
          updated_at: new Date(),
        }))
        .execute()
      return res.json({ data: parsed.data, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  return router
}
