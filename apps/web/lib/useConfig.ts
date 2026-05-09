import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

interface PublicConfig {
  app: { name: string; logoUrl: string };
  features: {
    crm: boolean;
    infra: boolean;
    alerts: boolean;
    analytics: boolean;
    files: boolean;
  };
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => apiFetch<{ data: PublicConfig }>('/api/config').then(r => r.data),
    staleTime: Infinity,
  });
}
