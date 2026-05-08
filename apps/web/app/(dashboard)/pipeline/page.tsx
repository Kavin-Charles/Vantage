import { Topbar } from '@/components/Topbar';

export default function PipelinePage() {
  return (
    <>
      <Topbar action={<button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>+ Add Deal</button>} />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--text2)' }}>Pipeline — coming soon</p>
      </div>
    </>
  );
}
