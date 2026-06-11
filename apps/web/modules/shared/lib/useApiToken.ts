'use client';

import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

export function useApiToken() {
  const token = useSelector((state: RootState) => state.auth.token);
  return useCallback(async () => token ?? '', [token]);
}
