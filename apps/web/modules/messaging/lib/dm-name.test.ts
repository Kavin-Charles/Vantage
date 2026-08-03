import { describe, it, expect } from 'vitest';
import { channelDisplayName } from './dm-name';

const ME = 'user-me';

describe('channelDisplayName', () => {
  it('returns the stored name for a regular channel', () => {
    expect(channelDisplayName({ name: 'general', type: 'channel' }, ME)).toBe('general');
  });

  it('ignores members on a regular channel', () => {
    const channel = {
      name: 'engineering',
      type: 'channel',
      members: [{ user_id: 'user-other', name: 'Admin' }],
    };
    expect(channelDisplayName(channel, ME)).toBe('engineering');
  });

  it('names a DM after the other participant, not "dm"', () => {
    const channel = {
      name: 'dm',
      type: 'dm',
      members: [
        { user_id: ME, name: 'Claude Test' },
        { user_id: 'user-other', name: 'Admin' },
      ],
    };
    expect(channelDisplayName(channel, ME)).toBe('Admin');
  });

  it('joins all other participants for a group DM', () => {
    const channel = {
      name: 'dm',
      type: 'group_dm',
      members: [
        { user_id: ME, name: 'Claude Test' },
        { user_id: 'u2', name: 'Admin' },
        { user_id: 'u3', name: 'Dana' },
      ],
    };
    expect(channelDisplayName(channel, ME)).toBe('Admin, Dana');
  });

  it('falls back to a readable label when members are not loaded', () => {
    expect(channelDisplayName({ name: 'dm', type: 'dm' }, ME)).toBe('Direct message');
  });

  it('falls back when the only member is yourself', () => {
    const channel = {
      name: 'dm',
      type: 'dm',
      members: [{ user_id: ME, name: 'Claude Test' }],
    };
    expect(channelDisplayName(channel, ME)).toBe('Direct message');
  });

  it('returns empty string for a missing channel', () => {
    expect(channelDisplayName(null, ME)).toBe('');
  });
});
