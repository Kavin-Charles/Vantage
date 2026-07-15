export interface ProviderRef {
  id: string;
  name: string;
}

export interface HookFeature {
  id: string;
  name: string;
  description: string;
  /**
   * Hub contract this feature reads (e.g. "crm.contact@v1"). Any installed
   * plugin that provides this contract is a compatible provider — computed at
   * runtime, never hand-listed.
   */
  requires_contract?: string;
  /**
   * Static providers that are always compatible (builtin modules). Plugin
   * providers are discovered via requires_contract instead.
   */
  compatible_providers: ProviderRef[];
}
