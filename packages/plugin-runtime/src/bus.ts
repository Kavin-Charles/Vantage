type BusHandler = (payload: unknown) => Promise<void> | void;
type GlobalBusHandler = (workspaceId: string, payload: unknown) => Promise<void> | void;

class WorkspaceBus {
  private readonly handlers = new Map<string, Set<BusHandler>>();

  constructor(
    private readonly workspaceId: string,
    private readonly globalHandlers: Map<string, Set<GlobalBusHandler>>,
  ) {}

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
    const globals = this.globalHandlers.get(event);
    const jobs: Array<Promise<void> | void> = [];
    if (handlers) jobs.push(...[...handlers].map((h) => h(payload)));
    if (globals) jobs.push(...[...globals].map((h) => h(this.workspaceId, payload)));
    if (jobs.length === 0) return;
    await Promise.allSettled(jobs);
  }
}

export class PluginEventBus {
  private readonly buses = new Map<string, WorkspaceBus>();
  private readonly globalHandlers = new Map<string, Set<GlobalBusHandler>>();

  forWorkspace(workspaceId: string): WorkspaceBus {
    let bus = this.buses.get(workspaceId);
    if (!bus) {
      bus = new WorkspaceBus(workspaceId, this.globalHandlers);
      this.buses.set(workspaceId, bus);
    }
    return bus;
  }

  /**
   * Subscribes across all workspaces. Used by host-side listeners (e.g. hook
   * features reacting to hub changes) that cannot know workspace ids upfront.
   */
  onGlobal(event: string, handler: GlobalBusHandler): void {
    const set = this.globalHandlers.get(event) ?? new Set<GlobalBusHandler>();
    set.add(handler);
    this.globalHandlers.set(event, set);
  }

  offGlobal(event: string, handler: GlobalBusHandler): void {
    this.globalHandlers.get(event)?.delete(handler);
  }
}

/** Singleton event bus shared across the API process. */
export const pluginEventBus = new PluginEventBus();
