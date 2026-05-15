import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { apiEnvSchema, readConfig } from '@vantage/config';
import { createDb } from '@vantage/db';
import { errorHandler } from './middleware/errors';
import { createRequireAuth, requireAdmin } from './middleware/auth';
import { createAuthRouter } from './routes/auth';
import { createUsersRouter } from './routes/users';
import { createConfigRouter } from './routes/config';
import { createMeRouter } from './routes/me';
import { createContactsRouter } from './routes/contacts';
import { createCompaniesRouter } from './routes/companies';
import { createDealsRouter } from './routes/deals';
import { createPipelinesRouter, createStageFieldsRouter } from './routes/pipelines';
import { createTasksRouter } from './routes/tasks';
import { createActivityRouter } from './routes/activity';
import { createAlertsRouter } from './routes/alerts';
import { createInternalRouter } from './routes/internal';
import { createAgentRouter } from './routes/agent';
import { createServersRouter } from './routes/servers';
import { createInfraDatabasesRouter } from './routes/infra-databases';
import { createWebsitesRouter } from './routes/websites';
import { createAlertThresholdsRouter } from './routes/alert-thresholds';
import { createItemGroupsRouter } from './routes/item-groups';
import { createItemsRouter } from './routes/items';
import { createAnalyticsRouter } from './routes/analytics';
import { createSshKeypairRouter } from './routes/ssh-keypair';
import { createSshActionsRouter } from './routes/ssh-actions';
import { createWebhooksRouter } from './routes/webhooks';
import { createApiKeysRouter } from './routes/api-keys';
import { createV1Router } from './routes/v1/index';
import { seedOnFirstBoot } from './lib/seed';
import { logger } from './lib/logger';

const env = apiEnvSchema.parse(process.env);
const config = readConfig();
const db = createDb(env.DATABASE_URL);
const requireAuth = createRequireAuth(db, env.JWT_SECRET);

const app = express();

app.use(cors({
  origin: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Public routes (no auth)
app.use('/api/config', createConfigRouter(config));
app.use('/api/auth', createAuthRouter(db, env.JWT_SECRET, config.smtp));

// Authenticated routes
app.use('/api/me', requireAuth, createMeRouter());
app.use('/api/contacts', requireAuth, createContactsRouter(db));
app.use('/api/companies', requireAuth, createCompaniesRouter(db));
app.use('/api/deals', requireAuth, createDealsRouter(db));
app.use('/api/pipelines', requireAuth, createPipelinesRouter(db));
app.use('/api/stages', requireAuth, createStageFieldsRouter(db));
app.use('/api/tasks', requireAuth, createTasksRouter(db));
app.use('/api/activity', requireAuth, createActivityRouter(db));
app.use('/api/alerts', requireAuth, createAlertsRouter(db));
app.use('/api/item-groups', requireAuth, createItemGroupsRouter(db));
app.use('/api/items', requireAuth, createItemsRouter(db));
app.use('/api/analytics', requireAuth, createAnalyticsRouter(db));
app.use('/api/webhooks', requireAuth, createWebhooksRouter(db));
app.use('/api/api-keys', requireAuth, createApiKeysRouter(db));

// Admin only — requireAuth + requireAdmin both applied
app.use('/api/users', requireAuth, requireAdmin, createUsersRouter(db));

// Infra routes
app.use('/api/servers', requireAuth, createServersRouter(db));
app.use('/api/databases', requireAuth, createInfraDatabasesRouter(db));
app.use('/api/websites', requireAuth, createWebsitesRouter(db, env.CRON_SECRET));
app.use('/api/alert-thresholds', requireAuth, createAlertThresholdsRouter(db));

// SSH management
app.use('/api/ssh', requireAuth, createSshKeypairRouter(db));
app.use('/api/servers/:id/ssh', requireAuth, createSshActionsRouter(db));

// Internal (cron) — protected by CRON_SECRET, no auth cookie
app.use('/api/internal', createInternalRouter(db, env.CRON_SECRET));

// Agent — protected by agent token, not cookie auth
app.use('/api/agent', createAgentRouter(db));

// Public API v1 — API key auth (no requireAuth cookie)
app.use('/v1', createV1Router(db));

app.use(errorHandler);

// First-boot seeding (non-blocking — errors logged, don't crash)
seedOnFirstBoot(db, config).catch((err: unknown) => {
  logger.error({ err }, '[Vantage] First-boot seeding failed');
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server running');
});
