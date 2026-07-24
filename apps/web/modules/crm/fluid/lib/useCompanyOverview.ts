'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/modules/shared/lib/api'
import { useApiToken } from '@/modules/shared/lib/useApiToken'
import type { CompanyOverview } from '@vencore/types'

interface CompanyOverviewResponse {
  data: CompanyOverview
  error: null
}

export function useCompanyOverview(id: string) {
  const getToken = useApiToken()

  return useQuery({
    queryKey: ['company-overview', id],
    queryFn: async () => {
      const res = await apiFetch<CompanyOverviewResponse>(`/api/companies/${id}/overview`, {
        token: await getToken(),
      })
      return res.data
    },
  })
}
