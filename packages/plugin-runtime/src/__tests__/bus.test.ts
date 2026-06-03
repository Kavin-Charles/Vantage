import { describe, it, expect, vi } from 'vitest';
import { PluginEventBus } from '../bus';

describe('PluginEventBus', () => {
  it('delivers emitted event to subscriber in same workspace', async () => {
    const bus = new PluginEventBus();
    const handler = vi.fn();
    bus.forWorkspace('ws1').on('com.test.event', handler);
    await bus.forWorkspace('ws1').emit('com.test.event', { x: 1 });
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  it('does not deliver event to different workspace', async () => {
    const bus = new PluginEventBus();
    const handler = vi.fn();
    bus.forWorkspace('ws2').on('com.test.event', handler);
    await bus.forWorkspace('ws1').emit('com.test.event', { x: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple subscribers for same event', async () => {
    const bus = new PluginEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.forWorkspace('ws1').on('com.test.evt', h1);
    bus.forWorkspace('ws1').on('com.test.evt', h2);
    await bus.forWorkspace('ws1').emit('com.test.evt', 'payload');
    expect(h1).toHaveBeenCalledWith('payload');
    expect(h2).toHaveBeenCalledWith('payload');
  });

  it('does not throw if no subscribers', async () => {
    const bus = new PluginEventBus();
    await expect(bus.forWorkspace('ws1').emit('com.empty.event', {})).resolves.not.toThrow();
  });
});
