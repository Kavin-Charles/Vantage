'use client';

import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import DatabasesPage from '@/modules/infra/databases/pages/page';

export default function Page() {
  return (
    <ModuleGuard moduleId="infra:databases">
      <DatabasesPage />
    </ModuleGuard>
  );
}
