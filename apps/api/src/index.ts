import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';
import { handleTerminalUpgrade } from './ws/ssh-terminal';
import { handleSftpUpgrade } from './ws/sftp-session';
import { apiEnvSchema, readConfig } from '@vencore/config';
import { createDb } from '@vencore/db';
import { errorHandler } from './middleware/errors';
import { createRequireAuth, requireAdmin } from './middleware/auth';
import { createRequireModule } from './middleware/module';
import { createRequirePermission } from './middleware/permission';
import { createWorkspaceModulesRouter } from './routes/workspace-modules';
import { createAuthRouter } from './routes/auth';
import { createUsersRouter } from './routes/users';
import { createGroupsRouter } from './routes/groups';
import { createInvitesRouter } from './routes/invites';
import { createUserPermissionsRouter } from './routes/user-permissions';
import { createConfigRouter } from './routes/config';
import { createSetupRouter } from './routes/setup';
import { createInstallerRouter } from './routes/installer';
import { createMeRouter } from './routes/me';
import { createPushTokenRouter } from './routes/push-token';
import { createContactsRouter } from './routes/contacts';
import { createCompaniesRouter } from './routes/companies';
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
import { createNotificationsRouter } from './routes/notifications';
import { createDashboardsRouter } from './routes/dashboards'
import { createProjectsRouter, createProjectStatusesRouter } from './routes/projects';
import { createProjectTasksRouter, createMyTasksRouter } from './routes/project-tasks';
import { createCustomFieldsRouter, createTaskFieldValuesRouter } from './routes/custom-fields';
import { createTimeLogsRouter } from './routes/time-logs';
import { createMilestonesRouter } from './routes/milestones';
import { createSprintsRouter } from './routes/sprints';
import { createProjectMembersRouter } from './routes/project-members';
import { createPortalRouter, createPortalInternalRouter } from './routes/portal';
import { startWebsiteChecker } from './workers/website-checker';
import { startTaskDueNotifier } from './workers/task-due-notifier';
import { startWebhookDelivery } from './workers/webhook-delivery';
import { createPluginsRouter } from './routes/plugins';
import { createV1Router } from './routes/v1/index';
import { loadPluginBackend, getPluginRouter } from './lib/plugin-loader';
import { assertSafeUrl, SsrfError } from './lib/ssrf-guard';
import { encryptSettingValue, decryptSettingValue, isEncryptedValue } from './lib/plugin-settings-crypto';
import { seedOnFirstBoot } from './lib/seed';
import { createAutomationRouter } from './routes/automation';
import { initAutomationEngine } from './lib/automation-engine';
import { createPmAnalyticsRouter } from './routes/pm-analytics';
import { createProjectDocsRouter } from './routes/project-docs';
import { createPmSearchRouter } from './routes/pm-search';
import { createProjectTemplatesRouter, createSaveAsTemplateRouter } from './routes/project-templates';
import { bridgeRegistry, pluginEventBus } from '@vencore/plugin-runtime';
import { registerContactsBridgeMethods } from './routes/contacts';
import { registerCompaniesBridgeMethods } from './routes/companies';
import { registerDealsBridgeMethods } from './routes/pipelines';
import { registerTasksBridgeMethods } from './routes/tasks';
import { registerActivityBridgeMethods } from './routes/activity';
import { registerServersBridgeMethods } from './routes/servers';
import { registerWebsitesBridgeMethods } from './routes/websites';
import { seedDemo } from './lib/seed-demo';
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
  .register('http.fetch', 'http:fetch', async (_ctx, p) => {
    const url = p.url as string;
    const timeoutMs = Math.min((p.timeout as number | undefined) ?? 30_000, 60_000);
    const maxBodyBytes = 4 * 1024 * 1024; // 4 MB cap

    // SSRF guard: validate URL against private/reserved IP ranges
    try {
      await assertSafeUrl(url);
    } catch (err) {
      if (err instanceof SsrfError) {
        throw { code: 'SSRF_BLOCKED', message: err.message };
      }
      throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: (p.method as string | undefined) ?? 'GET',
        headers: p.headers as Record<string, string> | undefined,
        body: p.body as string | undefined,
        signal: controller.signal,
      });

      // Enforce body size cap
      const reader = res.body?.getReader();
      if (!reader) {
        return { status: res.status, headers: {}, body: '', ok: res.ok };
      }
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBodyBytes) {
          reader.cancel();
          throw { code: 'RESPONSE_TOO_LARGE', message: `Response exceeds ${maxBodyBytes} byte limit` };
        }
        chunks.push(value);
      }
      const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
      const headers: Record<string, string> = {};
      res.headers.forEach((v: string, k: string) => { headers[k] = v; });
      return { status: res.status, headers, body, ok: res.ok };
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) throw err;
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
    if (row.encrypted && isEncryptedValue(row.value)) {
      try {
        return decryptSettingValue(row.value);
      } catch {
        return null;
      }
    }
    return row.value;
  })
  .register('settings.set', null, async (ctx, p, db) => {
    // Determine if this key is marked secret in the manifest
    const pluginRow = await (db as any).selectFrom('workspace_plugins').select('manifest')
      .where('workspace_id', '=', ctx.workspaceId)
      .where('plugin_id', '=', ctx.pluginSlug)
      .executeTakeFirst() as { manifest: Record<string, unknown> } | undefined;
    const schema = (pluginRow?.manifest?.settings_schema as Array<{ key: string; secret?: boolean }> | undefined) ?? [];
    const fieldDef = schema.find((f) => f.key === (p.key as string));
    const isSecret = fieldDef?.secret === true;

    let storedValue: unknown = p.value;
    let encrypted = false;
    if (isSecret && typeof p.value === 'string' && process.env['PLUGIN_SETTINGS_KEY']) {
      storedValue = encryptSettingValue(p.value as string);
      encrypted = true;
    }

    await (db as any).insertInto('plugin_settings')
      .values({ workspace_id: ctx.workspaceId, plugin_id: ctx.pluginSlug, key: p.key as string, value: storedValue, encrypted })
      .onConflict((oc: any) => oc.columns(['workspace_id', 'plugin_id', 'key']).doUpdateSet({ value: storedValue, encrypted, updated_at: new Date() }))
      .execute();
    return null;
  })
  .register('bus.emit', null, async (ctx, p) => {
    const event = p.event as string;
    if (!event.match(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)) {
      throw { code: 'INVALID_EVENT', message: 'Event name must use reverse-domain format' };
    }
    await pluginEventBus.forWorkspace(ctx.workspaceId).emit(event, p.payload);
    return null;
  })
  .register('user.get', null, async (ctx, _p, db) => {
    const row = await (db as any).selectFrom('users').select(['id', 'name', 'email', 'role'])
      .where('workspace_id', '=', ctx.workspaceId)
      .executeTakeFirst();
    return row ?? null;
  })
  .register('workspace.get', null, async (ctx, _p, db) => {
    const row = await (db as any).selectFrom('workspaces').select(['id', 'name', 'domain'])
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
  .register('context.get', null, async (ctx, _p, db) => {
    const user = await (db as any).selectFrom('users').select(['id', 'name', 'email', 'role'])
      .where('workspace_id', '=', ctx.workspaceId)
      .executeTakeFirst() as { id: string; name: string; email: string; role: string } | undefined;
    return {
      workspace_id: ctx.workspaceId,
      user_id: user?.id ?? '',
      page: 'full-page',
      record_id: null,
      record_type: null,
    };
  })
  .register('cron.register', null, async (ctx, p, db) => {
    const schedule = p.schedule as string;
    const name = p.name as string;
    if (!schedule || !name) {
      throw { code: 'INVALID_PARAMS', message: 'cron.register requires schedule and name' };
    }
    // Parse schedule to compute next_run_at (simple: 1 minute from now; worker computes actual)
    await (db as any).insertInto('plugin_cron_jobs')
      .values({
        workspace_id: ctx.workspaceId,
        plugin_id: ctx.pluginSlug,
        job_name: name,
        schedule,
        next_run_at: new Date(Date.now() + 60_000),
        enabled: true,
      })
      .onConflict((oc: any) =>
        oc.constraint('plugin_cron_jobs_workspace_plugin_name_unique')
          .doUpdateSet({ schedule, next_run_at: new Date(Date.now() + 60_000), enabled: true })
      )
      .execute();
    return null;
  })
  .register('files.upload', null, async (ctx, p, db) => {
    const r2AccountId = process.env['R2_ACCOUNT_ID'];
    const r2AccessKey = process.env['R2_ACCESS_KEY_ID'];
    const r2SecretKey = process.env['R2_SECRET_ACCESS_KEY'];
    const r2Bucket = process.env['R2_BUCKET_NAME'];
    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      throw { code: 'NOT_CONFIGURED', message: 'File storage (R2) is not configured on this instance' };
    }
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
    });
    const bufferB64 = p.buffer as string;
    const name = p.name as string;
    const mime = p.mime as string;
    const buffer = Buffer.from(bufferB64, 'base64');
    const r2Key = `plugins/${ctx.workspaceId}/${ctx.pluginSlug}/${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await s3.send(new PutObjectCommand({ Bucket: r2Bucket, Key: r2Key, Body: buffer, ContentType: mime }));
    const file = await (db as any).insertInto('plugin_files')
      .values({ workspace_id: ctx.workspaceId, plugin_id: ctx.pluginSlug, name, mime, size: buffer.byteLength, r2_key: r2Key })
      .returningAll()
      .executeTakeFirstOrThrow() as { id: string; name: string; mime: string; size: number };
    const publicUrl = process.env['R2_PUBLIC_URL'] ? `${process.env['R2_PUBLIC_URL']}/${r2Key}` : '';
    return { id: file.id, name: file.name, mime: file.mime, size: file.size, url: publicUrl };
  })
  .register('files.getUrl', null, async (ctx, p, db) => {
    const r2AccountId = process.env['R2_ACCOUNT_ID'];
    const r2AccessKey = process.env['R2_ACCESS_KEY_ID'];
    const r2SecretKey = process.env['R2_SECRET_ACCESS_KEY'];
    const r2Bucket = process.env['R2_BUCKET_NAME'];
    if (!r2AccountId || !r2AccessKey || !r2SecretKey || !r2Bucket) {
      throw { code: 'NOT_CONFIGURED', message: 'File storage (R2) is not configured' };
    }
    const file = await (db as any).selectFrom('plugin_files').select(['r2_key'])
      .where('id', '=', p.fileId as string)
      .where('workspace_id', '=', ctx.workspaceId)
      .where('plugin_id', '=', ctx.pluginSlug)
      .executeTakeFirst() as { r2_key: string } | undefined;
    if (!file) throw { code: 'NOT_FOUND', message: 'File not found' };
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
    });
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: r2Bucket, Key: file.r2_key }), { expiresIn: 3600 });
  })
  .register('files.delete', null, async (ctx, p, db) => {
    const r2AccountId = process.env['R2_ACCOUNT_ID'];
    const r2AccessKey = process.env['R2_ACCESS_KEY_ID'];
    const r2SecretKey = process.env['R2_SECRET_ACCESS_KEY'];
    const r2Bucket = process.env['R2_BUCKET_NAME'];
    const file = await (db as any).selectFrom('plugin_files').select(['r2_key'])
      .where('id', '=', p.fileId as string)
      .where('workspace_id', '=', ctx.workspaceId)
      .where('plugin_id', '=', ctx.pluginSlug)
      .executeTakeFirst() as { r2_key: string } | undefined;
    if (!file) throw { code: 'NOT_FOUND', message: 'File not found' };
    if (r2AccountId && r2AccessKey && r2SecretKey && r2Bucket) {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
      });
      await s3.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: file.r2_key })).catch(() => {});
    }
    await (db as any).deleteFrom('plugin_files')
      .where('id', '=', p.fileId as string)
      .where('workspace_id', '=', ctx.workspaceId)
      .where('plugin_id', '=', ctx.pluginSlug)
      .execute();
    return null;
  });

const requireAuth = createRequireAuth(db, env.JWT_SECRET);
const requireModule = createRequireModule(db);
const requirePermission = createRequirePermission(db);

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

// Installer (only active when INSTALLER_MODE=true)
if (process.env['INSTALLER_MODE'] === 'true') {
  app.use('/api/installer', createInstallerRouter());
}

// Authenticated routes
app.use('/api/me', requireAuth, createMeRouter());
app.use('/api/me/push-token', requireAuth, createPushTokenRouter(db));
app.use('/api/workspace/modules', requireAuth, createWorkspaceModulesRouter(db));
app.use('/api/contacts', requireAuth, requireModule('contacts'), createContactsRouter(db, requirePermission));
app.use('/api/companies', requireAuth, requireModule('companies'), createCompaniesRouter(db, requirePermission));
app.use('/api/record-types', requireAuth, requireModule('pipelines'), createRecordTypesRouter(db, requirePermission));
app.use('/api/records', requireAuth, requireModule('pipelines'), createRecordsRouter(db, requirePermission));
// Agent — must come before the broad /api catch below
app.use('/api/agent', createAgentRouter(db, config.smtp));
app.use('/api/pipelines', requireAuth, requireModule('pipelines'), createPipelinesRouter(db, requirePermission));
app.use('/api/stages', requireAuth, requireModule('pipelines'), createStageFieldsRouter(db, requirePermission));
app.use('/api/tasks', requireAuth, requireModule('tasks'), createTasksRouter(db, requirePermission));
app.use('/api/activity', requireAuth, requireModule('activity'), createActivityRouter(db, requirePermission));
app.use('/api/alerts', requireAuth, createAlertsRouter(db));
app.use('/api/dashboards', requireAuth, createDashboardsRouter(db))
app.use('/api/projects', requireAuth, createProjectsRouter(db))
app.use('/api/projects/:projectId/tasks/statuses', requireAuth, createProjectStatusesRouter(db));
app.use('/api/projects/:projectId/tasks', requireAuth, createProjectTasksRouter(db));
app.use('/api/projects/:projectId/milestones', requireAuth, createMilestonesRouter(db));
app.use('/api/projects/:projectId/sprints', requireAuth, createSprintsRouter(db));
app.use('/api/projects/:projectId/members', requireAuth, createProjectMembersRouter(db));
app.use('/api/projects/:projectId/portal', requireAuth, createPortalInternalRouter(db));
app.use('/api/projects/:projectId/automations', requireAuth, createAutomationRouter(db));
app.use('/api/projects/:projectId/custom-fields', requireAuth, createCustomFieldsRouter(db));
app.use('/api/projects/:projectId/tasks/:taskId/field-values', requireAuth, createTaskFieldValuesRouter(db));
app.use('/api/projects/:projectId/tasks/:taskId/time-logs', requireAuth, createTimeLogsRouter(db));
app.use('/api/projects/:projectId/analytics', requireAuth, createPmAnalyticsRouter(db));
app.use('/api/projects/:projectId/docs', requireAuth, createProjectDocsRouter(db));
app.use('/api/projects/:projectId/save-as-template', requireAuth, createSaveAsTemplateRouter(db));
app.use('/api/pm/search', requireAuth, createPmSearchRouter(db));
app.use('/api/project-templates', requireAuth, createProjectTemplatesRouter(db));

// Public portal — no requireAuth
app.use('/api/portal', createPortalRouter(db));
app.use('/api/me/tasks', requireAuth, createMyTasksRouter(db));
app.use('/api/notifications', requireAuth, createNotificationsRouter(db));
app.use('/api/item-groups', requireAuth, requireModule('pipelines'), createItemGroupsRouter(db, requirePermission));
app.use('/api/items', requireAuth, requireModule('pipelines'), createItemsRouter(db, requirePermission));
app.use('/api/analytics', requireAuth, requireModule('analytics'), createAnalyticsRouter(db, requirePermission));
app.use('/api/webhooks', requireAuth, createWebhooksRouter(db));
app.use('/api/api-keys', requireAuth, createApiKeysRouter(db));
app.use('/api/plugins', requireAuth, createPluginsRouter(db));

// Dynamic plugin route dispatcher — forwards /api/plugins/route/:pluginId/* to loaded bundle
app.use('/api/plugins/route/:pluginId', requireAuth, (req, res, next) => {
  const pluginId = req.params['pluginId']!;
  const { workspace } = req as any;
  const router = getPluginRouter(pluginId, workspace?.id ?? '');
  if (!router) {
    return res.status(404).json({ data: null, error: { code: 'PLUGIN_NOT_MOUNTED', message: 'Plugin has no server bundle' } });
  }
  return router(req, res, next);
});

// Admin only — requireAuth + requireAdmin both applied
app.use('/api/groups', requireAuth, requireAdmin, createGroupsRouter(db));
app.use('/api/invites', createInvitesRouter(db, config.smtp, requireAuth, requireAdmin));
app.use('/api/users/:id/permissions', requireAuth, requireAdmin, createUserPermissionsRouter(db));
app.use('/api/users', requireAuth, requireAdmin, createUsersRouter(db));

// Infra routes
app.use('/api/servers', requireAuth, requireModule('servers'), createServersRouter(db, requirePermission));
app.use('/api/sse', requireAuth, createSseRouter(db));
app.use('/api/databases', requireAuth, requireModule('databases'), createInfraDatabasesRouter(db));
app.use('/api/websites', requireAuth, requireModule('websites'), createWebsitesRouter(db, env.CRON_SECRET, requirePermission));
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
  logger.error({ err }, '[Vencore] First-boot seeding failed');
});

// Demo seed — only when DEMO_SEED=true
if (process.env['DEMO_SEED'] === 'true') {
  seedDemo(db).catch((err: unknown) => {
    logger.error({ err }, '[Vencore] Demo seeding failed');
  });
}

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
  } else {
    socket.destroy();
  }
});

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server running');
});
