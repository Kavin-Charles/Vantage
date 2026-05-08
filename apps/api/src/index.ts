import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import Stripe from 'stripe';
import { apiEnvSchema } from '@vantage/config';
import { createDb } from '@vantage/db';
import { errorHandler } from './middleware/errors';
import { createRequireWorkspace } from './middleware/auth';
import { createWebhooksRouter } from './routes/webhooks';
import { createMeRouter } from './routes/me';
import { createContactsRouter } from './routes/contacts';
import { createCompaniesRouter } from './routes/companies';
import { createDealsRouter } from './routes/deals';
import { createTasksRouter } from './routes/tasks';
import { createActivityRouter } from './routes/activity';
import { createAlertsRouter } from './routes/alerts';
import { createBillingRouter } from './routes/billing';
import { createInternalRouter } from './routes/internal';
import { createAgentRouter } from './routes/agent';
import { logger } from './lib/logger';

const env = apiEnvSchema.parse(process.env);
const db = createDb(env.DATABASE_URL);
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const requireWorkspace = createRequireWorkspace(db);

const app = express();

app.use(cors({ origin: process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000' }));
app.use(clerkMiddleware());

// Webhooks need raw body — mount before express.json()
app.use('/api/webhooks', createWebhooksRouter(db, stripe));

app.use(express.json());

// Authenticated routes
app.use('/api/me', requireWorkspace, createMeRouter());
app.use('/api/contacts', requireWorkspace, createContactsRouter(db));
app.use('/api/companies', requireWorkspace, createCompaniesRouter(db));
app.use('/api/deals', requireWorkspace, createDealsRouter(db));
app.use('/api/tasks', requireWorkspace, createTasksRouter(db));
app.use('/api/activity', requireWorkspace, createActivityRouter(db));
app.use('/api/alerts', requireWorkspace, createAlertsRouter(db));
app.use('/api/billing', requireWorkspace, createBillingRouter(db, stripe));

// Internal (cron) — protected by CRON_SECRET header, not Clerk
app.use('/api/internal', createInternalRouter(db, env.CRON_SECRET));

// Agent — protected by agent token, not Clerk
app.use('/api/agent', createAgentRouter(db));

app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server running');
});
