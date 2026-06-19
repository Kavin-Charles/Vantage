import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
import { logActivity } from '../lib/log-activity';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  show_all: z.coerce.boolean().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  due_date: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  record_id: z.string().uuid().nullable().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  due_date: z.string().optional(),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

export function createTasksRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  router.get('/', requirePermission('tasks:view'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, assignee_id, contact_id, show_all } = parsed.data;
      // show_all=true (admin only) returns all workspace tasks regardless of assignee
      const showAll = show_all === true && user.role === 'admin';
      // When filtering by contact_id, skip the assignee scope so all tasks for that contact are returned
      const effectiveAssignee = contact_id ? null : (showAll ? null : (assignee_id ?? user.id));

      let query = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('due_date', 'asc')
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (effectiveAssignee) query = query.where('assignee_id', '=', effectiveAssignee);
      if (contact_id) query = query.where('contact_id', '=', contact_id);

      const tasks = await query.execute();

      let countQuery = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (effectiveAssignee) countQuery = countQuery.where('assignee_id', '=', effectiveAssignee);
      if (contact_id) countQuery = countQuery.where('contact_id', '=', contact_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: tasks, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission('tasks:create'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createTaskSchema.parse(req.body);

      const task = await db
        .insertInto('tasks')
        .values({
          workspace_id: workspace.id,
          assignee_id: body.assignee_id ?? user.id,
          title: body.title,
          due_date: body.due_date ? new Date(body.due_date) : null,
          contact_id: body.contact_id ?? null,
          record_id: body.record_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      queueWebhook(db, workspace.id, 'task.created', {
        task_id: task.id,
        title: task.title,
        due_date: task.due_date ? (task.due_date as Date).toISOString() : null,
        assignee_id: task.assignee_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission('tasks:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('tasks')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();
      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/:id', requirePermission('tasks:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateTaskSchema.parse(req.body);

      const currentTask = body.status === 'done'
        ? await db
            .selectFrom('tasks')
            .select(['status'])
            .where('id', '=', req.params['id']!)
            .where('workspace_id', '=', workspace.id)
            .executeTakeFirst()
        : null;

      const task = await db
        .updateTable('tasks')
        .set({ ...body, updated_at: new Date(), due_date: body.due_date ? new Date(body.due_date) : undefined })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }

      if (body.status === 'done' && currentTask?.status !== 'done') {
        queueWebhook(db, workspace.id, 'task.completed', {
          task_id: task.id,
          title: task.title,
          assignee_id: task.assignee_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: task.assignee_id ?? null,
          type: 'task_done',
          source_module_id: 'tasks',
          body: `Task completed: "${task.title}"`,
          contact_id: task.contact_id ?? undefined,
          record_id: task.id,
        }).catch((err: unknown) => logger.error({ err }, 'logActivity failed'));
      }

      res.json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

import { bridgeRegistry } from '@vencore/plugin-runtime';

export function registerTasksBridgeMethods(): void {
  bridgeRegistry
    .register('tasks.list', 'tasks:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('tasks').selectAll().where('workspace_id', '=', ctx.workspaceId);
      if (filter.status) q = q.where('status', '=', filter.status as string);
      if (filter.assignee_id) q = q.where('assignee_id', '=', filter.assignee_id as string);
      if (filter.contact_id) q = q.where('contact_id', '=', filter.contact_id as string);
      if (filter.deal_id) q = q.where('deal_id', '=', filter.deal_id as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      return q.execute();
    })
    .register('tasks.get', 'tasks:read', async (ctx, p, db) => {
      const row = await db.selectFrom('tasks').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Task not found' };
      return row;
    })
    .register('tasks.create', 'tasks:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.insertInto('tasks')
        .values({ ...data, workspace_id: ctx.workspaceId } as any)
        .returningAll().execute();
      return row;
    })
    .register('tasks.update', 'tasks:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.updateTable('tasks')
        .set({ ...data, updated_at: new Date() } as any)
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .returningAll().execute();
      if (!row) throw { code: 'NOT_FOUND', message: 'Task not found' };
      return row;
    });
}
