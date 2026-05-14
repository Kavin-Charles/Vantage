import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  title: z.string().min(1),
  assignee_id: z.string().uuid(),
  due_date: z.string().optional(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['todo', 'done']).optional(),
  due_date: z.string().nullable().optional(),
});

export function createV1TasksRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  // GET /v1/tasks
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, assignee_id } = parsed.data;

      let query = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (assignee_id) query = query.where('assignee_id', '=', assignee_id);

      const tasks = await query.execute();

      let countQuery = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (assignee_id) countQuery = countQuery.where('assignee_id', '=', assignee_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();
      res.json({ data: tasks, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST /v1/tasks [read_write]
  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      // Validate assignee_id belongs to workspace
      const assignee = await db
        .selectFrom('users')
        .where('id', '=', parsed.data.assignee_id)
        .where('workspace_id', '=', workspace.id)
        .select('id')
        .executeTakeFirst();
      if (!assignee) {
        res.status(400).json({ data: null, error: { code: 'INVALID_ASSIGNEE', message: 'assignee_id not found in workspace' } });
        return;
      }

      const task = await db
        .insertInto('tasks')
        .values({
          workspace_id: workspace.id,
          title: parsed.data.title,
          assignee_id: parsed.data.assignee_id,
          due_date: parsed.data.due_date ? new Date(parsed.data.due_date) : null,
          contact_id: parsed.data.contact_id ?? null,
          deal_id: parsed.data.deal_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /v1/tasks/:id [read_write]
  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }

      const updateVals: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.data.title !== undefined) updateVals['title'] = parsed.data.title;
      if (parsed.data.status !== undefined) updateVals['status'] = parsed.data.status;
      if (parsed.data.due_date !== undefined) {
        updateVals['due_date'] = parsed.data.due_date ? new Date(parsed.data.due_date) : null;
      }

      const task = await db
        .updateTable('tasks')
        .set(updateVals as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
