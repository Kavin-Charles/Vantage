'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { FormField, Input } from '@/components/ui/FormField';
import { useApiToken } from '@/lib/useApiToken';
import { listDeployments, createDeployment, deleteDeployment } from '@/lib/deployments';
import type { Deployment } from '@vantage/types';
import type { CreateDeploymentBody } from '@/lib/deployments';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(s: number | null): string {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

type StatusColor = 'green' | 'red' | 'blue' | 'amber' | 'gray';
const STATUS_COLOR: Record<string, StatusColor> = {
  success: 'green',
  failed: 'red',
  running: 'blue',
  pending: 'amber',
  cancelled: 'gray',
};

const EMPTY_FORM: CreateDeploymentBody = {
  status: 'success',
  source: 'manual',
  name: '',
  environment: '',
  git_branch: '',
  git_commit: '',
};

const SETUP_CURL = `curl -X POST https://your-vantage-url/v1/deployments \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "api",
    "environment": "production",
    "status": "success",
    "git_branch": "main",
    "git_commit": "abc1234",
    "source": "webhook"
  }'`;

const SETUP_GHA = `- name: Notify Vantage
  if: always()
  env:
    VANTAGE_STATUS: \${{ job.status == 'success' && 'success' || 'failed' }}
  run: |
    curl -X POST https://your-vantage-url/v1/deployments \\
      -H "Authorization: Bearer \${{ secrets.VANTAGE_API_KEY }}" \\
      -H "Content-Type: application/json" \\
      -d "{\\"name\\":\\"\${{ github.repository }}\\",\\"environment\\":\\"production\\",\\"status\\":\\"\$VANTAGE_STATUS\\",\\"git_branch\\":\\"\${{ github.ref_name }}\\",\\"git_commit\\":\\"\${{ github.sha }}\\",\\"source\\":\\"webhook\\"}"`;

// ── Components ────────────────────────────────────────────────────────────────

function DeploymentDetail({ dep, onClose }: { dep: Deployment; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      zIndex: 50, overflowY: 'auto', padding: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
          {dep.name ?? 'Deployment'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)' }}>×</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row label="Status"><Badge label={dep.status} color={STATUS_COLOR[dep.status] ?? 'gray'} /></Row>
        <Row label="Source"><Badge label={dep.source} color="gray" /></Row>
        {dep.environment && <Row label="Environment">{dep.environment}</Row>}
        {dep.git_branch && <Row label="Branch">{dep.git_branch}</Row>}
        {dep.git_commit && <Row label="Commit"><code style={{ fontSize: 12 }}>{dep.git_commit.slice(0, 12)}</code></Row>}
        {dep.git_tag && <Row label="Tag">{dep.git_tag}</Row>}
        {dep.git_author && <Row label="Author">{dep.git_author}</Row>}
        {dep.git_message && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Commit message</div>
            <div style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg)', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>{dep.git_message}</div>
          </div>
        )}
        <Row label="Duration">{formatDuration(dep.duration_s)}</Row>
        <Row label="Started">{new Date(dep.started_at).toLocaleString()}</Row>
        {dep.finished_at && <Row label="Finished">{new Date(dep.finished_at).toLocaleString()}</Row>}
        {dep.meta && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Meta</div>
            <details>
              <summary style={{ fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>Show raw JSON</summary>
              <pre style={{ fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 6, marginTop: 4, overflow: 'auto', border: '1px solid var(--border)' }}>
                {JSON.stringify(dep.meta, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 12, color: 'var(--text3)', width: 90, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

function SetupSnippets() {
  const [tab, setTab] = useState<'curl' | 'gha'>('curl');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 640 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
        Log your first deployment
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Send deploys from CI, your terminal, or the monitoring agent.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['curl', 'gha'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--text)' : 'var(--bg)',
            color: tab === t ? '#fff' : 'var(--text2)',
            fontFamily: 'inherit', fontSize: 12,
          }}>
            {t === 'curl' ? 'curl' : 'GitHub Actions'}
          </button>
        ))}
      </div>
      <pre style={{
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 14, fontSize: 11,
        overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>
        {tab === 'curl' ? SETUP_CURL : SETUP_GHA}
      </pre>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeploymentsPage() {
  const getToken = useApiToken();
  const qc = useQueryClient();

  // Filters
  const [filterName, setFilterName] = useState('');
  const [filterEnv, setFilterEnv] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // UI state
  const [selected, setSelected] = useState<Deployment | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<CreateDeploymentBody>(EMPTY_FORM);
  const [showGit, setShowGit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['deployments', filterName, filterEnv, filterStatus],
    queryFn: async () => listDeployments(await getToken(), {
      name: filterName || undefined,
      environment: filterEnv || undefined,
      status: filterStatus || undefined,
    }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const createMut = useMutation({
    mutationFn: async () => createDeployment(await getToken(), {
      ...form,
      name: form.name || undefined,
      environment: form.environment || undefined,
      git_branch: form.git_branch || undefined,
      git_commit: form.git_commit || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deployments'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteDeployment(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['deployments'] }),
  });

  const deployments = data?.data ?? [];
  const isEmpty = !isLoading && deployments.length === 0 && !filterName && !filterEnv && !filterStatus;

  return (
    <>
      <Topbar />
      <div style={{ padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, margin: 0 }}>Deployments</h1>
          <Button onClick={() => setShowModal(true)}>Log Deploy</Button>
        </div>

        {/* Filters */}
        {!isEmpty && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <Input
              placeholder="Filter by name…"
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
              style={{ width: 180 }}
            />
            <Input
              placeholder="Filter by environment…"
              value={filterEnv}
              onChange={e => setFilterEnv(e.target.value)}
              style={{ width: 180 }}
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
              }}
            >
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        )}

        {/* Content */}
        {isEmpty ? (
          <SetupSnippets />
        ) : isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        ) : deployments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No deployments match filters.</div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 120px 160px 100px 80px 100px 40px',
              padding: '8px 16px', borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span>Status</span><span>Name</span><span>Environment</span><span>Git</span><span>Duration</span><span>Source</span><span>Time</span><span />
            </div>
            {/* Rows */}
            {deployments.map((dep, i) => (
              <DeploymentRow
                key={dep.id}
                dep={dep}
                last={i === deployments.length - 1}
                onClick={() => setSelected(dep)}
                onDelete={() => deleteMut.mutate(dep.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail slide-over */}
      {selected && <DeploymentDetail dep={selected} onClose={() => setSelected(null)} />}

      {/* Log Deploy modal */}
      {showModal && (
        <Modal title="Log Deploy" onClose={() => { setShowModal(false); setForm(EMPTY_FORM); }}>
          <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }}>
            <FormField label="Name">
              <Input placeholder="api, web, monolith…" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </FormField>
            <FormField label="Environment">
              <Input placeholder="production, staging…" value={form.environment ?? ''} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))} />
            </FormField>
            <FormField label="Status *">
              <select
                required
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as CreateDeploymentBody['status'] }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }}
              >
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="running">Running</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </FormField>

            <button
              type="button"
              onClick={() => setShowGit(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 13, padding: '4px 0', marginBottom: 8 }}
            >
              {showGit ? '▾' : '▸'} Git info (optional)
            </button>
            {showGit && (
              <>
                <FormField label="Branch">
                  <Input placeholder="main" value={form.git_branch ?? ''} onChange={e => setForm(f => ({ ...f, git_branch: e.target.value }))} />
                </FormField>
                <FormField label="Commit SHA">
                  <Input placeholder="abc1234" value={form.git_commit ?? ''} onChange={e => setForm(f => ({ ...f, git_commit: e.target.value }))} />
                </FormField>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button type="button" variant="secondary" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Logging…' : 'Log Deploy'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function DeploymentRow({ dep, last, onClick, onDelete }: {
  dep: Deployment;
  last: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const gitText = [dep.git_branch, dep.git_commit ? dep.git_commit.slice(0, 7) : null].filter(Boolean).join(' · ') || '—';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr 120px 160px 100px 80px 100px 40px',
        padding: '10px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
        background: hover ? 'var(--surface2)' : 'transparent',
        alignItems: 'center',
        fontSize: 13,
      }}
    >
      <span><Badge label={dep.status} color={STATUS_COLOR[dep.status] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {dep.name ?? <span style={{ color: 'var(--text3)' }}>unnamed</span>}
      </span>
      <span style={{ color: 'var(--text2)' }}>{dep.environment ?? '—'}</span>
      <span style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gitText}</span>
      <span style={{ color: 'var(--text2)' }}>{formatDuration(dep.duration_s)}</span>
      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{dep.source}</span>
      <span style={{ color: 'var(--text3)' }}>{timeAgo(dep.created_at)}</span>
      <span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete deployment"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text3)', fontSize: 16, padding: '2px 6px',
            borderRadius: 6, lineHeight: 1,
          }}
        >
          ×
        </button>
      </span>
    </div>
  );
}
