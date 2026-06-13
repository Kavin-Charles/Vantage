'use client';

import { useSearchParams, useRouter, useParams } from 'next/navigation';
import ProjectBoardPage from './ProjectBoardPage';
import ProjectListPage from './ProjectListPage';
import TimelinePage from './TimelinePage';
import CalendarPage from './CalendarPage';
import TablePage from './TablePage';

type View = 'board' | 'list' | 'timeline' | 'calendar' | 'table';

const VIEWS: { id: View; label: string }[] = [
  { id: 'board',    label: 'Board'    },
  { id: 'list',     label: 'List'     },
  { id: 'timeline', label: 'Timeline' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'table',    label: 'Table'    },
];

export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const view = (searchParams.get('view') as View | null) ?? 'board';

  function setView(v: View) {
    router.replace(`/projects/${id}/tasks?view=${v}`);
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* View switcher */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
              padding: '8px 14px', background: 'none', border: 'none',
              borderBottom: `2px solid ${view === v.id ? 'var(--text)' : 'transparent'}`,
              color: view === v.id ? 'var(--text)' : 'var(--text2)',
              cursor: 'pointer',
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Active view */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {view === 'board'    && <ProjectBoardPage />}
        {view === 'list'     && <ProjectListPage />}
        {view === 'timeline' && <TimelinePage />}
        {view === 'calendar' && <CalendarPage />}
        {view === 'table'    && <TablePage />}
      </div>
    </div>
  );
}
