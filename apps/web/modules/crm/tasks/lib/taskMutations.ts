import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { UnifiedTask } from './types'

export function useToggleTask() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (task: UnifiedTask) => {
      const token = await getToken()
      const newStatus = task.status === 'done' ? 'todo' : 'done'

      if (task.source === 'project') {
        const statusId = newStatus === 'done' ? task.done_status_id : task.todo_status_id
        if (!statusId) throw new Error('No status ID available for project task toggle')
        return apiFetch(
          `/api/projects/${task.project_id}/tasks/${task.id}`,
          { method: 'PATCH', body: JSON.stringify({ status_id: statusId }), token },
        )
      }

      return apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
        token,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

export function useEditTaskTitle() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ task, title }: { task: UnifiedTask; title: string }) => {
      const token = await getToken()

      if (task.source === 'project') {
        return apiFetch(
          `/api/projects/${task.project_id}/tasks/${task.id}`,
          { method: 'PATCH', body: JSON.stringify({ title }), token },
        )
      }

      return apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
        token,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

export function useDeleteTask() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (task: UnifiedTask) => {
      const token = await getToken()

      if (task.source === 'project') {
        return apiFetch(
          `/api/projects/${task.project_id}/tasks/${task.id}`,
          { method: 'DELETE', token },
        )
      }

      return apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE', token })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
  })
}

export function useBulkToggleTasks() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ tasks, newStatus }: { tasks: UnifiedTask[]; newStatus: 'todo' | 'done' }) => {
      const token = await getToken()
      await Promise.all(tasks.map(task => {
        if (task.source === 'project') {
          const statusId = newStatus === 'done' ? task.done_status_id : task.todo_status_id
          if (!statusId) return Promise.resolve()
          return apiFetch(
            `/api/projects/${task.project_id}/tasks/${task.id}`,
            { method: 'PATCH', body: JSON.stringify({ status_id: statusId }), token },
          )
        }
        return apiFetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
          token,
        })
      }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
    onError: (err) => console.error('[tasks] bulk toggle failed', err),
  })
}

export function useBulkDeleteTasks() {
  const getToken = useApiToken()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (tasks: UnifiedTask[]) => {
      const token = await getToken()
      await Promise.all(tasks.map(task => {
        if (task.source === 'project') {
          return apiFetch(
            `/api/projects/${task.project_id}/tasks/${task.id}`,
            { method: 'DELETE', token },
          )
        }
        return apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE', token })
      }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks-unified'] }),
    onError: (err) => console.error('[tasks] bulk delete failed', err),
  })
}
