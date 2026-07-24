'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/modules/shared/lib/api';
import { GlassCard, PageHeader, FluidButton, FluidInput, MSIcon } from '@/modules/shared/fluid/ui';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  lastCheckedAt: string | null;
}

interface UpdaterStatus {
  state: 'idle' | 'pulling' | 'recreating' | 'error' | 'unavailable' | 'unreachable';
  targetVersion?: string | null;
  log?: string[];
}

type Phase = 'ready' | 'confirming' | 'updating' | 'waiting' | 'done' | 'failed';

function majorOf(v: string): number {
  return Number(v.split('.')[0] ?? 0);
}

const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '14px 0',
  borderBottom: '1px solid var(--fl-outline-variant)',
};
const label: React.CSSProperties = { fontSize: 13, color: 'var(--fl-on-surface-variant)', fontWeight: 600 };
const value: React.CSSProperties = { fontSize: 14, color: 'var(--fl-on-surface)' };

/**
 * Fluid Updates settings panel — registered into the Foundation settings
 * registry (workspace scope, admin-only). Mounted directly by
 * apps/web/app/(fluid)/settings/updates/page.tsx.
 *
 * Reuses the exact backend surface as the legacy
 * apps/web/app/(dashboard)/settings/updates/page.tsx it replaces:
 *   - GET  /api/system/update-info    → current/latest version + availability
 *   - POST /api/system/check-updates  → force a check now
 *   - POST /api/system/update         → kick off an update to a version
 *   - GET  /api/system/update-status  → poll progress during an update
 *   - GET  /api/system/version        → poll for the app coming back post-restart
 */
export function UpdatesPanel() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadInfo = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: UpdateInfo }>('/api/system/update-info');
      setInfo(res.data);
      if (res.data.latestVersion) {
        localStorage.setItem('vencore-update-dismissed', res.data.latestVersion);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load update info');
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadInfo]);

  const checkNow = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: UpdateInfo }>('/api/system/check-updates', { method: 'POST' });
      setInfo(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const startPolling = (target: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<{ data: UpdaterStatus }>('/api/system/update-status');
        setStatus(res.data);
        if (res.data.state === 'error') {
          setPhase('failed');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // API is down — the recreate window. Switch to waiting for it to return.
        setPhase('waiting');
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const v = await apiFetch<{ data: { version: string } }>('/api/system/version');
            if (v.data.version === target) {
              if (pollRef.current) clearInterval(pollRef.current);
              setPhase('done');
              setTimeout(() => window.location.reload(), 1500);
            }
          } catch {
            /* still restarting */
          }
        }, 3000);
      }
    }, 2000);
  };

  const startUpdate = async () => {
    if (!info?.latestVersion) return;
    setError(null);
    try {
      await apiFetch('/api/system/update', {
        method: 'POST',
        body: JSON.stringify({ version: info.latestVersion }),
      });
      setPhase('updating');
      startPolling(info.latestVersion);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed to start');
      setPhase('ready');
    }
  };

  const isMajor =
    info?.latestVersion != null &&
    /^\d+\.\d+\.\d+$/.test(info.currentVersion) &&
    majorOf(info.latestVersion) > majorOf(info.currentVersion);

  return (
    <>
      <PageHeader title="Updates" subtitle="Keep this instance up to date." />

      <GlassCard>
        <div style={row}>
          <span style={label}>Current version</span>
          <span style={value}>{info?.currentVersion ?? '…'}</span>
        </div>
        <div style={row}>
          <span style={label}>Latest version</span>
          <span style={value}>{info?.latestVersion ?? 'unknown'}</span>
        </div>
        <div style={row}>
          <span style={label}>Last checked</span>
          <span style={value}>
            {info?.lastCheckedAt ? new Date(info.lastCheckedAt).toLocaleString() : 'never'}
          </span>
        </div>
        {info?.releaseUrl && (
          <div style={row}>
            <span style={label}>Release notes</span>
            <a
              href={info.releaseUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...value, color: 'var(--fl-primary)', textDecoration: 'underline' }}
            >
              View on GitHub
            </a>
          </div>
        )}

        {error && (
          <p style={{
            fontSize: 13, color: 'var(--fl-on-error-container)', background: 'var(--fl-error-container)',
            padding: '10px 14px', borderRadius: 'var(--fl-radius-card)', marginTop: 16,
          }}>
            {error}
          </p>
        )}

        {phase === 'ready' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <FluidButton variant="ghost" onClick={() => void checkNow()} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </FluidButton>
            {info?.updateAvailable && (
              <FluidButton onClick={() => setPhase('confirming')}>
                Update to {info.latestVersion}
              </FluidButton>
            )}
          </div>
        )}

        {phase === 'confirming' && info?.latestVersion && (
          <div style={{
            marginTop: 20, padding: 16,
            background: isMajor ? 'var(--fl-secondary-container)' : 'var(--fl-surface-container-high)',
            borderRadius: 'var(--fl-radius-card)',
          }}>
            <p style={{
              fontSize: 14, margin: '0 0 12px',
              color: isMajor ? 'var(--fl-on-secondary-container)' : 'var(--fl-on-surface)',
            }}>
              {isMajor
                ? `This is a major version upgrade (${info.currentVersion} → ${info.latestVersion}) and may include breaking changes. Type the version to confirm.`
                : `Update from ${info.currentVersion} to ${info.latestVersion}? The app will restart briefly.`}
            </p>
            {isMajor && (
              <div style={{ marginBottom: 12 }}>
                <FluidInput value={confirmText} onChange={setConfirmText} placeholder={info.latestVersion} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <FluidButton
                disabled={isMajor && confirmText !== info.latestVersion}
                onClick={() => void startUpdate()}
              >
                Update now
              </FluidButton>
              <FluidButton variant="ghost" onClick={() => { setPhase('ready'); setConfirmText(''); }}>
                Cancel
              </FluidButton>
            </div>
          </div>
        )}

        {(phase === 'updating' || phase === 'waiting') && (
          <div style={{ marginTop: 20, padding: 16, background: 'var(--fl-surface-container-high)', borderRadius: 'var(--fl-radius-card)' }}>
            <p style={{ fontSize: 14, margin: 0, fontWeight: 600, color: 'var(--fl-on-surface)' }}>
              {phase === 'updating'
                ? status?.state === 'recreating'
                  ? 'Restarting services…'
                  : 'Pulling new images…'
                : 'Waiting for services to come back…'}
            </p>
            {status?.log && status.log.length > 0 && (
              <pre style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', maxHeight: 160, overflow: 'auto', marginTop: 12, marginBottom: 0 }}>
                {status.log.slice(-12).join('\n')}
              </pre>
            )}
          </div>
        )}

        {phase === 'done' && (
          <p style={{
            fontSize: 14, color: 'var(--fl-on-success-container)', background: 'var(--fl-success-container)',
            padding: '10px 14px', borderRadius: 'var(--fl-radius-card)', marginTop: 20,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <MSIcon name="check_circle" size={18} />
            Updated successfully — reloading…
          </p>
        )}

        {phase === 'failed' && (
          <div style={{ marginTop: 20, padding: 16, background: 'var(--fl-error-container)', borderRadius: 'var(--fl-radius-card)' }}>
            <p style={{ fontSize: 14, color: 'var(--fl-on-error-container)', margin: '0 0 10px', fontWeight: 600 }}>
              Update failed.
            </p>
            {status?.log && (
              <pre style={{ fontSize: 12, color: 'var(--fl-on-surface-variant)', maxHeight: 160, overflow: 'auto', margin: '0 0 10px' }}>
                {status.log.slice(-12).join('\n')}
              </pre>
            )}
            <p style={{ fontSize: 13, color: 'var(--fl-on-surface-variant)', margin: 0 }}>
              To roll back manually: set VENCORE_VERSION back to the value of VENCORE_PREVIOUS_VERSION in your install
              directory&apos;s .env, then run <code>docker compose up -d</code>.
            </p>
            <div style={{ marginTop: 12 }}>
              <FluidButton variant="ghost" onClick={() => { setPhase('ready'); setStatus(null); }}>
                Dismiss
              </FluidButton>
            </div>
          </div>
        )}
      </GlassCard>
    </>
  );
}
