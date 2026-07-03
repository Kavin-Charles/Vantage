import { apiFetch } from '@/modules/shared/lib/api';
import type { Channel, Message, MessagesPage } from '@vencore/types';

export async function listChannels(token: string) {
  return apiFetch<{ data: (Channel & { unread_count: number; last_message: Message | null })[]; error: null }>(
    '/api/messaging/channels',
    { token },
  );
}

export async function createChannel(
  token: string,
  body: { name: string; topic?: string; is_private?: boolean; member_ids?: string[] },
) {
  return apiFetch<{ data: Channel; error: null }>('/api/messaging/channels', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function getChannel(token: string, id: string) {
  return apiFetch<{ data: Channel & { members: { user_id: string; role: string; name: string; email: string }[] }; error: null }>(
    `/api/messaging/channels/${id}`,
    { token },
  );
}

export async function getMessages(token: string, channelId: string, beforeId?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId) params.set('before_id', beforeId);
  return apiFetch<{ data: MessagesPage; error: null }>(
    `/api/messaging/channels/${channelId}/messages?${params}`,
    { token },
  );
}

export async function sendMessage(
  token: string,
  channelId: string,
  body: { body: string; mention_user_ids?: string[]; parent_message_id?: string; attachments?: PendingAttachment[] },
) {
  return apiFetch<{ data: Message; error: null }>(
    `/api/messaging/channels/${channelId}/messages`,
    { method: 'POST', body: JSON.stringify(body), token },
  );
}

export async function editMessage(token: string, messageId: string, body: string) {
  return apiFetch<{ data: Message; error: null }>(
    `/api/messaging/messages/${messageId}`,
    { method: 'PATCH', body: JSON.stringify({ body }), token },
  );
}

export async function deleteMessage(token: string, messageId: string) {
  return apiFetch<{ data: { id: string }; error: null }>(
    `/api/messaging/messages/${messageId}`,
    { method: 'DELETE', token },
  );
}

export async function addReaction(token: string, messageId: string, emoji: string) {
  return apiFetch<{ data: unknown; error: null }>(
    `/api/messaging/messages/${messageId}/reactions`,
    { method: 'POST', body: JSON.stringify({ emoji }), token },
  );
}

export async function removeReaction(token: string, messageId: string, emoji: string) {
  return apiFetch<{ data: unknown; error: null }>(
    `/api/messaging/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    { method: 'DELETE', token },
  );
}

export async function listDMs(token: string) {
  return apiFetch<{ data: Channel[]; error: null }>('/api/messaging/dms', { token });
}

export async function openDM(token: string, userId: string) {
  return apiFetch<{ data: Channel; error: null }>('/api/messaging/dms', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
    token,
  });
}

export async function searchMessages(token: string, q: string, channelId?: string) {
  const params = new URLSearchParams({ q });
  if (channelId) params.set('channel_id', channelId);
  return apiFetch<{ data: (Message & { headline: string })[]; error: null }>(
    `/api/messaging/search?${params}`,
    { token },
  );
}

export async function getThread(token: string, messageId: string) {
  return apiFetch<{ data: Message[]; error: null }>(
    `/api/messaging/messages/${messageId}/thread`,
    { token },
  );
}

export interface PendingAttachment {
  r2_key: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  previewUrl?: string;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function listWorkspaceMembers(token: string) {
  return apiFetch<{ data: WorkspaceMember[]; error: null }>('/api/users', { token });
}

export async function presignUpload(
  token: string,
  file: { filename: string; mime_type: string; size_bytes: number },
) {
  return apiFetch<{
    data: { upload_url: string; r2_key: string; filename: string; mime_type: string; size_bytes: number };
    error: null;
  }>('/api/messaging/upload/presign', {
    method: 'POST',
    body: JSON.stringify(file),
    token,
  });
}

export async function updateChannel(
  token: string,
  channelId: string,
  body: { name?: string; topic?: string | null; is_private?: boolean },
) {
  return apiFetch<{ data: Channel; error: null }>(
    `/api/messaging/channels/${channelId}`,
    { method: 'PATCH', body: JSON.stringify(body), token },
  );
}

export async function archiveChannel(token: string, channelId: string) {
  return apiFetch<{ data: { id: string }; error: null }>(
    `/api/messaging/channels/${channelId}`,
    { method: 'DELETE', token },
  );
}

export async function addChannelMember(token: string, channelId: string, userId: string) {
  return apiFetch<{ data: unknown; error: null }>(
    `/api/messaging/channels/${channelId}/members`,
    { method: 'POST', body: JSON.stringify({ user_id: userId }), token },
  );
}

export async function removeChannelMember(token: string, channelId: string, userId: string) {
  return apiFetch<{ data: unknown; error: null }>(
    `/api/messaging/channels/${channelId}/members/${userId}`,
    { method: 'DELETE', token },
  );
}

export async function markChannelRead(token: string, channelId: string, messageId: string) {
  return apiFetch<{ data: { channel_id: string; last_read_message_id: string }; error: null }>(
    `/api/messaging/channels/${channelId}/read`,
    { method: 'PATCH', body: JSON.stringify({ message_id: messageId }), token },
  );
}
