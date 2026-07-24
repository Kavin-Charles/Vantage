'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { Task } from '@vencore/types'

interface RecordTasksResponse {
  data: Task[]
  total: number
  page: number
  per_page: number
  error: null
}

export function useRecordTasks(contactId: string) {
  const getToken = useApiToken()

  return useQuery({
    queryKey: ['record-tasks', 'contact', contactId],
    queryFn: async () => {
      const res = await apiFetch<RecordTasksResponse>(`/api/tasks?contact_id=${contactId}`, {
        token: await getToken(),
      })
      return res.data
    },
  })
}
