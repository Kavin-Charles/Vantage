import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const triggerConditionsSchema = z.object({
  stage_id:    z.string().uuid().optional(),
  field_key:   z.string().optional(),
  days_before: z.number().int().positive().optional(),
});

const createAutomationSchema = z.object({
  name: z.string().min(1),
  trigger_type: z.enum(['stage_changed', 'field_changed', 'item_created', 'date_approaching']),
  trigger_conditions: triggerConditionsSchema,
  action_type: z.enum(['notify_assignee', 'assign_user', 'move_stage']),
  action_params: z.record(z.unknown()),
  enabled: z.boolean().default(true),
});

const updateAutomationSchema = createAutomationSchema.partial();

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createPipelineAutomationsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router({ mergeParams: true });
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
  const del  = requirePermission('pipelines:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['pipelineId']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const automations = await db.selectFrom('pipeline_automations').selectAll()
        .where('pipeline_id', '=', pipeline.id)
        .orderBy('created_at', 'asc').execute();
      res.json({ data: automations, error: null });
    } catch (e) { next(e); }
  });

  router.post('/', edit, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['pipelineId']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const body = createAutomationSchema.parse(req.body);
      const automation = await db.insertInto('pipeline_automations').values({
        pipeline_id: pipeline.id,
        name: body.name,
        trigger_type: body.trigger_type,
        trigger_conditions: body.trigger_conditions as any,
        action_type: body.action_type,
        action_params: body.action_params as any,
        enabled: body.enabled,
      }).returningAll().executeTakeFirstOrThrow();
      res.status(201).json({ data: automation, error: null });
    } catch (e) { next(e); }
  });

  router.patch('/:automationId', edit, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['pipelineId']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const body = updateAutomationSchema.parse(req.body);
      const automation = await db.updateTable('pipeline_automations').set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.trigger_type !== undefined && { trigger_type: body.trigger_type }),
        ...(body.trigger_conditions !== undefined && { trigger_conditions: body.trigger_conditions as any }),
        ...(body.action_type !== undefined && { action_type: body.action_type }),
        ...(body.action_params !== undefined && { action_params: body.action_params as any }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      })
        .where('id', '=', req.params['automationId']!)
        .where('pipeline_id', '=', pipeline.id)
        .returningAll().executeTakeFirst();
      if (!automation) return fail(res, 404, 'NOT_FOUND', 'Automation not found');
      res.json({ data: automation, error: null });
    } catch (e) { next(e); }
  });

  router.delete('/:automationId', del, async (req, res, next) => {
    try {
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', req.params['pipelineId']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      const automation = await db.deleteFrom('pipeline_automations')
        .where('id', '=', req.params['automationId']!)
        .where('pipeline_id', '=', pipeline.id)
        .returningAll().executeTakeFirst();
      if (!automation) return fail(res, 404, 'NOT_FOUND', 'Automation not found');
      res.json({ data: { id: automation.id }, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
