/* Settings — tabbed layout with Profile, Team, Pipelines, SSH, API Keys. */

const SETTINGS_TABS = [
  { id: 'profile',   label: 'Profile' },
  { id: 'team',      label: 'Team' },
  { id: 'mail',      label: 'Mail' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'tasks',     label: 'Tasks' },
  { id: 'ssh',       label: 'SSH Keys' },
  { id: 'api-keys',  label: 'API Keys' },
];

function Settings() {
  const [tab, setTab] = React.useState('profile');

  return (
    <div style={{ padding: 24 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {SETTINGS_TABS.map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '10px 18px', border: 'none', background: 'none',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                color: on ? 'var(--text)' : 'var(--text3)',
                borderBottom: on ? '2px solid var(--text)' : '2px solid transparent',
                marginBottom: -1, cursor: 'pointer',
                transition: 'all .15s',
              }}>{t.label}</button>
          );
        })}
      </div>

      <div style={{ maxWidth: 620 }}>
        {tab === 'profile'   && <ProfilePanel />}
        {tab === 'team'      && <TeamPanel />}
        {tab === 'mail'      && <MailSettingsPanel />}
        {tab === 'pipelines' && <PipelinesPanel />}
        {tab === 'tasks'     && <PlaceholderPanel title="Task settings" body="Default assignees and notification rules for new tasks."/>}
        {tab === 'ssh'       && <SshPanel />}
        {tab === 'api-keys'  && <ApiKeysPanel />}
      </div>
    </div>
  );
}

function SettingsCard({ title, children, eyebrow }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '20px 24px', marginBottom: 16,
    }}>
      {eyebrow && <Eyebrow style={{ marginBottom: 14, display: 'block' }}>{eyebrow}</Eyebrow>}
      {title && <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', color: 'var(--text)', marginBottom: 12 }}>{title}</div>}
      {children}
    </div>
  );
}

function FieldRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function ProfilePanel() {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 4 }}>Profile</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Your account details.</p>

      <SettingsCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <Avatar name="Nina" size={56} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Nina Park</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>nina@vencore.dev</div>
          </div>
        </div>
        <FieldRow label="Full name" value="Nina Park" />
        <FieldRow label="Email" value="nina@vencore.dev" />
        <FieldRow label="Role" value={<Badge label="admin" color="purple" />} />
        <FieldRow label="User ID" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>usr_7f3a8c2d…</span>} />
      </SettingsCard>
    </>
  );
}

function TeamPanel() {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 4 }}>Team &amp; Workspace</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Your workspace details and role.</p>

      <SettingsCard eyebrow="Workspace">
        <FieldRow label="Name" value="Vencore Internal" />
        <FieldRow label="Plan" value={<Badge label="active" color="green" />} />
        <FieldRow label="Contacts" value="12 / 1,000" />
        <FieldRow label="Servers" value="4 / 5" />
        <FieldRow label="Databases" value="3 / 3" />
      </SettingsCard>

      <SettingsCard eyebrow="Members">
        {[
          { name: 'Nina Park', email: 'nina@vencore.dev', role: 'admin' },
          { name: 'James Okafor', email: 'james@vencore.dev', role: 'admin' },
          { name: 'Tom Weston', email: 'tom@vencore.dev', role: 'member' },
        ].map((m, i) => (
          <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <Avatar name={m.name} size={30} dark={false} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
            </div>
            <Badge label={m.role} color={m.role === 'admin' ? 'purple' : 'gray'} />
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Button variant="primary"><Icon name="plus" size={13} /> Invite member</Button>
        </div>
      </SettingsCard>
    </>
  );
}

function MailSettingsPanel() {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 18 }}>Mail accounts</h2>
      <SettingsCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
            <Icon name="mail" size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>nina@vencore.dev</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Gmail · synced 2m ago</div>
          </div>
          <Badge label="connected" color="green" />
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Button>+ Connect mail account</Button>
        </div>
      </SettingsCard>
    </>
  );
}

function PipelinesPanel() {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 4 }}>Pipelines</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Customize stages and per-stage custom fields. Drag stages to reorder.</p>

      <SettingsCard title="Sales (default)">
        {[
          { name: 'Lead',       color: '#6366f1', fields: 3 },
          { name: 'Qualifying', color: '#1e3a8a', fields: 4 },
          { name: 'Proposal',   color: '#92400e', fields: 5 },
          { name: 'Closing',    color: '#4c1d95', fields: 6 },
          { name: 'Won',        color: '#22c55e', fields: 3 },
          { name: 'Lost',       color: '#ef4444', fields: 2 },
        ].map((s, i) => (
          <div key={s.name} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
          }}>
            <span style={{ color: 'var(--text3)', cursor: 'grab', display: 'flex' }}><Icon name="filter" size={14} /></span>
            <span style={{ background: s.color + '1a', color: s.color, borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>{s.name}</span>
            <span style={{ flex: 1, fontSize: 11, color: 'var(--text3)' }}>{s.fields} custom field{s.fields > 1 ? 's' : ''}</span>
            <Button style={{ padding: '4px 10px', fontSize: 12 }}>Edit</Button>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <Button>+ Add stage</Button>
          <Button variant="primary">Save changes</Button>
        </div>
      </SettingsCard>
    </>
  );
}

function SshPanel() {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 4 }}>SSH keys</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Used by the monitoring agent when running over SSH-based transports.</p>
      <SettingsCard>
        {[
          { name: 'agent-prod-2026',  fingerprint: 'SHA256:Z9Lc…JTb4', added: '3 months ago' },
          { name: 'agent-staging',    fingerprint: 'SHA256:Fz3a…HoQu', added: '1 month ago' },
        ].map((k, i) => (
          <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
              <Icon name="settings" size={14} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{k.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{k.fingerprint}</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{k.added}</span>
            <Button variant="danger" style={{ padding: '4px 10px', fontSize: 12 }}>Revoke</Button>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Button>+ Add SSH key</Button>
        </div>
      </SettingsCard>
    </>
  );
}

function ApiKeysPanel() {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 4 }}>API keys</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Workspace-scoped keys for the public Vencore REST API.</p>
      <SettingsCard>
        {[
          { name: 'CI deploy',      preview: 'vt_••••••••••••4b9c', last: '5m ago',  scope: 'write' },
          { name: 'Analytics ETL',  preview: 'vt_••••••••••••8e1a', last: '2h ago',  scope: 'read'  },
          { name: 'Status checker', preview: 'vt_••••••••••••203f', last: '6d ago',  scope: 'read'  },
        ].map((k, i) => (
          <div key={k.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{k.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{k.preview}</div>
            </div>
            <Badge label={k.scope} color={k.scope === 'write' ? 'amber' : 'gray'} />
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>last used {k.last}</span>
            <Button variant="danger" style={{ padding: '4px 10px', fontSize: 12 }}>Revoke</Button>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <Button variant="primary">+ Generate new key</Button>
        </div>
      </SettingsCard>
    </>
  );
}

function PlaceholderPanel({ title, body }) {
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 4 }}>{title}</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>{body}</p>
      <SettingsCard>
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Coming soon.</div>
      </SettingsCard>
    </>
  );
}

window.Settings = Settings;
