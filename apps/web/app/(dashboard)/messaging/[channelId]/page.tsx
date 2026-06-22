'use client';

import { use } from 'react';
import { MessagingLayout } from '@/modules/messaging/components/MessagingLayout';
import { ChannelView } from '@/modules/messaging/components/ChannelView';

export default function ChannelPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  return (
    <MessagingLayout>
      <ChannelView channelId={channelId} />
    </MessagingLayout>
  );
}
