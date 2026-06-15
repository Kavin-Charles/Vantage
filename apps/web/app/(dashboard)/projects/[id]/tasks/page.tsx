import { Suspense } from 'react';
import TasksPage from '@/modules/projects/pages/TasksPage';

export default function Page() {
  return (
    <Suspense>
      <TasksPage />
    </Suspense>
  );
}
