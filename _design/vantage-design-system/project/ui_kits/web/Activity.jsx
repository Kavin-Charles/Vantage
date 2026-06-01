/* Activity — unified feed. Mirrors apps/web/app/(dashboard)/activity/page.tsx */

const TYPE_ICONS = {
  email: 'mail', call: 'phone', note: 'note', meeting: 'meeting',
  deal_change: 'arrow', contact_created: 'contacts',
};
const TYPE_LABELS = {
  email: 'Email', call: 'Call', note: 'Note', meeting: 'Meeting',
  deal_change: 'Deal Change', contact_created: 'Contact Created',
};

const SEED_ACTIVITY = [
  { id: 'a1', type: 'call',     body: 'Discussed pricing options and support SLA. Rachel is ready to move forward pending legal review.',     at: 'now-2m' },
  { id: 'a2', type: 'email',    body: 'Sent over the Team Plan proposal PDF. Requested a follow-up call for Thursday.',                      at: 'now-2m' },
  { id: 'a3', type: 'meeting',  body: 'Intro call with Cobalt security team. They want infra monitoring + CRM bundled. Good fit for enterprise tier.', at: 'now-2m' },
  { id: 'a4', type: 'note',     body: 'Meridian fully onboarded. Using pipeline + server monitoring. Very happy so far — potential expansion to 3 more seats.', at: 'now-2m' },
  { id: 'a5', type: 'email',    body: 'Amir signed up for the trial. Walked him through the monitoring agent setup over chat.',             at: 'now-2m' },
  { id: 'a6', type: 'call',     body: 'Quick call to clarify the infra monitoring scope. Nina confirmed 4 servers and 2 databases.',         at: 'now-2m' },
  { id: 'a7', type: 'note',     body: 'Replied to inbound enquiry. Indie developer looking for a lightweight CRM. Sent trial link.',         at: 'now-2m' },
  { id: 'a8', type: 'deal_change', body: 'Orbit Cloud moved Closing → Won. $36,000 added to pipeline revenue.',                              at: 'now-2m' },
];

function Activity({ logTrigger }) {
  const [items, setItems] = React.useState(SEED_ACTIVITY);
  const [modal, setModal] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'note', body: '' });

  React.useEffect(() => { if (logTrigger > 0) setModal(true); }, [logTrigger]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.body.trim()) return;
    setItems([{ id: 'a' + Date.now(), type: form.type, body: form.body, at: 'just now' }, ...items]);
    setForm({ type: 'note', body: '' });
    setModal(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{items.length} total activities</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {items.map((item, i) => <ActivityRow key={item.id} item={item} last={i === items.length - 1} />)}
      </div>

      {modal && (
        <Modal title="Log activity" onClose={() => setModal(false)}>
          <form onSubmit={submit}>
            <FormField label="Type">
              <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="note">Note</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
              </Select>
            </FormField>
            <FormField label="Details">
              <Textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="What happened?"
                rows={4}
              />
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button onClick={() => setModal(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Log</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ActivityRow({ item, last }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', gap: 14, padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: 999,
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text2)', flexShrink: 0,
      }}><Icon name={TYPE_ICONS[item.type] ?? 'note'} size={15} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Eyebrow style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--text2)' }}>
            {TYPE_LABELS[item.type] ?? item.type}
          </Eyebrow>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{item.at === 'just now' ? 'just now' : '2m ago'}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{item.body}</p>
      </div>
    </div>
  );
}

window.Activity = Activity;
