'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FluidModal, FluidInput, FluidSelect, FluidButton } from '@/modules/shared/fluid/ui'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'

type Source = 'general' | 'contact' | 'project'

interface WorkspaceUser { id: string; name: string; email: string }
interface ContactItem { id: string; name: string }
interface ProjectItem { id: string; name: string }

interface Props {
  onClose: () => void
}

export function AddTaskModal({ onClose }: Props) {
  const getToken = useApiToken()
  const qc = useQueryClient()
  const [source, setSource] = useState<Source | null>(null)
  const [form, setForm] = useState({
    title: '', due_date: '', assignee_id: '',
    contact_id: '', project_id: '', priority: 'NONE',
  })

  const { data: usersData } = useQuery({
    queryKey: ['workspace-users'],
    queryFn: async () => apiFetch<{ data: WorkspaceUser[] }>('/api/users', { token: await getToken() }),
  })
  const users = usersData?.data ?? []

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-list-modal'],
    queryFn: async () => apiFetch<{ data: ContactItem[] }>('/api/contacts?per_page=100', { token: await getToken() }),
    enabled: source === 'contact',
  })
  const contacts = contactsData?.data ?? []

  const { data: projectsData } = useQuery({
    queryKey: ['projects-list-modal'],
    queryFn: async () => apiFetch<{ data: ProjectItem[] }>('/api/projects', { token: await getToken() }),
    enabled: source === 'project',
  })
  const projects = projectsData?.data ?? []

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (source === 'project') {
        const body: Record<string, unknown> = { title: form.title, priority: form.priority }
        if (form.due_date) body['due_date'] = new Date(form.due_date).toISOString()
        if (form.assignee_id) body['assignee_ids'] = [form.assignee_id]
        return apiFetch(`/api/projects/${form.project_id}/tasks`, {
          method: 'POST', body: JSON.stringify(body), token,
        })
      }
      const body: Record<string, unknown> = { title: form.title }
      if (form.due_date) body['due_date'] = form.due_date
      if (form.assignee_id) body['assignee_id'] = form.assignee_id
      if (source === 'contact' && form.contact_id) body['contact_id'] = form.contact_id
      return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body), token })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks-unified'] })
      onClose()
    },
  })

  function fieldLabel(label: string): React.ReactNode {
    return (
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fl-on-surface-variant)', marginBottom: 6 }}>
        {label}
      </label>
    )
  }

  if (!source) {
    return (
      <FluidModal open title="Add Task" subtitle="Where should this task live?" onClose={onClose}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {([
            { id: 'general', label: 'General', desc: 'Standalone task' },
            { id: 'contact', label: 'Contact', desc: 'Linked to a contact' },
            { id: 'project', label: 'Project', desc: 'In a project board' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => setSource(opt.id)}
              style={{
                padding: '16px 12px', borderRadius: 'var(--fl-radius-input)',
                border: '1.5px solid var(--fl-outline-variant)', background: 'var(--fl-surface-container-lowest)',
                cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--fl-font-body)',
                transition: 'border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--fl-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--fl-surface-container)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--fl-outline-variant)'; (e.currentTarget as HTMLElement).style.background = 'var(--fl-surface-container-lowest)' }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--fl-on-surface)', marginBottom: 4 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fl-on-surface-variant)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </FluidModal>
    )
  }

  const canSubmit = form.title.trim().length > 0 &&
    (source !== 'contact' || form.contact_id !== '') &&
    (source !== 'project' || form.project_id !== '')

  return (
    <FluidModal open title={`Add ${source.charAt(0).toUpperCase() + source.slice(1)} Task`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (canSubmit) createMut.mutate() }}>
        <div style={{ marginBottom: 14 }}>
          {fieldLabel('Title *')}
          <FluidInput value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Task title" />
        </div>

        {source === 'contact' && (
          <div style={{ marginBottom: 14 }}>
            {fieldLabel('Contact *')}
            <FluidSelect
              value={form.contact_id}
              onChange={v => setForm(f => ({ ...f, contact_id: v }))}
              options={[{ label: '— Select contact —', value: '' }, ...contacts.map(c => ({ label: c.name, value: c.id }))]}
            />
          </div>
        )}

        {source === 'project' && (
          <>
            <div style={{ marginBottom: 14 }}>
              {fieldLabel('Project *')}
              <FluidSelect
                value={form.project_id}
                onChange={v => setForm(f => ({ ...f, project_id: v }))}
                options={[{ label: '— Select project —', value: '' }, ...projects.map(p => ({ label: p.name, value: p.id }))]}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              {fieldLabel('Priority')}
              <FluidSelect
                value={form.priority}
                onChange={v => setForm(f => ({ ...f, priority: v }))}
                options={['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => ({ label: p, value: p }))}
              />
            </div>
          </>
        )}

        <div style={{ marginBottom: 14 }}>
          {fieldLabel('Assign to')}
          <FluidSelect
            value={form.assignee_id}
            onChange={v => setForm(f => ({ ...f, assignee_id: v }))}
            options={[{ label: '— Me —', value: '' }, ...users.map(u => ({ label: `${u.name} (${u.email})`, value: u.id }))]}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          {fieldLabel('Due date')}
          <FluidInput type="date" value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <FluidButton type="button" variant="ghost" onClick={() => setSource(null)}>← Back</FluidButton>
          <div style={{ display: 'flex', gap: 8 }}>
            <FluidButton type="button" variant="ghost" onClick={onClose}>Cancel</FluidButton>
            <FluidButton type="submit" disabled={!canSubmit || createMut.isPending}>
              {createMut.isPending ? 'Saving…' : 'Add task'}
            </FluidButton>
          </div>
        </div>
      </form>
    </FluidModal>
  )
}
