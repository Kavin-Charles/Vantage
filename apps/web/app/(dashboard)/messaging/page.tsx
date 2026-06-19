import { MessagingLayout } from '@/modules/messaging/components/MessagingLayout';

export default function MessagingPage() {
  return (
    <MessagingLayout>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <div style={{ fontSize: 36 }}>💬</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Select a channel</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Choose a channel from the sidebar to start messaging</div>
      </div>
    </MessagingLayout>
  );
}
