'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import DatabaseDetailPage from '@/modules/infra/databases/pages/[id]/page';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <ModuleGuard moduleId="infra:databases">
      <DatabaseDetailPage params={params} />
    </ModuleGuard>
  );
}
