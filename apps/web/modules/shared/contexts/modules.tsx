'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store';

interface ModuleRow {
  module_id: string;
  enabled: boolean;
}

interface ModulesContextValue {
  modules: ModuleRow[];
  isEnabled: (moduleId: string) => boolean;
  setEnabled: (moduleId: string, enabled: boolean) => void;
  isLoading: boolean;
}

const ModulesContext = createContext<ModulesContextValue | null>(null);

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const token = useSelector((state: RootState) => state.auth.token);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
        const res = await fetch(`${apiUrl}/api/workspace/modules`, {
          headers: { Authorization: `Bearer ${token ?? ''}` },
          credentials: 'include',
        });
        const body = (await res.json()) as { data?: ModuleRow[] };
        if (!cancelled && body.data) setModules(body.data);
      } catch {
        // ignore — leaves modules empty
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  function isEnabled(moduleId: string): boolean {
    const row = modules.find(m => m.module_id === moduleId);
    return row?.enabled ?? false;
  }

  function setEnabled(moduleId: string, enabled: boolean) {
    setModules(prev =>
      prev.map(m => (m.module_id === moduleId ? { ...m, enabled } : m)),
    );
  }

  return (
    <ModulesContext.Provider value={{ modules, isEnabled, setEnabled, isLoading }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules(): ModulesContextValue {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error('useModules must be used inside ModuleProvider');
  return ctx;
}
