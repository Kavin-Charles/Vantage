'use client';

import { useSearchParams, useRouter, useParams } from 'next/navigation';
import ProjectBoardPage from './ProjectBoardPage';
import ProjectListPage from './ProjectListPage';
import TimelinePage from './TimelinePage';
import CalendarPage from './CalendarPage';
import TablePage from './TablePage';

type View = 'board' | 'list' | 'timeline' | 'calendar' | 'table';

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'board',    label: 'Board',    icon: '⊞' },
  { id: 'list',     label: 'List',     icon: '≡' },
  { id: 'timeline', label: 'Timeline', icon: '▶' },
  { id: 'calendar', label: 'Calendar', icon: '▦' },
  { id: 'table',    label: 'Table',    icon: '⊟' },
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
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{
          display: 'inline-flex', gap: 2,
          background: 'var(--surface2)', borderRadius: 9,
          padding: 3,
        }}>
          {VIEWS.map(v => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: 'DM Sans', fontSize: 13, fontWeight: active ? 500 : 400,
                  padding: '5px 11px', border: 'none', borderRadius: 7,
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text3)',
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                <span style={{ fontSize: 12, lineHeight: 1 }}>{v.icon}</span>
                {v.label}
              </button>
            );
          })}
        </div>
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
