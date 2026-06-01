/* Contacts — avatar-row table with inline actions */

const SEED_CONTACTS = [
  { id: 'c1', name: 'Priya Nair',     email: 'priya@meridianlabs.io', phone: '+1 415 555 0182', status: 'customer', last: '2026-05-11' },
  { id: 'c2', name: 'Tom Weston',     email: 'tom.w@meridianlabs.io', phone: '+1 415 555 0193', status: 'customer', last: '2026-05-08' },
  { id: 'c3', name: 'Amir Hosseini',  email: 'amir@stackline.dev',     phone: '+1 512 555 0247', status: 'prospect', last: '2026-05-12' },
  { id: 'c4', name: 'Clara Ruiz',     email: 'clara@stackline.dev',    phone: null,              status: 'prospect', last: '2026-05-06' },
  { id: 'c5', name: 'James Okafor',   email: 'j.okafor@cobaltsystems.com', phone: '+1 212 555 0318', status: 'customer', last: '2026-05-10' },
  { id: 'c6', name: 'Sophie Müller',  email: 'sophie@fenixanalytics.ai', phone: '+44 20 5555 0142', status: 'prospect', last: '2026-05-03' },
  { id: 'c7', name: 'Luca Ferretti',  email: 'luca@fenixanalytics.ai',  phone: null,              status: 'cold',     last: '2026-04-13' },
  { id: 'c8', name: 'Rachel Kim',     email: 'rachel.kim@orbitcloud.io', phone: '+1 206 555 0471', status: 'customer', last: '2026-05-12' },
  { id: 'c9', name: 'Nina Park',      email: 'nina@cobaltsystems.com',   phone: '+1 212 555 0319', status: 'prospect', last: '2026-05-09' },
  { id: 'c10', name: 'Ben Hartley',   email: 'ben@hartley.dev',          phone: null,              status: 'cold',     last: '2026-03-22' },
];

function Contacts({ openAdd, addTrigger }) {
  const [contacts, setContacts] = React.useState(SEED_CONTACTS);
  const [removing, setRemoving] = React.useState(new Set());
  const [modal, setModal] = React.useState(null);
  const [form, setForm] = React.useState({ name: '', email: '', status: 'prospect' });

  React.useEffect(() => { if (addTrigger > 0) setModal('add'); }, [addTrigger]);

  const remove = (id) => {
    setRemoving(s => new Set(s).add(id));
    setTimeout(() => setContacts(cs => cs.filter(c => c.id !== id)), 220);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    setContacts(cs => [{ id: 'c' + Date.now(), ...form, phone: null, last: today }, ...cs]);
    setForm({ name: '', email: '', status: 'prospect' });
    setModal(null);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{contacts.length} contacts</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1.6fr 1.1fr .9fr 1fr auto',
          padding: '11px 18px', borderBottom: '1px solid var(--border)',
          gap: 14, alignItems: 'center',
        }}>
          {['Name','Email','Phone','Status','Last contacted'].map(h => (
            <Eyebrow key={h}>{h}</Eyebrow>
          ))}
          <span />
        </div>
        {contacts.map((c, i) => (
          <ContactRow key={c.id} c={c} last={i === contacts.length - 1} fading={removing.has(c.id)} onDelete={() => remove(c.id)} />
        ))}
      </div>

      {modal === 'add' && (
        <Modal title="Add contact" onClose={() => setModal(null)}>
          <form onSubmit={submit}>
            <FormField label="Name"><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Jane Doe" autoFocus /></FormField>
            <FormField label="Email"><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="jane@example.com" /></FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
                <option value="cold">Cold</option>
              </Select>
            </FormField>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" variant="primary">Add</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ContactRow({ c, last, fading, onDelete }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1.6fr 1.6fr 1.1fr .9fr 1fr auto',
        gap: 14, alignItems: 'center',
        padding: '12px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        opacity: fading ? 0 : 1, transition: 'opacity .2s, background .15s',
        fontSize: 13,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={c.name} />
        <span style={{ color: 'var(--text)' }}>{c.name}</span>
      </span>
      <span style={{ color: 'var(--text)' }}>{c.email}</span>
      <span style={{ color: c.phone ? 'var(--text)' : 'var(--text3)' }}>{c.phone ?? '—'}</span>
      <span><Badge label={c.status} color={STATUS_COLOR[c.status] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text2)' }}>{new Date(c.last + 'T00:00:00').toLocaleDateString()}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <Button style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Edit</Button>
        <Button variant="danger" onClick={onDelete} style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12 }}>Delete</Button>
      </span>
    </div>
  );
}

window.Contacts = Contacts;
