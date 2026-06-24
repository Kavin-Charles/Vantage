import type { ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

/** Standard right-click menu for a "label: value" settings row. */
export function settingRowMenu(opts: {
  label: string;
  value?: string;
  onEdit?: () => void;
  onReset?: () => void;
  href?: string;
}): ContextMenuItem[] {
  const { label, value, onEdit, onReset, href } = opts;
  return [
    ...(onEdit ? [{ icon: 'edit', label: 'Edit', onClick: onEdit }] : []),
    { icon: 'copy', label: 'Copy setting name', onClick: () => navigator.clipboard.writeText(label) },
    ...(value != null ? [{ icon: 'copy', label: 'Copy value', onClick: () => navigator.clipboard.writeText(value) }] : []),
    ...(href ? [{ icon: 'open', label: 'View documentation', onClick: () => window.open(href, '_blank') }] : []),
    ...(onReset ? [{ type: 'separator' as const }, { icon: 'refresh', label: 'Reset to default', onClick: onReset }] : []),
  ];
}
