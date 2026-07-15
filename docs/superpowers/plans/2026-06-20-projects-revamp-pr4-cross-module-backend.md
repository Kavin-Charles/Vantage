# Projects Revamp PR4 Cross-Module — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link Projects to CRM deals/contacts/companies (manually and via deal-close auto-spawn / project-complete deal-stage hooks), add a per-workspace opt-in settings mechanism for these cross-module hooks, and add a no-login-required client approval flow delivered by email with a signed, expiring link.

**Architecture:** A new `cross_module_settings` table stores per-workspace boolean toggles keyed by string (`pm.deal_link_enabled`, `pm.deal_close_auto_spawn`, `pm.project_complete_deal_stage`, `crm.project_health_on_record`), read/written through a small `cross-module-settings.ts` lib and exposed via an admin-only route. `projects` gains nullable `deal_id`/`contact_id`/`company_id` columns, settable through the existing create/update routes once `pm.deal_link_enabled` is on. A new `deal-close-hooks.ts` lib holds two hooks — `maybeSpawnProjectOnDealWon` (wired into both stage-changing handlers in `pipeline-items.ts`) and `maybeUpdateDealStageOnProjectComplete` (wired into the project-archive branch of `projects.ts`'s PATCH `/:id`, which Plan 1A already added) — both gated by their respective settings and reusing the existing `logStageChanged`/`logActivity` plumbing rather than inventing new logging paths. The client approval email flow signs a short JWT per approval per action (`{ aid, act }`, 7-day expiry) via a new `approval-token.ts` lib, emails two links (approve/reject) via a new `send-approval-email.ts` lib, and a new pair of public routes on the existing `portal.ts` (`GET`/`POST /approve/:token`) verify the token and apply the response — sharing a new `respondToApproval` helper with the existing session-based respond route so both flows consistently emit `pmEvents` and log `pm_approval_responded` activity.

**Tech Stack:** Express, Kysely, Zod, `jsonwebtoken`, `nodemailer` (dynamic import, mirroring `send-alert-email.ts`/`invites.ts`), vitest + supertest.

> **Build order note:** This plan assumes Plan 1A, 2A, and 3A (PR1–PR3 backend) are already merged — it builds on Plan 1A's `notify`/`logActivity`/`createAlert` wiring in `projects.ts`'s PATCH `/:id` handler and appends to the `ActivityType` union Plan 3A left ending in `'pm_time_logged'`.

---

## File Structure

| File | Change |
|---|---|
| `packages/db/migrations/20260620_002_crm_project_links.ts` | New migration — `projects.deal_id`/`contact_id`/`company_id` + `cross_module_settings` table |
| `packages/db/migrations/20260620_003_approval_recipient_email.ts` | New migration — `approval_requests.recipient_email` |
| `packages/db/src/schema.ts` | Add columns to `ProjectTable`/`ApprovalRequestTable`, new `CrossModuleSettingTable`, new `Database` key |
| `apps/api/src/routes/projects.ts` | Add `deal_id`/`contact_id`/`company_id` to create/update schemas + `verifyLinkTargets`; export `seedDefaultStatuses` |
| `apps/api/src/routes/projects.test.ts` | New file — link-field tests |
| `apps/api/src/lib/log-activity.ts` | Add `pm_approval_responded` to `ActivityType` |
| `apps/api/src/__tests__/log-activity.test.ts` | Append one test |
| `apps/api/src/lib/cross-module-settings.ts` | New file — `getCrossModuleSetting`/`setCrossModuleSetting`/`listCrossModuleSettings` |
| `apps/api/src/lib/cross-module-settings.test.ts` | New file |
| `apps/api/src/routes/cross-module-settings.ts` | New file — GET/PATCH router |
| `apps/api/src/routes/cross-module-settings.test.ts` | New file |
| `apps/api/src/lib/deal-close-hooks.ts` | New file — `maybeSpawnProjectOnDealWon`, `maybeUpdateDealStageOnProjectComplete` |
| `apps/api/src/lib/deal-close-hooks.test.ts` | New file |
| `apps/api/src/routes/pipeline-items.ts` | Wire `maybeSpawnProjectOnDealWon` into PATCH `/:id` and PATCH `/:id/move` |
| `apps/api/src/routes/pipeline-items.test.ts` | Append tests for the won-stage hook |
| `apps/api/src/lib/approval-token.ts` | New file — `signApprovalToken`/`verifyApprovalToken` |
| `apps/api/src/lib/approval-token.test.ts` | New file |
| `apps/api/src/lib/send-approval-email.ts` | New file — `sendApprovalEmail` |
| `apps/api/src/routes/portal.ts` | Add `recipient_email` to `POST /approvals` + email send; add `respondToApproval` helper; add public `GET`/`POST /approve/:token` |
| `apps/api/src/routes/portal.test.ts` | New file |
| `apps/api/src/index.ts` | Mount `cross-module-settings.ts`; widen `createPortalInternalRouter`/`createPortalRouter` DI |

---

### Task 1: `crm_project_links` migration — `projects` link columns + `cross_module_settings` table

**Files:**
- Create: `packages/db/migrations/20260620_002_crm_project_links.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/20260620_002_crm_project_links.ts`:

```ts
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('projects')
    .addColumn('deal_id', 'uuid', c => c.references('pipeline_items.id').onDelete('set null'))
    .execute()
  await db.schema
    .alterTable('projects')
    .addColumn('contact_id', 'uuid', c => c.references('contacts.id').onDelete('set null'))
    .execute()
  await db.schema
    .alterTable('projects')
    .addColumn('company_id', 'uuid', c => c.references('companies.id').onDelete('set null'))
    .execute()

  await db.schema.createIndex('idx_projects_deal_id').on('projects').column('deal_id').execute()
  await db.schema.createIndex('idx_projects_contact_id').on('projects').column('contact_id').execute()
  await db.schema.createIndex('idx_projects_company_id').on('projects').column('company_id').execute()

  await db.schema
    .createTable('cross_module_settings')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c => c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('setting_key', 'varchar(100)', c => c.notNull())
    .addColumn('enabled', 'boolean', c => c.notNull().defaultTo(false))
    .addColumn('config', 'jsonb')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE UNIQUE INDEX cross_module_settings_workspace_key_idx
    ON cross_module_settings (workspace_id, setting_key)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('cross_module_settings_workspace_key_idx').execute()
  await db.schema.dropTable('cross_module_settings').ifExists().execute()
  await db.schema.dropIndex('idx_projects_company_id').execute()
  await db.schema.dropIndex('idx_projects_contact_id').execute()
  await db.schema.dropIndex('idx_projects_deal_id').execute()
  await db.schema.alterTable('projects').dropColumn('company_id').execute()
  await db.schema.alterTable('projects').dropColumn('contact_id').execute()
  await db.schema.alterTable('projects').dropColumn('deal_id').execute()
}
```

- [ ] **Step 2: Run the migration locally**

Run: `cd packages/db && pnpm db:migrate`
Expected: `crm_project_links` listed as applied, no errors.

- [ ] **Step 3: Update `schema.ts` by hand**

This repo has no codegen step — `schema.ts` is hand-maintained alongside migrations. In `packages/db/src/schema.ts`, modify `ProjectTable` (currently ends `end_date: Date | null` then `created_by`):

```ts
export interface ProjectTable {
  id: Generated<string>
  workspace_id: string
  name: string
  description: string | null
  color: string | null
  status: Generated<'ACTIVE' | 'ARCHIVED' | 'DELETED'>
  health: Generated<'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'>
  start_date: Date | null
  end_date: Date | null
  deal_id: string | null
  contact_id: string | null
  company_id: string | null
  created_by: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}
```

Then, immediately after `ApprovalRequestTable` (so the new interface lives next to the other PM cross-module tables), add:

```ts
export interface CrossModuleSettingTable {
  id: Generated<string>
  workspace_id: string
  setting_key: string
  enabled: Generated<boolean>
  config: Record<string, unknown> | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}
```

Finally, in the `Database` interface, add the new table key right after `projects: ProjectTable`:

```ts
  projects: ProjectTable
  cross_module_settings: CrossModuleSettingTable
  project_task_statuses: ProjectTaskStatusTable
```

- [ ] **Step 4: Verify the API package still type-checks**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors (the new columns are all nullable, so existing inserts/selects remain valid).

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/20260620_002_crm_project_links.ts packages/db/src/schema.ts
git commit -m "feat(db): link projects to deals/contacts/companies, add cross_module_settings"
```

---

### Task 2: `approval_recipient_email` migration

**Files:**
- Create: `packages/db/migrations/20260620_003_approval_recipient_email.ts`
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/20260620_003_approval_recipient_email.ts`:

```ts
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('approval_requests')
    .addColumn('recipient_email', 'varchar(255)')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('approval_requests').dropColumn('recipient_email').execute()
}
```

- [ ] **Step 2: Run the migration locally**

Run: `cd packages/db && pnpm db:migrate`
Expected: `approval_recipient_email` listed as applied.

- [ ] **Step 3: Update `schema.ts`**

In `packages/db/src/schema.ts`, modify `ApprovalRequestTable`:

```ts
export interface ApprovalRequestTable {
  id: Generated<string>
  project_id: string
  portal_id: string
  task_id: string | null
  milestone_id: string | null
  attachment_id: string | null
  recipient_email: string | null
  status: Generated<string>
  note: string | null
  responded_at: Date | null
  created_at: Generated<Date>
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/20260620_003_approval_recipient_email.ts packages/db/src/schema.ts
git commit -m "feat(db): add recipient_email to approval_requests"
```

---

### Task 3: Manual deal/contact/company link fields on `projects.ts`

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/src/routes/projects.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/projects.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

const WORKSPACE_ID = 'ws-1'
const USER_ID = 'user-1'
const PROJECT_ID = 'project-1'
const DEAL_ID = 'deal-1'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    ;(req as any).user = { id: USER_ID, role: 'admin' }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
}

describe('POST /api/projects with deal_id', () => {
  it('rejects linking to a deal that does not exist in this workspace', async () => {
    const settingsChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ enabled: true }),
    }
    const dealChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }

    let selectCall = 0
    const db = {
      selectFrom: vi.fn((table: string) => {
        selectCall++
        if (table === 'cross_module_settings') return settingsChain
        return dealChain
      }),
    } as unknown as Kysely<Database>

    const { createProjectsRouter } = await import('./projects')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects', createProjectsRouter(db))

    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'New Project', deal_id: DEAL_ID })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_LINK')
    expect(selectCall).toBeGreaterThan(0)
  })

  it('creates the project with deal_id when the deal exists and linking is enabled', async () => {
    const settingsChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ enabled: true }),
    }
    const dealChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: DEAL_ID }),
    }
    const fakeProject = {
      id: PROJECT_ID, workspace_id: WORKSPACE_ID, name: 'New Project',
      description: null, color: null, status: 'ACTIVE', health: 'ON_TRACK',
      start_date: null, end_date: null, deal_id: DEAL_ID, contact_id: null, company_id: null,
      created_by: USER_ID, created_at: new Date(), updated_at: new Date(),
    }
    const insertChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue(fakeProject),
    }
    const statusesChain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    }

    const db = {
      selectFrom: vi.fn((table: string) => (table === 'cross_module_settings' ? settingsChain : dealChain)),
      insertInto: vi.fn((table: string) => (table === 'projects' ? insertChain : statusesChain)),
    } as unknown as Kysely<Database>

    const { createProjectsRouter } = await import('./projects')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/projects', createProjectsRouter(db))

    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'New Project', deal_id: DEAL_ID })

    expect(res.status).toBe(201)
    expect(res.body.data.deal_id).toBe(DEAL_ID)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/projects.test.ts`
Expected: FAIL — `deal_id` stripped by `createProjectSchema` (unknown key ignored by Zod, so the deal lookup never happens and the first test's `INVALID_LINK` assertion fails with a 201 instead).

- [ ] **Step 3: Implement**

In `apps/api/src/routes/projects.ts`, add the import and extend both schemas:

```ts
import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import { getCrossModuleSetting } from '../lib/cross-module-settings'

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  deal_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
})
```

Add `verifyLinkTargets` right after `seedDefaultStatuses` and export both:

```ts
export async function seedDefaultStatuses(db: Kysely<Database>, projectId: string) {
  const statuses = [
    { name: 'Backlog', color: '#9e998f', position: 0, is_done: false },
    { name: 'In Progress', color: '#1e3a8a', position: 1, is_done: false },
    { name: 'In Review', color: '#92400e', position: 2, is_done: false },
    { name: 'Done', color: '#2d6a4f', position: 3, is_done: true },
  ]
  await db.insertInto('project_task_statuses')
    .values(statuses.map(s => ({ ...s, project_id: projectId })))
    .execute()
}

async function verifyLinkTargets(
  db: Kysely<Database>,
  workspaceId: string,
  links: { deal_id?: string | null; contact_id?: string | null; company_id?: string | null },
): Promise<string | null> {
  if (links.deal_id === undefined && links.contact_id === undefined && links.company_id === undefined) return null

  if (links.deal_id || links.contact_id || links.company_id) {
    const linkingEnabled = await getCrossModuleSetting(db, workspaceId, 'pm.deal_link_enabled')
    if (!linkingEnabled) return 'CRM linking is disabled for this workspace'
  }

  if (links.deal_id) {
    const deal = await db.selectFrom('pipeline_items').select('id')
      .where('id', '=', links.deal_id)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()
    if (!deal) return 'Deal not found'
  }
  if (links.contact_id) {
    const contact = await db.selectFrom('contacts').select('id')
      .where('id', '=', links.contact_id)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!contact) return 'Contact not found'
  }
  if (links.company_id) {
    const company = await db.selectFrom('companies').select('id')
      .where('id', '=', links.company_id)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!company) return 'Company not found'
  }
  return null
}
```

In the POST `/` handler, validate links before inserting and include the new fields:

```ts
  // Create project
  router.post('/', async (req, res) => {
    const { user, workspace } = req as unknown as AuthenticatedRequest
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const linkError = await verifyLinkTargets(db, workspace.id, parsed.data)
      if (linkError) return res.status(400).json({ data: null, error: { code: 'INVALID_LINK', message: linkError } })

      const project = await db.insertInto('projects')
        .values({
          workspace_id: workspace.id,
          created_by: user.id,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          color: parsed.data.color ?? null,
          start_date: parsed.data.start_date ? new Date(parsed.data.start_date) : null,
          end_date: parsed.data.end_date ? new Date(parsed.data.end_date) : null,
          deal_id: parsed.data.deal_id ?? null,
          contact_id: parsed.data.contact_id ?? null,
          company_id: parsed.data.company_id ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await seedDefaultStatuses(db, project.id)
      return res.status(201).json({ data: project, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })
```

In the PATCH `/:id` handler, validate links and apply the same three fields (insert this right after the `if (!parsed.success) ...` line, before building `updates`):

```ts
      const linkError = await verifyLinkTargets(db, workspace.id, parsed.data)
      if (linkError) return res.status(400).json({ data: null, error: { code: 'INVALID_LINK', message: linkError } })

      const updates: Record<string, unknown> = { updated_at: new Date() }
      if (parsed.data.name !== undefined) updates.name = parsed.data.name
      if (parsed.data.description !== undefined) updates.description = parsed.data.description
      if (parsed.data.color !== undefined) updates.color = parsed.data.color
      if (parsed.data.status !== undefined) updates.status = parsed.data.status
      if (parsed.data.health !== undefined) updates.health = parsed.data.health
      if (parsed.data.start_date !== undefined) updates.start_date = parsed.data.start_date ? new Date(parsed.data.start_date) : null
      if (parsed.data.end_date !== undefined) updates.end_date = parsed.data.end_date ? new Date(parsed.data.end_date) : null
      if (parsed.data.deal_id !== undefined) updates.deal_id = parsed.data.deal_id
      if (parsed.data.contact_id !== undefined) updates.contact_id = parsed.data.contact_id
      if (parsed.data.company_id !== undefined) updates.company_id = parsed.data.company_id
```

> Note: Plan 1A added `notify`/`logActivity`/`createAlert` calls after the update in this same handler (the `prior`/`updated` archive+at-risk block) — leave that block exactly as Plan 1A wrote it; this task only touches the validation and the `updates` object above it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/projects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(projects): add manual deal/contact/company linking"
```

---

### Task 4: Add `pm_approval_responded` to `ActivityType`

**Files:**
- Modify: `apps/api/src/lib/log-activity.ts`
- Test: `apps/api/src/__tests__/log-activity.test.ts`

- [ ] **Step 1: Write the failing test**

Read `apps/api/src/__tests__/log-activity.test.ts` first to match its exact `buildMockDb` helper (created by Plan 1A, extended by Plan 3A). Append this test inside the same `describe` block, after the `pm_time_logged` test added by Plan 3A:

```ts
  it('accepts pm_approval_responded as a valid ActivityType', async () => {
    const db = buildMockDb(false);
    await logActivity(db, {
      workspace_id: 'ws-1',
      user_id: null,
      type: 'pm_approval_responded',
      source_module_id: 'projects',
      record_id: 'project-1',
      meta: { approval_id: 'approval-1', status: 'APPROVED' },
    });
    expect(db.insertInto).toHaveBeenCalledWith('activities');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/log-activity.test.ts`
Expected: FAIL — TypeScript compile error, `'pm_approval_responded' is not assignable to type ActivityType`.

- [ ] **Step 3: Implement**

In `apps/api/src/lib/log-activity.ts`, append to the end of the `ActivityType` union (after Plan 3A's `pm_time_logged`):

```ts
export type ActivityType =
  | 'email'
  | 'call'
  | 'note'
  | 'meeting'
  | 'deal_change'
  | 'infra_alert'
  | 'contact_created'
  | 'task_done'
  | 'database_added'
  | 'database_removed'
  | 'database_settings_changed'
  | 'database_connection_tested'
  | 'project_created'
  | 'project_updated'
  | 'project_archived'
  | 'pm_task_created'
  | 'pm_task_assigned'
  | 'pm_task_status_changed'
  | 'pm_comment_added'
  | 'milestone_created'
  | 'milestone_completed'
  | 'sprint_started'
  | 'sprint_ended'
  | 'pm_time_logged'
  | 'pm_approval_responded';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/__tests__/log-activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/log-activity.ts apps/api/src/__tests__/log-activity.test.ts
git commit -m "feat(activity): add pm_approval_responded activity type"
```

---

### Task 5: `cross-module-settings.ts` lib

**Files:**
- Create: `apps/api/src/lib/cross-module-settings.ts`
- Test: `apps/api/src/lib/cross-module-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/cross-module-settings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import {
  getCrossModuleSetting,
  setCrossModuleSetting,
  listCrossModuleSettings,
  DEFAULT_CROSS_MODULE_SETTINGS,
} from './cross-module-settings'

describe('getCrossModuleSetting', () => {
  it('returns the locked default when no row exists', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const db = chain as unknown as Kysely<Database>

    const result = await getCrossModuleSetting(db, 'ws-1', 'pm.deal_link_enabled')
    expect(result).toBe(true)
  })

  it('returns the stored value when a row exists', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ enabled: true }),
    }
    const db = chain as unknown as Kysely<Database>

    const result = await getCrossModuleSetting(db, 'ws-1', 'pm.deal_close_auto_spawn')
    expect(result).toBe(true)
  })
})

describe('setCrossModuleSetting', () => {
  it('upserts the row via onConflict', async () => {
    const chain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn((cb: (oc: any) => any) => {
        const ocChain = { columns: vi.fn().mockReturnThis(), doUpdateSet: vi.fn().mockReturnThis() }
        cb(ocChain)
        return chain
      }),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = chain as unknown as Kysely<Database>

    await setCrossModuleSetting(db, 'ws-1', 'pm.deal_close_auto_spawn', true)
    expect(chain.insertInto).toHaveBeenCalledWith('cross_module_settings')
  })
})

describe('listCrossModuleSettings', () => {
  it('merges stored overrides onto the full default key set', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([{ setting_key: 'pm.deal_close_auto_spawn', enabled: true }]),
    }
    const db = chain as unknown as Kysely<Database>

    const result = await listCrossModuleSettings(db, 'ws-1')
    expect(result['pm.deal_link_enabled']).toBe(DEFAULT_CROSS_MODULE_SETTINGS['pm.deal_link_enabled'])
    expect(result['pm.deal_close_auto_spawn']).toBe(true)
    expect(Object.keys(result).sort()).toEqual(Object.keys(DEFAULT_CROSS_MODULE_SETTINGS).sort())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/cross-module-settings.test.ts`
Expected: FAIL — `Cannot find module './cross-module-settings'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/cross-module-settings.ts`:

```ts
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

export type CrossModuleSettingKey =
  | 'pm.deal_link_enabled'
  | 'pm.deal_close_auto_spawn'
  | 'pm.project_complete_deal_stage'
  | 'crm.project_health_on_record'

export const DEFAULT_CROSS_MODULE_SETTINGS: Record<CrossModuleSettingKey, boolean> = {
  'pm.deal_link_enabled': true,
  'pm.deal_close_auto_spawn': false,
  'pm.project_complete_deal_stage': false,
  'crm.project_health_on_record': false,
}

export async function getCrossModuleSetting(
  db: Kysely<Database>,
  workspaceId: string,
  key: CrossModuleSettingKey,
): Promise<boolean> {
  const row = await db.selectFrom('cross_module_settings')
    .select('enabled')
    .where('workspace_id', '=', workspaceId)
    .where('setting_key', '=', key)
    .executeTakeFirst()
  return row?.enabled ?? DEFAULT_CROSS_MODULE_SETTINGS[key]
}

export async function setCrossModuleSetting(
  db: Kysely<Database>,
  workspaceId: string,
  key: CrossModuleSettingKey,
  enabled: boolean,
  config?: Record<string, unknown> | null,
): Promise<void> {
  await db.insertInto('cross_module_settings')
    .values({
      workspace_id: workspaceId,
      setting_key: key,
      enabled,
      config: config ?? null,
    })
    .onConflict(oc => oc
      .columns(['workspace_id', 'setting_key'])
      .doUpdateSet({ enabled, config: config ?? null, updated_at: new Date() }))
    .execute()
}

export async function listCrossModuleSettings(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<Record<CrossModuleSettingKey, boolean>> {
  const rows = await db.selectFrom('cross_module_settings')
    .select(['setting_key', 'enabled'])
    .where('workspace_id', '=', workspaceId)
    .execute()

  const overrides = new Map(rows.map(r => [r.setting_key, r.enabled]))
  const result = { ...DEFAULT_CROSS_MODULE_SETTINGS }
  for (const key of Object.keys(result) as CrossModuleSettingKey[]) {
    const override = overrides.get(key)
    if (override !== undefined) result[key] = override
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/cross-module-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/cross-module-settings.ts apps/api/src/lib/cross-module-settings.test.ts
git commit -m "feat(cross-module): add settings lib with locked defaults"
```

---

### Task 6: `cross-module-settings.ts` route + mount

**Files:**
- Create: `apps/api/src/routes/cross-module-settings.ts`
- Test: `apps/api/src/routes/cross-module-settings.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/cross-module-settings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

const WORKSPACE_ID = 'ws-1'

function injectUser(app: express.Express) {
  app.use((req, _res, next) => {
    ;(req as any).user = { id: 'user-1', role: 'admin' }
    ;(req as any).workspace = { id: WORKSPACE_ID }
    next()
  })
}

describe('GET /api/cross-module-settings', () => {
  it('returns the full default key set merged with overrides', async () => {
    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([{ setting_key: 'pm.deal_close_auto_spawn', enabled: true }]),
    }
    const db = chain as unknown as Kysely<Database>

    const { createCrossModuleSettingsRouter } = await import('./cross-module-settings')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/cross-module-settings', createCrossModuleSettingsRouter(db))

    const res = await request(app).get('/api/cross-module-settings')
    expect(res.status).toBe(200)
    expect(res.body.data['pm.deal_link_enabled']).toBe(true)
    expect(res.body.data['pm.deal_close_auto_spawn']).toBe(true)
  })
})

describe('PATCH /api/cross-module-settings', () => {
  it('upserts the given key', async () => {
    const chain = {
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflict: vi.fn((cb: (oc: any) => any) => {
        cb({ columns: vi.fn().mockReturnThis(), doUpdateSet: vi.fn().mockReturnThis() })
        return chain
      }),
      execute: vi.fn().mockResolvedValue([]),
    }
    const db = chain as unknown as Kysely<Database>

    const { createCrossModuleSettingsRouter } = await import('./cross-module-settings')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/cross-module-settings', createCrossModuleSettingsRouter(db))

    const res = await request(app)
      .patch('/api/cross-module-settings')
      .send({ key: 'pm.deal_close_auto_spawn', enabled: true })

    expect(res.status).toBe(200)
    expect(res.body.data.key).toBe('pm.deal_close_auto_spawn')
    expect(res.body.data.enabled).toBe(true)
  })

  it('rejects an unknown key', async () => {
    const db = {} as unknown as Kysely<Database>
    const { createCrossModuleSettingsRouter } = await import('./cross-module-settings')
    const app = express()
    app.use(express.json())
    injectUser(app)
    app.use('/api/cross-module-settings', createCrossModuleSettingsRouter(db))

    const res = await request(app)
      .patch('/api/cross-module-settings')
      .send({ key: 'not.a.real.key', enabled: true })

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/cross-module-settings.test.ts`
Expected: FAIL — `Cannot find module './cross-module-settings'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/routes/cross-module-settings.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { AuthenticatedRequest } from '../middleware/auth'
import {
  listCrossModuleSettings,
  setCrossModuleSetting,
  DEFAULT_CROSS_MODULE_SETTINGS,
  type CrossModuleSettingKey,
} from '../lib/cross-module-settings'

const KNOWN_KEYS = Object.keys(DEFAULT_CROSS_MODULE_SETTINGS) as CrossModuleSettingKey[]

const patchSchema = z.object({
  key: z.enum(KNOWN_KEYS as [CrossModuleSettingKey, ...CrossModuleSettingKey[]]),
  enabled: z.boolean(),
})

export function createCrossModuleSettingsRouter(db: Kysely<Database>): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const settings = await listCrossModuleSettings(db, workspace.id)
      return res.json({ data: settings, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  router.patch('/', async (req, res) => {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      await setCrossModuleSetting(db, workspace.id, parsed.data.key, parsed.data.enabled)
      return res.json({ data: { key: parsed.data.key, enabled: parsed.data.enabled }, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  return router
}
```

In `apps/api/src/index.ts`, add the import near the other route imports:

```ts
import { createCrossModuleSettingsRouter } from './routes/cross-module-settings';
```

And mount it alongside the other admin-only routes (next to `app.use('/api/groups', requireAuth, requireAdmin, createGroupsRouter(db));`):

```ts
app.use('/api/cross-module-settings', requireAuth, requireAdmin, createCrossModuleSettingsRouter(db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/cross-module-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/cross-module-settings.ts apps/api/src/routes/cross-module-settings.test.ts apps/api/src/index.ts
git commit -m "feat(cross-module): add settings route and mount"
```

---

### Task 7: `deal-close-hooks.ts` — spawn-on-won and stage-on-complete

**Files:**
- Create: `apps/api/src/lib/deal-close-hooks.ts`
- Test: `apps/api/src/lib/deal-close-hooks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/deal-close-hooks.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'

vi.mock('./cross-module-settings', () => ({
  getCrossModuleSetting: vi.fn(),
}))
vi.mock('./pipeline-activity', () => ({
  logStageChanged: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./log-activity', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}))

import { getCrossModuleSetting } from './cross-module-settings'
import { logStageChanged } from './pipeline-activity'
import { logActivity } from './log-activity'
import { maybeSpawnProjectOnDealWon, maybeUpdateDealStageOnProjectComplete } from './deal-close-hooks'

const WORKSPACE_ID = 'ws-1'
const USER_ID = 'user-1'
const DEAL_ID = 'deal-1'

describe('maybeSpawnProjectOnDealWon', () => {
  it('does nothing when the setting is disabled', async () => {
    vi.mocked(getCrossModuleSetting).mockResolvedValue(false)
    const db = { selectFrom: vi.fn(), insertInto: vi.fn() } as unknown as Kysely<Database>

    await maybeSpawnProjectOnDealWon({ db, workspaceId: WORKSPACE_ID, userId: USER_ID, dealId: DEAL_ID })

    expect(db.selectFrom).not.toHaveBeenCalled()
  })

  it('creates a project linked to the deal when enabled and none exists yet', async () => {
    vi.mocked(getCrossModuleSetting).mockResolvedValue(true)

    const existingChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    }
    const dealChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ field_values: { name: 'Acme deal' } }),
    }
    let selectCall = 0
    const insertProjectChain = {
      values: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: 'project-1', name: 'Acme deal — Project' }),
    }
    const insertStatusesChain = { values: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) }

    const db = {
      selectFrom: vi.fn(() => {
        selectCall++
        return selectCall === 1 ? existingChain : dealChain
      }),
      insertInto: vi.fn((table: string) => (table === 'projects' ? insertProjectChain : insertStatusesChain)),
    } as unknown as Kysely<Database>

    await maybeSpawnProjectOnDealWon({ db, workspaceId: WORKSPACE_ID, userId: USER_ID, dealId: DEAL_ID })

    expect(insertProjectChain.values).toHaveBeenCalledWith(expect.objectContaining({ deal_id: DEAL_ID, name: 'Acme deal — Project' }))
    expect(logActivity).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'project_created' }))
  })
})

describe('maybeUpdateDealStageOnProjectComplete', () => {
  it('moves the deal to the won stage and logs the change', async () => {
    vi.mocked(getCrossModuleSetting).mockResolvedValue(true)

    const itemChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: DEAL_ID, pipeline_id: 'pipeline-1', stage_id: 'stage-open' }),
    }
    const wonStageChain = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'stage-won' }),
    }
    let selectCall = 0
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) }

    const db = {
      selectFrom: vi.fn(() => {
        selectCall++
        return selectCall === 1 ? itemChain : wonStageChain
      }),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    await maybeUpdateDealStageOnProjectComplete({ db, workspaceId: WORKSPACE_ID, userId: USER_ID, dealId: DEAL_ID })

    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ stage_id: 'stage-won' }))
    expect(logStageChanged).toHaveBeenCalledWith(expect.objectContaining({ fromStageId: 'stage-open', toStageId: 'stage-won' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/deal-close-hooks.test.ts`
Expected: FAIL — `Cannot find module './deal-close-hooks'`.

- [ ] **Step 3: Implement**

First export `seedDefaultStatuses` from `apps/api/src/routes/projects.ts` (Task 3 already wrote it as `export async function seedDefaultStatuses` — verify that export is present; if Task 3 was applied this is already done).

Create `apps/api/src/lib/deal-close-hooks.ts`:

```ts
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { getCrossModuleSetting } from './cross-module-settings'
import { logStageChanged } from './pipeline-activity'
import { logActivity } from './log-activity'
import { seedDefaultStatuses } from '../routes/projects'
import { logger } from './logger'

interface SpawnParams {
  db: Kysely<Database>
  workspaceId: string
  userId: string
  dealId: string
}

export async function maybeSpawnProjectOnDealWon(params: SpawnParams): Promise<void> {
  try {
    const enabled = await getCrossModuleSetting(params.db, params.workspaceId, 'pm.deal_close_auto_spawn')
    if (!enabled) return

    const existing = await params.db.selectFrom('projects')
      .select('id')
      .where('deal_id', '=', params.dealId)
      .where('workspace_id', '=', params.workspaceId)
      .where('status', '!=', 'DELETED')
      .executeTakeFirst()
    if (existing) return

    const deal = await params.db.selectFrom('pipeline_items')
      .select('field_values')
      .where('id', '=', params.dealId)
      .where('workspace_id', '=', params.workspaceId)
      .executeTakeFirst()
    const dealName = (deal?.field_values as Record<string, unknown> | undefined)?.['name']
    const projectName = typeof dealName === 'string' && dealName.length > 0 ? `${dealName} — Project` : 'New Project'

    const project = await params.db.insertInto('projects')
      .values({
        workspace_id: params.workspaceId,
        created_by: params.userId,
        name: projectName,
        deal_id: params.dealId,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    await seedDefaultStatuses(params.db, project.id)

    await logActivity(params.db, {
      workspace_id: params.workspaceId,
      user_id: params.userId,
      type: 'project_created',
      source_module_id: 'projects',
      record_id: project.id,
      body: `Auto-created project "${project.name}" from won deal`,
    })
  } catch (err) {
    logger.error({ err }, 'maybeSpawnProjectOnDealWon failed')
  }
}

interface CompleteParams {
  db: Kysely<Database>
  workspaceId: string
  userId: string
  dealId: string
}

export async function maybeUpdateDealStageOnProjectComplete(params: CompleteParams): Promise<void> {
  try {
    const enabled = await getCrossModuleSetting(params.db, params.workspaceId, 'pm.project_complete_deal_stage')
    if (!enabled) return

    const item = await params.db.selectFrom('pipeline_items')
      .select(['id', 'pipeline_id', 'stage_id'])
      .where('id', '=', params.dealId)
      .where('workspace_id', '=', params.workspaceId)
      .executeTakeFirst()
    if (!item) return

    const wonStage = await params.db.selectFrom('pipeline_stages')
      .select('id')
      .where('pipeline_id', '=', item.pipeline_id)
      .where('is_won', '=', true)
      .executeTakeFirst()
    if (!wonStage || wonStage.id === item.stage_id) return

    await params.db.updateTable('pipeline_items')
      .set({ stage_id: wonStage.id, updated_at: new Date() })
      .where('id', '=', item.id)
      .execute()

    await logStageChanged({
      db: params.db,
      itemId: item.id,
      pipelineId: item.pipeline_id,
      workspaceId: params.workspaceId,
      userId: params.userId,
      fromStageId: item.stage_id,
      toStageId: wonStage.id,
    })
  } catch (err) {
    logger.error({ err }, 'maybeUpdateDealStageOnProjectComplete failed')
  }
}
```

Wire `maybeUpdateDealStageOnProjectComplete` into `apps/api/src/routes/projects.ts`'s PATCH `/:id` handler, inside the archive-transition block Plan 1A added. That block currently reads:

```ts
      if (prior?.status !== 'ARCHIVED' && updated.status === 'ARCHIVED') {
        void logActivity(db, { workspace_id: workspace.id, user_id: user.id, type: 'project_archived', source_module_id: 'projects', record_id: updated.id, body: `Archived project "${updated.name}"` });
      }
```

Change it to:

```ts
      if (prior?.status !== 'ARCHIVED' && updated.status === 'ARCHIVED') {
        void logActivity(db, { workspace_id: workspace.id, user_id: user.id, type: 'project_archived', source_module_id: 'projects', record_id: updated.id, body: `Archived project "${updated.name}"` });
        if (updated.deal_id) {
          void maybeUpdateDealStageOnProjectComplete({ db, workspaceId: workspace.id, userId: user.id, dealId: updated.deal_id });
        }
      }
```

And add the import at the top of `projects.ts`:

```ts
import { maybeUpdateDealStageOnProjectComplete } from '../lib/deal-close-hooks'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/deal-close-hooks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/deal-close-hooks.ts apps/api/src/lib/deal-close-hooks.test.ts apps/api/src/routes/projects.ts
git commit -m "feat(cross-module): add deal-close-won and project-complete hooks"
```

---

### Task 8: Wire `maybeSpawnProjectOnDealWon` into `pipeline-items.ts`

**Files:**
- Modify: `apps/api/src/routes/pipeline-items.ts`
- Test: `apps/api/src/routes/pipeline-items.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/routes/pipeline-items.test.ts` (after the existing `describe('PATCH /api/items/:id/move + GET /api/items/:id/activity'...)` block):

```ts
describe('PATCH /api/items/:id — won-stage hook', () => {
  it('triggers maybeSpawnProjectOnDealWon when the new stage is_won', async () => {
    vi.mock('../lib/deal-close-hooks', () => ({
      maybeSpawnProjectOnDealWon: vi.fn().mockResolvedValue(undefined),
    }));
    const { maybeSpawnProjectOnDealWon } = await import('../lib/deal-close-hooks');

    const currentItem = { id: ITEM_ID, pipeline_id: PIPELINE_ID, stage_id: STAGE_A, field_values: {} };
    const updatedItem = { ...currentItem, stage_id: STAGE_B };

    const itemChain = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(currentItem),
    };
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updatedItem),
    };
    const activityChain = { insertInto: vi.fn().mockReturnThis(), values: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue([]) };
    const stageChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ is_won: true }),
    };

    let selectCall = 0;
    const db = {
      selectFrom: vi.fn(() => {
        selectCall++;
        return selectCall === 1 ? itemChain : stageChain;
      }),
      updateTable: vi.fn(() => updateChain),
      insertInto: vi.fn(() => activityChain),
    } as unknown as Kysely<Database>;

    const { createItemRouter } = await import('./pipeline-items');
    const app = express();
    app.use(express.json());
    injectUser(app);
    app.use('/api/items', createItemRouter(db, mockPermission()));

    const res = await request(app).patch(`/api/items/${ITEM_ID}`).send({ stage_id: STAGE_B });

    expect(res.status).toBe(200);
    expect(maybeSpawnProjectOnDealWon).toHaveBeenCalledWith(
      expect.objectContaining({ dealId: ITEM_ID, workspaceId: WORKSPACE_ID }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/pipeline-items.test.ts`
Expected: FAIL — `maybeSpawnProjectOnDealWon` not called (hook not wired yet).

- [ ] **Step 3: Implement**

In `apps/api/src/routes/pipeline-items.ts`, add the import:

```ts
import { maybeSpawnProjectOnDealWon } from '../lib/deal-close-hooks';
```

In the PATCH `/:id` handler, after the existing `logStageChanged` block (lines reproduced below for context), add a check against the new stage's `is_won` flag:

```ts
      if (body.stage_id && body.stage_id !== current.stage_id) {
        await logStageChanged({
          db, itemId: current.id, pipelineId: current.pipeline_id,
          workspaceId, userId,
          fromStageId: current.stage_id, toStageId: body.stage_id,
        });

        const newStage = await db.selectFrom('pipeline_stages')
          .select('is_won')
          .where('id', '=', body.stage_id)
          .executeTakeFirst();
        if (newStage?.is_won) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        }
      }
```

In the PATCH `/:id/move` handler, after its own existing `logStageChanged` block, add the same check:

```ts
      if (stage_id !== current.stage_id) {
        await logStageChanged({
          db, itemId: current.id, pipelineId: current.pipeline_id,
          workspaceId, userId,
          fromStageId: current.stage_id, toStageId: stage_id,
        });

        const newStage = await db.selectFrom('pipeline_stages')
          .select('is_won')
          .where('id', '=', stage_id)
          .executeTakeFirst();
        if (newStage?.is_won) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/pipeline-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/pipeline-items.ts apps/api/src/routes/pipeline-items.test.ts
git commit -m "feat(pipelines): spawn linked project when a deal reaches a won stage"
```

---

### Task 9: `approval-token.ts` lib

**Files:**
- Create: `apps/api/src/lib/approval-token.ts`
- Test: `apps/api/src/lib/approval-token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/approval-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { signApprovalToken, verifyApprovalToken } from './approval-token'

const SECRET = 'test-secret'

describe('signApprovalToken / verifyApprovalToken', () => {
  it('round-trips the approval id and action', () => {
    const token = signApprovalToken({ aid: 'approval-1', act: 'approve' }, SECRET)
    const payload = verifyApprovalToken(token, SECRET)
    expect(payload.aid).toBe('approval-1')
    expect(payload.act).toBe('approve')
  })

  it('throws when verifying with the wrong secret', () => {
    const token = signApprovalToken({ aid: 'approval-1', act: 'reject' }, SECRET)
    expect(() => verifyApprovalToken(token, 'wrong-secret')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/approval-token.test.ts`
Expected: FAIL — `Cannot find module './approval-token'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/approval-token.ts`:

```ts
import jwt from 'jsonwebtoken'

export interface ApprovalTokenPayload {
  aid: string
  act: 'approve' | 'reject'
}

export function signApprovalToken(payload: ApprovalTokenPayload, jwtSecret: string): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: '7d' })
}

export function verifyApprovalToken(token: string, jwtSecret: string): ApprovalTokenPayload {
  return jwt.verify(token, jwtSecret) as ApprovalTokenPayload
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/approval-token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/approval-token.ts apps/api/src/lib/approval-token.test.ts
git commit -m "feat(portal): add signed approval token lib"
```

---

### Task 10: `send-approval-email.ts` lib

**Files:**
- Create: `apps/api/src/lib/send-approval-email.ts`

- [ ] **Step 1: Implement**

This mirrors `send-alert-email.ts`'s structure exactly (dynamic `nodemailer` import, swallow-all-errors). No new mocking pattern is introduced, so this task is implementation-only — there is nothing meaningfully different to unit-test beyond what `send-alert-email.ts` already demonstrates for this exact shape, and that file has no test of its own either.

Create `apps/api/src/lib/send-approval-email.ts`:

```ts
import type { SmtpConfig } from '@vencore/config'
import { logger } from './logger'

interface ApprovalEmailInfo {
  projectName: string
  approveToken: string
  rejectToken: string
}

/**
 * Email a client two pre-signed links (approve/reject) for an approval request.
 * Swallows errors — must never crash the parent request.
 */
export async function sendApprovalEmail(
  smtp: SmtpConfig | null | undefined,
  recipientEmail: string,
  info: ApprovalEmailInfo,
): Promise<void> {
  if (!smtp) return

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    })

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

    await transporter.sendMail({
      from: smtp.from,
      to: recipientEmail,
      subject: `Approval requested: ${info.projectName}`,
      text: [
        `You have been asked to review and approve a deliverable for "${info.projectName}".`,
        '',
        `Approve: ${appUrl}/portal/approve/${info.approveToken}`,
        `Reject: ${appUrl}/portal/approve/${info.rejectToken}`,
        '',
        'This link expires in 7 days.',
      ].join('\n'),
    })
  } catch (err) {
    logger.error({ err }, 'sendApprovalEmail: failed to send')
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/send-approval-email.ts
git commit -m "feat(portal): add approval-email sender"
```

---

### Task 11: `portal.ts` — recipient email, shared respond helper, and signed-link routes

**Files:**
- Modify: `apps/api/src/routes/portal.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/routes/portal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/portal.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { signApprovalToken } from '../lib/approval-token'

const SECRET = 'test-secret'
const APPROVAL_ID = 'approval-1'

vi.mock('../lib/pm-events', () => ({ pmEvents: { emit: vi.fn() } }))
vi.mock('../lib/log-activity', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }))

describe('GET /api/portal/approve/:token', () => {
  it('returns approval context for a valid token', async () => {
    const token = signApprovalToken({ aid: APPROVAL_ID, act: 'approve' }, SECRET)

    const chain = {
      selectFrom: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: APPROVAL_ID, status: 'PENDING', task_id: null, milestone_id: null, project_name: 'Acme' }),
    }
    const db = chain as unknown as Kysely<Database>

    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).get(`/api/portal/approve/${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.action).toBe('approve')
    expect(res.body.data.already_responded).toBe(false)
    expect(res.body.data.project_name).toBe('Acme')
  })

  it('returns 401 for an invalid token', async () => {
    const db = {} as unknown as Kysely<Database>
    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).get('/api/portal/approve/not-a-real-token')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('TOKEN_INVALID')
  })
})

describe('POST /api/portal/approve/:token', () => {
  it('applies the embedded action and logs activity + emits pmEvents', async () => {
    const { pmEvents } = await import('../lib/pm-events')
    const { logActivity } = await import('../lib/log-activity')
    const token = signApprovalToken({ aid: APPROVAL_ID, act: 'approve' }, SECRET)

    const lookupChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: APPROVAL_ID, status: 'PENDING' }),
    }
    const updateChain = {
      updateTable: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returningAll: vi.fn().mockReturnThis(),
      executeTakeFirstOrThrow: vi.fn().mockResolvedValue({ id: APPROVAL_ID, project_id: 'project-1', status: 'APPROVED' }),
    }
    const projectChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ workspace_id: 'ws-1' }),
    }

    let selectCall = 0
    const db = {
      selectFrom: vi.fn(() => {
        selectCall++
        return selectCall === 1 ? lookupChain : projectChain
      }),
      updateTable: vi.fn(() => updateChain),
    } as unknown as Kysely<Database>

    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).post(`/api/portal/approve/${token}`).send({})

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('APPROVED')
    expect(pmEvents.emit).toHaveBeenCalledWith('pm', expect.objectContaining({ type: 'client_approved', approvalId: APPROVAL_ID }))
    expect(logActivity).toHaveBeenCalledWith(db, expect.objectContaining({ type: 'pm_approval_responded' }))
  })

  it('returns 409 if the approval was already responded to', async () => {
    const token = signApprovalToken({ aid: APPROVAL_ID, act: 'approve' }, SECRET)
    const lookupChain = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: APPROVAL_ID, status: 'APPROVED' }),
    }
    const db = { selectFrom: vi.fn(() => lookupChain) } as unknown as Kysely<Database>

    const { createPortalRouter } = await import('./portal')
    const app = express()
    app.use(express.json())
    app.use('/api/portal', createPortalRouter(db, SECRET))

    const res = await request(app).post(`/api/portal/approve/${token}`).send({})
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/portal.test.ts`
Expected: FAIL — `createPortalRouter` does not accept a second argument yet, and `/approve/:token` does not exist (404).

- [ ] **Step 3: Implement**

In `apps/api/src/routes/portal.ts`, update the imports at the top:

```ts
import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import type { SmtpConfig } from '@vencore/config'
import type { AuthenticatedRequest } from '../middleware/auth'
import type { Request, Response, NextFunction } from 'express'
import { verifyApprovalToken, signApprovalToken } from '../lib/approval-token'
import { sendApprovalEmail } from '../lib/send-approval-email'
import { pmEvents } from '../lib/pm-events'
import { logActivity } from '../lib/log-activity'
```

Extend `createApprovalSchema`:

```ts
const createApprovalSchema = z.object({
  portal_id: z.string().uuid(),
  task_id: z.string().uuid().optional(),
  milestone_id: z.string().uuid().optional(),
  attachment_id: z.string().uuid().optional(),
  recipient_email: z.string().email().optional(),
})
```

Add a shared respond helper right after `respondApprovalSchema` (used by both the existing session-based respond route and the new signed-link routes, so both consistently emit the automation trigger and log activity):

```ts
async function respondToApproval(
  db: Kysely<Database>,
  params: { approvalId: string; status: 'APPROVED' | 'REJECTED'; note: string | null },
) {
  const updated = await db.updateTable('approval_requests')
    .set({ status: params.status, note: params.note, responded_at: new Date() })
    .where('id', '=', params.approvalId)
    .returningAll()
    .executeTakeFirstOrThrow()

  pmEvents.emit('pm', {
    type: params.status === 'APPROVED' ? 'client_approved' : 'client_rejected',
    projectId: updated.project_id,
    approvalId: updated.id,
  })

  const project = await db.selectFrom('projects').select('workspace_id')
    .where('id', '=', updated.project_id)
    .executeTakeFirst()
  if (project) {
    void logActivity(db, {
      workspace_id: project.workspace_id,
      user_id: null,
      type: 'pm_approval_responded',
      source_module_id: 'projects',
      record_id: updated.project_id,
      meta: { approval_id: updated.id, status: params.status },
    })
  }

  return updated
}
```

Change `createPortalInternalRouter`'s signature to accept `smtp` and `jwtSecret`:

```ts
export function createPortalInternalRouter(
  db: Kysely<Database>,
  smtp: SmtpConfig | null | undefined,
  jwtSecret: string,
): Router {
```

Update the POST `/approvals` handler inside it — widen the project select and add the email send:

```ts
  // POST /approvals — create approval request
  router.post('/approvals', async (req, res) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest
      const { projectId } = req.params as { projectId: string }

      const project = await db.selectFrom('projects').select(['id', 'name'])
        .where('id', '=', projectId)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst()
      if (!project) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } })

      const parsed = createApprovalSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const approval = await db.insertInto('approval_requests')
        .values({
          project_id: projectId,
          portal_id: parsed.data.portal_id,
          task_id: parsed.data.task_id ?? null,
          milestone_id: parsed.data.milestone_id ?? null,
          attachment_id: parsed.data.attachment_id ?? null,
          recipient_email: parsed.data.recipient_email ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      if (parsed.data.recipient_email) {
        const approveToken = signApprovalToken({ aid: approval.id, act: 'approve' }, jwtSecret)
        const rejectToken = signApprovalToken({ aid: approval.id, act: 'reject' }, jwtSecret)
        void sendApprovalEmail(smtp, parsed.data.recipient_email, {
          projectName: project.name,
          approveToken,
          rejectToken,
        })
      }

      return res.status(201).json({ data: approval, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })
```

Change `createPortalRouter`'s signature to accept `jwtSecret`:

```ts
export function createPortalRouter(db: Kysely<Database>, jwtSecret: string): Router {
```

Replace the body of the existing session-based respond handler to call the shared helper:

```ts
  // POST /:token/approvals/:approvalId/respond — approve or reject
  router.post('/:token/approvals/:approvalId/respond', requirePortalSession, async (req, res) => {
    try {
      const portalReq = req as Request & { portal: { id: string; project_id: string } }
      const { approvalId } = req.params as { approvalId: string }

      const parsed = respondApprovalSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })

      const approval = await db.selectFrom('approval_requests').selectAll()
        .where('id', '=', approvalId)
        .where('portal_id', '=', portalReq.portal.id)
        .where('project_id', '=', portalReq.portal.project_id)
        .executeTakeFirst()

      if (!approval) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Approval not found' } })
      if (approval.status !== 'PENDING') return res.status(409).json({ data: null, error: { code: 'ALREADY_RESPONDED', message: 'Already responded to this approval' } })

      const updated = await respondToApproval(db, {
        approvalId,
        status: parsed.data.status,
        note: parsed.data.note ?? null,
      })

      return res.json({ data: updated, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })
```

Add the two new public routes right after it, before `return router`:

```ts
  // GET /approve/:token — preview an approval from a signed email link (side-effect-free)
  router.get('/approve/:token', async (req, res) => {
    try {
      const { token } = req.params as { token: string }
      let payload
      try {
        payload = verifyApprovalToken(token, jwtSecret)
      } catch {
        return res.status(401).json({ data: null, error: { code: 'TOKEN_INVALID', message: 'This link has expired. Please contact your team for a new one.' } })
      }

      const approval = await db.selectFrom('approval_requests as a')
        .innerJoin('projects as p', 'p.id', 'a.project_id')
        .select(['a.id', 'a.status', 'a.task_id', 'a.milestone_id', 'p.name as project_name'])
        .where('a.id', '=', payload.aid)
        .executeTakeFirst()

      if (!approval) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Approval request not found' } })

      return res.json({
        data: {
          action: payload.act,
          already_responded: approval.status !== 'PENDING',
          status: approval.status,
          project_name: approval.project_name,
        },
        error: null,
      })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })

  // POST /approve/:token — apply the action embedded in the signed link
  router.post('/approve/:token', async (req, res) => {
    try {
      const { token } = req.params as { token: string }
      let payload
      try {
        payload = verifyApprovalToken(token, jwtSecret)
      } catch {
        return res.status(401).json({ data: null, error: { code: 'TOKEN_INVALID', message: 'This link has expired. Please contact your team for a new one.' } })
      }

      const approval = await db.selectFrom('approval_requests').select(['id', 'status'])
        .where('id', '=', payload.aid)
        .executeTakeFirst()
      if (!approval) return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Approval request not found' } })
      if (approval.status !== 'PENDING') return res.status(409).json({ data: null, error: { code: 'ALREADY_RESPONDED', message: 'Already responded to this approval' } })

      const note = typeof (req.body as { note?: unknown })?.note === 'string' ? (req.body as { note: string }).note : null
      const updated = await respondToApproval(db, {
        approvalId: approval.id,
        status: payload.act === 'approve' ? 'APPROVED' : 'REJECTED',
        note,
      })

      return res.json({ data: updated, error: null })
    } catch (err) {
      return res.status(500).json({ data: null, error: { code: 'INTERNAL', message: String(err) } })
    }
  })
```

Finally, in `apps/api/src/index.ts`, update both mount lines:

```ts
app.use('/api/projects/:projectId/portal', requireAuth, createPortalInternalRouter(db, config.smtp, env.JWT_SECRET));
```

```ts
// Public portal — no requireAuth
app.use('/api/portal', createPortalRouter(db, env.JWT_SECRET));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/routes/portal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/portal.ts apps/api/src/routes/portal.test.ts apps/api/src/index.ts
git commit -m "feat(portal): add email-link client approval flow with signed tokens"
```

---

## Self-Review

**Spec coverage:**
- 4.1 CRM Full-Automation Linking ✅ — manual link fields + `verifyLinkTargets` (Task 3), deal-close auto-spawn (Task 7/8), project-complete deal-stage advance (Task 7), and the `crm.project_health_on_record` toggle is stored/returned by Tasks 5/6 for Plan 4B's frontend to read (no backend logic needed beyond storage, since it only gates a display, not a write).
- 4.2 Client Approval Email-Link Flow ✅ — `recipient_email` migration (Task 2), signed JWT lib (Task 9), email sender (Task 10), `GET`/`POST /approve/:token` (Task 11), and the existing session-respond route now shares the same activity/event hooks via `respondToApproval` so both flows are consistent.
- Settings-toggle mechanism ✅ — `cross_module_settings` table + lib + route (Tasks 1, 5, 6), with the locked defaults (`pm.deal_link_enabled: true`, everything else `false`).
- `pm_approval_responded` ActivityType ✅ (Task 4), wired into both respond paths via the shared helper (Task 11).
- Edge case "toggling off a cross-module setting stops new links/alerts/spawns but existing records remain visible" — confirmed: every hook (`verifyLinkTargets`, `maybeSpawnProjectOnDealWon`, `maybeUpdateDealStageOnProjectComplete`) checks the setting before *creating* new links/spawns/stage-moves; none of them touch or hide already-created `deal_id`/`contact_id`/`company_id` values or already-sent approval requests.
- Edge case "approval token expiry 7 days with 'link expired, contact your team' messaging" — confirmed: `signApprovalToken` uses `expiresIn: '7d'`, and both new portal routes return that exact message text on verification failure.
- Out of scope confirmed not touched: Infra/Servers↔Projects linking, full VM management, AI features — none of this plan's files intersect those areas.

**Placeholder scan:** No "TBD"/"add appropriate handling" patterns found — every step has full runnable code, and Task 10 explicitly explains why no test step is included rather than gesturing at "write tests for the above".

**Type consistency:** `CrossModuleSettingKey` is defined once in `cross-module-settings.ts` and reused via import in both the route (Task 6) and `deal-close-hooks.ts`/`projects.ts` (Tasks 3, 7) — no second inline definition. `ApprovalTokenPayload` is defined once in `approval-token.ts` and consumed by both new `portal.ts` routes via the same `verifyApprovalToken`/`signApprovalToken` functions (Task 11), matching Task 9's exported signatures exactly. `respondToApproval`'s parameter shape (`approvalId`, `status`, `note`) is identical across both call sites in Task 11.
