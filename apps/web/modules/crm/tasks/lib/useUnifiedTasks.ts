// apps/web/modules/tasks/lib/useUnifiedTasks.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { UnifiedTasksBuckets, UnifiedTasksFilters } from './types'

interface UnifiedTasksResponse {
  data: UnifiedTasksBuckets
  total: number
  error: null
}

export function useUnifiedTasks(filters: UnifiedTasksFilters = {}) {
  const getToken = useApiToken()

  return useQuery({
    queryKey: ['tasks-unified', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.source) params.set('source', filters.source)
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.show_all) params.set('show_all', 'true')
      if (filters.q) params.set('q', filters.q)
      if (filters.owner_id) params.set('owner_id', filters.owner_id)
      const qs = params.toString() ? `?${params.toString()}` : ''
      return apiFetch<UnifiedTasksResponse>(`/api/tasks/unified${qs}`, {
        token: await getToken(),
      })
    },
    staleTime: 30_000,
  })
}
