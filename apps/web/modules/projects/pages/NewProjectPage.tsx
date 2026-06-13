'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { pmApi } from '@/modules/projects/lib/api';

const SWATCHES = ['#2d6a4f', '#1e3a8a', '#92400e', '#991b1b', '#6d28d9', '#0369a1', '#b45309', '#374151'];

export default function NewProjectPage() {
  const router = useRouter();
  const getToken = useApiToken();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]!);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const token = await getToken();
      const res = await pmApi.createProject(token, {
        name: name.trim(),
        color,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      router.push(`/projects/${res.data.id}/board`);
    } catch {
      setError('Failed to create project. Please try again.');
      setSubmitting(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500,
    color: 'var(--text2)', marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
    borderRadius: 10, fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text)',
    background: 'var(--surface)', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <button
        onClick={() => router.back()}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', fontFamily: 'DM Sans', fontSize: 13,
          padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ← Back
      </button>
      <h1 style={{ fontFamily: 'Instrument Serif', fontSize: 26, color: 'var(--text)', margin: '0 0 24px' }}>New Project</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Project name *</label>
          <input
            style={inputStyle}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Website Redesign"
            autoFocus
            required
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {SWATCHES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setColor(s)}
                style={{
                  width: 28, height: 28, borderRadius: 8, background: s, border: 'none',
                  cursor: 'pointer', outline: color === s ? `2px solid var(--text)` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Start date</label>
            <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End date</label>
            <input type="date" style={inputStyle} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        {error && (
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--red)', marginBottom: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            style={{
              background: 'var(--text)', color: '#fff', border: 'none',
              borderRadius: 10, padding: '9px 20px', fontFamily: 'DM Sans',
              fontSize: 14, fontWeight: 500, cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting || !name.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 10, padding: '9px 20px', fontFamily: 'DM Sans',
              fontSize: 14, cursor: 'pointer', color: 'var(--text2)',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
