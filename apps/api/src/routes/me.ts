import { Router, type Router as ExpressRouter } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createMeRouter(): ExpressRouter {
  const router = Router();

  router.get('/', (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest;
    res.json({ data: { user, workspace }, error: null });
  });

  return router;
}
