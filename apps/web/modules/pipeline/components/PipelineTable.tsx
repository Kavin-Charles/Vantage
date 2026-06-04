'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listRecords } from '@/modules/pipeline/lib/records';
import { RecordDetailPanel } from './RecordDetailPanel';
import type { PipelineWithDetails, PipelineRecordWithValues } from '@vencore/types';

type SortKey = 'name' | 'created_at' | 'stage_id';

export function PipelineTable({
  pipeline,
  search,
  addTrigger,
}: {
  pipeline: PipelineWithDetails;
  search: string;
  addTrigger: number;
}) {
  const getToken = useApiToken();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['records', pipeline.id],
    queryFn: async () => listRecords(await getToken(), { pipeline_id: pipeline.id }),
  });

  const allRecords: PipelineRecordWithValues[] = data?.data ?? [];
  const stageMap = Object.fromEntries(pipeline.stages.map(s => [s.id, s]));
  const fields = pipeline.record_type?.fields ?? [];
  const valueField = fields.find(f => f.label.toLowerCase() === 'value');

  const filtered = search
    ? allRecords.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : allRecords;

  const sorted = [...filtered].sort((a, b) => {
    const av = String((a as any)[sort.key] ?? '');
    const bv = String((b as any)[sort.key] ?? '');
    return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: 'var(--text2)', fontFamily: 'DM Sans, sans-serif',
    borderBottom: '1px solid var(--border)', cursor: 'pointer',
    userSelect: 'none', background: 'var(--surface)', whiteSpace: 'nowrap',
    position: 'sticky', top: 0,
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 14, color: 'var(--text)',
    fontFamily: 'DM Sans, sans-serif', borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
  };

  return (
    <>
      <div style={{ overflow: 'auto', height: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => toggleSort('name')}>
                Name {sort.key === 'name' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={thStyle} onClick={() => toggleSort('stage_id')}>
                Stage {sort.key === 'stage_id' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
              {valueField && <th style={thStyle}>Value</th>}
              <th style={thStyle} onClick={() => toggleSort('created_at')}>
                Created {sort.key === 'created_at' ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(record => {
              const stage = stageMap[record.stage_id];
              const fv = valueField ? record.field_values.find(v => v.field_id === valueField.id) : null;
              const val = fv
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(fv.value))
                : '—';
              return (
                <tr
                  key={record.id}
                  onClick={() => setSelectedId(record.id)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={tdStyle}>
                    {record.record_number && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginRight: 6, fontFamily: 'DM Sans, sans-serif' }}>
                        {record.record_number}
                      </span>
                    )}
                    {record.name}
                  </td>
                  <td style={tdStyle}>
                    {stage && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 12,
                        background: `${stage.color ?? '#6366f1'}22`,
                        fontSize: 12, fontWeight: 500, color: stage.color ?? 'var(--text)',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color ?? '#6366f1' }} />
                        {stage.name}
                      </span>
                    )}
                  </td>
                  {valueField && (
                    <td style={{ ...tdStyle, fontFamily: 'Instrument Serif, serif' }}>{val}</td>
                  )}
                  <td style={{ ...tdStyle, color: 'var(--text2)', fontSize: 12 }}>
                    {fmtDate(record.created_at)}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text3)', padding: '32px 14px' }}>
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <RecordDetailPanel
          recordId={selectedId}
          pipeline={pipeline}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
