'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';

interface Doc {
  id: string;
  title: string;
  content: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export default function DocEditorPage() {
  const { id: projectId, docId } = useParams<{ id: string; docId: string }>();
  const getToken = useApiToken();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: ['project-doc', projectId, docId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch<{ data: Doc }>(`/api/projects/${projectId}/docs/${docId}`, { token });
    },
  });

  useEffect(() => {
    if (data?.data && !initializedRef.current) {
      setTitle(data.data.title);
      const content = data.data.content;
      setBody(typeof content?.text === 'string' ? content.text : '');
      initializedRef.current = true;
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (updates: { title?: string; content?: Record<string, unknown> }) => {
      setSaveStatus('saving');
      const token = await getToken();
      return apiFetch<{ data: Doc }>(`/api/projects/${projectId}/docs/${docId}`, {
        token,
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      setSaveStatus('saved');
      qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
      qc.invalidateQueries({ queryKey: ['project-doc', projectId, docId] });
    },
    onError: () => {
      setSaveStatus('error');
    },
  });

  const scheduleSave = useCallback((newTitle: string, newBody: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveStatus('unsaved');
    timerRef.current = setTimeout(() => {
      saveMutation.mutate({ title: newTitle, content: { text: newBody } });
    }, 800);
  }, [saveMutation]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
    scheduleSave(e.target.value, body);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value);
    scheduleSave(title, e.target.value);
  }

  if (isLoading) {
    return (
      <div style={{ padding: 32, fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text3)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', maxWidth: 760, margin: '0 auto' }}>
      {/* Save status indicator */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <span style={{
          fontFamily: 'DM Sans', fontSize: 12,
          color: saveStatus === 'error' ? 'var(--red)' : 'var(--text3)',
        }}>
          {saveStatus === 'unsaved' && 'Unsaved changes'}
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && 'Save failed'}
        </span>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={handleTitleChange}
        placeholder="Untitled doc"
        style={{
          fontFamily: 'Instrument Serif', fontSize: 32, color: 'var(--text)',
          border: 'none', outline: 'none', width: '100%',
          background: 'transparent', marginBottom: 24, display: 'block',
        }}
      />

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 24 }} />

      {/* Body */}
      <textarea
        value={body}
        onChange={handleBodyChange}
        placeholder="Start writing..."
        style={{
          fontFamily: 'DM Sans', fontSize: 15, color: 'var(--text)', lineHeight: 1.7,
          border: 'none', outline: 'none', width: '100%',
          background: 'transparent', resize: 'none', minHeight: 400,
          display: 'block',
        }}
      />
    </div>
  );
}
