import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';
import { handleTerminalUpgrade } from './ws/ssh-terminal';
import { handleSftpUpgrade } from './ws/sftp-session';
import { handleMessagingUpgrade } from './ws/messaging-session';
import { initRedisMessaging } from './lib/messaging-pubsub';
import { apiEnvSchema, readConfig } from '@vencore/config';
import { createDb, runMigrations } from '@vencore/db';
import type { Kysely } from 'kysely';
import { sql as sqlTag } from 'kysely';
import type { Database } from '@vencore/db';
import { errorHandler } from './middleware/errors';
import { createRequireAuth, requireAdmin, type AuthenticatedRequest } from './middleware/auth';
import { decryptSettingValue, isEncryptedValue, encryptSettingValue } from './lib/plugin-settings-crypto';
import { createRequireModule } from './middleware/module';
import { createRequirePermission } from './middleware/permission';
import { createWorkspaceModulesRouter } from './routes/workspace-modules';
import { createWorkspaceRouter } from './routes/workspace';
import { createAuthRouter } from './routes/auth';
import { createUsersRouter } from './routes/users';
import { createGroupsRouter } from './routes/groups';
import { createInvitesRouter } from './routes/invites';
import { createUserPermissionsRouter } from './routes/user-permissions';
import { createConfigRouter } from './routes/config';
import { createSetupRouter } from './routes/setup';
import { createMeRouter } from './routes/me';
import { createPushTokenRouter } from './routes/push-token';
import { createContactsRouter } from './routes/contacts';
import { createCompaniesRouter } from './routes/companies';
import { createPipelinesRouter } from './routes/pipelines';
import { createPipelineFieldsRouter } from './routes/pipeline-fields';
import { createPipelineItemsRouter, createItemRouter } from './routes/pipeline-items';
import { createPipelineAutomationsRouter } from './routes/pipeline-automations';
import { createTasksRouter } from './routes/tasks';
import { createUnifiedTasksRouter } from './routes/tasks-unified';
import { createActivityRouter } from './routes/activity';
import { createAlertsRouter } from './routes/alerts';
import { createInternalRouter } from './routes/internal';
import { createAgentRouter } from './routes/agent';
import { createServersRouter } from './routes/servers';
import { createSseRouter } from './routes/sse';
import { createInfraDatabasesRouter } from './routes/infra-databases';
import { createWebsitesRouter } from './routes/websites';
import { createAlertThresholdsRouter } from './routes/alert-thresholds';
import { createAnalyticsRouter } from './routes/analytics';
import { createSshKeypairRouter } from './routes/ssh-keypair';
import { createSshActionsRouter } from './routes/ssh-actions';
import { createWebhooksRouter } from './routes/webhooks';
import { createApiKeysRouter } from './routes/api-keys';
import { createNotificationsRouter } from './routes/notifications';
import { createMessagingRouter } from './routes/messaging';
import { createDashboardsRouter } from './routes/dashboards'
import { createProjectsRouter, createProjectStatusesRouter, createProjectLabelsRouter } from './routes/projects';
import { createProjectWidgetStatsRouter } from './routes/project-widget-stats';
import { createProjectTasksRouter, createMyTasksRouter } from './routes/project-tasks';
import { createCustomFieldsRouter, createTaskFieldValuesRouter } from './routes/custom-fields';
import { createTimeLogsRouter, createTimeSummaryRouter } from './routes/time-logs';
import { createMilestonesRouter } from './routes/milestones';
import { createSprintsRouter } from './routes/sprints';
import { createRecurringRulesRouter } from './routes/recurring-rules';
import { createProjectMembersRouter } from './routes/project-members';
import { createPortalRouter, createPortalInternalRouter } from './routes/portal';
import { createModuleEventSettingsRouter } from './routes/module-event-settings';
import { createHooksRouter } from './routes/hooks';
import { createHubProvidersRouter } from './routes/hub-providers';
import { createHubSectionsRouter } from './routes/hub-sections';
import { createSystemRouter } from './routes/system';
import { startWebsiteChecker } from './workers/website-checker';
import { startTaskDueNotifier } from './workers/task-due-notifier';
import { startPmDueAlertWorker } from './workers/pm-due-alert';
import { startWebhookDelivery } from './workers/webhook-delivery';
import { startMetricsRollup } from './workers/metrics-rollup';
import { startRecurringTaskGenerator } from './workers/recurring-task-generator';
import { createPluginsRouter } from './routes/plugins';
import { createV1Router } from './routes/v1/index';
import { loadPluginBackend, getPluginRouter } from './lib/plugin-loader';
import { createAutomationRouter, createAutomationLogsRouter } from './routes/automation';
import { initAutomationEngine } from './lib/automation-engine';
import { createPmAnalyticsRouter } from './routes/pm-analytics';
import { createProjectDocsRouter } from './routes/project-docs';
import { createPmSearchRouter } from './routes/pm-search';
import { createProjectTemplatesRouter, createSaveAsTemplateRouter } from './routes/project-templates';
import { bridgeRegistry, pluginEventBus, registerHubBridgeMethods } from '@vencore/plugin-runtime';
import { startPluginCron, scheduleToMinutes } from './workers/plugin-cron';
import { startHubRetention } from './workers/hub-retention';
import { initHubHookListeners } from './lib/hub-hook-listeners';
import { initHookFeatureDispatcher } from './lib/hook-features';
import { registerContactsBridgeMethods } from './routes/contacts';
import { registerCompaniesBridgeMethods } from './routes/companies';
import { registerDealsBridgeMethods } from './routes/pipelines';
import { registerTasksBridgeMethods } from './routes/tasks';
import { registerActivityBridgeMethods } from './routes/activity';
import { registerServersBridgeMethods } from './routes/servers';
import { registerWebsitesBridgeMethods } from './routes/websites';
import { createAlert } from './lib/alert-service';
import { createNotificationPreferencesRouter } from './routes/notification-preferences';
import { logger } from './lib/logger';

const env = apiEnvSchema.parse(process.env);
const config = readConfig();
const db = createDb(env.DATABASE_URL);

initAutomationEngine(db);

// Register all module bridge methods
registerContactsBridgeMethods();
registerCompaniesBridgeMethods();
registerDealsBridgeMethods();
registerTasksBridgeMethods();
registerActivityBridgeMethods();
registerServersBridgeMethods();
registerWebsitesBridgeMethods();
registerHubBridgeMethods();

// Register built-in bridge methods
bridgeRegistry
  .register('storage.get', 'storage:read', async (ctx, p, db) => {
    const key = `${ctx.pluginSlug}:${p.key as string}`;
    const row = await (db as any).selectFrom('plugin_storage').select('value')
      .where('workspace_id', '=', ctx.workspaceId)
      .where('key', '=', key)
      .executeTakeFirst();
    return row ? row.value : null;
  })
  .register('storage.set', 'storage:write', async (ctx, p, db) => {
    const key = `${ctx.pluginSlug}:${p.key as string}`;
    await (db as any).insertInto('plugin_storage')
      .values({ workspace_id: ctx.workspaceId, key, value: p.value })
      .onConflict((oc: any) => oc.columns(['workspace_id', 'key']).doUpdateSet({ value: p.value }))
      .execute();
    return null;
  })
  .register('storage.delete', 'storage:write', async (ctx, p, db) => {
    const key = `${ctx.pluginSlug}:${p.key as string}`;
    await (db as any).deleteFrom('plugin_storage')
      .where('workspace_id', '=', ctx.workspaceId)
      .where('key', '=', key)
      .execute();
    return null;
  })
  .register('http.fetch', 'http:fetch', async (ctx, p, db) => {
    const url = p.url as string;
    const timeoutMs = (p.timeout as number | undefined) ?? 30_000;

    // Merge plain headers with server-resolved secret headers. Secret header
    // values may contain {settingKey} tokens, replaced with the decrypted plugin
    // secret. The decrypted secret never returns to plugin code or the browser.
    const headers: Record<string, string> = { ...(p.headers as Record<string, string> | undefined ?? {}) };
    const secretHeaders = p.secret_headers as Record<string, string> | undefined;
    if (secretHeaders && Object.keys(secretHeaders).length > 0) {
      const needed = new Set<string>();
      for (const tmpl of Object.values(secretHeaders)) {
        for (const m of tmpl.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) needed.add(m[1]!);
      }
      const resolved: Record<string, string> = {};
      for (const key of needed) {
        const row = await (db as any).selectFrom('plugin_settings').select(['value', 'encrypted'])
          .where('workspace_id', '=', ctx.workspaceId)
          .where('plugin_id', '=', ctx.pluginSlug)
          .where('key', '=', key)
          .executeTakeFirst() as { value: unknown; encrypted: boolean } | undefined;
        if (!row || row.value == null || row.value === '') {
          throw { code: 'NO_KEY', message: `Secret setting '${key}' is not configured.` };
        }
        resolved[key] = isEncryptedValue(row.value) ? decryptSettingValue(row.value) : String(row.value);
      }
      for (const [name, tmpl] of Object.entries(secretHeaders)) {
        headers[name] = tmpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k: string) => resolved[k] ?? '');
      }
    }

    // secret_body: like secret_headers, but substitutes {settingKey} tokens in
    // the request body server-side (OAuth token exchanges put secrets in the
    // body, not headers). Only keys that resolve to a configured secret are
    // replaced; other brace tokens pass through untouched.
    let body = p.body as string | undefined;
    if (p.secret_body === true && typeof body === 'string') {
      const needed = new Set<string>();
      for (const m of body.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) needed.add(m[1]!);
      for (const key of needed) {
        const row = await (db as any).selectFrom('plugin_settings').select(['value', 'encrypted'])
          .where('workspace_id', '=', ctx.workspaceId)
          .where('plugin_id', '=', ctx.pluginSlug)
          .where('key', '=', key)
          .executeTakeFirst() as { value: unknown; encrypted: boolean } | undefined;
        if (!row || row.value == null || row.value === '') continue;
        const resolvedValue = isEncryptedValue(row.value) ? decryptSettingValue(row.value) : String(row.value);
        body = body.split(`{${key}}`).join(encodeURIComponent(resolvedValue));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: (p.method as string | undefined) ?? 'GET',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body,
        signal: controller.signal,
      });
      const respBody = await res.text();
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v: string, k: string) => { respHeaders[k] = v; });
      return { status: res.status, headers: respHeaders, body: respBody, ok: res.ok };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw { code: isAbort ? 'TIMEOUT' : 'BRIDGE_ERROR', message: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  })
  .register('settings.get', null, async (ctx, p, db) => {
    const row = await (db as any).selectFrom('plugin_settings').select(['value', 'encrypted'])
      .where('workspace_id', '=', ctx.workspaceId)
      .where('plugin_id', '=', ctx.pluginSlug)
      .where('key', '=', p.key as string)
      .executeTakeFirst() as { value: unknown; encrypted: boolean } | undefined;
    if (!row) return null;
    // Never hand ciphertext (or plaintext secrets) back to plugin code — use
    // secret_headers / secret_body on http.fetch to consume secrets. Plugins
    // get a set/unset signal only.
    if (isEncryptedValue(row.value)) return '__secret_set__';
    return row.value;
  })
  .register('settings.set', null, async (ctx, p, db) => {
    const key = p.key as string;
    // Encrypt when the manifest marks this settings field secret — mirrors the
    // PUT /api/plugins/:id/settings route so plugin-written secrets (e.g. an
    // OAuth refresh token) are stored encrypted too.
    const fieldDef = (ctx.manifest?.settings_schema ?? []).find((f) => f.key === key);
    let value: unknown = p.value;
    let encrypted = false;
    if (fieldDef?.secret && typeof value === 'string' && process.env['PLUGIN_SETTINGS_KEY']) {
      value = encryptSettingValue(value);
      encrypted = true;
    }
    const jsonbValue = sqlTag`${JSON.stringify(value)}::jsonb`;
    await (db as any).insertInto('plugin_settings')
      .values({ workspace_id: ctx.workspaceId, plugin_id: ctx.pluginSlug, key, value: jsonbValue, encrypted })
      .onConflict((oc: any) => oc.columns(['workspace_id', 'plugin_id', 'key']).doUpdateSet({ value: jsonbValue, encrypted, updated_at: new Date() }))
      .execute();
    return null;
  })
  .register('bus.emit', null, async (ctx, p) => {
    const event = p.event as string;
    if (!event.match(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)) {
      throw { code: 'INVALID_EVENT', message: 'Event name must use reverse-domain format' };
    }
    // hub:* and cron:* topics are host-emitted only
    if (event.startsWith('hub:') || event.startsWith('cron:')) {
      throw { code: 'INVALID_EVENT', message: `'${event}' is a reserved host topic` };
    }
    // Enforce manifest emits[] declarations when present
    const emits = ctx.manifest?.emits ?? [];
    if (emits.length > 0 && !emits.includes(event)) {
      throw { code: 'UNDECLARED_EVENT', message: `Event '${event}' is not declared in manifest emits[]` };
    }
    await pluginEventBus.forWorkspace(ctx.workspaceId).emit(event, p.payload);
    return null;
  })
  .register('cron.register', null, async (ctx, p, db) => {
    const name = p.name as string;
    const schedule = p.schedule as string;
    if (!name || !/^[a-z][a-z0-9_-]{0,63}$/i.test(name)) {
      throw { code: 'INVALID_REQUEST', message: 'Invalid cron job name' };
    }
    const effectiveSchedule = schedule ?? 'every 60m';
    const intervalMin = scheduleToMinutes(effectiveSchedule);
    const nextRunAt = new Date(Date.now() + intervalMin * 60_000);
    await (db as any).insertInto('plugin_cron_jobs')
      .values({
        workspace_id: ctx.workspaceId,
        plugin_id: ctx.pluginSlug,
        job_name: name,
        schedule: effectiveSchedule,
        next_run_at: nextRunAt,
        enabled: true,
      })
      .onConflict((oc: any) =>
        oc.columns(['workspace_id', 'plugin_id', 'job_name'])
          .doUpdateSet({
            schedule: effectiveSchedule,
            enabled: true,
            // Recompute next_run_at only when the schedule actually changed —
            // re-registering on every sandbox boot must not keep pushing the
            // next run into the future.
            next_run_at: sqlTag`CASE WHEN plugin_cron_jobs.schedule <> ${effectiveSchedule} THEN ${nextRunAt} ELSE plugin_cron_jobs.next_run_at END`,
          }),
      )
      .execute();
    return { registered: name, interval_minutes: intervalMin };
  })
  .register('user.get', null, async (ctx, _p, db) => {
    const row = await (db as any).selectFrom('users').select(['id', 'name', 'email', 'role'])
      .where('workspace_id', '=', ctx.workspaceId)
      .executeTakeFirst();
    return row ?? null;
  })
  .register('workspace.get', null, async (ctx, _p, db) => {
    // workspaces has no 'plan' column — selecting it threw 42703 for every plugin.
    const row = await (db as any).selectFrom('workspaces').select(['id', 'name'])
      .where('id', '=', ctx.workspaceId)
      .executeTakeFirst();
    return row ?? null;
  })
  .register('notify', null, async (ctx, p, db) => {
    const users = await (db as any).selectFrom('users').select('id')
      .where('workspace_id', '=', ctx.workspaceId)
      .execute();
    await Promise.all((users as Array<{ id: string }>).map((u) =>
      (db as any).insertInto('plugin_notifications').values({
        workspace_id: ctx.workspaceId,
        user_id: u.id,
        plugin_id: ctx.pluginSlug,
        title: p.title as string,
        body: (p.body as string | undefined) ?? null,
        type: (p.type as string | undefined) ?? 'info',
      }).execute()
    ));
    return null;
  })
  .register('permissions.check', null, async (ctx, p, db) => {
    const { pluginPermissionKey } = await import('@vencore/plugin-runtime');
    const fullKey = pluginPermissionKey(ctx.pluginSlug, p.permissionKey as string);
    const row = await (db as any).selectFrom('user_permissions')
      .select('granted')
      .where('workspace_id', '=', ctx.workspaceId)
      .where('user_id', '=', p.userId as string)
      .where('permission', '=', fullKey)
      .executeTakeFirst();
    return row?.granted ?? false;
  })
  .register('alert.create', null, async (ctx, p, db) => {
    await createAlert(db as Kysely<Database>, {
      workspaceId: ctx.workspaceId,
      severity: (p.severity as 'critical' | 'warning' | 'info') ?? 'info',
      resourceType: (p.resource_type as any) ?? 'crm',
      resourceId: p.resource_id as string | undefined,
      message: p.message as string,
      messagePrefix: p.message_prefix as string | undefined,
      sourceModuleId: ctx.pluginSlug ?? 'system',
    });
    return { ok: true };
  });

const requireAuth = createRequireAuth(db, env.JWT_SECRET);
const requireModule = createRequireModule(db);
const requirePermission = createRequirePermission(db);

const app = express();

app.use(cors({
  origin: env.APP_URL,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Public routes (no auth)
app.use('/api/config', createConfigRouter(config, db));
app.use('/api/auth', createAuthRouter(db, env.JWT_SECRET, config.smtp, env.APP_URL));
// Setup (public — must come before requireAuth routes)
app.use('/api/setup', createSetupRouter(db));

// Authenticated routes
app.use('/api/me', requireAuth, createMeRouter(db));
app.use('/api/me/push-token', requireAuth, createPushTokenRouter(db));
app.use('/api/workspace/modules', requireAuth, createWorkspaceModulesRouter(db));
app.use('/api/contacts', requireAuth, requireModule('contacts'), createContactsRouter(db, requirePermission));
app.use('/api/companies', requireAuth, requireModule('companies'), createCompaniesRouter(db, requirePermission));
// Agent — must come before the broad /api catch below
app.use('/api/agent', createAgentRouter(db, config.smtp));
app.use('/api/pipelines', requireAuth, requireModule('pipelines'), createPipelinesRouter(db, requirePermission));
app.use('/api/pipelines/:pipelineId/fields', requireAuth, requireModule('pipelines'), createPipelineFieldsRouter(db, requirePermission));
app.use('/api/pipelines/:pipelineId/items', requireAuth, requireModule('pipelines'), createPipelineItemsRouter(db, requirePermission));
app.use('/api/items', requireAuth, requireModule('pipelines'), createItemRouter(db, requirePermission));
app.use(
  '/api/pipelines/:pipelineId/automations',
  requireAuth,
  requireModule('pipelines'),
  createPipelineAutomationsRouter(db, requirePermission),
);
app.use('/api/tasks/unified', requireAuth, requireModule('tasks'), createUnifiedTasksRouter(db, requirePermission));
app.use('/api/tasks', requireAuth, requireModule('tasks'), createTasksRouter(db, requirePermission));
app.use('/api/activity', requireAuth, requireModule('activity'), createActivityRouter(db, requirePermission));
app.use('/api/alerts', requireAuth, requireModule('alerts'), createAlertsRouter(db));
app.use('/api/dashboards', requireAuth, createDashboardsRouter(db))
app.use('/api/projects/widget-stats', requireAuth, createProjectWidgetStatsRouter(db));
app.use('/api/projects', requireAuth, createProjectsRouter(db))
app.use('/api/projects/:projectId/tasks/statuses', requireAuth, createProjectStatusesRouter(db));
app.use('/api/projects/:projectId/labels', requireAuth, createProjectLabelsRouter(db));
app.use('/api/projects/:projectId/tasks', requireAuth, createProjectTasksRouter(db));
app.use('/api/projects/:projectId/recurring-rules', requireAuth, createRecurringRulesRouter(db));
app.use('/api/projects/:projectId/milestones', requireAuth, createMilestonesRouter(db));
app.use('/api/projects/:projectId/sprints', requireAuth, createSprintsRouter(db));
app.use('/api/projects/:projectId/members', requireAuth, createProjectMembersRouter(db));
app.use('/api/projects/:projectId/portal', requireAuth, createPortalInternalRouter(db));
app.use('/api/projects/:projectId/automations', requireAuth, createAutomationRouter(db));
app.use('/api/projects/:projectId/automation-logs', requireAuth, createAutomationLogsRouter(db));
app.use('/api/projects/:projectId/custom-fields', requireAuth, createCustomFieldsRouter(db));
app.use('/api/projects/:projectId/tasks/:taskId/field-values', requireAuth, createTaskFieldValuesRouter(db));
app.use('/api/projects/:projectId/tasks/:taskId/time-logs', requireAuth, createTimeLogsRouter(db));
app.use('/api/projects/:projectId/time-summary', requireAuth, createTimeSummaryRouter(db));
app.use('/api/projects/:projectId/analytics', requireAuth, createPmAnalyticsRouter(db));
app.use('/api/projects/:projectId/docs', requireAuth, createProjectDocsRouter(db));
app.use('/api/projects/:projectId/save-as-template', requireAuth, createSaveAsTemplateRouter(db));
app.use('/api/pm/search', requireAuth, createPmSearchRouter(db));
app.use('/api/project-templates', requireAuth, createProjectTemplatesRouter(db));

// Public portal — no requireAuth
app.use('/api/portal', createPortalRouter(db));
app.use('/api/me/tasks', requireAuth, createMyTasksRouter(db));
app.use('/api/notifications', requireAuth, createNotificationsRouter(db));
app.use('/api/analytics', requireAuth, requireModule('analytics'), createAnalyticsRouter(db, requirePermission));
app.use('/api/webhooks', requireAuth, createWebhooksRouter(db));
app.use('/api/api-keys', requireAuth, createApiKeysRouter(db));
app.use('/api/plugins', requireAuth, createPluginsRouter(db));

// Dynamic plugin route dispatcher — forwards /api/plugins/route/:pluginId/* to loaded bundle
app.use('/api/plugins/route/:pluginId', requireAuth, (req, res, next) => {
  const pluginId = req.params['pluginId']!;
  const { workspace } = req as unknown as AuthenticatedRequest;
  const router = getPluginRouter(pluginId, workspace.id);
  if (!router) {
    return res.status(404).json({ data: null, error: { code: 'PLUGIN_NOT_MOUNTED', message: 'Plugin has no server bundle' } });
  }
  return router(req, res, next);
});

// Admin only — requireAuth + requireAdmin both applied
app.use('/api/workspace', requireAuth, requireAdmin, createWorkspaceRouter(db));
app.use('/api/groups', requireAuth, requireAdmin, createGroupsRouter(db));
app.use('/api/invites', createInvitesRouter(db, config.smtp, requireAuth, requireAdmin, env.APP_URL));
app.use('/api/users/:id/permissions', requireAuth, requireAdmin, createUserPermissionsRouter(db));
app.use('/api/users', requireAuth, requireAdmin, createUsersRouter(db));

// Messaging
app.use('/api/messaging', requireAuth, requireModule('messaging'), createMessagingRouter(db, requirePermission));

// Infra routes
app.use('/api/servers', requireAuth, requireModule('servers'), createServersRouter(db, requirePermission));
app.use('/api/sse', requireAuth, createSseRouter(db));
app.use('/api/databases', requireAuth, requireModule('databases'), createInfraDatabasesRouter(db));
app.use('/api/websites', requireAuth, requireModule('websites'), createWebsitesRouter(db, env.CRON_SECRET, requirePermission));
app.use('/api/alert-thresholds', requireAuth, requireModule('alerts'), createAlertThresholdsRouter(db));
app.use('/api/settings/module-events', requireAuth, createModuleEventSettingsRouter(db));
app.use('/api/settings/notifications', requireAuth, createNotificationPreferencesRouter(db));
app.use('/api/settings', requireAuth, createHubProvidersRouter(db));
app.use('/api/settings', requireAuth, createHooksRouter(db));
app.use('/api/hub/sections', requireAuth, createHubSectionsRouter(db));

// System — version + updates. Mixed auth handled inside the router.
app.use('/api/system', createSystemRouter(db, env, requireAuth, requireAdmin));

// SSH management
app.use('/api/ssh', requireAuth, createSshKeypairRouter(db));
app.use('/api/servers/:id/ssh', requireAuth, requireModule('servers'), requirePermission('servers:ssh'), createSshActionsRouter(db));

// Internal (cron) — protected by CRON_SECRET, no auth cookie
app.use('/api/internal', createInternalRouter(db, env.CRON_SECRET));

// (agent route registered above the /api catch-all)

// Public API v1 — API key auth (no requireAuth cookie)
app.use('/v1', createV1Router(db));

app.use(errorHandler);


// Start website checker (polls every 60 s)
startWebsiteChecker(db);

// Start task-due notifier (fires at midnight UTC daily)
startTaskDueNotifier(db);

// Start pm-due alert worker (fires at midnight UTC daily)
startPmDueAlertWorker(db);

// Start webhook delivery worker (polls every 10 s)
startWebhookDelivery(db);

// Start metrics rollup + retention worker (15-min cycle)
startMetricsRollup(db);

// Start plugin cron worker (fires plugin-registered jobs, 60-s cycle)
startPluginCron(db);

// Purge tombstoned hub records past the retention window (daily)
startHubRetention(db);

// Hook features reacting to hub data changes from plugin providers
initHubHookListeners(db);

// Dispatch plugin-declared hook features on contract events
initHookFeatureDispatcher(db);
startRecurringTaskGenerator(db);

// Init messaging Redis pub/sub (optional — falls back to local broadcast without it)
if (env.REDIS_URL) {
  initRedisMessaging(env.REDIS_URL);
}

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
  } else if (url.startsWith('/api/messaging/ws')) {
    wss.handleUpgrade(request, socket as import('net').Socket, head, (ws) => {
      void handleMessagingUpgrade(ws, request, db, env.JWT_SECRET);
    });
  } else {
    socket.destroy();
  }
});

async function start(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    logger.info('Running database migrations...');
    await runMigrations(env.DATABASE_URL);
    logger.info('Migrations up to date');
  }

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API server running');

    // Respawn backends for all enabled plugins on boot — otherwise plugin
    // sandboxes stay dead after a restart until each is re-uploaded/re-enabled.
    void (async () => {
      try {
        const rows = await db
          .selectFrom('workspace_plugins')
          .select(['plugin_id', 'workspace_id'])
          .where('enabled', '=', true)
          .execute();
        for (const r of rows) {
          try { loadPluginBackend(r.plugin_id, r.workspace_id, db); } catch { /* per-plugin failure is non-fatal */ }
        }
        logger.info({ count: rows.length }, 'Loaded enabled plugin backends on startup');
      } catch (err) {
        logger.error({ err }, 'Failed to load plugin backends on startup');
      }
    })();
  });
}

void start().catch((err: unknown) => {
  logger.error({ err }, 'API startup failed');
  process.exit(1);
});
