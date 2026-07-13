'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import DatabaseDetailPage from '@/modules/databases/pages/[id]/page';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <ModuleGuard moduleId="databases">
      <DatabaseDetailPage params={params} />
    </ModuleGuard>
  );
}
