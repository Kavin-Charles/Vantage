export interface ChannelMemberSummary {
  user_id: string;
  name: string;
  email?: string;
}

export interface NameableChannel {
  name: string;
  type?: string | null;
  members?: ChannelMemberSummary[] | undefined;
}

/**
 * DM channels are all stored with name='dm' — the display name is derived from
 * the other participants. Regular channels keep their stored name.
 */
export function channelDisplayName(
  channel: NameableChannel | null | undefined,
  currentUserId: string,
): string {
  if (!channel) return '';

  const isDm = channel.type === 'dm' || channel.type === 'group_dm';
  if (!isDm) return channel.name;

  const others = (channel.members ?? []).filter(m => m.user_id !== currentUserId);
  if (others.length === 0) {
    // Members not loaded yet, or a DM with only yourself left in it.
    return channel.name === 'dm' ? 'Direct message' : channel.name;
  }

  return others.map(m => m.name).join(', ');
}
