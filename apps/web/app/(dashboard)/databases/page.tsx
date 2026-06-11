'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import DatabasesPage from '@/modules/databases/pages/page';

export default function Page() {
  return (
    <ModuleGuard moduleId="databases">
      <DatabasesPage />
    </ModuleGuard>
  );
}
