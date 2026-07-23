'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { ContactOverview } from '@vencore/types'

interface ContactOverviewResponse {
  data: ContactOverview
  error: null
}

export function useContactOverview(id: string) {
  const getToken = useApiToken()

  return useQuery({
    queryKey: ['contact-overview', id],
    queryFn: async () => {
      const res = await apiFetch<ContactOverviewResponse>(`/api/contacts/${id}/overview`, {
        token: await getToken(),
      })
      return res.data
    },
  })
}
