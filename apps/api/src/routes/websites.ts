import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const createSchema = z.object({
  url: z.string().url(),
  label: z.string().optional(),
});

const checkSchema = z.object({
  status: z.enum(['online', 'degraded', 'offline']),
  response_ms: z.number().int().optional(),
  ssl_expiry_date: z.string().optional(),
  uptime_pct_30d: z.number().optional(),
});

export function createWebsitesRouter(db: Kysely<Database>, cronSecret: string, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  router.get('/', requirePermission('websites:view'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const sites = await db
        .selectFrom('websites')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();
      res.json({ data: sites, total: sites.length, error: null });
    } catch (err) { next(err); }
  });

  router.post('/', requirePermission('websites:create'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = createSchema.parse(req.body);
      const host = new URL(body.url).hostname;
      const site = await db
        .insertInto('websites')
        .values({ workspace_id: workspace.id, url: body.url, label: body.label ?? null, host, status: 'offline' })
        .returningAll()
        .executeTakeFirstOrThrow();
      res.status(201).json({ data: site, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/:id', requirePermission('websites:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = z.object({ label: z.string().optional() }).parse(req.body);
      const site = await db
        .updateTable('websites')
        .set({ ...body, updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!site) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Website not found' } }); return; }
      res.json({ data: site, error: null });
    } catch (err) { next(err); }
  });

  router.delete('/:id', requirePermission('websites:delete'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('websites')
        .where('id', '=', req.params['id'] as string)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!deleted) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Website not found' } }); return; }
      res.json({ data: { ok: true }, error: null });
    } catch (err) { next(err); }
  });

  // Internal: worker posts check result — protected by CRON_SECRET
  router.post('/:id/check', async (req, res, next) => {
    try {
      if (req.headers['x-cron-secret'] !== cronSecret) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } });
        return;
      }
      const body = checkSchema.parse(req.body);
      const site = await db
        .updateTable('websites')
        .set({ ...body, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .where('id', '=', req.params['id'] as string)
        .returningAll()
        .executeTakeFirst();
      if (!site) { res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Website not found' } }); return; }
      res.json({ data: site, error: null });
    } catch (err) { next(err); }
  });

  return router;
}

import { bridgeRegistry } from '@vantage/plugin-runtime';

export function registerWebsitesBridgeMethods(): void {
  bridgeRegistry
    .register('websites.list', 'websites:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('websites').selectAll().where('workspace_id', '=', ctx.workspaceId);
      if (filter.status) q = q.where('status', '=', filter.status as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      return q.execute();
    })
    .register('websites.get', 'websites:read', async (ctx, p, db) => {
      const row = await db.selectFrom('websites').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Website not found' };
      return row;
    });
}
