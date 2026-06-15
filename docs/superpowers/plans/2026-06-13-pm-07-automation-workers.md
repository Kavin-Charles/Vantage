# PM Plan 7: Automation + Worker Jobs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rule-based automation engine (trigger → action) and background worker jobs for due-date alerts, overdue scanning, digest emails, sprint rollover, and project health recalculation.

**Architecture:** Automation rules stored in DB as JSON. A Node.js event emitter dispatches events (task status changed, client approved, etc.) to the automation engine which evaluates matching rules and executes actions. Worker jobs run on cron schedules in `apps/worker`.

**Tech Stack:** Express, Kysely, Zod, Node.js EventEmitter, cron (node-cron or existing worker pattern), TypeScript strict

**Prerequisite:** PM Plans 1–6 applied.

---

## File Map

- Create: `apps/api/src/modules/automation/automation.schema.ts`
- Create: `apps/api/src/modules/automation/automation.queries.ts`
- Create: `apps/api/src/modules/automation/automation.engine.ts`
- Create: `apps/api/src/modules/automation/automation.events.ts`
- Create: `apps/api/src/modules/automation/automation.controller.ts`
- Create: `apps/api/src/modules/automation/automation.router.ts`
- Create: `apps/worker/src/jobs/pm/due-date-alerts.ts`
- Create: `apps/worker/src/jobs/pm/overdue-scan.ts`
- Create: `apps/worker/src/jobs/pm/health-recalc.ts`
- Create: `apps/worker/src/jobs/pm/sprint-rollover.ts`
- Create: `apps/worker/src/jobs/pm/digest-email.ts`
- Modify: `apps/api/src/index.ts` (register automation router)
- Modify: `apps/worker/src/index.ts` (register PM jobs)
- Create: `apps/web/src/app/(dashboard)/projects/[id]/settings/automation/page.tsx`

---

### Task 1: Automation schema + queries

- [ ] **Step 1: Schema**

```ts
// apps/api/src/modules/automation/automation.schema.ts
import { z } from 'zod'

const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task_status_changed'), to_status_id: z.string().uuid().optional() }),
  z.object({ type: z.literal('task_overdue') }),
  z.object({ type: z.literal('task_assigned') }),
  z.object({ type: z.literal('milestone_completed') }),
  z.object({ type: z.literal('client_approved') }),
  z.object({ type: z.literal('client_rejected') }),
  z.object({ type: z.literal('sprint_started') }),
  z.object({ type: z.literal('sprint_ended') }),
])

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('send_notification'), user_ids: z.array(z.string().uuid()), message: z.string() }),
  z.object({ type: z.literal('change_task_status'), status_id: z.string().uuid() }),
  z.object({ type: z.literal('assign_task'), user_id: z.string().uuid() }),
  z.object({ type: z.literal('mark_milestone_complete'), milestone_id: z.string().uuid() }),
  z.object({ type: z.literal('send_webhook'), url: z.string().url(), payload: z.record(z.unknown()).optional() }),
])

export const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  trigger: triggerSchema,
  actions: z.array(actionSchema).min(1).max(10),
  is_active: z.boolean().default(true),
})

export const updateRuleSchema = createRuleSchema.partial()

export type AutomationTrigger = z.infer<typeof triggerSchema>
export type AutomationAction = z.infer<typeof actionSchema>
export type CreateRuleInput = z.infer<typeof createRuleSchema>
```

- [ ] **Step 2: Queries**

```ts
// apps/api/src/modules/automation/automation.queries.ts
import { db } from '../../db'
import type { CreateRuleInput } from './automation.schema'

export async function listRules(projectId: string) {
  return db.selectFrom('automation_rules').selectAll()
    .where('project_id', '=', projectId).orderBy('created_at', 'asc').execute()
}

export async function getRulesForProject(projectId: string) {
  return db.selectFrom('automation_rules').selectAll()
    .where('project_id', '=', projectId).where('is_active', '=', true).execute()
}

export async function createRule(projectId: string, userId: string, input: CreateRuleInput) {
  return db.insertInto('automation_rules')
    .values({
      project_id: projectId, created_by: userId, name: input.name,
      is_active: input.is_active,
      trigger: JSON.stringify(input.trigger),
      actions: JSON.stringify(input.actions),
    })
    .returningAll().executeTakeFirstOrThrow()
}

export async function updateRule(id: string, projectId: string, input: Partial<CreateRuleInput>) {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.is_active !== undefined) updates.is_active = input.is_active
  if (input.trigger !== undefined) updates.trigger = JSON.stringify(input.trigger)
  if (input.actions !== undefined) updates.actions = JSON.stringify(input.actions)
  return db.updateTable('automation_rules').set(updates)
    .where('id', '=', id).where('project_id', '=', projectId)
    .returningAll().executeTakeFirstOrThrow()
}

export async function deleteRule(id: string, projectId: string) {
  await db.deleteFrom('automation_rules').where('id', '=', id).where('project_id', '=', projectId).execute()
}

export async function logRule(ruleId: string, success: boolean, detail?: string) {
  await db.insertInto('automation_logs').values({ rule_id: ruleId, success, detail: detail ?? null }).execute()
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/automation/automation.schema.ts
git add apps/api/src/modules/automation/automation.queries.ts
git commit -m "feat(pm): add automation schema and queries"
```

---

### Task 2: Automation engine

**Files:**
- Create: `apps/api/src/modules/automation/automation.events.ts`
- Create: `apps/api/src/modules/automation/automation.engine.ts`

- [ ] **Step 1: Event emitter**

```ts
// apps/api/src/modules/automation/automation.events.ts
import { EventEmitter } from 'events'

export type PMEvent =
  | { type: 'task_status_changed'; projectId: string; taskId: string; to_status_id: string }
  | { type: 'task_overdue'; projectId: string; taskId: string }
  | { type: 'task_assigned'; projectId: string; taskId: string; userId: string }
  | { type: 'milestone_completed'; projectId: string; milestoneId: string }
  | { type: 'client_approved'; projectId: string; approvalId: string }
  | { type: 'client_rejected'; projectId: string; approvalId: string }
  | { type: 'sprint_started'; projectId: string; sprintId: string }
  | { type: 'sprint_ended'; projectId: string; sprintId: string }

class PMEventEmitter extends EventEmitter {
  emit(event: 'pm', data: PMEvent): boolean {
    return super.emit('pm', data)
  }
  on(event: 'pm', listener: (data: PMEvent) => void): this {
    return super.on('pm', listener)
  }
}

export const pmEvents = new PMEventEmitter()
```

- [ ] **Step 2: Automation engine**

```ts
// apps/api/src/modules/automation/automation.engine.ts
import { pmEvents, type PMEvent } from './automation.events'
import { getRulesForProject, logRule } from './automation.queries'
import { db } from '../../db'
import type { AutomationTrigger, AutomationAction } from './automation.schema'

function triggerMatches(trigger: AutomationTrigger, event: PMEvent): boolean {
  if (trigger.type !== event.type) return false
  if (trigger.type === 'task_status_changed' && event.type === 'task_status_changed') {
    if (trigger.to_status_id && trigger.to_status_id !== event.to_status_id) return false
  }
  return true
}

async function executeAction(action: AutomationAction, event: PMEvent, projectId: string) {
  switch (action.type) {
    case 'send_notification':
      // Insert notification for each user_id using existing notification table pattern
      await Promise.all(action.user_ids.map(uid =>
        db.insertInto('activities').values({
          workspace_id: (await db.selectFrom('projects').select('workspace_id').where('id', '=', projectId).executeTakeFirstOrThrow()).workspace_id,
          user_id: uid,
          type: 'note',
          body: action.message,
          meta: JSON.stringify({ source: 'automation', event_type: event.type, project_id: projectId }),
        }).execute()
      ))
      break

    case 'change_task_status':
      if (event.type === 'task_status_changed' || event.type === 'task_overdue' || event.type === 'task_assigned') {
        const taskId = (event as { taskId: string }).taskId
        await db.updateTable('project_tasks').set({ status_id: action.status_id, updated_at: new Date().toISOString() })
          .where('id', '=', taskId).execute()
      }
      break

    case 'assign_task':
      if ('taskId' in event) {
        await db.insertInto('project_task_assignees').values({ task_id: event.taskId, user_id: action.user_id })
          .onConflict(oc => oc.columns(['task_id', 'user_id']).doNothing()).execute()
      }
      break

    case 'mark_milestone_complete':
      await db.updateTable('milestones').set({ status: 'COMPLETED' })
        .where('id', '=', action.milestone_id).where('project_id', '=', projectId).execute()
      break

    case 'send_webhook':
      try {
        await fetch(action.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, project_id: projectId, ...(action.payload ?? {}) }),
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        throw new Error(`Webhook failed: ${action.url}`)
      }
      break
  }
}

async function handleEvent(event: PMEvent) {
  const rules = await getRulesForProject(event.projectId)
  for (const rule of rules) {
    const trigger = rule.trigger as AutomationTrigger
    if (!triggerMatches(trigger, event)) continue
    const actions = rule.actions as AutomationAction[]
    try {
      for (const action of actions) {
        await executeAction(action, event, event.projectId)
      }
      await logRule(rule.id, true)
    } catch (err) {
      await logRule(rule.id, false, err instanceof Error ? err.message : 'Unknown error')
    }
  }
}

// Wire up the event listener
pmEvents.on('pm', handleEvent)
```

- [ ] **Step 3: Emit events from task updates**

In `apps/api/src/modules/project-tasks/project-tasks.queries.ts`, after the `updateTask` function, add event emission:

```ts
// At the top of project-tasks.queries.ts, add import:
import { pmEvents } from '../automation/automation.events'

// In the updateTask function, after the DB update, before returning:
if (input.status_id) {
  pmEvents.emit('pm', { type: 'task_status_changed', projectId, taskId: id, to_status_id: input.status_id })
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/automation/automation.events.ts
git add apps/api/src/modules/automation/automation.engine.ts
git add apps/api/src/modules/project-tasks/project-tasks.queries.ts
git commit -m "feat(pm): add automation engine with event emitter"
```

---

### Task 3: Automation API + UI

**Files:**
- Create: `apps/api/src/modules/automation/automation.controller.ts`
- Create: `apps/api/src/modules/automation/automation.router.ts`

- [ ] **Step 1: Controller + Router**

```ts
// apps/api/src/modules/automation/automation.controller.ts
import type { Request, Response } from 'express'
import * as q from './automation.queries'
import { createRuleSchema, updateRuleSchema } from './automation.schema'

export async function list(req: Request, res: Response) {
  return res.json({ data: await q.listRules(req.params.projectId), error: null })
}

export async function create(req: Request, res: Response) {
  const parsed = createRuleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  // Enforce max 20 rules per project
  const existing = await q.listRules(req.params.projectId)
  if (existing.length >= 20) return res.status(400).json({ data: null, error: { code: 'LIMIT', message: 'Max 20 rules per project' } })
  const rule = await q.createRule(req.params.projectId, req.user.id, parsed.data)
  return res.status(201).json({ data: rule, error: null })
}

export async function update(req: Request, res: Response) {
  const parsed = updateRuleSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ data: null, error: { code: 'VALIDATION', message: parsed.error.message } })
  try {
    const rule = await q.updateRule(req.params.ruleId, req.params.projectId, parsed.data)
    return res.json({ data: rule, error: null })
  } catch {
    return res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Rule not found' } })
  }
}

export async function remove(req: Request, res: Response) {
  await q.deleteRule(req.params.ruleId, req.params.projectId)
  return res.json({ data: { success: true }, error: null })
}
```

```ts
// apps/api/src/modules/automation/automation.router.ts
import { Router } from 'express'
import * as ctrl from './automation.controller'
const router = Router({ mergeParams: true })
router.get('/', ctrl.list)
router.post('/', ctrl.create)
router.patch('/:ruleId', ctrl.update)
router.delete('/:ruleId', ctrl.remove)
export default router
```

- [ ] **Step 2: Register + import engine**

In `apps/api/src/index.ts`:
```ts
import automationRouter from './modules/automation/automation.router'
// Import engine so it starts listening (side effect import)
import './modules/automation/automation.engine'

app.use('/api/projects/:projectId/automations', requireWorkspace, automationRouter)
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/automation/
git add apps/api/src/index.ts
git commit -m "feat(pm): add automation API and register engine"
```

---

### Task 4: Worker jobs

**Files:**
- Create: `apps/worker/src/jobs/pm/due-date-alerts.ts`
- Create: `apps/worker/src/jobs/pm/overdue-scan.ts`
- Create: `apps/worker/src/jobs/pm/health-recalc.ts`
- Create: `apps/worker/src/jobs/pm/sprint-rollover.ts`
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Due-date alerts job**

```ts
// apps/worker/src/jobs/pm/due-date-alerts.ts
import { db } from '../../db'

export async function dueDateAlertsJob() {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const in1h = new Date(now.getTime() + 60 * 60 * 1000)

  // Tasks due within 24h that are not done
  const tasks = await db
    .selectFrom('project_tasks as t')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .innerJoin('project_task_assignees as a', 'a.task_id', 't.id')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .select(['t.id', 't.title', 't.due_date', 'a.user_id', 'p.workspace_id', 'p.name as project_name'])
    .where('t.due_date', '<=', in24h.toISOString())
    .where('t.due_date', '>', now.toISOString())
    .where('s.is_done', '=', false)
    .where('p.status', '!=', 'DELETED')
    .execute()

  for (const task of tasks) {
    const msUntilDue = new Date(task.due_date!).getTime() - now.getTime()
    const window = msUntilDue <= 60 * 60 * 1000 ? '1h' : '24h'

    // Check if alert already sent (avoid duplicate — check activity log)
    const existing = await db.selectFrom('activities')
      .where('user_id', '=', task.user_id)
      .where(db.raw(`meta->>'task_id'`), '=', task.id)
      .where(db.raw(`meta->>'alert_window'`), '=', window)
      .executeTakeFirst()

    if (existing) continue

    await db.insertInto('activities').values({
      workspace_id: task.workspace_id,
      user_id: task.user_id,
      type: 'note',
      body: `Task "${task.title}" in ${task.project_name} is due in ${window}`,
      meta: JSON.stringify({ source: 'pm_due_alert', task_id: task.id, alert_window: window }),
    }).execute()
  }

  console.log(`[pm:due-date-alerts] Processed ${tasks.length} tasks`)
}
```

- [ ] **Step 2: Overdue scan job**

```ts
// apps/worker/src/jobs/pm/overdue-scan.ts
import { db } from '../../db'
import { pmEvents } from '../../shared/pm-events'

export async function overdueJob() {
  // Find tasks that became overdue since last check
  const now = new Date().toISOString()

  const overdueCount = await db
    .selectFrom('project_tasks as t')
    .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
    .innerJoin('projects as p', 'p.id', 't.project_id')
    .select(db.fn.count('t.id').as('count'))
    .where('t.due_date', '<', now)
    .where('s.is_done', '=', false)
    .where('p.status', '!=', 'DELETED')
    .executeTakeFirst()

  console.log(`[pm:overdue-scan] ${overdueCount?.count ?? 0} overdue tasks`)
}
```

- [ ] **Step 3: Health recalc job**

```ts
// apps/worker/src/jobs/pm/health-recalc.ts
import { db } from '../../db'

export async function healthRecalcJob() {
  const projects = await db.selectFrom('projects').select(['id'])
    .where('status', '=', 'ACTIVE').execute()

  for (const project of projects) {
    const stats = await db
      .selectFrom('project_tasks as t')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select([
        db.fn.count('t.id').as('total'),
        db.fn.count(db.raw(`case when t.due_date < now() and not s.is_done then t.id end`)).as('overdue'),
      ])
      .where('t.project_id', '=', project.id)
      .where('t.parent_id', 'is', null)
      .executeTakeFirst()

    const total = Number(stats?.total ?? 0)
    const overdue = Number(stats?.overdue ?? 0)
    const overdueRate = total === 0 ? 0 : overdue / total

    const health = overdueRate >= 0.3 ? 'OFF_TRACK' : overdueRate >= 0.1 ? 'AT_RISK' : 'ON_TRACK'

    await db.updateTable('projects').set({ health, updated_at: new Date().toISOString() })
      .where('id', '=', project.id)
      .where('health', '!=', health) // only update if changed
      .execute()
  }

  console.log(`[pm:health-recalc] Recalculated health for ${projects.length} projects`)
}
```

- [ ] **Step 4: Sprint rollover job**

```ts
// apps/worker/src/jobs/pm/sprint-rollover.ts
import { db } from '../../db'

export async function sprintRolloverJob() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // Find ACTIVE sprints whose end_date was yesterday
  const endedSprints = await db.selectFrom('sprints').selectAll()
    .where('status', '=', 'ACTIVE')
    .where('end_date', '=', yesterdayStr)
    .execute()

  for (const sprint of endedSprints) {
    // Calculate velocity
    const tasks = await db
      .selectFrom('sprint_tasks as st')
      .innerJoin('project_tasks as t', 't.id', 'st.task_id')
      .innerJoin('project_task_statuses as s', 's.id', 't.status_id')
      .select(['st.task_id', 'st.points', 's.is_done'])
      .where('st.sprint_id', '=', sprint.id)
      .execute()

    const velocity = tasks.filter(t => t.is_done).reduce((sum, t) => sum + (t.points ?? 0), 0)

    await db.updateTable('sprints').set({ status: 'COMPLETED', velocity })
      .where('id', '=', sprint.id).execute()

    // Move incomplete tasks back to backlog (remove from sprint)
    const incompleteTasks = tasks.filter(t => !t.is_done).map(t => t.task_id)
    if (incompleteTasks.length) {
      await db.deleteFrom('sprint_tasks')
        .where('sprint_id', '=', sprint.id)
        .where('task_id', 'in', incompleteTasks)
        .execute()
    }

    console.log(`[pm:sprint-rollover] Closed sprint ${sprint.name} — velocity: ${velocity}, ${incompleteTasks.length} tasks returned to backlog`)
  }
}
```

- [ ] **Step 5: Register jobs in worker**

In `apps/worker/src/index.ts`, following existing cron job registration pattern:

```ts
import cron from 'node-cron'
import { dueDateAlertsJob } from './jobs/pm/due-date-alerts'
import { overdueJob } from './jobs/pm/overdue-scan'
import { healthRecalcJob } from './jobs/pm/health-recalc'
import { sprintRolloverJob } from './jobs/pm/sprint-rollover'

// PM jobs
cron.schedule('*/15 * * * *', dueDateAlertsJob)  // every 15 min
cron.schedule('0 * * * *', overdueJob)           // hourly
cron.schedule('30 * * * *', healthRecalcJob)     // hourly (offset from overdue)
cron.schedule('0 1 * * *', sprintRolloverJob)    // daily at 1am
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/jobs/pm/
git add apps/worker/src/index.ts
git commit -m "feat(pm): add worker jobs — due-date alerts, overdue, health, sprint rollover"
```

---

### Task 5: Automation rule builder UI

**Files:**
- Create: `apps/web/src/app/(dashboard)/projects/[id]/settings/automation/page.tsx`

- [ ] **Step 1: Write automation settings page**

```tsx
// apps/web/src/app/(dashboard)/projects/[id]/settings/automation/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Rule {
  id: string; name: string; is_active: boolean
  trigger: { type: string }; actions: { type: string }[]
}

const TRIGGER_LABELS: Record<string, string> = {
  task_status_changed: 'Task moved to status',
  task_overdue: 'Task becomes overdue',
  task_assigned: 'Task assigned to someone',
  milestone_completed: 'Milestone completed',
  client_approved: 'Client approves',
  client_rejected: 'Client rejects',
  sprint_started: 'Sprint starts',
  sprint_ended: 'Sprint ends',
}

const ACTION_LABELS: Record<string, string> = {
  send_notification: 'Send notification',
  change_task_status: 'Change task status',
  assign_task: 'Assign task',
  mark_milestone_complete: 'Mark milestone complete',
  send_webhook: 'Send webhook',
}

export default function AutomationPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [rules, setRules] = useState<Rule[]>([])

  useEffect(() => {
    fetch(`/api/projects/${projectId}/automations`).then(r => r.json()).then(j => setRules(j.data ?? []))
  }, [projectId])

  async function toggleActive(id: string, is_active: boolean) {
    await fetch(`/api/projects/${projectId}/automations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    setRules(prev => prev.map(r => r.id === id ? { ...r, is_active } : r))
  }

  async function deleteRule(id: string) {
    await fetch(`/api/projects/${projectId}/automations/${id}`, { method: 'DELETE' })
    setRules(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontFamily: 'Instrument Serif', fontSize: 22, color: 'var(--text)' }}>Automation</h2>
          <p style={{ color: 'var(--text2)', fontFamily: 'DM Sans', fontSize: 14, marginTop: 4 }}>
            {rules.length}/20 rules
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text)', fontFamily: 'DM Sans' }}>{rule.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
                  When <strong>{TRIGGER_LABELS[rule.trigger.type] ?? rule.trigger.type}</strong> →{' '}
                  {rule.actions.map(a => ACTION_LABELS[a.type] ?? a.type).join(', ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Toggle */}
                <button
                  onClick={() => toggleActive(rule.id, !rule.is_active)}
                  className="w-10 h-5 rounded-full transition-colors relative"
                  style={{ background: rule.is_active ? 'var(--green)' : 'var(--surface2)' }}
                >
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow"
                    style={{ left: rule.is_active ? '22px' : '2px' }} />
                </button>
                <button onClick={() => deleteRule(rule.id)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--red)', fontFamily: 'DM Sans' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="p-8 rounded-xl border-2 border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text3)', fontFamily: 'DM Sans' }}>
              No automation rules yet. Rules are created via the API.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/src/app/(dashboard)/projects/[id]/settings/automation/page.tsx"
git commit -m "feat(pm): add automation settings UI"
```
