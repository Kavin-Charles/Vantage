# Project Management Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Project Management module with rich task creation, assignee display, nav expansion (primary + "More ▾"), and UI cleanup — all frontend-only.

**Architecture:** Five focused changes: (1) expand `ProjectNav` with primary tabs + overflow dropdown, (2) upgrade `pmApi.createTask` and `listTasks` types, (3) new shared `AvatarGroup` component, (4) new `TaskCreateModal` component, (5) wire both into board/list/table views with card polish. Backend already supports all fields — no API changes.

**Tech Stack:** Next.js App Router, React, TypeScript strict, @tanstack/react-query, design tokens (CSS vars), DM Sans + Instrument Serif fonts.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `apps/web/app/(dashboard)/projects/[id]/ProjectNav.tsx` | Primary tabs + "More ▾" dropdown |
| Modify | `apps/web/modules/projects/lib/api.ts` | `createTask` body type, `listMembers`, fix `listTasks` → `TaskWithAssignees[]` |
| Create | `apps/web/modules/projects/components/AvatarGroup.tsx` | Stacked initials circles with tooltip |
| Create | `apps/web/modules/projects/components/TaskCreateModal.tsx` | Rich creation modal with assignee picker |
| Modify | `apps/web/modules/projects/pages/ProjectBoardPage.tsx` | Polish cards, AvatarGroup, TaskCreateModal |
| Modify | `apps/web/modules/projects/pages/ProjectListPage.tsx` | Assignees column, TaskCreateModal, type fix |
| Modify | `apps/web/modules/projects/pages/TablePage.tsx` | Assignees column |
| Modify | `apps/web/app/(dashboard)/projects/[id]/layout.tsx` | Progress bar height, breadcrumb color |

---

## Task 1: Update API Client

**Files:**
- Modify: `apps/web/modules/projects/lib/api.ts`

- [ ] **Step 1: Add `ProjectMember` type, fix `listTasks` return type, update `createTask` body, add `listMembers`**

Replace the entire file with this updated version:

```ts
import { apiFetch } from '@/modules/shared/lib/api';

export interface Project {
  id: string; workspace_id: string; name: string; description: string | null;
  cover_image: string | null; color: string | null; status: string; health: string;
  start_date: string | null; end_date: string | null; budget: string | null;
  created_by: string; created_at: string; updated_at: string;
}
export interface ProjectWithProgress extends Project { progress: number }
export interface TaskStatus { id: string; project_id: string; name: string; color: string; position: number; is_done: boolean }
export interface Task {
  id: string; project_id: string; parent_id: string | null; status_id: string; title: string;
  description: string | null; priority: string; due_date: string | null; start_date: string | null;
  estimate_hours: string | null; estimated_minutes: number | null;
  client_visible: boolean; position: number; created_at: string; updated_at: string;
}
export interface TaskWithAssignees extends Task { assignees: { id: string; name: string; email: string }[] }
export interface Comment { id: string; task_id: string; body: string | null; parent_id: string | null; created_at: string; author_name: string | null }
export interface ProjectMember { id: string; project_id: string; user_id: string; role: string; joined_at: string; name: string | null; email: string | null }

export interface Milestone {
  id: string; project_id: string; name: string; description: string | null;
  due_date: string; status: string; client_visible: boolean; position: number;
}

export interface CreateTaskBody {
  title: string;
  status_id?: string;
  priority?: string;
  assignee_ids?: string[];
  due_date?: string | null;
}

export const pmApi = {
  listMilestones: (token: string, projectId: string) =>
    apiFetch<{ data: Milestone[] }>(`/api/projects/${projectId}/milestones`, { token }),
  createMilestone: (token: string, projectId: string, body: { name: string; due_date: string; description?: string; client_visible?: boolean }) =>
    apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateMilestone: (token: string, projectId: string, milestoneId: string, body: Partial<Milestone>) =>
    apiFetch<{ data: Milestone }>(`/api/projects/${projectId}/milestones/${milestoneId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  listProjects: (token: string, params?: Record<string, string>) =>
    apiFetch<{ data: ProjectWithProgress[] }>(`/api/projects${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getProject: (token: string, id: string) =>
    apiFetch<{ data: ProjectWithProgress }>(`/api/projects/${id}`, { token }),
  createProject: (token: string, body: { name: string; color?: string; start_date?: string; end_date?: string }) =>
    apiFetch<{ data: Project }>('/api/projects', { token, method: 'POST', body: JSON.stringify(body) }),
  updateProject: (token: string, id: string, body: Partial<Project>) =>
    apiFetch<{ data: Project }>(`/api/projects/${id}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteProject: (token: string, id: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${id}`, { token, method: 'DELETE' }),
  listStatuses: (token: string, projectId: string) =>
    apiFetch<{ data: TaskStatus[] }>(`/api/projects/${projectId}/tasks/statuses`, { token }),
  listTasks: (token: string, projectId: string, params?: Record<string, string>) =>
    apiFetch<{ data: TaskWithAssignees[] }>(`/api/projects/${projectId}/tasks${params ? '?' + new URLSearchParams(params) : ''}`, { token }),
  getTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: TaskWithAssignees }>(`/api/projects/${projectId}/tasks/${taskId}`, { token }),
  createTask: (token: string, projectId: string, body: CreateTaskBody) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks`, { token, method: 'POST', body: JSON.stringify(body) }),
  updateTask: (token: string, projectId: string, taskId: string, body: Partial<Task>) =>
    apiFetch<{ data: Task }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'PATCH', body: JSON.stringify(body) }),
  deleteTask: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: { success: boolean } }>(`/api/projects/${projectId}/tasks/${taskId}`, { token, method: 'DELETE' }),
  listComments: (token: string, projectId: string, taskId: string) =>
    apiFetch<{ data: Comment[] }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token }),
  createComment: (token: string, projectId: string, taskId: string, body: string) =>
    apiFetch<{ data: Comment }>(`/api/projects/${projectId}/tasks/${taskId}/comments`, { token, method: 'POST', body: JSON.stringify({ body }) }),
  listMembers: (token: string, projectId: string) =>
    apiFetch<{ data: ProjectMember[] }>(`/api/projects/${projectId}/members`, { token }),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `api.ts`. Fix any type mismatches before continuing.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/lib/api.ts
git commit -m "feat(pm): update pmApi types — rich createTask body, TaskWithAssignees list, listMembers"
```

---

## Task 2: AvatarGroup Component

**Files:**
- Create: `apps/web/modules/projects/components/AvatarGroup.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';

interface Assignee { id: string; name: string; email: string }

interface Props {
  assignees: Assignee[];
  max?: number;
  size?: number;
}

const PALETTE = ['#d8f3dc', '#dbeafe', '#fef3c7', '#fee2e2', '#ede9fe', '#fce7f3'];
const PALETTE_TEXT = ['#1b4332', '#1e3a8a', '#78350f', '#7f1d1d', '#4c1d95', '#831843'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function hashIndex(str: string, len: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % len;
}

function Avatar({ assignee, size, zIndex }: { assignee: Assignee; size: number; zIndex: number }) {
  const [showTip, setShowTip] = useState(false);
  const idx = hashIndex(assignee.id, PALETTE.length);
  const bg = PALETTE[idx]!;
  const color = PALETTE_TEXT[idx]!;

  return (
    <div
      style={{ position: 'relative', zIndex }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, color, fontSize: size * 0.38,
        fontFamily: 'DM Sans', fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid var(--surface)',
        flexShrink: 0, userSelect: 'none',
      }}>
        {initials(assignee.name || assignee.email)}
      </div>
      {showTip && (
        <div style={{
          position: 'absolute', bottom: size + 6, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--text)', color: '#fff',
          fontFamily: 'DM Sans', fontSize: 11, padding: '3px 8px',
          borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
          opacity: showTip ? 1 : 0,
          transition: 'opacity 0.1s ease',
          zIndex: 100,
        }}>
          {assignee.name || assignee.email}
        </div>
      )}
    </div>
  );
}

export function AvatarGroup({ assignees, max = 3, size = 24 }: Props) {
  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;
  const totalWidth = visible.length * (size - 6) + (overflow > 0 ? size - 6 : 0) + 6;

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: totalWidth, flexShrink: 0 }}>
      {visible.map((a, i) => (
        <div key={a.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar assignee={a} size={size} zIndex={visible.length - i} />
        </div>
      ))}
      {overflow > 0 && (
        <div style={{
          marginLeft: -6,
          width: size, height: size, borderRadius: '50%',
          background: 'var(--surface2)', color: 'var(--text3)',
          fontSize: size * 0.36, fontFamily: 'DM Sans', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--surface)', flexShrink: 0,
        }}>
          +{overflow}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep AvatarGroup
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/AvatarGroup.tsx
git commit -m "feat(pm): add AvatarGroup component with tooltip and overflow"
```

---

## Task 3: TaskCreateModal Component

**Files:**
- Create: `apps/web/modules/projects/components/TaskCreateModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskStatus, type ProjectMember } from '@/modules/projects/lib/api';
import { AvatarGroup } from './AvatarGroup';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
type Priority = typeof PRIORITIES[number];

interface Props {
  projectId: string;
  defaultStatusId?: string;
  onClose: () => void;
}

export function TaskCreateModal({ projectId, defaultStatusId, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [statusId, setStatusId] = useState(defaultStatusId ?? '');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const res = await pmApi.listStatuses(await getToken(), projectId);
      return res.data ?? [];
    },
  });

  const { data: members = [] } = useQuery<ProjectMember[]>({
    queryKey: ['members', projectId],
    queryFn: async () => {
      const res = await pmApi.listMembers(await getToken(), projectId);
      return res.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return pmApi.createTask(token, projectId, {
        title: title.trim(),
        status_id: statusId || statuses[0]?.id,
        priority,
        assignee_ids: selectedIds,
        due_date: dueDate || null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      onClose();
    },
  });

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 150);
  }

  function toggleMember(userId: string) {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }

  const selectedAssignees = members
    .filter(m => selectedIds.includes(m.user_id))
    .map(m => ({ id: m.user_id, name: m.name ?? '', email: m.email ?? '' }));

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
    fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--bg)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.15s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: `rgba(0,0,0,${visible ? 0.3 : 0})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 520, background: 'var(--surface)', borderRadius: 12,
          border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Instrument Serif', fontSize: 18, color: 'var(--text)' }}>New Task</span>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 18, lineHeight: 1, padding: 4,
              transition: 'color 0.15s ease',
            }}
          >×</button>
        </div>

        {/* Title */}
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) createMutation.mutate(); }}
            placeholder="Task title…"
            style={inputStyle}
          />
        </div>

        {/* Status + Priority row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select
              value={statusId}
              onChange={e => setStatusId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {statuses.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  style={{
                    flex: 1, padding: '7px 0', border: '1px solid var(--border)',
                    borderRadius: 6, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    background: priority === p ? 'var(--text)' : 'var(--bg)',
                    color: priority === p ? '#fff' : 'var(--text3)',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Assignees */}
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>Assignees</label>
          <button
            onClick={() => setMemberPickerOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px',
              background: 'var(--bg)', cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s ease',
            }}
          >
            {selectedAssignees.length > 0
              ? <AvatarGroup assignees={selectedAssignees} size={22} />
              : <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>Select members…</span>
            }
          </button>
          {memberPickerOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              opacity: memberPickerOpen ? 1 : 0,
              transform: memberPickerOpen ? 'translateY(0)' : 'translateY(-4px)',
              transition: 'opacity 0.12s ease, transform 0.12s ease',
              maxHeight: 200, overflowY: 'auto',
            }}>
              {members.length === 0 && (
                <div style={{ padding: '12px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
                  No members in this project.
                </div>
              )}
              {members.map(m => {
                const selected = selectedIds.includes(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleMember(m.user_id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 14px', background: selected ? 'var(--surface2)' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--surface2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text2)', flexShrink: 0,
                    }}>
                      {((m.name ?? m.email ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('')).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', fontWeight: selected ? 600 : 400 }}>
                        {m.name ?? 'Unknown'}
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
                    </div>
                    {selected && (
                      <span style={{ marginLeft: 'auto', color: 'var(--text)', fontSize: 14 }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Due Date */}
        <div>
          <label style={labelStyle}>Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 8,
              background: 'none', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text2)', cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', border: 'none', borderRadius: 8,
              background: canSubmit ? 'var(--text)' : 'var(--surface2)',
              color: canSubmit ? '#fff' : 'var(--text3)',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {createMutation.isPending ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep TaskCreateModal
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/components/TaskCreateModal.tsx
git commit -m "feat(pm): add TaskCreateModal with assignee picker, priority, due date"
```

---

## Task 4: Expand ProjectNav

**Files:**
- Modify: `apps/web/app/(dashboard)/projects/[id]/ProjectNav.tsx`

- [ ] **Step 1: Replace ProjectNav with primary tabs + "More ▾" dropdown**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

const PRIMARY_NAV = [
  { href: 'tasks',      label: 'Tasks'      },
  { href: 'roadmap',    label: 'Roadmap'    },
  { href: 'milestones', label: 'Milestones' },
  { href: 'members',    label: 'Members'    },
  { href: 'docs',       label: 'Docs'       },
];

const MORE_NAV = [
  { href: 'sprints',    label: 'Sprints'    },
  { href: 'analytics',  label: 'Analytics'  },
  { href: 'portal',     label: 'Portal'     },
  { href: 'automation', label: 'Automation' },
  { href: 'settings',   label: 'Settings'   },
];

export function ProjectNav({ id }: { id: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const activeInMore = MORE_NAV.some(n => pathname.includes(`/projects/${id}/${n.href}`));

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
    padding: '8px 14px', textDecoration: 'none', display: 'inline-block',
    color: active ? 'var(--text)' : 'var(--text2)',
    borderBottom: `2px solid ${active ? 'var(--text)' : 'transparent'}`,
    transition: 'color 0.15s ease, border-color 0.15s ease',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'center', overflowX: 'auto' }}>
      {PRIMARY_NAV.map(n => {
        const active = pathname.includes(`/projects/${id}/${n.href}`);
        return (
          <Link key={n.href} href={`/projects/${id}/${n.href}`} style={tabStyle(active)}>
            {n.label}
          </Link>
        );
      })}

      {/* More dropdown */}
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            ...tabStyle(activeInMore),
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${activeInMore ? 'var(--text)' : 'transparent'}`,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          More
          <span style={{
            fontSize: 10, display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}>▾</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            minWidth: 140, overflow: 'hidden',
            animation: 'pmDropdownIn 0.12s ease forwards',
          }}>
            <style>{`
              @keyframes pmDropdownIn {
                from { opacity: 0; transform: translateY(-4px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            {MORE_NAV.map(n => {
              const active = pathname.includes(`/projects/${id}/${n.href}`);
              return (
                <Link
                  key={n.href}
                  href={`/projects/${id}/${n.href}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'block', padding: '10px 16px',
                    fontFamily: 'DM Sans', fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? 'var(--text)' : 'var(--text2)',
                    textDecoration: 'none',
                    background: active ? 'var(--surface2)' : 'transparent',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep ProjectNav
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/projects/\[id\]/ProjectNav.tsx
git commit -m "feat(pm): expand nav — primary tabs + More dropdown with all project sections"
```

---

## Task 5: Polish ProjectBoardPage

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectBoardPage.tsx`

- [ ] **Step 1: Replace file with polished version**

Key changes from original:
- `TaskCard` uses `TaskWithAssignees` (not `Task`), shows `AvatarGroup` bottom-right
- `AddTaskInline` replaced by "+ Add task" button that opens `TaskCreateModal`
- Card hover uses CSS `transition`
- Due date shows in red if overdue

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { pmApi, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';
import { TaskCreateModal } from '@/modules/projects/components/TaskCreateModal';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};

function TaskCard({
  task,
  onClick,
  onDragStart,
}: {
  task: TaskWithAssignees;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const now = new Date();
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const overdue = dueDate && dueDate < now;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--surface2)' : 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 12px', cursor: 'pointer', marginBottom: 8,
        boxShadow: hover ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
        transition: 'background 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.4, flex: 1 }}>
          {task.title}
        </p>
        {task.priority && task.priority !== 'NONE' && (
          <span style={{
            fontFamily: 'DM Sans', fontSize: 10, color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)',
            fontWeight: 700, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em',
          }}>
            {task.priority}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {dueDate ? (
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400 }}>
            {dueDate.toLocaleDateString()}
          </span>
        ) : <span />}
        {task.assignees.length > 0 && (
          <AvatarGroup assignees={task.assignees} size={22} max={3} />
        )}
      </div>
    </div>
  );
}

export default function ProjectBoardPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignees | null>(null);
  const [createForStatus, setCreateForStatus] = useState<string | null>(null);

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const res = await pmApi.listStatuses(await getToken(), projectId);
      return res.data ?? [];
    },
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery<TaskWithAssignees[]>({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await pmApi.listTasks(await getToken(), projectId);
      return res.data ?? [];
    },
    enabled: !!projectId,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<TaskWithAssignees> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  function handleDrop(e: React.DragEvent, statusId: string) {
    e.preventDefault();
    if (draggedTaskId) {
      updateMutation.mutate({ taskId: draggedTaskId, patch: { status_id: statusId } });
      setDraggedTaskId(null);
    }
  }

  async function openTask(task: TaskWithAssignees) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, task.id);
    setSelectedTask(res.data);
  }

  return (
    <div style={{ padding: 20, overflowX: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 'max-content' }}>
        {statuses.map(status => {
          const columnTasks = tasks.filter(t => t.status_id === status.id).sort((a, b) => a.position - b.position);
          return (
            <div
              key={status.id}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, status.id)}
              style={{ width: 270, background: 'var(--bg)', borderRadius: 14, padding: 12, flexShrink: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{status.name}</span>
                <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', borderRadius: 10, padding: '1px 7px' }}>
                  {columnTasks.length}
                </span>
              </div>

              {columnTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => void openTask(task)}
                  onDragStart={() => setDraggedTaskId(task.id)}
                />
              ))}

              <button
                onClick={() => setCreateForStatus(status.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px dashed var(--border)', borderRadius: 8,
                  padding: '7px 10px', cursor: 'pointer', color: 'var(--text3)',
                  fontFamily: 'DM Sans', fontSize: 12,
                  transition: 'border-color 0.15s ease, color 0.15s ease',
                }}
              >
                <Icon name="plus" size={13} /> Add task
              </button>
            </div>
          );
        })}

        {statuses.length === 0 && (
          <div style={{ color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 14, padding: '40px 0' }}>
            No statuses configured for this project.
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => setSelectedTask(prev => prev ? { ...prev, ...patch } : null)}
        />
      )}

      {createForStatus && (
        <TaskCreateModal
          projectId={projectId}
          defaultStatusId={createForStatus}
          onClose={() => setCreateForStatus(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep BoardPage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectBoardPage.tsx
git commit -m "feat(pm): polish board cards — assignee avatars, transitions, TaskCreateModal"
```

---

## Task 6: Update ProjectListPage

**Files:**
- Modify: `apps/web/modules/projects/pages/ProjectListPage.tsx`

- [ ] **Step 1: Update to use `TaskWithAssignees`, add AvatarGroup in Assignees column, wire TaskCreateModal**

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { TaskDetailPanel } from '@/modules/projects/components/TaskDetailPanel';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';
import { TaskCreateModal } from '@/modules/projects/components/TaskCreateModal';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'var(--text3)', MEDIUM: 'var(--amber)', HIGH: 'var(--red)', URGENT: 'var(--red)',
};

export default function ProjectListPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('ALL');
  const [selectedTask, setSelectedTask] = useState<TaskWithAssignees | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: statuses = [] } = useQuery<TaskStatus[]>({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const res = await pmApi.listStatuses(await getToken(), projectId);
      return res.data ?? [];
    },
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery<TaskWithAssignees[]>({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await pmApi.listTasks(await getToken(), projectId);
      return res.data ?? [];
    },
    enabled: !!projectId,
  });

  const filtered = filter === 'ALL' ? tasks : tasks.filter(t => t.status_id === filter);

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: Partial<TaskWithAssignees> }) => {
      const token = await getToken();
      return pmApi.updateTask(token, projectId, taskId, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  async function openTask(task: TaskWithAssignees) {
    const token = await getToken();
    const res = await pmApi.getTask(token, projectId, task.id);
    setSelectedTask(res.data);
  }

  const thStyle: React.CSSProperties = {
    fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px',
    textAlign: 'left', borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Filter bar + Add button */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        {[{ id: 'ALL', name: 'All', color: '' }, ...statuses].map(s => (
          <button
            key={s.id}
            onClick={() => setFilter(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)',
              background: filter === s.id ? 'var(--text)' : 'var(--surface)',
              color: filter === s.id ? '#fff' : 'var(--text2)',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {s.color && s.id !== 'ALL' && (
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
            )}
            {s.name}
          </button>
        ))}
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: 'var(--text)', color: '#fff',
            fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            transition: 'opacity 0.15s ease',
          }}
        >
          + Add Task
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '38%' }}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Due Date</th>
              <th style={{ ...thStyle, width: 100 }}>Assignees</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 14px', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text3)' }}>
                  No tasks found.
                </td>
              </tr>
            ) : filtered.map(task => {
              const status = statuses.find(s => s.id === task.status_id);
              const now = new Date();
              const dueDate = task.due_date ? new Date(task.due_date) : null;
              const overdue = dueDate && dueDate < now && !status?.is_done;
              return (
                <tr
                  key={task.id}
                  onClick={() => void openTask(task)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)' }}>
                    {task.title}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {status ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text2)' }}>{status.name}</span>
                      </div>
                    ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, color: PRIORITY_COLORS[task.priority] ?? 'var(--text3)' }}>
                    {task.priority === 'NONE' ? '—' : task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: 'DM Sans', fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400 }}>
                    {dueDate ? dueDate.toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '11px 14px', width: 100 }}>
                    {task.assignees.length > 0
                      ? <AvatarGroup assignees={task.assignees} size={22} max={3} />
                      : <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          projectId={projectId}
          task={selectedTask}
          statuses={statuses}
          onClose={() => setSelectedTask(null)}
          onUpdate={patch => {
            setSelectedTask(prev => prev ? { ...prev, ...patch } : null);
            updateMutation.mutate({ taskId: selectedTask.id, patch });
          }}
        />
      )}

      {createOpen && (
        <TaskCreateModal
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep ListPage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/ProjectListPage.tsx
git commit -m "feat(pm): list view — assignee column, TaskCreateModal, transition polish"
```

---

## Task 7: Update TablePage

**Files:**
- Modify: `apps/web/modules/projects/pages/TablePage.tsx`

- [ ] **Step 1: Add Assignees column, fix type to `TaskWithAssignees`, remove zebra striping**

Replace the import line and the `tasks` variable type, add `AvatarGroup` import, add "Assignees" to columns, update `<tbody>` to render assignees:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi, type TaskWithAssignees, type TaskStatus } from '@/modules/projects/lib/api';
import { AvatarGroup } from '@/modules/projects/components/AvatarGroup';

const PRIORITY_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  URGENT: { label: 'Urgent', color: 'var(--red)',   bg: 'var(--red-bg, #fee2e2)'   },
  HIGH:   { label: 'High',   color: 'var(--red)',   bg: 'var(--red-bg, #fee2e2)'   },
  MEDIUM: { label: 'Medium', color: 'var(--amber)', bg: 'var(--amber-bg, #fef3c7)' },
  LOW:    { label: 'Low',    color: 'var(--text3)', bg: 'var(--surface2)'           },
  NONE:   { label: '—',      color: 'var(--text3)', bg: 'transparent'               },
};

export default function TablePage() {
  const { id: projectId } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listTasks(token, projectId);
      return res.data;
    },
  });

  const { data: statusesData } = useQuery({
    queryKey: ['statuses', projectId],
    queryFn: async () => {
      const token = await getToken();
      const res = await pmApi.listStatuses(token, projectId);
      return res.data;
    },
  });

  const tasks: TaskWithAssignees[] = tasksData ?? [];
  const statuses: TaskStatus[] = statusesData ?? [];
  const statusMap: Record<string, TaskStatus> = {};
  for (const s of statuses) statusMap[s.id] = s;

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || t.status_id === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [tasks, search, statusFilter]);

  const now = new Date();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{
            border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
            fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--surface2)',
            outline: 'none', width: 200, transition: 'border-color 0.15s ease',
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
            fontFamily: 'DM Sans', fontSize: 13, color: 'var(--text)', background: 'var(--surface2)',
            outline: 'none',
          }}
        >
          <option value="">All statuses</option>
          {statuses.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--text3)' }}>
          {filtered.length} task{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tasksLoading ? (
          <div style={{ padding: 32, fontFamily: 'DM Sans', color: 'var(--text3)' }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                {['Task', 'Status', 'Priority', 'Due Date', 'Est.', 'Assignees'].map(col => (
                  <th
                    key={col}
                    style={{
                      padding: '8px 16px', textAlign: 'left', fontSize: 11,
                      fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => {
                const status = statusMap[task.status_id];
                const priority = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE['NONE']!;
                const dueDate = task.due_date ? new Date(task.due_date) : null;
                const overdue = dueDate && dueDate < now && !(status?.is_done);
                const estHours = task.estimated_minutes ? `${Math.round(task.estimated_minutes / 60)}h` : '—';

                return (
                  <tr
                    key={task.id}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text)', maxWidth: 320 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {task.title}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {status && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                          {status.name}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: priority.color, background: priority.bg, padding: '2px 6px', borderRadius: 4 }}>
                        {priority.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {dueDate ? (
                        <span style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text2)', fontWeight: overdue ? 600 : 400 }}>
                          {dueDate.toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {estHours}
                    </td>
                    <td style={{ padding: '10px 16px', width: 100 }}>
                      {task.assignees.length > 0
                        ? <AvatarGroup assignees={task.assignees} size={22} max={3} />
                        : <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
                      }
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    No tasks match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep TablePage
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/modules/projects/pages/TablePage.tsx
git commit -m "feat(pm): table view — assignees column, remove zebra, hover transitions"
```

---

## Task 8: Polish Project Layout Header

**Files:**
- Modify: `apps/web/app/(dashboard)/projects/[id]/layout.tsx`

- [ ] **Step 1: Update breadcrumb color and progress bar height**

In `layout.tsx`, make two targeted edits:

**Edit 1** — breadcrumb link color `var(--text3)` → `var(--text2)`:
```tsx
// Find this:
style={{ color: 'var(--text3)', fontSize: 13, fontFamily: 'DM Sans', textDecoration: 'none' }}
// Change to:
style={{ color: 'var(--text2)', fontSize: 13, fontFamily: 'DM Sans', textDecoration: 'none' }}
```

**Edit 2** — progress bar container height 4px → 6px, inner bar height 4px → 6px:
```tsx
// Find this:
<div style={{ height: 4, width: 100, background: 'var(--surface2)', borderRadius: 2 }}>
  <div style={{
    height: '100%', borderRadius: 2,
// Change to:
<div style={{ height: 6, width: 100, background: 'var(--surface2)', borderRadius: 3 }}>
  <div style={{
    height: '100%', borderRadius: 3,
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/projects/\[id\]/layout.tsx
git commit -m "feat(pm): header polish — breadcrumb color, wider progress bar"
```

---

## Final Verification

- [ ] Start dev server: `pnpm dev` from repo root
- [ ] Open a project → verify 5 primary tabs visible + "More ▾" dropdown shows remaining tabs
- [ ] Click "+ Add task" on board → modal opens with animation, fields work, create succeeds
- [ ] Created task appears in board with AvatarGroup if assignees selected
- [ ] List view shows Assignees column with avatars
- [ ] Table view shows Assignees column with avatars
- [ ] Hover on avatar → tooltip shows full name
- [ ] All transitions feel smooth (no flicker, no layout shift)
- [ ] Escape closes modal without saving
