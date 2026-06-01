/* Tasks — checkbox list with filter tabs + overdue banner. */

const SEED_TASKS = [
  { id: 't1', title: 'Follow up with Cobalt Systems on Enterprise quote',  due: '2026-05-19', status: 'todo', assignee: 'Nina Park' },
  { id: 't2', title: 'Send Meridian onboarding kit',                        due: '2026-05-18', status: 'todo', assignee: 'James Okafor' },
  { id: 't3', title: 'Schedule infra review with Orbit Cloud',              due: '2026-05-15', status: 'todo', assignee: 'Nina Park' },
  { id: 't4', title: 'Review Fenix Analytics churn risk',                   due: '2026-05-10', status: 'todo', assignee: 'Tom Weston' },
  { id: 't5', title: 'Update pipeline stages for FY26',                     due: null,         status: 'todo', assignee: 'Nina Park' },
  { id: 't6', title: 'Prepare Q1 board deck',                                due: '2026-04-30', status: 'done', assignee: 'Nina Park' },
  { id: 't7', title: 'Migrate prod-postgres to TimescaleDB',                due: '2026-04-22', status: 'done', assignee: 'James Okafor' },
  { id: 't8', title: 'Onboard Priya Nair as customer',                       due: '2026-04-15', status: 'done', assignee: 'Nina Park' },
];

function Tasks() {
  const [tasks, setTasks]   = React.useState(SEED_TASKS);
  const [filter, setFilter] = React.useState('todo');
  const visible = tasks.filter(t => filter === 'all' || t.status === filter);
  const today   = new Date('2026-05-13'); // fixed seed date
  const overdue = tasks.filter(t => t.status === 'todo' && t.due && new Date(t.due) < today);

  const toggle = (id) => setTasks(ts => ts.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t));

  return (
    <div style={{ padding: 24 }}>
      {overdue.length > 0 && (
        <div style={{
          background: 'var(--red-bg)', border: '1px solid #fee2e2',
          borderRadius: 12, padding: '10px 16px', marginBottom: 14,
          fontSize: 13, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="warning" size={14} />
          {overdue.length} overdue task{overdue.length > 1 ? 's' : ''}
        </div>
      )}

      <div style={{
        display: 'inline-flex', gap: 0,
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 3, marginBottom: 16,
      }}>
        {['all', 'todo', 'done'].map(f => {
          const on = filter === f;
          const count = f === 'all' ? tasks.length : tasks.filter(t => t.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '5px 14px', borderRadius: 8, border: 'none',
                background: on ? 'var(--text)' : 'transparent',
                color: on ? '#fff' : 'var(--text2)',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all .15s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span style={{ fontSize: 11, opacity: on ? 0.7 : 0.6, fontWeight: 600 }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        {visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No tasks.</div>
        ) : visible.map((t, i) => (
          <TaskRow key={t.id} t={t} last={i === visible.length - 1} today={today} onToggle={() => toggle(t.id)} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ t, last, today, onToggle }) {
  const [hover, setHover] = React.useState(false);
  const done    = t.status === 'done';
  const isOverdue = !done && t.due && new Date(t.due) < today;
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 18px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        background: hover ? 'var(--surface2)' : 'transparent',
        transition: 'background .12s', fontSize: 13,
      }}>
      <Checkbox checked={done} onChange={onToggle} />
      <span style={{ flex: 1, color: done ? 'var(--text3)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
        {t.title}
      </span>
      {t.due && (
        <span style={{
          fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text3)',
          background: isOverdue ? 'var(--red-bg)' : 'transparent',
          padding: isOverdue ? '2px 8px' : 0, borderRadius: 999, fontWeight: isOverdue ? 600 : 400,
        }}>{new Date(t.due + 'T00:00:00').toLocaleDateString()}</span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)' }}>
        <Avatar name={t.assignee} size={22} dark={false} />
        <span style={{ fontSize: 12 }}>{t.assignee.split(' ')[0]}</span>
      </span>
      <Badge label={t.status} color={t.status === 'done' ? 'green' : 'amber'} />
    </div>
  );
}

function Checkbox({ checked, onChange }) {
  return (
    <button onClick={onChange}
      style={{
        width: 18, height: 18, borderRadius: 6,
        border: '1.5px solid ' + (checked ? 'var(--text)' : 'var(--border2)'),
        background: checked ? 'var(--text)' : 'transparent',
        cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .12s', padding: 0,
      }}>
      {checked && <Icon name="check" size={12} color="#fff" strokeWidth={2.5} />}
    </button>
  );
}

window.Tasks = Tasks;
