type BusHandler = (payload: unknown) => Promise<void> | void;

class WorkspaceBus {
  private readonly handlers = new Map<string, Set<BusHandler>>();

  on(event: string, handler: BusHandler): void {
    const set = this.handlers.get(event) ?? new Set<BusHandler>();
    set.add(handler);
    this.handlers.set(event, set);
  }

  off(event: string, handler: BusHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) return;
    await Promise.allSettled([...handlers].map((h) => h(payload)));
  }
}

export class PluginEventBus {
  private readonly buses = new Map<string, WorkspaceBus>();

  forWorkspace(workspaceId: string): WorkspaceBus {
    let bus = this.buses.get(workspaceId);
    if (!bus) {
      bus = new WorkspaceBus();
      this.buses.set(workspaceId, bus);
    }
    return bus;
  }
}

/** Singleton event bus shared across the API process. */
export const pluginEventBus = new PluginEventBus();
