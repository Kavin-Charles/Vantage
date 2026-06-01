import { Router } from 'express';

const GONE_RESPONSE = { data: null, error: { code: 'DEPRECATED', message: 'Use /api/records' } };

export function createDealsRouter(requirePermission: (p: string) => import('express').RequestHandler): ReturnType<typeof Router> {
  const router = Router();
  const gone = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
    res.status(410).json(GONE_RESPONSE);
  router.get('/', requirePermission('pipelines:view'), gone);
  router.post('/', requirePermission('pipelines:create'), gone);
  router.get('/:id', requirePermission('pipelines:view'), gone);
  router.patch('/:id', requirePermission('pipelines:edit'), gone);
  router.delete('/:id', requirePermission('pipelines:delete'), gone);
  return router;
}
