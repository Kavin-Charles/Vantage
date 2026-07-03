'use client';

import { useEffect } from 'react';
import { ContextMenu, useContextMenu, type ContextMenuItem } from '@/modules/shared/components/ui/ContextMenu';

type Editable = HTMLInputElement | HTMLTextAreaElement;

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range',
  'color', 'image', 'hidden', 'date', 'time', 'datetime-local', 'month', 'week',
]);

function isTextEditable(el: Element | null): el is Editable {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (el instanceof HTMLInputElement) return !el.disabled && !NON_TEXT_INPUT_TYPES.has(el.type);
  return false;
}

function isContentEditable(el: Element | null): el is HTMLElement {
  return !!el && el instanceof HTMLElement && el.isContentEditable;
}

/** Sets a native input/textarea value via the React-aware setter so controlled state stays in sync. */
function setNativeValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function editableMenuItems(el: Editable): ContextMenuItem[] {
  const hasSelection = el.selectionStart !== el.selectionEnd;
  const readOnly = el.readOnly;
  return [
    { icon: 'convert', label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => document.execCommand('undo') },
    { icon: 'convert', label: 'Redo', shortcut: 'Ctrl+Y', onClick: () => document.execCommand('redo') },
    { type: 'separator' },
    { icon: 'copy', label: 'Cut', shortcut: 'Ctrl+X', disabled: !hasSelection || readOnly, onClick: () => document.execCommand('cut') },
    { icon: 'copy', label: 'Copy', shortcut: 'Ctrl+C', disabled: !hasSelection, onClick: () => document.execCommand('copy') },
    {
      icon: 'file', label: 'Paste', shortcut: 'Ctrl+V', disabled: readOnly,
      onClick: () => { void navigator.clipboard.readText().then(text => {
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        setNativeValue(el, el.value.slice(0, start) + text + el.value.slice(end));
        el.setSelectionRange(start + text.length, start + text.length);
      }).catch(() => {}); },
    },
    { type: 'separator' },
    { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => el.select() },
  ];
}

function contentEditableMenuItems(el: HTMLElement): ContextMenuItem[] {
  const sel = window.getSelection();
  const hasSelection = !!sel && !sel.isCollapsed && el.contains(sel.anchorNode);
  return [
    { icon: 'convert', label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => document.execCommand('undo') },
    { icon: 'convert', label: 'Redo', shortcut: 'Ctrl+Y', onClick: () => document.execCommand('redo') },
    { type: 'separator' },
    { icon: 'copy', label: 'Cut', shortcut: 'Ctrl+X', disabled: !hasSelection, onClick: () => document.execCommand('cut') },
    { icon: 'copy', label: 'Copy', shortcut: 'Ctrl+C', disabled: !hasSelection, onClick: () => document.execCommand('copy') },
    {
      icon: 'file', label: 'Paste', shortcut: 'Ctrl+V',
      onClick: () => { void navigator.clipboard.readText().then(text => document.execCommand('insertText', false, text)).catch(() => {}); },
    },
    {
      icon: 'file', label: 'Paste without formatting',
      onClick: () => { void navigator.clipboard.readText().then(text => document.execCommand('insertText', false, text)).catch(() => {}); },
    },
    { type: 'separator' },
    { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => document.execCommand('selectAll') },
  ];
}

function selectionMenuItems(text: string): ContextMenuItem[] {
  return [
    { icon: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: () => { void navigator.clipboard.writeText(text); } },
    { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => document.execCommand('selectAll') },
    { type: 'separator' },
    { icon: 'open', label: 'Search selected text', onClick: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank') },
  ];
}

/**
 * App-wide fallback: handles right-clicks that no closer component already
 * claimed (those call stopPropagation in their own onContextMenu, so this
 * listener never sees them). Shows OS-style editable/text-selection menus;
 * otherwise just suppresses the native menu.
 */
export function GlobalContextMenu() {
  const { menu, open, close } = useContextMenu();

  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      const target = e.target as Element | null;

      if (isTextEditable(target)) {
        e.preventDefault();
        (target as Editable).focus();
        open(e as unknown as React.MouseEvent, editableMenuItems(target as Editable));
        return;
      }
      if (isContentEditable(target)) {
        e.preventDefault();
        open(e as unknown as React.MouseEvent, contentEditableMenuItems(target));
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text) {
        e.preventDefault();
        open(e as unknown as React.MouseEvent, selectionMenuItems(text));
        return;
      }

      // No editable target, no selection, and nothing closer claimed it — suppress native menu only.
      e.preventDefault();
    }
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [open]);

  return <ContextMenu menu={menu} onClose={close} />;
}
