import { Router } from 'express';
import type { VantageConfig } from '@vantage/config';

export function createConfigRouter(config: VantageConfig): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      data: {
        app: { name: config.app.name, logoUrl: config.app.logoUrl },
        features: config.features,
      },
      error: null,
    });
  });

  return router;
}
