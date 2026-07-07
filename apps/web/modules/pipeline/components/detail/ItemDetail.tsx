'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getItem, updateItem, deleteItem } from '@/modules/pipeline/lib/items';
import { ItemDetailField } from './ItemDetailField';
import { ItemActivity } from './ItemActivity';
import { pmApi } from '@/modules/projects/lib/api';
import { LinkedProjectCard } from '@/modules/projects/components/LinkedProjectCard';
import type { Pipeline } from '@/modules/pipeline/lib/pipelines';

interface Props {
  itemId: string;
  pipeline: Pipeline;
  onClose: () => void;
}

type Tab = 'fields' | 'activity';

export function ItemDetail({ itemId, pipeline, onClose }: Props) {
  const getToken = useApiToken();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('fields');
  const [deleteHovered, setDeleteHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const [stageFocused, setStageFocused] = useState(false);

  const { data: item } = useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => getItem(await getToken(), itemId),
  });

  const updateMut = useMutation({
    mutationFn: async (field_values: Record<string, unknown>) =>
      updateItem(await getToken(), itemId, { field_values }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['item', itemId] });
      void qc.invalidateQueries({ queryKey: ['items', pipeline.id] });
    },
  });

  const stageMut = useMutation({
    mutationFn: async (stage_id: string) =>
      updateItem(await getToken(), itemId, { stage_id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['item', itemId] });
      void qc.invalidateQueries({ queryKey: ['items', pipeline.id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => deleteItem(await getToken(), itemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items', pipeline.id] });
      void qc.invalidateQueries({ queryKey: ['item', itemId] });
      onClose();
    },
  });

  const { data: linkedProjectsData } = useQuery({
    queryKey: ['deal-projects', itemId],
    queryFn: async () => pmApi.listProjectsByDeal(await getToken(), itemId),
    enabled: !!itemId,
  });
  const linkedProjects = linkedProjectsData?.data ?? [];

  const currentStage = pipeline.stages.find(s => s.id === item?.stage_id);
  const stageColor = currentStage?.is_won ? '#22c55e' : currentStage?.is_lost ? '#ef4444' : (currentStage?.color ?? '#6366f1');

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: 'rgba(11,19,48,0.15)',
          backdropFilter: 'blur(1px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 201,
        width: 440,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.10)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          {currentStage && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              background: stageColor + '1a',
              color: stageColor,
              padding: '3px 9px',
              borderRadius: 6,
              letterSpacing: '0.2px',
            }}>
              {currentStage.name}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { if (confirm('Delete this item? This cannot be undone.')) deleteMut.mutate(); }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
            style={{
              border: 'none',
              background: deleteHovered ? 'var(--red-bg, #fee2e2)' : 'transparent',
              cursor: 'pointer',
              color: deleteHovered ? 'var(--red, #991b1b)' : 'var(--text3)',
              fontSize: 12,
              fontFamily: 'var(--font-sans)',
              padding: '5px 10px',
              borderRadius: 8,
              fontWeight: 500,
              transition: 'all .15s ease',
            }}
          >
            Delete
          </button>
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHovered(true)}
            onMouseLeave={() => setCloseHovered(false)}
            style={{
              border: 'none',
              background: closeHovered ? 'var(--surface2)' : 'transparent',
              cursor: 'pointer',
              color: closeHovered ? 'var(--text)' : 'var(--text3)',
              fontSize: 20,
              lineHeight: 1,
              padding: 0,
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              transition: 'all .15s ease',
            }}
          >
            ×
          </button>
        </div>

        {/* Stage mover */}
        {item && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <label style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: 'var(--text3)',
              fontFamily: 'var(--font-sans)',
              display: 'block',
              marginBottom: 6,
            }}>
              Stage
            </label>
            <select
              value={item.stage_id}
              onChange={e => stageMut.mutate(e.target.value)}
              onFocus={() => setStageFocused(true)}
              onBlur={() => setStageFocused(false)}
              disabled={stageMut.isPending}
              style={{
                width: '100%',
                padding: '7px 10px',
                border: `1px solid ${stageFocused ? 'var(--text2)' : 'var(--border)'}`,
                borderRadius: 10,
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                background: 'var(--surface)',
                color: 'var(--text)',
                outline: 'none',
                transition: 'border-color .15s ease, box-shadow .15s ease',
                boxShadow: stageFocused ? '0 0 0 3px rgba(11,19,48,0.06)' : 'none',
                boxSizing: 'border-box',
                opacity: stageMut.isPending ? 0.6 : 1,
              }}
            >
              {pipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Linked projects */}
        {linkedProjects.length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <label
              style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.6px', color: 'var(--text3)',
                fontFamily: 'var(--font-sans)', display: 'block', marginBottom: 8,
              }}
            >
              Project
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {linkedProjects.map((p, i) => (
                <LinkedProjectCard key={p.id} project={p} animationDelay={i * 30} />
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          padding: '0 20px',
          flexShrink: 0,
        }}>
          {(['fields', 'activity'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '11px 0',
                marginRight: 24,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--text)' : 'var(--text3)',
                borderBottom: tab === t ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color .15s ease',
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!item && (
            <div style={{
              padding: '40px 0',
              textAlign: 'center',
              color: 'var(--text3)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
            }}>
              Loading…
            </div>
          )}

          {item && tab === 'fields' && (
            <>
              {pipeline.fields.length === 0 && (
                <p style={{ color: 'var(--text3)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                  No fields configured.
                </p>
              )}
              {pipeline.fields.map(f => (
                <ItemDetailField
                  key={f.id}
                  field={f}
                  value={(item.field_values as Record<string, unknown>)[f.key]}
                  onSave={v =>
                    updateMut.mutate({ ...(item.field_values as Record<string, unknown>), [f.key]: v })
                  }
                />
              ))}
            </>
          )}

          {item && tab === 'activity' && <ItemActivity itemId={itemId} />}
        </div>
      </div>
    </>
  );
}
