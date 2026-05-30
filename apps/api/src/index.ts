import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';
import { handleTerminalUpgrade } from './ws/ssh-terminal';
import { handleSftpUpgrade } from './ws/sftp-session';
import { apiEnvSchema, readConfig } from '@vantage/config';
import { createDb } from '@vantage/db';
import { errorHandler } from './middleware/errors';
import { createRequireAuth, requireAdmin } from './middleware/auth';
import { createAuthRouter } from './routes/auth';
import { createUsersRouter } from './routes/users';
import { createConfigRouter } from './routes/config';
import { createSetupRouter } from './routes/setup';
import { createMeRouter } from './routes/me';
import { createPushTokenRouter } from './routes/push-token';
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
import { createSseRouter } from './routes/sse';
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
import { createRecordTypesRouter } from './routes/record-types';
import { createRecordsRouter } from './routes/records';
import { createConversionsRouter } from './routes/conversions';
import { createNotificationsRouter } from './routes/notifications';
import { createCalendarRouter } from './routes/calendar';
import { createMailAccountsRouter, handleGmailCallback } from './routes/mail-accounts';
import { createMailEmailsRouter } from './routes/mail-emails';
import { createMailWebhookRouter } from './routes/mail-webhook';
import { startMailSync } from './workers/mail-sync';
import { startGmailWatchRenew } from './workers/gmail-watch-renew';
import { startImapIdle } from './workers/imap-idle';
import { handleMailWsUpgrade } from './ws/mail-ws';
import { startWebsiteChecker } from './workers/website-checker';
import { startTaskDueNotifier } from './workers/task-due-notifier';
import { startWebhookDelivery } from './workers/webhook-delivery';
import { createV1Router } from './routes/v1/index';
import { seedOnFirstBoot } from './lib/seed';
import { seedDemo } from './lib/seed-demo';
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
app.use('/api/config', createConfigRouter(config, db));
app.use('/api/auth', createAuthRouter(db, env.JWT_SECRET, config.smtp));
// Setup (public — must come before requireAuth routes)
app.use('/api/setup', createSetupRouter(db));

// Authenticated routes
app.use('/api/me', requireAuth, createMeRouter());
app.use('/api/me/push-token', requireAuth, createPushTokenRouter(db));
app.use('/api/contacts', requireAuth, createContactsRouter(db));
app.use('/api/companies', requireAuth, createCompaniesRouter(db));
app.use('/api/deals', requireAuth, createDealsRouter());
app.use('/api/record-types', requireAuth, createRecordTypesRouter(db));
app.use('/api/records', requireAuth, createRecordsRouter(db));
// Agent — must come before the broad /api catch below
app.use('/api/agent', createAgentRouter(db, config.smtp));
// Gmail OAuth callback — public, must come before the broad /api requireAuth catch below
app.get('/api/mail/accounts/gmail/callback', (req, res, next) => {
  void handleGmailCallback(db, req, res, next);
});

app.use('/api', requireAuth, createConversionsRouter(db));
app.use('/api/pipelines', requireAuth, createPipelinesRouter(db));
app.use('/api/stages', requireAuth, createStageFieldsRouter(db));
app.use('/api/tasks', requireAuth, createTasksRouter(db));
app.use('/api/calendar/events', requireAuth, createCalendarRouter(db));
app.use('/api/activity', requireAuth, createActivityRouter(db));
app.use('/api/alerts', requireAuth, createAlertsRouter(db));
app.use('/api/notifications', requireAuth, createNotificationsRouter(db));
// Mail routes (authenticated)
app.use('/api/mail/accounts', requireAuth, createMailAccountsRouter(db));
app.use('/api/mail/emails', requireAuth, createMailEmailsRouter(db));
// Gmail Pub/Sub push webhook — public, verified by token header
app.use('/api/mail/webhook', createMailWebhookRouter(db, env.GMAIL_PUBSUB_TOKEN ?? ''));
app.use('/api/item-groups', requireAuth, createItemGroupsRouter(db));
app.use('/api/items', requireAuth, createItemsRouter(db));
app.use('/api/analytics', requireAuth, createAnalyticsRouter(db));
app.use('/api/webhooks', requireAuth, createWebhooksRouter(db));
app.use('/api/api-keys', requireAuth, createApiKeysRouter(db));

// Admin only — requireAuth + requireAdmin both applied
app.use('/api/users', requireAuth, requireAdmin, createUsersRouter(db));

// Infra routes
app.use('/api/servers', requireAuth, createServersRouter(db));
app.use('/api/sse', requireAuth, createSseRouter(db));
app.use('/api/databases', requireAuth, createInfraDatabasesRouter(db));
app.use('/api/websites', requireAuth, createWebsitesRouter(db, env.CRON_SECRET));
app.use('/api/alert-thresholds', requireAuth, createAlertThresholdsRouter(db));

// SSH management
app.use('/api/ssh', requireAuth, createSshKeypairRouter(db));
app.use('/api/servers/:id/ssh', requireAuth, createSshActionsRouter(db));

// Internal (cron) — protected by CRON_SECRET, no auth cookie
app.use('/api/internal', createInternalRouter(db, env.CRON_SECRET));

// (agent route registered above the /api catch-all)

// Public API v1 — API key auth (no requireAuth cookie)
app.use('/v1', createV1Router(db));

app.use(errorHandler);

// First-boot seeding (non-blocking — errors logged, don't crash)
seedOnFirstBoot(db, config).catch((err: unknown) => {
  logger.error({ err }, '[Vantage] First-boot seeding failed');
});

// Demo seed — only when DEMO_SEED=true
if (process.env['DEMO_SEED'] === 'true') {
  seedDemo(db).catch((err: unknown) => {
    logger.error({ err }, '[Vantage] Demo seeding failed');
  });
}

// Start mail sync worker (polls every 5 min)
startMailSync(db);

// Start IMAP IDLE connections for real-time detection
void startImapIdle(db).catch(err =>
  logger.error({ err }, 'mail: IMAP IDLE startup failed'),
);

// Start Gmail watch renewal cron (renews every 6 h)
startGmailWatchRenew(db);

// Start website checker (polls every 60 s)
startWebsiteChecker(db);

// Start task-due notifier (fires at midnight UTC daily)
startTaskDueNotifier(db);

// Start webhook delivery worker (polls every 10 s)
startWebhookDelivery(db);

// ── HTTP + WebSocket server ────────────────────────────────────────────────
const httpServer = createServer(app);

// WebSocket server (no-server mode — we route upgrades manually)
const wss = new WebSocketServer({ noServer: true });

// Route WebSocket upgrades for SSH terminal and SFTP endpoints
httpServer.on('upgrade', (request, socket, head) => {
  const url = request.url ?? '';
  if (/^\/api\/servers\/[^/]+\/ssh\/terminal/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleTerminalUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else if (/^\/api\/servers\/[^/]+\/ssh\/sftp/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleSftpUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else if (/^\/api\/mail\/ws/.test(url)) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleMailWsUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else {
    socket.destroy();
  }
});

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server running');
});
