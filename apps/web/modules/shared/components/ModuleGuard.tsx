'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useModules } from '@/modules/shared/contexts/modules';

interface ModuleGuardProps {
  moduleId: string;
  children: React.ReactNode;
}

export function ModuleGuard({ moduleId, children }: ModuleGuardProps) {
  const { isEnabled, isLoading } = useModules();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isEnabled(moduleId)) {
      router.replace('/dashboard');
    }
  }, [isLoading, moduleId, isEnabled, router]);

  if (isLoading) return null;
  if (!isEnabled(moduleId)) return null;

  return <>{children}</>;
}
