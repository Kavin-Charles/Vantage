'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { ThreadPanel } from './ThreadPanel';
import { SearchPanel } from './SearchPanel';
import { ChannelSettings } from './ChannelSettings';
import { useChat } from '../hooks/useChat';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { getChannel, type PendingAttachment } from '../lib/messaging';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import type { Message } from '@vencore/types';

interface Props {
  channelId: string;
}

export function ChannelView({ channelId }: Props) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  // Sidebar's "View details" action deep-links here with ?settings=1
  const [showSettings, setShowSettings] = useState(() => searchParams.get('settings') === '1');

  useEffect(() => {
    if (searchParams.get('settings') === '1') {
      router.replace(`/messaging/${channelId}`, { scroll: false });
    }
  }, [searchParams, channelId, router]);

  const { messages, hasMore, loadingHistory, typing, wsReady, onlineUsers, loadMore, send, sendTyping, markRead } =
    useChat(channelId);

  const { data: channelData } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return null;
      const res = await getChannel(token, channelId);
      return res.data;
    },
    staleTime: 60_000,
  });

  // Escape closes panels in priority order
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showSearch) { setShowSearch(false); return; }
      if (showSettings) { setShowSettings(false); return; }
      if (threadMessage) { setThreadMessage(null); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch, showSettings, threadMessage]);

  const handleSend = useCallback(async (body: string, attachments?: PendingAttachment[]) => {
    await send(body, attachments);
  }, [send]);

  const isDm = channelData?.type === 'dm' || channelData?.type === 'group_dm';

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Main channel area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Channel header */}
        <div style={{
          height: 52, padding: '0 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          background: 'var(--surface)',
        }}>
          <span style={{ fontSize: 15, color: 'var(--text3)', lineHeight: 1 }}>
            {isDm ? '●' : channelData?.is_private ? <Icon name="lock" size={14} /> : '#'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {channelData?.name ?? '…'}
          </span>
          {channelData?.topic && (
            <>
              <span style={{ color: 'var(--border)', fontSize: 13 }}>|</span>
              <span style={{ fontSize: 12.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                {channelData.topic}
              </span>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            {!wsReady && (
              <span style={{ fontSize: 11, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '2px 8px', borderRadius: 6, marginRight: 4 }}>
                Reconnecting…
              </span>
            )}

            {/* Online count */}
            <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 4 }}>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>●</span>{' '}
              {onlineUsers.size} online
            </span>

            <HeaderBtn icon="search" title="Search (Esc to close)" active={showSearch} onClick={() => { setShowSearch(v => !v); setShowSettings(false); }} />
            {!isDm && <HeaderBtn icon="settings" title="Channel settings" active={showSettings} onClick={() => { setShowSettings(v => !v); setShowSearch(false); }} />}
          </div>
        </div>

        {/* Messages */}
        <MessageList
          channelId={channelId}
          messages={messages}
          currentUserId={user?.id ?? ''}
          hasMore={hasMore}
          loadingHistory={loadingHistory}
          onLoadMore={loadMore}
          onMarkRead={markRead}
          onThreadOpen={setThreadMessage}
          onlineUsers={onlineUsers}
        />

        <TypingIndicator users={typing} />

        <MessageInput
          onSend={handleSend}
          onTyping={sendTyping}
          placeholder={`Message ${channelData?.name ? (isDm ? channelData.name : `#${channelData.name}`) : '…'}`}
          disabled={!wsReady && messages.length === 0}
        />
      </div>

      {/* Right panels — mutually exclusive */}
      {threadMessage && !showSearch && !showSettings && (
        <ThreadPanel
          parentMessage={threadMessage}
          currentUserId={user?.id ?? ''}
          onClose={() => setThreadMessage(null)}
        />
      )}
      {showSearch && (
        <SearchPanel
          onClose={() => setShowSearch(false)}
          onJump={(chId) => {
            setShowSearch(false);
            if (chId !== channelId) router.push(`/messaging/${chId}`);
          }}
        />
      )}
      {showSettings && !showSearch && (
        <ChannelSettings channelId={channelId} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function HeaderBtn({ icon, title, active, onClick }: { icon: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30, height: 30, borderRadius: 8,
        border: '1px solid var(--border)',
        background: active ? 'var(--surface2)' : 'none',
        cursor: 'pointer', color: active ? 'var(--text)' : 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .12s',
      }}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
