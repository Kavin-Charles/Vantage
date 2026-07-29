export interface Preset {
  id: string;
  name: string;
  seed: string;
  sidebarStyle?: 'light' | 'dark' | 'brand';
}

export const PRESETS: Preset[] = [
  { id: 'default', name: 'Default', seed: '#0b1330' },
  { id: 'midnight', name: 'Midnight', seed: '#1e3a8a', sidebarStyle: 'dark' },
  { id: 'forest', name: 'Forest', seed: '#2d6a4f' },
  { id: 'slate', name: 'Slate', seed: '#334155' },
  { id: 'ember', name: 'Ember', seed: '#92400e' },
  { id: 'violet', name: 'Violet', seed: '#4c1d95' },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
