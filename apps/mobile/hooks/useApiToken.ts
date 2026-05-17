// apps/mobile/hooks/useApiToken.ts
import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/secureStore';

export function useApiToken(): string {
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    const t = await getAuthToken();
    setToken(t ?? '');
  }, []);

  useEffect(() => { void load(); }, [load]);

  return token;
}
