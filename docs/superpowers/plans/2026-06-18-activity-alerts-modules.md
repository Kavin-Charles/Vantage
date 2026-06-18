# Activity & Alerts Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Alerts a proper toggleable module, extend the existing `logActivity` service with per-module settings checks, extract an `alert-service.ts`, and wire auto-emitters across CRM, Projects, and Infra.

**Architecture:** Extend the existing `apps/api/src/lib/log-activity.ts` service (don't replace it) to support new activity types and per-module settings checks. Extract alert insertion logic from `alert-eval.ts` into a new `alert-service.ts`. Add `ALERTS_MODULE` to the MODULE_REGISTRY. Wire all callers to pass `sourceModuleId` so the new `module_event_settings` table can gate per-module event logging.

**Tech Stack:** TypeScript, Kysely, Express, Next.js App Router, React, `@tanstack/react-query`, `@vencore/modules` package, Zod

---

## File Map

| File | Action | What it does |
|---|---|---|
| `packages/db/migrations/20260618_001_activity_alerts_modules.ts` | Create | DB schema: new enum values, nullable user_id, two new tables |
| `packages/modules/src/types.ts` | Modify | Add `emitsActivity?`, `emitsAlerts?` to `ModuleDefinition` |
| `packages/modules/src/alerts/index.ts` | Create | `ALERTS_MODULE` definition |
| `packages/modules/src/index.ts` | Modify | Register ALERTS_MODULE, export alerts |
| `packages/modules/src/contacts/index.ts` | Modify | Add `emitsActivity: true` |
| `packages/modules/src/pipelines/index.ts` | Modify | Add `emitsActivity: true` |
| `packages/modules/src/projects/index.ts` | Modify | Add `emitsActivity: true` |
| `packages/modules/src/servers/index.ts` | Modify | Add `emitsActivity: true, emitsAlerts: true` |
| `apps/api/src/lib/log-activity.ts` | Modify | Add new types, `sourceModuleId`, nullable `user_id`, settings check |
| `apps/api/src/lib/alert-service.ts` | Create | Extracted + extended alert insertion logic |
| `apps/api/src/routes/module-event-settings.ts` | Create | GET/PATCH /api/settings/module-events |
| `apps/api/src/routes/notification-preferences.ts` | Create | GET/PATCH /api/settings/notifications |
| `apps/api/src/routes/pipeline-activity.ts` (already `lib/pipeline-activity.ts`) | Modify | Call `logActivity` from `logStageChanged` |
| `apps/api/src/routes/contacts.ts` | Modify | Change type `'note'` → `'contact_created'`, add `sourceModuleId` |
| `apps/api/src/routes/project-tasks.ts` | Modify | Call `logActivity` on task status → done |
| `apps/worker/src/jobs/alert-eval.ts` | Modify | Use `createAlert()` + `logActivity()` from services |
| `apps/api/src/index.ts` | Modify | Add requireModule('alerts'), register new routes, register alert bridge |
| `apps/web/modules/alerts/pages/page.tsx` | Modify | Wrap with `<ModuleGuard moduleId="alerts">` |
| `apps/web/modules/shared/components/Sidebar.tsx` | Modify | `featureKey: 'alerts'` → `moduleId: 'alerts'` |
| `apps/web/modules/shared/components/AlertBar.tsx` | Modify | Add `isEnabled('alerts')` guard |
| `apps/web/modules/settings/pages/ActivitySettingsPage.tsx` | Create | Toggle UI for module event settings |
| `apps/web/modules/settings/pages/NotificationPreferencesPage.tsx` | Create | Alert notification channel/severity toggles |
| `apps/web/app/(dashboard)/settings/activity/page.tsx` | Create | Route delegate |
| `apps/web/app/(dashboard)/settings/notifications/page.tsx` | Create | Route delegate |
| `apps/web/app/(dashboard)/settings/layout.tsx` | Modify | Add Activity + Notifications tabs |

---

## Task 1: Database Migration

**Files:**
- Create: `packages/db/migrations/20260618_001_activity_alerts_modules.ts`

- [ ] **Step 1: Write the migration**

```typescript
import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Extend activity_type enum
  await sql`ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'contact_created'`.execute(db);
  await sql`ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'task_done'`.execute(db);

  // 2. Make activities.user_id nullable (system events have no user)
  await sql`ALTER TABLE activities ALTER COLUMN user_id DROP NOT NULL`.execute(db);

  // 3. Per-workspace, per-module event settings
  await sql`
    CREATE TABLE IF NOT EXISTS module_event_settings (
      workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      module_id     text        NOT NULL,
      activity_on   boolean     NOT NULL DEFAULT true,
      alerts_on     boolean     NOT NULL DEFAULT true,
      updated_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, module_id)
    )
  `.execute(db);

  // 4. Alert notification channel/severity preferences
  await sql`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      channel       text        NOT NULL,
      severity      text        NOT NULL,
      enabled       boolean     NOT NULL DEFAULT true,
      updated_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, channel, severity)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS notification_preferences`.execute(db);
  await sql`DROP TABLE IF EXISTS module_event_settings`.execute(db);
  await sql`ALTER TABLE activities ALTER COLUMN user_id SET NOT NULL`.execute(db);
  // Enum values cannot be removed in PostgreSQL without recreating the type
}
```

- [ ] **Step 2: Run the migration**

```bash
cd packages/db && pnpm run migrate
```

Expected: Migration applies without errors. Verify with `\d activities` in psql — `user_id` should show `uuid` (no `NOT NULL`).

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/20260618_001_activity_alerts_modules.ts
git commit -m "feat(db): add module_event_settings, notification_preferences, extend activity_type enum"
```

---

## Task 2: Extend ModuleDefinition Type + Create ALERTS_MODULE

**Files:**
- Modify: `packages/modules/src/types.ts`
- Create: `packages/modules/src/alerts/index.ts`
- Modify: `packages/modules/src/index.ts`
- Modify: `packages/modules/src/contacts/index.ts`
- Modify: `packages/modules/src/pipelines/index.ts`
- Modify: `packages/modules/src/projects/index.ts`
- Modify: `packages/modules/src/servers/index.ts`

- [ ] **Step 1: Add flags to ModuleDefinition in `packages/modules/src/types.ts`**

Find the `ModuleDefinition` interface and add two optional fields after `workers`:

```typescript
export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultEnabled: boolean;
  permissions: PermissionDef[];
  nav: NavItem[];
  apiPrefixes: string[];
  workers: string[];
  emitsActivity?: boolean;
  emitsAlerts?: boolean;
}
```

- [ ] **Step 2: Create `packages/modules/src/alerts/index.ts`**

```typescript
import type { ModuleDefinition } from '../types';

export const ALERTS_MODULE: ModuleDefinition = {
  id: 'alerts',
  name: 'Alerts',
  description: 'Infrastructure and workspace alerting with threshold monitoring.',
  icon: 'Bell',
  defaultEnabled: true,
  permissions: [
    { key: 'alerts:view',        label: 'View alerts',           defaultRoles: ['admin', 'member'] },
    { key: 'alerts:acknowledge', label: 'Acknowledge alerts',    defaultRoles: ['admin', 'member'] },
    { key: 'alerts:resolve',     label: 'Resolve alerts',        defaultRoles: ['admin'] },
    { key: 'alerts:configure',   label: 'Configure thresholds',  defaultRoles: ['admin'] },
  ],
  nav: [{ label: 'Alerts', path: '/alerts', icon: 'Bell' }],
  apiPrefixes: ['/alerts', '/alert-thresholds'],
  workers: ['alert-eval'],
  emitsAlerts: true,
};
```

- [ ] **Step 3: Register ALERTS_MODULE in `packages/modules/src/index.ts`**

Add import at top with the other module imports:
```typescript
import { ALERTS_MODULE } from './alerts';
```

Add to `MODULE_REGISTRY` array (after `ACTIVITY_MODULE`):
```typescript
export const MODULE_REGISTRY: ModuleDefinition[] = [
  DASHBOARD_MODULE,
  CONTACTS_MODULE,
  COMPANIES_MODULE,
  PIPELINES_MODULE,
  TASKS_MODULE,
  WEBSITES_MODULE,
  SERVERS_MODULE,
  DATABASES_MODULE,
  ANALYTICS_MODULE,
  ACTIVITY_MODULE,
  ALERTS_MODULE,
  PROJECTS_MODULE,
];
```

Add export at top of the export block:
```typescript
export * from './alerts';
```

- [ ] **Step 4: Mark emitting modules in their definitions**

In `packages/modules/src/contacts/index.ts`, add `emitsActivity: true` to the `CONTACTS_MODULE` object.

In `packages/modules/src/pipelines/index.ts`, add `emitsActivity: true` to the `PIPELINES_MODULE` object.

In `packages/modules/src/projects/index.ts`, add `emitsActivity: true` to the `PROJECTS_MODULE` object.

In `packages/modules/src/servers/index.ts`, add `emitsActivity: true, emitsAlerts: true` to the `SERVERS_MODULE` object.

- [ ] **Step 5: Build and verify**

```bash
cd packages/modules && pnpm run build
```

Expected: No TypeScript errors. `MODULE_IDS` array now includes `'alerts'`.

- [ ] **Step 6: Commit**

```bash
git add packages/modules/
git commit -m "feat(modules): add ALERTS_MODULE, emitsActivity/emitsAlerts flags to ModuleDefinition"
```

---

## Task 3: Extend log-activity.ts Service

**Files:**
- Modify: `apps/api/src/lib/log-activity.ts`

The existing file has `logActivity` with type union `'email' | 'call' | 'note' | 'meeting' | 'deal_change' | 'infra_alert'` and required `user_id: string`. We extend it.

- [ ] **Step 1: Replace `apps/api/src/lib/log-activity.ts` entirely**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

export type ActivityType =
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'deal_change'
  | 'infra_alert'
  | 'contact_created'
  | 'task_done';

interface ActivityPayload {
  workspace_id: string;
  user_id: string | null;
  type: ActivityType;
  source_module_id?: string;
  body?: string;
  contact_id?: string;
  record_id?: string;
  meta?: Record<string, unknown>;
}

async function isActivityEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('module_event_settings')
    .select('activity_on')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst();
  // No row = default enabled
  return row?.activity_on ?? true;
}

/**
 * Fire-and-forget activity logger.
 * Swallows errors so activity logging never crashes the parent request.
 * When source_module_id is provided, checks module_event_settings before inserting.
 */
export async function logActivity(
  db: Kysely<Database>,
  payload: ActivityPayload,
): Promise<void> {
  try {
    if (payload.source_module_id) {
      const enabled = await isActivityEnabled(db, payload.workspace_id, payload.source_module_id);
      if (!enabled) return;
    }

    await db
      .insertInto('activities')
      .values({
        workspace_id: payload.workspace_id,
        user_id: payload.user_id,
        type: payload.type as any,
        body: payload.body ?? null,
        contact_id: payload.contact_id ?? null,
        record_id: payload.record_id ?? null,
        meta: payload.meta ?? null,
      })
      .execute();
  } catch (err) {
    logger.error({ err }, 'logActivity: failed to insert activity');
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && pnpm run type-check
```

Expected: No errors related to `log-activity.ts`. Existing callers still compile because `user_id: string` satisfies `string | null` and `source_module_id` is optional.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/log-activity.ts
git commit -m "feat(api): extend logActivity with new types, nullable user_id, per-module settings check"
```

---

## Task 4: Create alert-service.ts

**Files:**
- Create: `apps/api/src/lib/alert-service.ts`

- [ ] **Step 1: Create `apps/api/src/lib/alert-service.ts`**

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertResourceType = 'server' | 'database' | 'website' | 'crm' | 'projects';

interface CreateAlertParams {
  workspaceId: string;
  severity: AlertSeverity;
  resourceType: AlertResourceType;
  resourceId?: string;
  message: string;
  messagePrefix?: string;
  sourceModuleId?: string;
}

async function isAlertsEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('module_event_settings')
    .select('alerts_on')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst();
  return row?.alerts_on ?? true;
}

async function hasOpenAlert(
  db: Kysely<Database>,
  workspaceId: string,
  resourceType: AlertResourceType,
  resourceId: string,
  messagePrefix: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom('alerts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('resource_type', '=', resourceType)
    .where('resource_id', '=', resourceId)
    .where('message', 'like', `${messagePrefix}%`)
    .where('resolved', '=', false)
    .executeTakeFirst();
  return existing !== undefined;
}

export async function createAlert(
  db: Kysely<Database>,
  params: CreateAlertParams,
): Promise<void> {
  try {
    if (params.sourceModuleId) {
      const enabled = await isAlertsEnabled(db, params.workspaceId, params.sourceModuleId);
      if (!enabled) return;
    }

    if (params.resourceId) {
      const prefix = params.messagePrefix ?? params.message;
      const already = await hasOpenAlert(
        db,
        params.workspaceId,
        params.resourceType,
        params.resourceId,
        prefix,
      );
      if (already) return;
    }

    await db
      .insertInto('alerts')
      .values({
        workspace_id: params.workspaceId,
        resource_type: params.resourceType,
        resource_id: params.resourceId ?? null,
        severity: params.severity,
        message: params.message,
        acknowledged: false,
        resolved: false,
      })
      .execute();

    logger.info(
      { workspaceId: params.workspaceId, resourceType: params.resourceType, message: params.message },
      'alert created',
    );
  } catch (err) {
    logger.error({ err }, 'createAlert: failed to insert alert');
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/api && pnpm run type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/alert-service.ts
git commit -m "feat(api): add createAlert service with dedup and per-module settings check"
```

---

## Task 5: Module Event Settings API Route

**Files:**
- Create: `apps/api/src/routes/module-event-settings.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/routes/module-event-settings.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { MODULE_REGISTRY } from '@vencore/modules';

const patchSchema = z.object({
  activity_on: z.boolean().optional(),
  alerts_on: z.boolean().optional(),
});

export function createModuleEventSettingsRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const rows = await db
        .selectFrom('module_event_settings')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .execute();

      const settingsMap = new Map(rows.map(r => [r.module_id, r]));

      const emitters = MODULE_REGISTRY.filter(m => m.emitsActivity || m.emitsAlerts).map(m => ({
        module_id: m.id,
        name: m.name,
        emits_activity: m.emitsActivity ?? false,
        emits_alerts: m.emitsAlerts ?? false,
        activity_on: settingsMap.get(m.id)?.activity_on ?? true,
        alerts_on: settingsMap.get(m.id)?.alerts_on ?? true,
      }));

      res.json({ data: emitters, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:moduleId', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const { moduleId } = req.params;
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY' } });
        return;
      }

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (parsed.data.activity_on !== undefined) updates['activity_on'] = parsed.data.activity_on;
      if (parsed.data.alerts_on !== undefined) updates['alerts_on'] = parsed.data.alerts_on;

      await db
        .insertInto('module_event_settings')
        .values({
          workspace_id: workspace.id,
          module_id: moduleId!,
          activity_on: parsed.data.activity_on ?? true,
          alerts_on: parsed.data.alerts_on ?? true,
        })
        .onConflict(oc =>
          oc.columns(['workspace_id', 'module_id']).doUpdateSet(updates as any),
        )
        .execute();

      res.json({ data: { module_id: moduleId, ...parsed.data }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Register route in `apps/api/src/index.ts`**

Add import near the other route imports:
```typescript
import { createModuleEventSettingsRouter } from './routes/module-event-settings';
```

Add route registration (admin-protected, near the other settings routes):
```typescript
app.use('/api/settings/module-events', requireAuth, createModuleEventSettingsRouter(db));
```

- [ ] **Step 3: Verify and commit**

```bash
cd apps/api && pnpm run type-check
git add apps/api/src/routes/module-event-settings.ts apps/api/src/index.ts
git commit -m "feat(api): add module-event-settings route for per-module activity/alert toggles"
```

---

## Task 6: Notification Preferences API Route

**Files:**
- Create: `apps/api/src/routes/notification-preferences.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create `apps/api/src/routes/notification-preferences.ts`**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';

const CHANNELS = ['email', 'push'] as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;

const patchSchema = z.array(
  z.object({
    channel: z.enum(CHANNELS),
    severity: z.enum(SEVERITIES),
    enabled: z.boolean(),
  }),
);

export function createNotificationPreferencesRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      const rows = await db
        .selectFrom('notification_preferences')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .execute();

      const map = new Map(rows.map(r => [`${r.channel}:${r.severity}`, r.enabled]));

      const data = CHANNELS.flatMap(channel =>
        SEVERITIES.map(severity => ({
          channel,
          severity,
          enabled: map.get(`${channel}:${severity}`) ?? true,
        })),
      );

      res.json({ data, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      if (user.role !== 'admin') {
        res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
        return;
      }

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }

      for (const item of parsed.data) {
        await db
          .insertInto('notification_preferences')
          .values({ workspace_id: workspace.id, ...item })
          .onConflict(oc =>
            oc.columns(['workspace_id', 'channel', 'severity']).doUpdateSet({
              enabled: item.enabled,
              updated_at: new Date(),
            }),
          )
          .execute();
      }

      res.json({ data: parsed.data, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 2: Register route in `apps/api/src/index.ts`**

Add import:
```typescript
import { createNotificationPreferencesRouter } from './routes/notification-preferences';
```

Add route registration:
```typescript
app.use('/api/settings/notifications', requireAuth, createNotificationPreferencesRouter(db));
```

- [ ] **Step 3: Verify and commit**

```bash
cd apps/api && pnpm run type-check
git add apps/api/src/routes/notification-preferences.ts apps/api/src/index.ts
git commit -m "feat(api): add notification-preferences route for alert channel/severity toggles"
```

---

## Task 7: Fix Alerts Route Module Guard + Register Bridge Method

**Files:**
- Modify: `apps/api/src/index.ts`

The `/api/alerts` route currently has no `requireModule` check. The `/api/alert-thresholds` route also needs it.

- [ ] **Step 1: Add `requireModule('alerts')` to alerts routes in `apps/api/src/index.ts`**

Find the lines:
```typescript
app.use('/api/alerts', requireAuth, createAlertsRouter(db));
```
and:
```typescript
app.use('/api/alert-thresholds', ...
```

Change both to:
```typescript
app.use('/api/alerts', requireAuth, requireModule('alerts'), createAlertsRouter(db));
app.use('/api/alert-thresholds', requireAuth, requireModule('alerts'), createAlertThresholdsRouter(db));
```

- [ ] **Step 2: Register `alert.create` bridge method**

In `apps/api/src/index.ts`, after the existing bridge registrations (after `registerActivityBridgeMethods()`), add:

```typescript
import { createAlert } from './lib/alert-service';

bridgeRegistry.register('alert.create', 'alerts:view', async (ctx, p, db) => {
  await createAlert(db as any, {
    workspaceId: ctx.workspaceId,
    severity: (p.severity as 'critical' | 'warning' | 'info') ?? 'info',
    resourceType: (p.resource_type as any) ?? 'crm',
    resourceId: p.resource_id as string | undefined,
    message: p.message as string,
    messagePrefix: p.message_prefix as string | undefined,
    sourceModuleId: ctx.pluginSlug,
  });
  return { ok: true };
});
```

- [ ] **Step 3: Verify and commit**

```bash
cd apps/api && pnpm run type-check
git add apps/api/src/index.ts
git commit -m "feat(api): gate alerts routes on alerts module, register alert.create bridge method"
```

---

## Task 8: Wire Auto-Emitter — Contacts

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`

Contacts already calls `logActivity` at line ~295 with `type: 'note'`. Change it to use `contact_created`.

- [ ] **Step 1: Find and update the logActivity call after contact creation in `contacts.ts`**

Find the block (around line 295):
```typescript
void logActivity(db, {
  workspace_id: workspace.id,
  user_id: user.id,
  type: 'note',
```

Change it to:
```typescript
void logActivity(db, {
  workspace_id: workspace.id,
  user_id: user.id,
  type: 'contact_created',
  source_module_id: 'contacts',
  body: `Contact ${contact.name} created`,
  contact_id: contact.id,
});
```

Note: There is also a second `logActivity` call after contact update (around line 372) with `type: 'note'`. Leave that one as-is (it is intentionally a note type for updates — do not change it). Only change the POST handler's call.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/api && pnpm run type-check
git add apps/api/src/routes/contacts.ts
git commit -m "feat(api): log contact_created activity when contact is created"
```

---

## Task 9: Wire Auto-Emitter — Pipeline Stage Changes

**Files:**
- Modify: `apps/api/src/lib/pipeline-activity.ts`

`logStageChanged` writes to `pipeline_activity` table. We add a `logActivity` call inside it so stage changes also appear in the unified activity feed.

- [ ] **Step 1: Update `apps/api/src/lib/pipeline-activity.ts`**

Add import at the top:
```typescript
import { logActivity } from './log-activity';
```

Update the `LogStageChangedParams` interface to include `userId`:
```typescript
interface LogStageChangedParams {
  db: Kysely<Database>;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
  fromStageId: string;
  toStageId: string;
}
```

Update `logStageChanged` to also call `logActivity`:
```typescript
export async function logStageChanged(p: LogStageChangedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'stage_changed',
    payload: { from_stage_id: p.fromStageId, to_stage_id: p.toStageId } as any,
  }).execute();

  void logActivity(p.db, {
    workspace_id: p.workspaceId,
    user_id: p.userId,
    type: 'deal_change',
    source_module_id: 'pipelines',
    record_id: p.itemId,
    meta: { from_stage_id: p.fromStageId, to_stage_id: p.toStageId },
  });
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd apps/api && pnpm run type-check
git add apps/api/src/lib/pipeline-activity.ts
git commit -m "feat(api): log deal_change activity on pipeline stage change"
```

---

## Task 10: Wire Auto-Emitter — Project Task Done

**Files:**
- Modify: `apps/api/src/routes/project-tasks.ts`

The PATCH `/:taskId` handler (around line 199) updates `status_id`. When the new status has `is_done = true` in `project_task_statuses`, log `task_done`.

- [ ] **Step 1: Add import to `apps/api/src/routes/project-tasks.ts`**

Add at the top with other imports:
```typescript
import { logActivity } from '../lib/log-activity';
```

- [ ] **Step 2: Add task-done detection in the PATCH `/:taskId` handler**

In the PATCH `/:taskId` handler (around line 199), after the `const task = ...` update succeeds and before `return res.json(...)`, add:

```typescript
// Log task_done activity when status changes to a done status
if (parsed.data.status_id !== undefined && parsed.data.status_id !== task.status_id) {
  const newStatus = await db
    .selectFrom('project_task_statuses')
    .select('is_done')
    .where('id', '=', parsed.data.status_id)
    .executeTakeFirst();

  if (newStatus?.is_done) {
    const { workspace, user } = req as unknown as AuthenticatedRequest;
    void logActivity(db, {
      workspace_id: workspace.id,
      user_id: user.id,
      type: 'task_done',
      source_module_id: 'projects',
      record_id: taskId,
      body: `Task "${task.title}" marked as done`,
    });
  }
}
```

Note: `task` in the handler refers to the result of the DB update. Check the handler — if the update returns the updated row via `returningAll()`, use that. If it selects before updating, use the pre-update `task` variable. The variable name must match what's already in the handler.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/api && pnpm run type-check
git add apps/api/src/routes/project-tasks.ts
git commit -m "feat(api): log task_done activity when project task status moves to done"
```

---

## Task 11: Refactor alert-eval.ts to Use Services

**Files:**
- Modify: `apps/worker/src/jobs/alert-eval.ts`

`alert-eval.ts` has inline `hasOpenAlert` and `insertAlert` functions. Replace with `createAlert` from the service and add `logActivity` on new alert.

- [ ] **Step 1: Add imports to `apps/worker/src/jobs/alert-eval.ts`**

Add at the top:
```typescript
import { createAlert } from '../../../apps/api/src/lib/alert-service';
import { logActivity } from '../../../apps/api/src/lib/log-activity';
```

Wait — the worker is a separate package. Check the actual import path. The worker likely imports from relative paths or shared packages. Check how the worker currently imports `db`:

The worker uses `db` from `@vencore/db` or from its own setup. Since `alert-service.ts` and `log-activity.ts` live in `apps/api/src/lib/`, the worker can't import them directly via relative path unless they're in the same `apps/` peer.

**Correct approach:** Move the shared service functions to a package both api and worker can import, OR copy the relevant functions into `apps/worker/src/lib/`. Since the codebase doesn't have a shared `@vencore/services` package, add `alert-service.ts` and re-export `logActivity` from the worker's own lib directory.

- [ ] **Step 2: Create `apps/worker/src/lib/alert-service.ts`**

This is identical to `apps/api/src/lib/alert-service.ts`. Copy the full file:

```typescript
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from './logger';

type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertResourceType = 'server' | 'database' | 'website' | 'crm' | 'projects';

interface CreateAlertParams {
  workspaceId: string;
  severity: AlertSeverity;
  resourceType: AlertResourceType;
  resourceId?: string;
  message: string;
  messagePrefix?: string;
  sourceModuleId?: string;
}

async function isAlertsEnabled(
  db: Kysely<Database>,
  workspaceId: string,
  moduleId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('module_event_settings')
    .select('alerts_on')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', '=', moduleId)
    .executeTakeFirst();
  return row?.alerts_on ?? true;
}

async function hasOpenAlert(
  db: Kysely<Database>,
  workspaceId: string,
  resourceType: AlertResourceType,
  resourceId: string,
  messagePrefix: string,
): Promise<boolean> {
  const existing = await db
    .selectFrom('alerts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('resource_type', '=', resourceType)
    .where('resource_id', '=', resourceId)
    .where('message', 'like', `${messagePrefix}%`)
    .where('resolved', '=', false)
    .executeTakeFirst();
  return existing !== undefined;
}

export async function createAlert(
  db: Kysely<Database>,
  params: CreateAlertParams,
): Promise<void> {
  try {
    if (params.sourceModuleId) {
      const enabled = await isAlertsEnabled(db, params.workspaceId, params.sourceModuleId);
      if (!enabled) return;
    }

    if (params.resourceId) {
      const prefix = params.messagePrefix ?? params.message;
      const already = await hasOpenAlert(db, params.workspaceId, params.resourceType, params.resourceId, prefix);
      if (already) return;
    }

    await db
      .insertInto('alerts')
      .values({
        workspace_id: params.workspaceId,
        resource_type: params.resourceType,
        resource_id: params.resourceId ?? null,
        severity: params.severity,
        message: params.message,
        acknowledged: false,
        resolved: false,
      })
      .execute();

    logger.info(
      { workspaceId: params.workspaceId, resourceType: params.resourceType, message: params.message },
      'alert created',
    );
  } catch (err) {
    logger.error({ err }, 'createAlert: failed to insert alert');
  }
}
```

Also create `apps/worker/src/lib/log-activity.ts` with the same content as `apps/api/src/lib/log-activity.ts`.

- [ ] **Step 3: Refactor `apps/worker/src/jobs/alert-eval.ts`**

Remove the inline `hasOpenAlert` and `insertAlert` private functions.

Add imports at the top:
```typescript
import { createAlert } from '../lib/alert-service';
import { logActivity } from '../lib/log-activity';
```

Replace every call to `insertAlert(workspaceId, severity, resourceType, resourceId, messagePrefix, message)` with:
```typescript
await createAlert(db, {
  workspaceId,
  severity,
  resourceType,
  resourceId,
  message,
  messagePrefix,
  sourceModuleId: 'servers',
});
```

After each `createAlert` call that succeeds (or rather, after the check — since createAlert is fire-and-check internally), add an activity log. The pattern to add immediately after each `createAlert` call:
```typescript
void logActivity(db, {
  workspace_id: workspaceId,
  user_id: null,
  type: 'infra_alert',
  source_module_id: 'servers',
  body: message,
  meta: { resourceType, resourceId, severity },
});
```

- [ ] **Step 4: Verify and commit**

```bash
cd apps/worker && pnpm run type-check
git add apps/worker/src/lib/alert-service.ts apps/worker/src/lib/log-activity.ts apps/worker/src/jobs/alert-eval.ts
git commit -m "feat(worker): refactor alert-eval to use createAlert service, log infra_alert activities"
```

---

## Task 12: UI — Alerts Module Guard + Sidebar + AlertBar

**Files:**
- Modify: `apps/web/modules/alerts/pages/page.tsx`
- Modify: `apps/web/modules/shared/components/Sidebar.tsx`
- Modify: `apps/web/modules/shared/components/AlertBar.tsx`

- [ ] **Step 1: Add ModuleGuard to alerts page**

In `apps/web/modules/alerts/pages/page.tsx`, add import:
```typescript
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
```

Wrap the returned JSX — replace the outer `<>...</>` fragment with:
```typescript
return (
  <ModuleGuard moduleId="alerts">
    <Topbar />
    <div style={{ padding: 24 }}>
      {/* ... rest of existing content unchanged ... */}
    </div>
    <ContextMenu menu={menu} onClose={closeMenu} />
  </ModuleGuard>
);
```

- [ ] **Step 2: Fix Sidebar alerts entry**

In `apps/web/modules/shared/components/Sidebar.tsx`, find the General group items array. Change the alerts entry from:
```typescript
{ href: '/alerts', label: 'Alerts', icon: 'alerts', featureKey: 'alerts' as const, dot: true },
```
to:
```typescript
{ href: '/alerts', label: 'Alerts', icon: 'alerts', moduleId: 'alerts', dot: true },
```

- [ ] **Step 3: Add isEnabled guard to AlertBar**

In `apps/web/modules/shared/components/AlertBar.tsx`, add import:
```typescript
import { useModules } from '@/modules/shared/contexts/modules';
```

At the top of the `AlertBar` function body (before any other logic), add:
```typescript
const { isEnabled } = useModules();
if (!isEnabled('alerts')) return null;
```

- [ ] **Step 4: Verify and commit**

```bash
cd apps/web && pnpm run type-check
git add apps/web/modules/alerts/pages/page.tsx apps/web/modules/shared/components/Sidebar.tsx apps/web/modules/shared/components/AlertBar.tsx
git commit -m "feat(web): gate alerts page and AlertBar on alerts module, fix sidebar moduleId"
```

---

## Task 13: Settings Page — Module Event Settings

**Files:**
- Create: `apps/web/modules/settings/pages/ActivitySettingsPage.tsx`
- Create: `apps/web/app/(dashboard)/settings/activity/page.tsx`

- [ ] **Step 1: Create `apps/web/modules/settings/pages/ActivitySettingsPage.tsx`**

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface ModuleEventSetting {
  module_id: string;
  name: string;
  emits_activity: boolean;
  emits_alerts: boolean;
  activity_on: boolean;
  alerts_on: boolean;
}

export default function ActivitySettingsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['module-event-settings'],
    queryFn: async () =>
      apiFetch<{ data: ModuleEventSetting[]; error: null }>('/api/settings/module-events', {
        token: await getToken(),
      }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({
      moduleId,
      field,
      value,
    }: {
      moduleId: string;
      field: 'activity_on' | 'alerts_on';
      value: boolean;
    }) =>
      apiFetch(`/api/settings/module-events/${moduleId}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ [field]: value }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-event-settings'] }),
  });

  const settings: ModuleEventSetting[] = data?.data ?? [];

  return (
    <>
      <Topbar />
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          Activity & Alert Settings
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>
          Choose which modules log to the activity feed and create alerts.
        </p>

        {isLoading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Module</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Activity</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>Alerts</span>
            </div>
            {settings.map((s, i) => (
              <div
                key={s.module_id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                  padding: '14px 18px',
                  borderBottom: i < settings.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{s.name}</span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {s.emits_activity ? (
                    <Toggle
                      on={s.activity_on}
                      disabled={toggleMut.isPending}
                      onChange={v => toggleMut.mutate({ moduleId: s.module_id, field: 'activity_on', value: v })}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {s.emits_alerts ? (
                    <Toggle
                      on={s.alerts_on}
                      disabled={toggleMut.isPending}
                      onChange={v => toggleMut.mutate({ moduleId: s.module_id, field: 'alerts_on', value: v })}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange(!on)}
      disabled={disabled}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--green)' : 'var(--border)',
        position: 'relative', transition: 'background .15s', padding: 0, outline: 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  );
}
```

- [ ] **Step 2: Create route delegate `apps/web/app/(dashboard)/settings/activity/page.tsx`**

```typescript
export { default } from '@/modules/settings/pages/ActivitySettingsPage';
```

- [ ] **Step 3: Verify and commit**

```bash
cd apps/web && pnpm run type-check
git add "apps/web/modules/settings/pages/ActivitySettingsPage.tsx" "apps/web/app/(dashboard)/settings/activity/page.tsx"
git commit -m "feat(web): add activity/alert settings page with per-module toggles"
```

---

## Task 14: Settings Page — Notification Preferences

**Files:**
- Create: `apps/web/modules/settings/pages/NotificationPreferencesPage.tsx`
- Create: `apps/web/app/(dashboard)/settings/notifications/page.tsx`

- [ ] **Step 1: Create `apps/web/modules/settings/pages/NotificationPreferencesPage.tsx`**

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { Button } from '@/modules/shared/components/ui/Button';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

const CHANNELS = ['email', 'push'] as const;
const SEVERITIES = ['critical', 'warning', 'info'] as const;

type Channel = typeof CHANNELS[number];
type Severity = typeof SEVERITIES[number];

interface Pref { channel: Channel; severity: Severity; enabled: boolean }

const SEV_COLOR: Record<Severity, string> = {
  critical: 'var(--red)',
  warning: 'var(--amber)',
  info: 'var(--blue)',
};

export default function NotificationPreferencesPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () =>
      apiFetch<{ data: Pref[]; error: null }>('/api/settings/notifications', { token: await getToken() }),
  });

  const saveMut = useMutation({
    mutationFn: async (prefs: Pref[]) =>
      apiFetch('/api/settings/notifications', {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify(prefs),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });

  const prefs: Pref[] = data?.data ?? [];

  function isEnabled(channel: Channel, severity: Severity) {
    return prefs.find(p => p.channel === channel && p.severity === severity)?.enabled ?? true;
  }

  function toggle(channel: Channel, severity: Severity) {
    const current = isEnabled(channel, severity);
    const updated = CHANNELS.flatMap(ch =>
      SEVERITIES.map(sev => ({
        channel: ch,
        severity: sev,
        enabled: ch === channel && sev === severity ? !current : isEnabled(ch, sev),
      })),
    );
    saveMut.mutate(updated);
  }

  return (
    <>
      <Topbar />
      <div style={{ padding: 24, maxWidth: 540 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          Notification Preferences
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>
          Choose which alert severities trigger notifications per channel.
        </p>

        {isLoading ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Severity</span>
              {CHANNELS.map(ch => (
                <span key={ch} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>
                  {ch}
                </span>
              ))}
            </div>
            {SEVERITIES.map((sev, i) => (
              <div
                key={sev}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                  padding: '14px 18px',
                  borderBottom: i < SEVERITIES.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: SEV_COLOR[sev], textTransform: 'capitalize' }}>
                  {sev}
                </span>
                {CHANNELS.map(ch => (
                  <div key={ch} style={{ display: 'flex', justifyContent: 'center' }}>
                    <Toggle
                      on={isEnabled(ch, sev)}
                      disabled={saveMut.isPending}
                      onChange={() => toggle(ch, sev)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--green)' : 'var(--border)',
        position: 'relative', transition: 'background .15s', padding: 0, outline: 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }} />
    </button>
  );
}
```

- [ ] **Step 2: Create route delegate `apps/web/app/(dashboard)/settings/notifications/page.tsx`**

```typescript
export { default } from '@/modules/settings/pages/NotificationPreferencesPage';
```

- [ ] **Step 3: Verify and commit**

```bash
cd apps/web && pnpm run type-check
git add "apps/web/modules/settings/pages/NotificationPreferencesPage.tsx" "apps/web/app/(dashboard)/settings/notifications/page.tsx"
git commit -m "feat(web): add notification preferences settings page"
```

---

## Task 15: Update Settings Layout Navigation

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/layout.tsx`

The settings layout has `ALL_TABS` array. Add Activity and Notifications tabs.

- [ ] **Step 1: Add tabs to `ALL_TABS` in settings layout**

Find `const ALL_TABS: Tab[] = [` and add two entries (admin-only, after Modules):

```typescript
const ALL_TABS: Tab[] = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/team', label: 'Team', adminOnly: true },
  { href: '/settings/tasks', label: 'Tasks', adminOnly: true },
  { href: '/settings/ssh', label: 'SSH Keys', adminOnly: true },
  { href: '/settings/api-keys', label: 'API Keys', adminOnly: true },
  { href: '/settings/pipelines', label: 'Pipelines', adminOnly: true },
  { href: '/settings/modules', label: 'Modules', adminOnly: true },
  { href: '/settings/plugins', label: 'Plugins', adminOnly: true },
  { href: '/settings/activity', label: 'Activity', adminOnly: true },
  { href: '/settings/notifications', label: 'Notifications', adminOnly: true },
];
```

Also update the `useEffect` redirect guard to include the new paths (add to the `pathname.startsWith(...)` list so non-admins get redirected away):

```typescript
pathname.startsWith('/settings/activity') ||
pathname.startsWith('/settings/notifications')
```

- [ ] **Step 2: Verify and commit**

```bash
cd apps/web && pnpm run type-check
git add "apps/web/app/(dashboard)/settings/layout.tsx"
git commit -m "feat(web): add Activity and Notifications tabs to settings layout"
```

---

## Self-Review Checklist (run before submitting)

- [ ] Migration includes both new tables and enum values
- [ ] `logActivity` type union matches DB enum (verify after migration runs)
- [ ] `createAlert` in worker lib is identical to API lib (no drift)
- [ ] `requireModule('alerts')` added to both `/api/alerts` and `/api/alert-thresholds`
- [ ] AlertBar `isEnabled` check uses the correct context hook (`useModules`)
- [ ] Sidebar entry has `moduleId: 'alerts'` (not `featureKey`)
- [ ] Settings layout redirect guard includes `/settings/activity` and `/settings/notifications`
- [ ] All new pages have route delegate files in `app/(dashboard)/`
