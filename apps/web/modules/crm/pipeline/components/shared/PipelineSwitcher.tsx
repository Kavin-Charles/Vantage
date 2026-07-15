'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { listPipelines } from '@/modules/crm/pipeline/lib/pipelines';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

interface Props {
  currentId: string;
}

export function PipelineSwitcher({ currentId }: Props) {
  const getToken = useApiToken();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => listPipelines(await getToken()),
  });

  const pipelines = data ?? [];
  const current = pipelines.find(p => p.id === currentId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 14px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: open ? 'var(--surface2)' : 'var(--surface)',
          cursor: 'pointer',
          fontSize: 14,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          letterSpacing: '-0.3px',
          color: 'var(--text)',
          transition: 'var(--transition)',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--surface2)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'var(--surface)'; }}
      >
        {current?.name ?? 'Pipeline'}
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          style={{
            transition: 'transform .15s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            color: 'var(--text3)',
            flexShrink: 0,
          }}
        >
          <path
            d="M1 1l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 200,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          minWidth: 200,
          padding: 6,
          opacity: open ? 1 : 0,
          transform: open ? 'translateY(0)' : 'translateY(-4px)',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .15s ease, transform .15s ease',
        }}
      >
        {pipelines.map(p => {
          const active = p.id === currentId;
          const hov = hoveredId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => { router.push(`/crm/pipeline/${p.id}`); setOpen(false); }}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                textAlign: 'left',
                padding: '9px 14px',
                border: 'none',
                background: hov || active ? 'var(--surface2)' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                fontWeight: active ? 600 : 400,
                color: 'var(--text)',
                borderRadius: 10,
                transition: 'background .12s ease',
              }}
            >
              <span>{p.name}</span>
              {active && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 7l3.5 3.5L12 3.5"
                    stroke="var(--text)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
        {pipelines.length === 0 && (
          <p
            style={{
              padding: '8px 14px',
              fontSize: 12,
              color: 'var(--text3)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
            }}
          >
            No pipelines
          </p>
        )}
      </div>
    </div>
  );
}
