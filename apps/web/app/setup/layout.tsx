export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
    }}>
      {children}
    </div>
  );
}
