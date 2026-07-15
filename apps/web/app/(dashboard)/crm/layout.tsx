'use client';

import { usePathname } from 'next/navigation';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';

const SUB_MODULE_BY_SEGMENT: Record<string, string> = {
  pipeline: 'crm:pipeline',
  contacts: 'crm:contacts',
  companies: 'crm:companies',
  tasks: 'crm:tasks',
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segment = pathname.split('/')[2] ?? '';
  const moduleId = SUB_MODULE_BY_SEGMENT[segment] ?? 'crm';

  return <ModuleGuard moduleId={moduleId}>{children}</ModuleGuard>;
}
