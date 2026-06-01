/* Top-level App. Routes between screens, holds the Alert card. */

function App() {
  const [active, setActive]     = React.useState('pipeline');
  const [serverId, setServerId] = React.useState(null);
  const [alertOpen, setAlert]   = React.useState(true);
  const [addTrigger, setAdd]    = React.useState(0);
  const [logTrigger, setLog]    = React.useState(0);

  const navigate = (id) => { setServerId(null); setActive(id); };

  const screen = (() => {
    if (active === 'servers' && serverId) {
      return <ServerDetail serverId={serverId} onBack={() => setServerId(null)} />;
    }
    switch (active) {
      case 'pipeline':  return <Pipeline  openAdd={() => setAdd(n => n + 1)} addTrigger={addTrigger} />;
      case 'contacts':  return <Contacts  openAdd={() => setAdd(n => n + 1)} addTrigger={addTrigger} />;
      case 'companies': return <Companies openAdd={() => setAdd(n => n + 1)} addTrigger={addTrigger} />;
      case 'tasks':     return <Tasks />;
      case 'activity':  return <Activity logTrigger={logTrigger} />;
      case 'mail':      return <Mail />;
      case 'servers':   return <Servers onSelect={setServerId} />;
      case 'databases': return <Databases />;
      case 'websites':  return <Websites />;
      case 'files':     return <Files />;
      case 'analytics': return <Analytics />;
      case 'alerts':    return <Alerts />;
      case 'settings':  return <Settings />;
      default:          return <Placeholder name={PAGE_TITLES[active] ?? 'Soon'} />;
    }
  })();

  const action = (() => {
    if (active === 'pipeline')
      return <Button variant="primary" onClick={() => setAdd(n => n + 1)}>+ Add item</Button>;
    if (active === 'contacts')
      return <Button variant="primary" onClick={() => setAdd(n => n + 1)}>+ Add Contact</Button>;
    if (active === 'companies')
      return <Button variant="primary" onClick={() => setAdd(n => n + 1)}>+ Add Company</Button>;
    if (active === 'tasks')
      return <Button variant="primary">+ Add Task</Button>;
    if (active === 'activity')
      return <Button variant="primary" onClick={() => setLog(n => n + 1)}>+ Log Activity</Button>;
    if (active === 'servers')
      return <Button variant="primary">+ Add Server</Button>;
    if (active === 'databases')
      return <Button variant="primary">+ Add Database</Button>;
    if (active === 'websites')
      return <Button variant="primary">+ Add Website</Button>;
    if (active === 'files')
      return <Button variant="primary">+ Upload file</Button>;
    return null;
  })();

  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 720, background: 'var(--bg)' }}>
      <Sidebar active={active} onNavigate={navigate} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar active={active} action={action} />
        {alertOpen && active !== 'mail' && (
          <AlertCard
            count={3}
            severity={{ critical: 1, warning: 2, info: 0 }}
            message="prod-worker-01 memory 91.7%"
            onDismiss={() => setAlert(false)}
          />
        )}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {screen}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ name }) {
  return (
    <div style={{ padding: '60px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text3)' }}>
      <Icon name="note" size={28} />
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px', color: 'var(--text)' }}>
        {name}
      </span>
      <span style={{ fontSize: 13 }}>This screen is part of the source product but not in the UI kit recreation.</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
