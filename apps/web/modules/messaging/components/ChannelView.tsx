'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/modules/shared/components/ui/Icon';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { ThreadPanel } from './ThreadPanel';
import { SearchPanel } from './SearchPanel';
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
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const router = useRouter();

  const { messages, hasMore, loadingHistory, typing, wsReady, loadMore, send, sendTyping, markRead } =
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

  const handleSend = useCallback(async (body: string, attachments?: PendingAttachment[]) => {
    await send(body, attachments);
  }, [send]);

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
          <span style={{ fontSize: 16, color: 'var(--text3)' }}>
            {channelData?.type === 'dm' ? '●' : channelData?.is_private ? <Icon name="lock" size={15} /> : '#'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {channelData?.name ?? '…'}
          </span>
          {channelData?.topic && (
            <>
              <span style={{ color: 'var(--border)', fontSize: 14 }}>|</span>
              <span style={{ fontSize: 13, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {channelData.topic}
              </span>
            </>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {!wsReady && (
              <span style={{ fontSize: 11, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '2px 8px', borderRadius: 6 }}>
                Reconnecting…
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>
              {channelData?.members?.length ?? 0} members
            </span>
            <button
              onClick={() => setShowSearch(v => !v)}
              title="Search messages"
              style={{
                width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
                background: showSearch ? 'var(--surface2)' : 'none', cursor: 'pointer',
                color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name="search" size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          currentUserId={user?.id ?? ''}
          hasMore={hasMore}
          loadingHistory={loadingHistory}
          onLoadMore={loadMore}
          onMarkRead={markRead}
          onThreadOpen={setThreadMessage}
        />

        <TypingIndicator users={typing} />

        <MessageInput
          onSend={handleSend}
          onTyping={sendTyping}
          placeholder={`Message ${channelData?.name ? (channelData.type === 'channel' ? `#${channelData.name}` : channelData.name) : '…'}`}
          disabled={!wsReady && messages.length === 0}
        />
      </div>

      {/* Thread panel */}
      {threadMessage && (
        <ThreadPanel
          parentMessage={threadMessage}
          currentUserId={user?.id ?? ''}
          onClose={() => setThreadMessage(null)}
        />
      )}

      {/* Search panel — overlays on the right */}
      {showSearch && (
        <SearchPanel
          onClose={() => setShowSearch(false)}
          onJump={(chId) => {
            setShowSearch(false);
            if (chId !== channelId) router.push(`/messaging/${chId}`);
          }}
        />
      )}
    </div>
  );
}
