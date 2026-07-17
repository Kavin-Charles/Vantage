'use client';

import { usePathname } from 'next/navigation';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';

const SUB_MODULE_BY_SEGMENT: Record<string, string> = {
  servers: 'infra:servers',
  databases: 'infra:databases',
  websites: 'infra:websites',
  alerts: 'infra:alerts',
};

export default function InfraLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segment = pathname.split('/')[2] ?? '';
  const moduleId = SUB_MODULE_BY_SEGMENT[segment] ?? 'infra';

  return <ModuleGuard moduleId={moduleId}>{children}</ModuleGuard>;
}
