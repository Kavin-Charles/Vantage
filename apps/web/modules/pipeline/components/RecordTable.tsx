'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordDetail } from './RecordDetail';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

interface PipelineRecord {
  id: string;
  name: string;
  record_number: string | null;
  stage_id: string;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  created_at: string;
}

interface Stage { id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean; }
interface PipelineWithStages { id: string; stages: Stage[]; }

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

const DEFAULT_COLUMNS = ['record_number', 'name', 'stage', 'owner_id', 'created_at'];

const COLUMN_LABELS: Record<string, string> = {
  record_number: 'Record #',
  name: 'Name',
  stage: 'Stage',
  owner_id: 'Owner',
  contact_id: 'Contact',
  company_id: 'Company',
  created_at: 'Created',
};

function stageColor(stage: Stage): string {
  if (stage.is_won) return '#22c55e';
  if (stage.is_lost) return '#ef4444';
  return stage.color ?? '#6366f1';
}

function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
}

export function RecordTable({
  recordTypeId,
  pipelineId,
  columns = DEFAULT_COLUMNS,
}: {
  recordTypeId: string;
  pipelineId: string;
  columns?: string[];
}) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'created_at', dir: 'desc' });
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const { data: pipelineData } = useQuery<PipelineWithStages>({
    queryKey: ['pipeline', pipelineId],
    queryFn: () => apiFetch(`/pipelines/${pipelineId}`),
  });

  const { data: records = [], isError } = useQuery<PipelineRecord[]>({
    queryKey: ['records', pipelineId, recordTypeId],
    queryFn: () => apiFetch(`/records?pipeline_id=${pipelineId}&record_type_id=${recordTypeId}`),
  });

  const stageMap = new Map((pipelineData?.stages ?? []).map(s => [s.id, s]));

  const sorted = [...records].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.col === 'stage') {
      const sa = stageMap.get(a.stage_id)?.name ?? '';
      const sb = stageMap.get(b.stage_id)?.name ?? '';
      return sa.localeCompare(sb) * dir;
    }
    const va = String((a as unknown as Record<string, unknown>)[sort.col] ?? '');
    const vb = String((b as unknown as Record<string, unknown>)[sort.col] ?? '');
    return va.localeCompare(vb) * dir;
  });

  function toggleSort(col: string) {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    );
  }

  function renderCell(record: PipelineRecord, col: string): React.ReactNode {
    switch (col) {
      case 'record_number':
        return record.record_number
          ? <code style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{record.record_number}</code>
          : <span style={{ color: 'var(--text3)' }}>—</span>;
      case 'name':
        return <span style={{ fontWeight: 500 }}>{record.name}</span>;
      case 'stage': {
        const stage = stageMap.get(record.stage_id);
        if (!stage) return <span style={{ color: 'var(--text3)' }}>—</span>;
        const color = stageColor(stage);
        return (
          <span style={{ background: `${color}1a`, color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
            {stage.name}
          </span>
        );
      }
      case 'owner_id':
        return (
          <span style={{ background: 'var(--surface2)', borderRadius: '50%', width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>
            {record.owner_id[0]?.toUpperCase()}
          </span>
        );
      case 'contact_id':
        return record.contact_id
          ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>{record.contact_id.slice(0, 8)}…</span>
          : <span style={{ color: 'var(--text3)' }}>—</span>;
      case 'company_id':
        return record.company_id
          ? <span style={{ fontSize: 12, color: 'var(--text2)' }}>{record.company_id.slice(0, 8)}…</span>
          : <span style={{ color: 'var(--text3)' }}>—</span>;
      case 'created_at':
        return <span style={{ fontSize: 12, color: 'var(--text2)' }}>{relDate(record.created_at)}</span>;
      default:
        return <span style={{ color: 'var(--text3)' }}>—</span>;
    }
  }

  if (isError) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--amber-bg, #fef3c7)', color: 'var(--amber, #92400e)', borderRadius: 8, fontSize: 13 }}>
        Failed to load records.
      </div>
    );
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  style={{
                    padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11,
                    color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
                  }}
                >
                  {COLUMN_LABELS[col] ?? col}
                  {sort.col === col && <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(record => (
              <tr
                key={record.id}
                onClick={() => setSelectedRecordId(record.id)}
                onContextMenu={(e) => {
                  const items: ContextMenuItem[] = [
                    { icon: 'open', label: 'Open record', onClick: () => setSelectedRecordId(record.id) },
                    { type: 'separator' },
                    { icon: 'link', label: 'Copy link', onClick: () => navigator.clipboard.writeText(`${window.location.origin}/pipeline?record=${record.id}`) },
                    ...(record.record_number ? [{ icon: 'copy', label: 'Copy record #', onClick: () => navigator.clipboard.writeText(record.record_number!) } as ContextMenuItem] : []),
                  ];
                  openMenu(e, items);
                }}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
              >
                {columns.map(col => (
                  <td key={col} style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                    {renderCell(record, col)}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text3)' }}>
                  No records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedRecordId && (
        <RecordDetail recordId={selectedRecordId} onClose={() => setSelectedRecordId(null)} />
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
    </>
  );
}
