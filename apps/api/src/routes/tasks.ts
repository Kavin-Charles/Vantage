import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

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
      const status = req.query['status'] as string | undefined;
      const assignee_id = (req.query['assignee_id'] as string) ?? user.id;

      let query = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('due_date', 'asc')
        .orderBy('created_at', 'desc');

      if (status) query = query.where('status', '=', status as never);
      if (assignee_id) query = query.where('assignee_id', '=', assignee_id);

      const tasks = await query.execute();
      res.json({ data: tasks, error: null });
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
