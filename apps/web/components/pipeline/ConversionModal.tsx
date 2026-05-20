'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

interface ConversionTemplate { id: string; name: string; target_type_id: string; }

interface Props {
  recordId: string;
  recordTypeId: string;
  onClose: () => void;
  onConverted: (newRecordId: string) => void;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed');
  return json.data;
}

export function ConversionModal({ recordId, recordTypeId, onClose, onConverted }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<ConversionTemplate | null>(null);

  const { data: templates = [] } = useQuery<ConversionTemplate[]>({
    queryKey: ['conversion-templates', recordTypeId],
    queryFn: () => apiFetch(`/templates?source_type_id=${recordTypeId}`),
  });

  const convert = useMutation({
    mutationFn: (templateId: string) =>
      apiFetch<{ record_id: string }>(`/records/${recordId}/convert`, {
        method: 'POST',
        body: JSON.stringify({ template_id: templateId }),
      }),
    onSuccess: data => onConverted(data.record_id),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 460, fontFamily: 'DM Sans, sans-serif' }}>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 20, fontWeight: 400, margin: '0 0 20px' }}>Convert Record</h2>
        {templates.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 14 }}>No conversion templates configured.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {templates.map(tpl => (
            <div key={tpl.id} onClick={() => setSelectedTemplate(tpl)}
              style={{ padding: '12px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                border: `1px solid ${selectedTemplate?.id === tpl.id ? 'var(--text, #1a1814)' : 'var(--border, #e4e0d8)'}`,
                background: selectedTemplate?.id === tpl.id ? 'var(--surface2, #f0ede6)' : 'transparent' }}>
              {tpl.name}
            </div>
          ))}
        </div>
        {convert.isError && <p style={{ color: 'var(--red, #991b1b)', fontSize: 13, marginBottom: 12 }}>{(convert.error as Error).message}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => selectedTemplate && convert.mutate(selectedTemplate.id)}
            disabled={!selectedTemplate || convert.isPending}
            style={{ background: 'var(--text, #1a1814)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
            {convert.isPending ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  );
}
