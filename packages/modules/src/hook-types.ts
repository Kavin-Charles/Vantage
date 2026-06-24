export interface ProviderRef {
  id: string;
  name: string;
}

export interface HookFeature {
  id: string;
  name: string;
  description: string;
  compatible_providers: ProviderRef[];
}
