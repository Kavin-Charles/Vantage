'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listItems, updateItem } from '@/modules/crm/pipeline/lib/items';
import { TableCell } from './TableCell';
import { ItemForm } from '@/modules/crm/pipeline/components/shared/ItemForm';
import type { Pipeline } from '@/modules/crm/pipeline/lib/pipelines';

import { ItemDetail } from '@/modules/crm/pipeline/components/detail/ItemDetail';

interface Props {
  pipeline: Pipeline;
  search: string;
  addTrigger: number;
}

export function PipelineTable({ pipeline, search, addTrigger }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lastTrigger, setLastTrigger] = useState(addTrigger);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    if (addTrigger !== lastTrigger) {
      setLastTrigger(addTrigger);
      setShowForm(true);
    }
  }, [addTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: items = [] } = useQuery({
    queryKey: ['items', pipeline.id],
    queryFn: async () => listItems(await getToken(), pipeline.id),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, field_values }: { id: string; field_values: Record<string, unknown> }) =>
      updateItem(await getToken(), id, { field_values }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['items', pipeline.id] }),
  });

  const filtered = search
    ? items.filter(i =>
        Object.values(i.field_values).some(v =>
          String(v ?? '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : items;

  const stageMap = Object.fromEntries(pipeline.stages.map(s => [s.id, s]));

  return (
    <>
      <div style={{ overflowX: 'auto', height: '100%', padding: '20px 24px', boxSizing: 'border-box' }}>
        <div style={{
          borderRadius: 16,
          border: '1px solid var(--border)',
          overflow: 'hidden',
          background: 'var(--surface)',
        }}>
          <table style={{
            borderCollapse: 'collapse',
            width: '100%',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
          }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{
                  padding: '10px 16px',
                  textAlign: 'left',
                  color: 'var(--text3)',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-sans)',
                }}>
                  Stage
                </th>
                {pipeline.fields.map(f => (
                  <th key={f.id} style={{
                    padding: '10px 12px',
                    textAlign: 'left',
                    color: 'var(--text3)',
                    fontWeight: 600,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const stage = stageMap[item.stage_id];
                const stageColor = stage?.is_won ? '#22c55e' : stage?.is_lost ? '#ef4444' : (stage?.color ?? '#6366f1');
                const isHovered = hoveredRow === item.id;
                return (
                  <tr
                    key={item.id}
                    onMouseEnter={() => setHoveredRow(item.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: isHovered ? 'var(--surface2)' : 'transparent',
                      transition: 'background .12s ease',
                      cursor: 'default',
                    }}
                  >
                    <td
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        verticalAlign: 'middle',
                      }}
                    >
                      {stage ? (
                        <span style={{
                          background: stageColor + '1a',
                          color: stageColor,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontFamily: 'var(--font-sans)',
                        }}>
                          {stage.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {pipeline.fields.map(f => (
                      <TableCell
                        key={f.id}
                        field={f}
                        value={item.field_values[f.key]}
                        onSave={v =>
                          updateMut.mutate({
                            id: item.id,
                            field_values: { ...(item.field_values as Record<string, unknown>), [f.key]: v },
                          })
                        }
                      />
                    ))}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={pipeline.fields.length + 1}
                    style={{
                      padding: 48,
                      textAlign: 'center',
                      color: 'var(--text3)',
                      fontSize: 13,
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {search ? `No items matching "${search}"` : 'No items yet — add one above.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <ItemDetail itemId={selectedId} pipeline={pipeline} onClose={() => setSelectedId(null)} />
      )}

      {showForm && (
        <ItemForm
          pipelineId={pipeline.id}
          stages={pipeline.stages}
          fields={pipeline.fields}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
