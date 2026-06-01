/* Mail — 3-pane layout: folders, list, reader. Lifted from the source's
   FolderSidebar + EmailList + EmailDetail structure. */

const FOLDERS = [
  { id: 'inbox',   label: 'Inbox',   icon: 'mail',     count: 4 },
  { id: 'starred', label: 'Starred', icon: 'check',    count: 1 },
  { id: 'sent',    label: 'Sent',    icon: 'arrow',    count: 2 },
  { id: 'trash',   label: 'Trash',   icon: 'x',        count: 0 },
];

const SEED_EMAILS = [
  { id: 'em1', from: 'Rachel Kim',     fromAddr: 'rachel.kim@orbitcloud.io',     subject: 'Re: Platform License — legal review',           preview: 'Just heard back from our counsel. We\u2019re aligned on the redlines from yesterday. Let\u2019s lock the dates Tuesday.', at: '2h',   starred: true,  unread: true,  folder: 'inbox' },
  { id: 'em2', from: 'Priya Nair',     fromAddr: 'priya@meridianlabs.io',        subject: 'Welcome to Vantage \u2014 onboarding checklist',  preview: 'Hi Nina, here\u2019s the checklist we agreed on. I\u2019ll add the team this afternoon and run the agent install on staging.',         at: '5h',   starred: false, unread: true,  folder: 'inbox' },
  { id: 'em3', from: 'James Okafor',   fromAddr: 'j.okafor@cobaltsystems.com',    subject: 'Enterprise tier \u2014 SOC2 docs',                preview: 'Attached our updated SOC2 Type II. Quick question on the data retention defaults.',                                          at: '8h',   starred: false, unread: true,  folder: 'inbox' },
  { id: 'em4', from: 'Vantage Alerts', fromAddr: 'noreply@vantage.dev',           subject: '[critical] prod-worker-01 memory 91.7%',          preview: 'Critical threshold (90%) crossed at 11:38:42 PM. Active for 3m. View alert: https://...',                                  at: '1d',   starred: false, unread: false, folder: 'inbox' },
  { id: 'em5', from: 'Amir Hosseini',  fromAddr: 'amir@stackline.dev',            subject: 'Trial extension request',                          preview: 'Hey \u2014 mind extending our trial by a week? Still working through the infra side.',                                       at: '2d',   starred: false, unread: false, folder: 'inbox' },
];

function Mail() {
  const [folder, setFolder]   = React.useState('inbox');
  const [selectedId, select]  = React.useState('em1');
  const list = SEED_EMAILS.filter(e =>
    folder === 'inbox'   ? e.folder === 'inbox' :
    folder === 'starred' ? e.starred :
    folder === 'sent'    ? e.folder === 'sent' :
    folder === 'trash'   ? e.folder === 'trash' : true
  );
  const selected = list.find(e => e.id === selectedId) ?? list[0];

  return (
    <div style={{ height: '100%', display: 'flex', background: 'var(--bg)' }}>
      {/* Folder sidebar */}
      <div style={{ width: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '14px 10px', flexShrink: 0 }}>
        <Button variant="primary" style={{ marginBottom: 14, padding: '8px 12px', justifyContent: 'center' }}>
          <Icon name="plus" size={13} /> Compose
        </Button>
        {FOLDERS.map(f => {
          const on = folder === f.id;
          return (
            <button key={f.id} onClick={() => { setFolder(f.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 10, border: 'none',
                background: on ? 'var(--text)' : 'transparent',
                color: on ? '#fff' : 'var(--text2)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 500 : 400,
                cursor: 'pointer', marginBottom: 2, textAlign: 'left',
              }}>
              <Icon name={f.icon} size={14} />
              {f.label}
              <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{f.count}</span>
            </button>
          );
        })}
      </div>

      {/* Email list pane */}
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 12px' }}>
            <span style={{ color: 'var(--text3)' }}><Icon name="search" size={14} /></span>
            <input placeholder="Search messages..."
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit', width: '100%' }}/>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {list.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No messages.</div>
          ) : list.map((e, i) => (
            <EmailListItem key={e.id} e={e} active={selectedId === e.id} last={i === list.length - 1} onClick={() => select(e.id)} />
          ))}
        </div>
      </div>

      {/* Reader pane */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)' }}>
        {selected ? <EmailReader e={selected} /> : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
            Select an email to read
          </div>
        )}
      </div>
    </div>
  );
}

function EmailListItem({ e, active, last, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        padding: '12px 14px', cursor: 'pointer',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        borderLeft: active ? '3px solid var(--text)' : '3px solid transparent',
        background: active ? 'var(--surface2)' : (hover ? 'var(--bg)' : 'transparent'),
        transition: 'background .12s, border-color .12s',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {e.unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--text)', flexShrink: 0 }}/>}
        <span style={{ fontSize: 13, fontWeight: e.unread ? 600 : 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{e.from}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{e.at}</span>
      </div>
      <div style={{ fontSize: 12.5, color: e.unread ? 'var(--text)' : 'var(--text2)', fontWeight: e.unread ? 500 : 400, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.preview}</div>
    </div>
  );
}

function EmailReader({ e }) {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)', marginBottom: 14 }}>{e.subject}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={e.from} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{e.from}</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>&lt;{e.fromAddr}&gt;</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>to me · {e.at} ago</div>
          </div>
          <Button style={{ padding: '5px 12px', fontSize: 12 }}><Icon name="arrow" size={12} /> Reply</Button>
        </div>
      </div>

      <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
        <p style={{ marginBottom: 14 }}>{e.preview}</p>
        <p style={{ marginBottom: 14 }}>
          We can lock the platform license terms by Tuesday and target the kickoff for the week of the 27th. Pretty straightforward integration on our end — your agent is already on staging and reporting clean metrics.
        </p>
        <p style={{ marginBottom: 18 }}>
          Worth a 30-min sync to walk through the rollout plan with our SRE team? I'll send a few slots if helpful.
        </p>
        <p style={{ color: 'var(--text2)' }}>— {e.from.split(' ')[0]}</p>
      </div>
    </div>
  );
}

window.Mail = Mail;
