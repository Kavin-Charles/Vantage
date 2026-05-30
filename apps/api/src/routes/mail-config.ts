import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/auth';

const workspaceImapConfigSchema = z.object({
  imap_host: z.string().min(1),
  imap_port: z.coerce.number().int().min(1).max(65535),
  smtp_host: z.string().min(1),
  smtp_port: z.coerce.number().int().min(1).max(65535),
  use_ssl: z.boolean().default(true),
});

export function createMailConfigRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /api/mail/workspace-config
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const config = await db
        .selectFrom('workspace_imap_config')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .executeTakeFirst();
      res.json({ data: config ?? null, error: null });
    } catch (err) { next(err); }
  });

  // PUT /api/mail/workspace-config — admin only
  router.put('/', requireAdmin, async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = workspaceImapConfigSchema.parse(req.body);
      const config = await db
        .insertInto('workspace_imap_config')
        .values({ workspace_id: workspace.id, ...body })
        .onConflict(oc =>
          oc.column('workspace_id').doUpdateSet({
            imap_host: body.imap_host,
            imap_port: body.imap_port,
            smtp_host: body.smtp_host,
            smtp_port: body.smtp_port,
            use_ssl: body.use_ssl,
            updated_at: new Date().toISOString(),
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
      res.json({ data: config, error: null });
    } catch (err) { next(err); }
  });

  return router;
}
