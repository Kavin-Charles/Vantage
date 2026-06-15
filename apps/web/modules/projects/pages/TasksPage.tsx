'use client';

import { useSearchParams, useRouter, useParams } from 'next/navigation';
import ProjectBoardPage from './ProjectBoardPage';
import ProjectListPage from './ProjectListPage';
import TimelinePage from './TimelinePage';
import CalendarPage from './CalendarPage';
import TablePage from './TablePage';

type View = 'board' | 'list' | 'timeline' | 'calendar' | 'table';

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'board',    label: 'Board',    icon: 'M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z' },
  { id: 'list',     label: 'List',     icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'timeline', label: 'Timeline', icon: 'M8 6h10M8 12h10M6 18h12M3 6h.01M3 12h.01M3 18h.01' },
  { id: 'calendar', label: 'Calendar', icon: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { id: 'table',    label: 'Table',    icon: 'M3 3h18v4H3V3zm0 8h18v4H3v-4zm0 8h18v4H3v-4z' },
];

function ViewIcon({ path, active }: { path: string; active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

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
        padding: '8px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <div style={{
          display: 'inline-flex', gap: 1,
          background: 'var(--surface2)', borderRadius: 10,
          padding: '3px',
        }}>
          {VIEWS.map(v => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                title={v.label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: active ? 600 : 400,
                  padding: '5px 12px', border: 'none', borderRadius: 8,
                  background: active ? 'var(--surface)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text3)',
                  cursor: 'pointer',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text3)'; }}
              >
                <ViewIcon path={v.icon} active={active} />
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
