'use client';

interface TypingUser {
  user_id: string;
  name: string;
  until: number;
}

export function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (users.length === 0) return null;

  let text: string;
  if (users.length === 1) {
    text = `${users[0]!.name} is typing…`;
  } else if (users.length === 2) {
    text = `${users[0]!.name} and ${users[1]!.name} are typing…`;
  } else {
    text = `${users[0]!.name} and ${users.length - 1} others are typing…`;
  }

  return (
    <div style={{
      padding: '2px 16px 6px',
      display: 'flex', alignItems: 'center', gap: 8,
      minHeight: 24,
    }}>
      <Dots />
      <span style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>{text}</span>
    </div>
  );
}

function Dots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      <style>{`
        @keyframes vt-dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: .4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--text3)',
            display: 'inline-block',
            animation: `vt-dot-bounce 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}
