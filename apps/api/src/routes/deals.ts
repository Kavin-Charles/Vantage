import { Router } from 'express';

const GONE_RESPONSE = { data: null, error: { code: 'DEPRECATED', message: 'Use /api/records' } };

export function createDealsRouter(): ReturnType<typeof Router> {
  const router = Router();
  const gone = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
    res.status(410).json(GONE_RESPONSE);
  router.get('/', gone);
  router.post('/', gone);
  router.get('/:id', gone);
  router.patch('/:id', gone);
  router.delete('/:id', gone);
  return router;
}
