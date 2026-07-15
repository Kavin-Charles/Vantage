'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/modules/shared/components/ui/Modal'
import { Button } from '@/modules/shared/components/ui/Button'
import { FormField, Input } from '@/modules/shared/components/ui/FormField'
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

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
    fontFamily: 'inherit', outline: 'none',
  }

  if (!source) {
    return (
      <Modal title="Add Task" onClose={onClose}>
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Where should this task live?</p>
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
                padding: '16px 12px', borderRadius: 10,
                border: '1.5px solid var(--border)', background: 'var(--bg)',
                cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
                transition: 'border-color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg)' }}
            >
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  const canSubmit = form.title.trim().length > 0 &&
    (source !== 'contact' || form.contact_id !== '') &&
    (source !== 'project' || form.project_id !== '')

  return (
    <Modal title={`Add ${source.charAt(0).toUpperCase() + source.slice(1)} Task`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (canSubmit) createMut.mutate() }}>
        <FormField label="Title *">
          <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" />
        </FormField>

        {source === 'contact' && (
          <FormField label="Contact *">
            <select style={selectStyle} value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
              <option value="">— Select contact —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
        )}

        {source === 'project' && (
          <>
            <FormField label="Project *">
              <select style={selectStyle} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select style={selectStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </>
        )}

        <FormField label="Assign to">
          <select style={selectStyle} value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
            <option value="">— Me —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </FormField>

        <FormField label="Due date">
          <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </FormField>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <Button type="button" onClick={() => setSource(null)}>← Back</Button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!canSubmit || createMut.isPending}>
              {createMut.isPending ? 'Saving…' : 'Add task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
