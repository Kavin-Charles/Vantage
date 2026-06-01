/* Pipeline — list view is the default; kanban is the secondary view. */

const STAGES = [
  { id: 'lead',       name: 'Lead',       color: '#6366f1' },
  { id: 'qualifying', name: 'Qualifying', color: '#1e3a8a' },
  { id: 'proposal',   name: 'Proposal',   color: '#92400e' },
  { id: 'closing',    name: 'Closing',    color: '#4c1d95' },
  { id: 'won',        name: 'Won',        color: '#22c55e', isWon: true },
  { id: 'lost',       name: 'Lost',       color: '#ef4444', isLost: true },
];
const STAGE_BADGE = {
  lead: 'gray', qualifying: 'blue', proposal: 'amber',
  closing: 'purple', won: 'green', lost: 'red',
};

const SEED_DEALS = [
  { id: 'd1', name: 'Stackline — Developer Plan',           value: 4800,  probability: 20,  close: '2026-06-27', stage: 'lead',       owner: 'Nina Park' },
  { id: 'd2', name: 'Ben Hartley — Indie License',          value: 990,   probability: 30,  close: '2026-06-12', stage: 'lead',       owner: 'James Okafor' },
  { id: 'd3', name: 'Fenix Analytics — Team Plan',          value: 18000, probability: 40,  close: '2026-06-03', stage: 'qualifying', owner: 'Nina Park' },
  { id: 'd4', name: 'Cobalt Systems — Enterprise',          value: 55000, probability: 45,  close: '2026-07-12', stage: 'qualifying', owner: 'Nina Park' },
  { id: 'd5', name: 'Cobalt — Infra Monitoring Add-on',     value: 12000, probability: 65,  close: '2026-05-27', stage: 'proposal',   owner: 'James Okafor' },
  { id: 'd6', name: 'Orbit Cloud — Platform License',       value: 36000, probability: 85,  close: '2026-05-20', stage: 'closing',    owner: 'Nina Park' },
  { id: 'd7', name: 'Meridian Labs — Annual Plan',          value: 24000, probability: 100, close: '2026-05-03', stage: 'won',        owner: 'Nina Park' },
  { id: 'd8', name: 'Cobalt Systems — Starter',             value: 9600,  probability: 100, close: '2026-04-18', stage: 'won',        owner: 'James Okafor' },
  { id: 'd9', name: 'Fenix Analytics — Trial',              value: 8400,  probability: 0,   close: '2026-04-30', stage: 'lost',       owner: 'Tom Weston' },
];

function Pipeline({ openAdd, addTrigger }) {
  const [deals, setDeals] = React.useState(SEED_DEALS);
  const [view,  setView]  = React.useState('list');
  const [modal, setModal] = React.useState(null);
  const [form,  setForm]  = React.useState({ name: '', value: '', stage: 'lead' });
  const [sort,  setSort]  = React.useState({ key: 'close', dir: 'asc' });

  // drag state used by board view
  const [dragId, setDragId] = React.useState(null);
  const [dragOverStage, setDragOverStage] = React.useState(null);

  React.useEffect(() => { if (addTrigger > 0) setModal('add'); }, [addTrigger]);

  const activeDeals = deals.filter(d => {
    const s = STAGES.find(x => x.id === d.stage);
    return s && !s.isWon && !s.isLost;
  });
  const totalValue = activeDeals.reduce((s, d) => s + d.value, 0);

  const move = (id, stageId) => setDeals(ds => ds.map(d => d.id === id ? { ...d, stage: stageId } : d));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setDeals(ds => [...ds, { id: 'd' + Date.now(), name: form.name, value: Number(form.value) || 0, probability: 25, close: '2026-06-30', stage: form.stage, owner: 'Nina Park' }]);
    setForm({ name: '', value: '', stage: 'lead' });
    setModal(null);
  };

  const sorted = React.useMemo(() => {
    const arr = [...deals];
    const { key, dir } = sort;
    const stageOrder = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
    arr.sort((a, b) => {
      const av = key === 'stage' ? stageOrder[a.stage] : a[key];
      const bv = key === 'stage' ? stageOrder[b.stage] : b[key];
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ?  1 : -1;
      return 0;
    });
    return arr;
  }, [deals, sort]);

  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  return (
    <div style={{ padding: 24 }}>
      {/* Toolbar: counter + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          {deals.length} items · <strong style={{ color: 'var(--text)' }}>{fmtCurrency(totalValue)}</strong> in pipeline
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {view === 'list'
        ? <PipelineList deals={sorted} sort={sort} toggleSort={toggleSort} />
        : <PipelineBoard
            deals={deals} move={move}
            dragId={dragId} setDragId={setDragId}
            dragOverStage={dragOverStage} setDragOverStage={setDragOverStage}
            openAddInStage={(s) => { setForm(f => ({ ...f, stage: s })); setModal('add'); }}
          />
      }

      {modal === 'add' && (
        <Modal title="Add deal" onClose={() => setModal(null)}>
          <form onSubmit={submit}>
            <FormField label="Name">
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Cobalt — Enterprise" autoFocus />
            </FormField>
            <FormField label="Value">
              <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
            </FormField>
            <FormField label="Stage">
              <Select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                {STAGES.filter(s => !s.isWon && !s.isLost).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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

// ── View Toggle (segmented) ─────────────────────────────────────────────────
function ViewToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', gap: 0,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 2,
    }}>
      {[
        { id: 'list',  label: 'List',  icon: <Icon name="tasks" size={14} /> },
        { id: 'board', label: 'Board', icon: <Icon name="pipeline" size={14} /> },
      ].map(opt => {
        const on = value === opt.id;
        return (
          <button key={opt.id} onClick={() => onChange(opt.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, border: 'none',
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text2)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              boxShadow: on ? '0 1px 2px rgba(0,0,0,.04)' : 'none',
              transition: 'all .15s',
            }}>
            {opt.icon} {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── LIST VIEW ───────────────────────────────────────────────────────────────
function PipelineList({ deals, sort, toggleSort }) {
  const cols = 'minmax(220px,2.2fr) .9fr .9fr .55fr .9fr 1fr';
  const SortHead = ({ k, children }) => (
    <button onClick={() => toggleSort(k)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: 10, fontWeight: 600, color: 'var(--text3)',
        textTransform: 'uppercase', letterSpacing: 1.4,
        display: 'inline-flex', alignItems: 'center', gap: 4, textAlign: 'left',
      }}>
      {children}
      {sort.key === k && (
        <span style={{ color: 'var(--text2)', transform: sort.dir === 'asc' ? 'rotate(180deg)' : 'none', display: 'inline-flex' }}>
          <Icon name="chevron" size={11} />
        </span>
      )}
    </button>
  );
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: cols, gap: 14,
        padding: '12px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center',
      }}>
        <SortHead k="name">Name</SortHead>
        <SortHead k="value">Value</SortHead>
        <SortHead k="stage">Stage</SortHead>
        <SortHead k="probability">%</SortHead>
        <SortHead k="close">Close</SortHead>
        <Eyebrow>Owner</Eyebrow>
      </div>
      {deals.map((d, i) => (
        <DealRow key={d.id} d={d} last={i === deals.length - 1} cols={cols} />
      ))}
    </div>
  );
}

function DealRow({ d, last, cols }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center',
        padding: '14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s',
        fontSize: 13,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
      </span>
      <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtCurrency(d.value)}</span>
      <span><Badge label={d.stage} color={STAGE_BADGE[d.stage] ?? 'gray'} /></span>
      <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{d.probability}%</span>
      <span style={{ color: 'var(--text2)' }}>{new Date(d.close + 'T00:00:00').toLocaleDateString()}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Avatar name={d.owner} size={24} dark={false} />
        <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.owner}</span>
      </span>
    </div>
  );
}

// ── BOARD VIEW (kanban, secondary) ─────────────────────────────────────────
function PipelineBoard({ deals, move, dragId, setDragId, dragOverStage, setDragOverStage, openAddInStage }) {
  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12 }}>
      {STAGES.map(stage => {
        const col = deals.filter(d => d.stage === stage.id);
        const stageTotal = col.reduce((s, d) => s + d.value, 0);
        const hot = dragOverStage === stage.id;
        return (
          <div key={stage.id}
            onDragOver={e => { e.preventDefault(); setDragOverStage(stage.id); }}
            onDragLeave={() => setDragOverStage(s => s === stage.id ? null : s)}
            onDrop={() => { if (dragId) move(dragId, stage.id); setDragId(null); setDragOverStage(null); }}
            style={{
              minWidth: 234, flexShrink: 0,
              background: hot ? 'var(--surface2)' : 'transparent',
              borderRadius: 14, padding: hot ? 6 : 0, margin: hot ? -6 : 0,
              transition: 'all .12s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: stage.color + '1a', color: stage.color,
                  borderRadius: 6, padding: '2px 9px',
                  fontSize: 11, fontWeight: 600,
                }}>{stage.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{col.length}</span>
              </div>
              <button onClick={() => openAddInStage(stage.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0, display: 'flex' }}>
                <Icon name="plus" size={14} />
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>{fmtCurrency(stageTotal)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
              {col.map(deal => (
                <DealCard key={deal.id} deal={deal}
                  onDragStart={() => setDragId(deal.id)}
                  isDragging={dragId === deal.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealCard({ deal, onDragStart, isDragging }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div draggable onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 14px',
        cursor: 'grab',
        boxShadow: hover ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        opacity: isDragging ? 0.4 : 1,
        transition: 'box-shadow .15s, opacity .15s',
      }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>{deal.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--text)' }}>{fmtCurrency(deal.value)}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{deal.probability}%</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
        Close {new Date(deal.close + 'T00:00:00').toLocaleDateString()}
      </div>
    </div>
  );
}

window.Pipeline = Pipeline;
