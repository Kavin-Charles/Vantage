/* CRM screens — Pipeline, DealDetail, Contacts, ContactDetail. */

// ─── PIPELINE LIST ──────────────────────────────────────────────────────────
function PipelineScreen({ nav }) {
  const [stage, setStage] = React.useState('all');

  const activeStages = STAGES.filter(s => s.id !== 'won' && s.id !== 'lost');
  const filtered = stage === 'all'
    ? DEALS.filter(d => d.stage !== 'won' && d.stage !== 'lost')
    : DEALS.filter(d => d.stage === stage);

  const total = filtered.reduce((sum, d) => sum + d.value, 0);

  // group by stage (when "all")
  const groups = stage === 'all'
    ? activeStages.map(s => [s, filtered.filter(d => d.stage === s.id)]).filter(([, d]) => d.length)
    : [[STAGES.find(s => s.id === stage), filtered]];

  return (
    <>
      <MobileHeader title="Pipeline" large
        eyebrow={`${filtered.length} deals · ${fmtMoneyShort(total)}`}
        right={
          <button className="vt-press" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text)', padding: 8,
            display: 'flex',
          }}><Icon name="plus" size={20} /></button>
        } />
      <ScreenBody>
        <Section>
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', padding: '0 0 4px',
          }} className="vt-scroll">
            {[{ id: 'all', name: 'All' }, ...activeStages].map(s => (
              <Chip key={s.id} active={stage === s.id} onClick={() => setStage(s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </Section>

        {groups.map(([s, items]) => (
          <Section key={s.id} eyebrow={
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Badge label={s.name} color={s.badge} />
              <span>{items.length} · {fmtMoneyShort(items.reduce((sum, d) => sum + d.value, 0))}</span>
            </span>
          }>
            <ListGroup>
              {items.map((d, i) => (
                <DealRow key={d.id} d={d} last={i === items.length - 1}
                  onClick={() => nav.go('deal', { id: d.id })} />
              ))}
            </ListGroup>
          </Section>
        ))}
      </ScreenBody>
    </>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '6px 12px', borderRadius: 999,
        border: `1px solid ${active ? 'var(--text)' : 'var(--border)'}`,
        background: active ? 'var(--text)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text2)',
        fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}>{children}</button>
  );
}

function DealRow({ d, last, onClick }) {
  const stage = STAGES.find(s => s.id === d.stage);
  return (
    <div onClick={onClick} className="vt-press"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}>
      <Avatar name={d.company} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 500, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3,
        }}>{d.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{new Date(d.close + 'T00:00:00').toLocaleDateString()}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>·</span>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{d.prob}%</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="vt-display" style={{ fontSize: 15, color: 'var(--text)' }}>{fmtMoneyShort(d.value)}</div>
        <div style={{ marginTop: 4 }}><Badge label={stage.name} color={stage.badge} /></div>
      </div>
    </div>
  );
}

// ─── DEAL DETAIL ────────────────────────────────────────────────────────────
function DealDetailScreen({ nav, params }) {
  const d = DEALS.find(x => x.id === params.id) ?? DEALS[0];
  const stage = STAGES.find(s => s.id === d.stage);
  const stageIdx = STAGES.findIndex(s => s.id === d.stage);

  return (
    <>
      <MobileHeader title="Deal" onBack={() => nav.back()}
        right={
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text2)', padding: 8, display: 'flex',
          }}><Icon name="more" size={20} /></button>
        } />
      <ScreenBody>
        {/* Hero */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Avatar name={d.company} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 2,
              }}>{d.company}</div>
              <div className="vt-display" style={{ fontSize: 20, color: 'var(--text)', lineHeight: 1.15 }}>
                {d.name}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Stat label="Value" value={fmtMoneyShort(d.value)} />
            <Stat label="Probability" value={`${d.prob}%`} />
            <Stat label="Close" value={new Date(d.close + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
          </div>
        </Card>

        {/* Stage progress */}
        <Section eyebrow="Stage">
          <Card>
            <div style={{ marginBottom: 8 }}>
              <Badge label={stage.name} color={stage.badge} size="md" />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {STAGES.filter(s => s.id !== 'lost').map((s, i) => {
                const reached = i <= stageIdx && d.stage !== 'lost';
                return (
                  <div key={s.id} style={{ flex: 1 }}>
                    <div style={{
                      height: 4, borderRadius: 2,
                      background: reached ? 'var(--text)' : 'var(--surface2)',
                      marginBottom: 6,
                    }} />
                    <div style={{
                      fontSize: 9, fontWeight: 600,
                      color: reached ? 'var(--text2)' : 'var(--text3)',
                      textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left',
                      whiteSpace: 'nowrap',
                    }}>{s.name}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </Section>

        {/* Contact */}
        <Section eyebrow="Primary contact">
          <ListGroup>
            {(() => {
              const c = CONTACTS.find(x => x.name === d.contact);
              if (!c) return null;
              return <ListRow
                icon={<Avatar name={c.name} size={32} tone="ink" />}
                iconBg="transparent"
                title={c.name}
                subtitle={`${c.title} · ${c.company}`}
                onClick={() => nav.go('contactDetail', { id: c.id })}
                last
              />;
            })()}
          </ListGroup>
        </Section>

        {/* Owner */}
        <Section eyebrow="Owner">
          <ListGroup>
            <ListRow
              icon={<Avatar name={d.owner} size={32} />}
              iconBg="transparent"
              title={d.owner}
              subtitle="Account Executive"
              last
            />
          </ListGroup>
        </Section>

        {/* Recent activity on this deal */}
        <Section eyebrow="Activity">
          <ListGroup>
            {ACTIVITIES.filter(a => a.contact === d.contact || a.contact === d.company).slice(0, 3).map((a, i, arr) => (
              <ActivityRow key={a.id} a={a} last={i === arr.length - 1} />
            ))}
          </ListGroup>
        </Section>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Btn variant="secondary" leading="phone" style={{ flex: 1 }}>Call</Btn>
          <Btn variant="secondary" leading="mail"  style={{ flex: 1 }}>Email</Btn>
          <Btn variant="accent"    leading="note"  style={{ flex: 1 }}>Log</Btn>
        </div>
      </ScreenBody>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 600, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
      }}>{label}</div>
      <div className="vt-display" style={{ fontSize: 17, color: 'var(--text)', letterSpacing: '-0.3px' }}>{value}</div>
    </div>
  );
}

// ─── CONTACTS LIST ──────────────────────────────────────────────────────────
function ContactsScreen({ nav }) {
  const [q, setQ] = React.useState('');
  const filtered = CONTACTS.filter(c =>
    !q || `${c.name} ${c.company} ${c.title}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <>
      <MobileHeader title="Contacts" large eyebrow={`${filtered.length} people`} onBack={() => nav.back()}
        right={
          <button className="vt-press" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text)', padding: 8, display: 'flex',
          }}><Icon name="plus" size={20} /></button>
        } />
      <ScreenBody>
        <Section>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '10px 12px',
          }}>
            <Icon name="search" size={16} color="var(--text3)" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people, companies…"
              style={{
                flex: 1, border: 'none', background: 'none', outline: 'none',
                fontSize: 14, color: 'var(--text)', fontFamily: 'inherit',
              }}/>
          </div>
        </Section>
        <ListGroup>
          {filtered.map((c, i) => (
            <ContactRow key={c.id} c={c} last={i === filtered.length - 1}
              onClick={() => nav.go('contactDetail', { id: c.id })} />
          ))}
        </ListGroup>
      </ScreenBody>
    </>
  );
}

function ContactRow({ c, last, onClick }) {
  const statusColor = {
    customer: 'green', prospect: 'blue', cold: 'gray', churned: 'red',
  }[c.status] ?? 'gray';
  return (
    <div onClick={onClick} className="vt-press"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}>
      <Avatar name={c.name} size={38} tone="ink" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.name}</div>
        <div style={{
          fontSize: 11.5, color: 'var(--text3)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{c.title} · {c.company}</div>
      </div>
      <Badge label={c.status} color={statusColor} />
    </div>
  );
}

// ─── CONTACT DETAIL ─────────────────────────────────────────────────────────
function ContactDetailScreen({ nav, params }) {
  const c = CONTACTS.find(x => x.id === params.id) ?? CONTACTS[0];
  const [sheet, setSheet] = React.useState(null);
  const statusColor = { customer: 'green', prospect: 'blue', cold: 'gray', churned: 'red' }[c.status] ?? 'gray';

  return (
    <>
      <MobileHeader title="Contact" onBack={() => nav.back()}
        right={<button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text2)', padding:8, display:'flex' }}><Icon name="more" size={20}/></button>} />
      <ScreenBody>
        {/* Hero */}
        <Card style={{ marginBottom: 16, padding: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Avatar name={c.name} size={68} tone="ink" />
            <div className="vt-display" style={{ fontSize: 22, color: 'var(--text)', textAlign: 'center' }}>{c.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{c.title} · {c.company}</div>
            <Badge label={c.status} color={statusColor} size="md" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Btn variant="secondary" leading="phone" style={{ flex: 1 }} onClick={() => setSheet('call')}>Call</Btn>
            <Btn variant="secondary" leading="mail" style={{ flex: 1 }} onClick={() => setSheet('email')}>Email</Btn>
            <Btn variant="accent"    leading="note" style={{ flex: 1 }} onClick={() => setSheet('log')}>Log</Btn>
          </div>
        </Card>

        <Section eyebrow="Contact info">
          <ListGroup>
            <ListRow icon="mail"  title={c.email} subtitle="Work email" />
            <ListRow icon="phone" title={c.phone} subtitle="Mobile" />
            <ListRow icon="companies" title={c.company} subtitle="Company" last onClick={() => {}} />
          </ListGroup>
        </Section>

        <Section eyebrow="Deals">
          <ListGroup>
            {DEALS.filter(d => d.contact === c.name).map((d, i, arr) => (
              <DealRow key={d.id} d={d} last={i === arr.length - 1}
                onClick={() => nav.go('deal', { id: d.id })} />
            ))}
            {DEALS.filter(d => d.contact === c.name).length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No active deals.</div>
            )}
          </ListGroup>
        </Section>

        <Section eyebrow="Activity">
          <ListGroup>
            {ACTIVITIES.filter(a => a.contact === c.name).map((a, i, arr) => (
              <ActivityRow key={a.id} a={a} last={i === arr.length - 1} />
            ))}
            {ACTIVITIES.filter(a => a.contact === c.name).length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>No activity yet.</div>
            )}
          </ListGroup>
        </Section>
      </ScreenBody>

      <BottomSheet open={!!sheet} onClose={() => setSheet(null)}
        title={sheet === 'log' ? 'Log activity' : sheet === 'call' ? 'Log call' : 'Send email'}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text2)',
          marginBottom: 6,
        }}>What happened?</div>
        <textarea placeholder={sheet === 'log' ? 'Met with David about the infra add-on…' : 'Type here…'}
          style={{
            width: '100%', minHeight: 100, padding: 12, borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, outline: 'none',
            resize: 'none', boxSizing: 'border-box',
          }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 14, marginBottom: 4 }}>
          <Btn variant="ghost" style={{ flex: 1 }} onClick={() => setSheet(null)}>Cancel</Btn>
          <Btn variant="accent" style={{ flex: 1 }} onClick={() => setSheet(null)}>Save</Btn>
        </div>
      </BottomSheet>
    </>
  );
}

Object.assign(window, {
  PipelineScreen, DealRow, DealDetailScreen,
  ContactsScreen, ContactRow, ContactDetailScreen,
  Chip, Stat,
});
