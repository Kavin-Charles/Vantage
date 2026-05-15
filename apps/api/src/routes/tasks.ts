import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  due_date: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  due_date: z.string().optional(),
  status: z.enum(['todo', 'done']).optional(),
  assignee_id: z.string().uuid().optional(),
});

export function createTasksRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, assignee_id } = parsed.data;
      const effectiveAssignee = assignee_id ?? user.id;

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

      const tasks = await query.execute();

      let countQuery = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (effectiveAssignee) countQuery = countQuery.where('assignee_id', '=', effectiveAssignee);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: tasks, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
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
          deal_id: body.deal_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateTaskSchema.parse(req.body);

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
      res.json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
