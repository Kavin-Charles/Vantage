'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { portalApproveApi } from '@/modules/projects/lib/api';
import type { ApproveTokenInfo } from '@/modules/projects/lib/api';

type PageState = 'loading' | 'ready' | 'done' | 'error';

export default function ApprovePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [info, setInfo] = useState<ApproveTokenInfo | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneAction, setDoneAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!token) return;
    portalApproveApi.getInfo(token).then(json => {
      if (json.error || !json.data) {
        setError(json.error?.message ?? 'Invalid or expired link.');
        setState('error');
        return;
      }
      if (json.data.already_responded) {
        setState('done');
        setDoneAction(json.data.action);
        setInfo(json.data);
        return;
      }
      setInfo(json.data);
      setState('ready');
    }).catch(() => {
      setError('Failed to load approval request.');
      setState('error');
    });
  }, [token]);

  async function handleSubmit() {
    if (!token || !info) return;
    setSubmitting(true);
    try {
      const json = await portalApproveApi.submit(token);
      if (json.error) {
        setError(json.error.message ?? 'Something went wrong.');
        return;
      }
      setDoneAction(info.action);
      setState('done');
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const isApprove = info?.action === 'approve';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #f7f6f2)',
        fontFamily: 'DM Sans, sans-serif',
        padding: 24,
      }}
    >
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div
        style={{
          width: 440,
          maxWidth: '100%',
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #e4e0d8)',
          borderRadius: 16,
          padding: 36,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          animation: 'fadeInUp .3s ease both',
        }}
      >
        {state === 'loading' && (
          <p style={{ textAlign: 'center', color: 'var(--text3, #9e998f)', fontSize: 14 }}>Loading…</p>
        )}

        {state === 'error' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>⚠️</span>
            </div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', textAlign: 'center', margin: '0 0 10px' }}>
              Link Invalid
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text2, #6b665c)', textAlign: 'center', margin: 0 }}>
              {error}
            </p>
          </>
        )}

        {state === 'done' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 40 }}>{doneAction === 'approve' ? '✅' : '❌'}</span>
            </div>
            <h1 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 22, color: 'var(--text, #1a1814)', textAlign: 'center', margin: '0 0 10px' }}>
              {doneAction === 'approve' ? 'Approval Recorded' : 'Rejection Recorded'}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text2, #6b665c)', textAlign: 'center', margin: 0 }}>
              {info?.already_responded
                ? 'This request has already been responded to.'
                : `Your ${doneAction === 'approve' ? 'approval' : 'rejection'} has been recorded for "${info?.project_name ?? 'this project'}".`}
            </p>
          </>
        )}

        {state === 'ready' && info && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 40 }}>{isApprove ? '👍' : '👎'}</span>
            </div>
            <h1
              style={{
                fontFamily: 'Instrument Serif, serif',
                fontSize: 24,
                color: 'var(--text, #1a1814)',
                textAlign: 'center',
                margin: '0 0 10px',
              }}
            >
              {isApprove ? 'Approve Request' : 'Reject Request'}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text2, #6b665c)',
                textAlign: 'center',
                margin: '0 0 28px',
                lineHeight: 1.6,
              }}
            >
              You are being asked to <strong>{isApprove ? 'approve' : 'reject'}</strong> a request for{' '}
              <strong>{info.project_name}</strong>.
            </p>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--red, #991b1b)', textAlign: 'center', marginBottom: 16 }}>
                {error}
              </p>
            )}

            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              style={{
                display: 'block',
                width: '100%',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 15,
                fontWeight: 600,
                padding: '12px 0',
                borderRadius: 10,
                background: isApprove ? 'var(--green, #2d6a4f)' : 'var(--red, #991b1b)',
                color: '#fff',
                border: 'none',
                cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.65 : 1,
                transition: 'opacity .15s',
              }}
            >
              {submitting ? 'Submitting…' : isApprove ? 'Confirm Approval' : 'Confirm Rejection'}
            </button>

            <p style={{ fontSize: 12, color: 'var(--text3, #9e998f)', textAlign: 'center', marginTop: 14, margin: '14px 0 0' }}>
              This action is final and will be logged on the project.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
