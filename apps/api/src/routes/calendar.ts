import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const VALID_CATEGORIES = ['holiday', 'company_event', 'meeting', 'other'] as const;

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(VALID_CATEGORIES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  all_day: z.boolean().default(true),
});

const updateEventSchema = createEventSchema.partial();

const listQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function createCalendarRouter(db: Kysely<Database>): Router {
  const router = Router();

  // GET / — list events in date range
  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: 'start and end query params required (YYYY-MM-DD)' } });
        return;
      }
      const { start, end } = parsed.data;

      const events = await db
        .selectFrom('calendar_events')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('start_date', '<=', end)
        .where((eb) =>
          eb.or([
            eb('end_date', '>=', start),
            eb.and([
              eb('end_date', 'is', null),
              eb('start_date', '>=', start),
            ]),
          ])
        )
        .orderBy('start_date', 'asc')
        .execute();

      res.json({ data: events, error: null });
    } catch (err) {
      next(err);
    }
  });

  // POST / — create event (admin only)
  router.post('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } });
        return;
      }
      const parsed = createEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const event = await db
        .insertInto('calendar_events')
        .values({
          workspace_id: workspace.id,
          created_by: user.id,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          category: parsed.data.category,
          color: parsed.data.color ?? null,
          start_date: parsed.data.start_date,
          end_date: parsed.data.end_date ?? null,
          all_day: parsed.data.all_day,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: event, error: null });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id — update event (admin only)
  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } });
        return;
      }
      const parsed = updateEventSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const event = await db
        .updateTable('calendar_events')
        .set({ ...parsed.data, updated_at: new Date() } as never)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!event) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: event, error: null });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id — delete event (admin only)
  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN', message: 'Admin only' } });
        return;
      }
      const deleted = await db
        .deleteFrom('calendar_events')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND' } });
        return;
      }
      res.json({ data: null, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
