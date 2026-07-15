'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { listGroupAssignments } from '../lib/dashboard-api';

interface Props {
  open: boolean;
  onClose: () => void;
  currentGroupIds: string[];
  onSave: (groupIds: string[]) => void;
}

export function GroupAssignModal({ open, onClose, currentGroupIds, onSave }: Props) {
  const getToken = useApiToken();
  const [selected, setSelected] = useState<Set<string>>(new Set(currentGroupIds));

  const { data: groups = [] } = useQuery({
    queryKey: ['dashboard-group-assignments'],
    queryFn: async () => {
      const assignments = await listGroupAssignments(await getToken());
      return assignments.groups;
    },
    enabled: open,
  });

  if (!open) return null;

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.3)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 12,
          padding: 24,
          width: 400,
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Assign to Groups</h3>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
          {groups.length === 0 && (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>No groups found. Create groups in Settings → Groups.</p>
          )}
          {groups.map(g => (
            <label
              key={g.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(g.id)}
                onChange={() => toggle(g.id)}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: g.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14 }}>{g.name}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'none',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave([...selected]); onClose(); }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--text)',
              color: 'var(--bg)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
