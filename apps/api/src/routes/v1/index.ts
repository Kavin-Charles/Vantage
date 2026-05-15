import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { createRequireApiKey } from '../../middleware/api-key-auth';
import { createV1ContactsRouter } from './contacts';
import { createV1CompaniesRouter } from './companies';
import { createV1DealsRouter } from './deals';
import { createV1TasksRouter } from './tasks';
import { createV1InfraRouter } from './infra';

export function createV1Router(db: Kysely<Database>): ExpressRouter {
  const router = Router();
  const requireApiKey = createRequireApiKey(db);

  // All /v1 routes require a valid API key
  router.use(requireApiKey);

  router.use('/contacts', createV1ContactsRouter(db));
  router.use('/companies', createV1CompaniesRouter(db));
  router.use('/deals', createV1DealsRouter(db));
  router.use('/tasks', createV1TasksRouter(db));

  // Infra routes mounted directly (they define /servers, /alerts, /websites)
  const infraRouter = createV1InfraRouter(db);
  router.use('/', infraRouter);

  return router;
}
