'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { apiFetch } from './api';
import { setUser, clearAuth } from '@/store/auth-slice';
import type { RootState, AppDispatch } from '@/store';
import type { AuthUser } from '@/store/auth-slice';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();
  const token = useSelector((state: RootState) => state.auth.token);
  const user = useSelector((state: RootState) => state.auth.user);

  const isLoading = token !== null && user === null;

  const fetchUser = async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ data: AuthUser }>('/api/me', { token });
      dispatch(setUser(res.data));
    } catch {
      dispatch(clearAuth());
    }
  };

  useEffect(() => {
    if (token && !user) {
      void fetchUser();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', token: token ?? '' });
    } catch {
      // Ignore — clear local state regardless
    }
    dispatch(clearAuth());
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, refetch: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
