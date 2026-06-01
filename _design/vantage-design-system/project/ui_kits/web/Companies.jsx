/* Companies — table view: Company, Industry, Location, Employees, Website */

const SEED_COMPANIES = [
  { id: 'co1', name: 'Meridian Labs',      industry: 'AI Infrastructure',   location: 'San Francisco, CA', employees: 42,  website: 'meridianlabs.io' },
  { id: 'co2', name: 'Cobalt Systems',     industry: 'Enterprise SaaS',     location: 'New York, NY',      employees: 180, website: 'cobaltsystems.com' },
  { id: 'co3', name: 'Stackline',          industry: 'Developer Tools',     location: 'Austin, TX',        employees: 12,  website: 'stackline.dev' },
  { id: 'co4', name: 'Fenix Analytics',    industry: 'Data Analytics',      location: 'London, UK',        employees: 28,  website: 'fenixanalytics.ai' },
  { id: 'co5', name: 'Orbit Cloud',        industry: 'Cloud Hosting',       location: 'Seattle, WA',       employees: 94,  website: 'orbitcloud.io' },
  { id: 'co6', name: 'Hartley Software',   industry: 'Independent',         location: 'Remote',            employees: 1,   website: 'hartley.dev' },
  { id: 'co7', name: 'Nine Mile Labs',     industry: 'Robotics',            location: 'Boston, MA',        employees: 22,  website: 'ninemile.co' },
];

function Companies({ openAdd, addTrigger }) {
  const [companies] = React.useState(SEED_COMPANIES);
  const [modal, setModal] = React.useState(null);
  const [form, setForm] = React.useState({ name: '', industry: '', location: '', employees: '', website: '' });

  React.useEffect(() => { if (addTrigger > 0) setModal('add'); }, [addTrigger]);

  const cols = 'minmax(160px,1.4fr) 1.2fr 1.1fr .7fr 1fr auto';

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>{companies.length} companies</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
          padding: '12px 18px', borderBottom: '1px solid var(--border)',
        }}>
          {['Company','Industry','Location','Employees','Website'].map(h => <Eyebrow key={h}>{h}</Eyebrow>)}
          <span/>
        </div>
        {companies.map((c, i) => (
          <CompanyRow key={c.id} c={c} cols={cols} last={i === companies.length - 1} />
        ))}
      </div>

      {modal === 'add' && (
        <Modal title="Add company" onClose={() => setModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); setModal(null); }}>
            <FormField label="Name"><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Corp" autoFocus /></FormField>
            <FormField label="Industry"><Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="SaaS" /></FormField>
            <FormField label="Website"><Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="acme.com" /></FormField>
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

function CompanyRow({ c, cols, last }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
        padding: '13px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}>
          <Icon name="companies" size={15} />
        </span>
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.name}</span>
      </span>
      <span style={{ color: 'var(--text2)' }}>{c.industry}</span>
      <span style={{ color: 'var(--text2)' }}>{c.location}</span>
      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{c.employees}</span>
      <a href={`https://${c.website}`} target="_blank" rel="noopener noreferrer"
        style={{ color: 'var(--text2)', textDecoration: 'underline', textDecorationColor: 'var(--border2)', textUnderlineOffset: 3 }}>
        {c.website}
      </a>
      <Button style={{ padding: '4px 12px', fontSize: 12 }}>Edit</Button>
    </div>
  );
}

window.Companies = Companies;
