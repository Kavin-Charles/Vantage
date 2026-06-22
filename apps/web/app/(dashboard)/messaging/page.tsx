import { MessagingLayout } from '@/modules/messaging/components/MessagingLayout';

export default function MessagingPage() {
  return (
    <MessagingLayout>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Select a channel</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Choose a channel from the sidebar to start messaging</div>
      </div>
    </MessagingLayout>
  );
}
