import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

interface PublicConfig {
  app: {
    name: string;
    logoUrl: string;
    faviconUrl: string | null;
    tagline: string | null;
    primaryColor: string | null;
    appearance: {
      accentColor: string;
      preset: string;
      radius: 'sharp' | 'rounded' | 'pill';
      density: 'comfortable' | 'compact';
      sidebarStyle: 'light' | 'dark' | 'brand';
      login: { background: string | null; backgroundImage: string | null };
    };
  };
  features: {
    crm: boolean;
    infra: boolean;
    alerts: boolean;
    analytics: boolean;
    calendar: boolean;
  };
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => apiFetch<{ data: PublicConfig }>('/api/config').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}
