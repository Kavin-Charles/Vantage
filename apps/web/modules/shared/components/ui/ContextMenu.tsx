'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ContextMenuItem =
  | {
      type?: 'item';
      label: string;
      icon?: string;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    }
  | {
      type: 'submenu';
      label: string;
      icon?: string;
      items: ContextMenuSubItem[];
    }
  | { type: 'separator' }
  | { type: 'header'; label: string };

export type ContextMenuSubItem = {
  label: string;
  icon?: string;
  swatch?: string;
  disabled?: boolean;
  onClick: () => void;
};

interface MenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const open = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, open, close };
}

// ── Public wrapper ─────────────────────────────────────────────────────────────

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState | null;
  onClose: () => void;
}) {
  const [mounted] = useState(() => typeof document !== 'undefined');
  if (!mounted || !menu) return null;
  return createPortal(
    <MenuRoot x={menu.x} y={menu.y} items={menu.items} onClose={onClose} />,
    document.body,
  );
}

// ── Layout constants ───────────────────────────────────────────────────────────

const MENU_W = 236;
const SUB_W  = 216;
const ITEM_H = 34;
const SEP_H  = 13;
const HDR_H  = 28;
const PAD_V  = 6;
const EDGE   = 8;

function estimateH(items: ContextMenuItem[]): number {
  return PAD_V * 2 + items.reduce((acc, it) => {
    if (it.type === 'separator') return acc + SEP_H;
    if (it.type === 'header')    return acc + HDR_H;
    return acc + ITEM_H;
  }, 0);
}

/** Indices of items that can receive keyboard focus (skips separators/headers). */
function focusableIndices(items: { type?: string }[]): number[] {
  return items.reduce<number[]>((acc, it, i) => {
    if (it.type !== 'separator' && it.type !== 'header') acc.push(i);
    return acc;
  }, []);
}

const CONTAINER: React.CSSProperties = {
  position: 'fixed',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
  padding: PAD_V,
  zIndex: 9999,
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  minWidth: MENU_W,
  userSelect: 'none',
  animation: 'ctx-in .12s ease',
  outline: 'none',
};

// ── CSS animation (injected once) ─────────────────────────────────────────────

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const s = document.createElement('style');
  s.id = 'vencore-ctx-style';
  s.textContent = `
    @keyframes ctx-in {
      from { opacity: 0; transform: translateY(-3px) scale(0.985); }
      to   { opacity: 1; transform: none; }
    }
  `;
  document.head.appendChild(s);
}

// ── Sub-item ───────────────────────────────────────────────────────────────────

function SubItem({
  item,
  id,
  focused,
  onHover,
  onClose,
}: {
  item: ContextMenuSubItem;
  id: string;
  focused: boolean;
  onHover: () => void;
  onClose: () => void;
}) {
  return (
    <div
      id={id}
      role="menuitem"
      aria-disabled={item.disabled || undefined}
      onMouseEnter={onHover}
      onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 8,
        background: focused && !item.disabled ? 'var(--surface2)' : 'transparent',
        cursor: item.disabled ? 'default' : 'pointer',
        opacity: item.disabled ? 0.4 : 1,
        color: 'var(--text)', transition: 'background .12s',
      }}
    >
      {item.swatch && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.swatch, flexShrink: 0 }} />
      )}
      {item.icon && !item.swatch && (
        <span style={{ color: 'var(--text2)', display: 'flex', flexShrink: 0 }}>
          <Icon name={item.icon} size={16} />
        </span>
      )}
      {!item.icon && !item.swatch && <span style={{ width: 16, flexShrink: 0 }} />}
      <span style={{ flex: 1 }}>{item.label}</span>
    </div>
  );
}

// ── Submenu panel ──────────────────────────────────────────────────────────────

function SubMenu({
  items,
  anchorEl,
  menuId,
  focusedIdx,
  onHover,
  onClose,
  onEnter,
  onLeave,
}: {
  items: ContextMenuSubItem[];
  anchorEl: HTMLDivElement;
  menuId: string;
  focusedIdx: number;
  onHover: (i: number) => void;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const r = anchorEl.getBoundingClientRect();
  const h = PAD_V * 2 + items.length * ITEM_H;
  let x = r.right - 4;
  let y = r.top - PAD_V;
  if (x + SUB_W > window.innerWidth - EDGE) x = r.left - SUB_W + 4;
  if (y + h      > window.innerHeight - EDGE) y = window.innerHeight - h - EDGE;

  return (
    <div
      id={menuId}
      role="menu"
      aria-orientation="vertical"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ ...CONTAINER, left: Math.max(EDGE, x), top: Math.max(EDGE, y), zIndex: 10000, minWidth: SUB_W }}
    >
      {items.map((it, i) => (
        <SubItem
          key={i}
          id={`${menuId}-item-${i}`}
          item={it}
          focused={focusedIdx === i}
          onHover={() => onHover(i)}
          onClose={onClose}
        />
      ))}
    </div>
  );
}

// ── Menu item ──────────────────────────────────────────────────────────────────

function MenuItem({
  id,
  label,
  icon,
  shortcut,
  danger = false,
  disabled = false,
  isSubmenu = false,
  subOpen = false,
  focused = false,
  submenuId,
  onClick,
  onEnter,
  onLeave,
}: {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  isSubmenu?: boolean;
  subOpen?: boolean;
  focused?: boolean;
  submenuId?: string;
  onClick: () => void;
  onEnter: (el: HTMLDivElement) => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = focused || subOpen;

  return (
    <div
      id={id}
      ref={ref}
      role="menuitem"
      aria-disabled={disabled || undefined}
      aria-haspopup={isSubmenu ? 'menu' : undefined}
      aria-expanded={isSubmenu ? subOpen : undefined}
      aria-controls={isSubmenu && subOpen ? submenuId : undefined}
      onMouseEnter={() => onEnter(ref.current!)}
      onMouseLeave={onLeave}
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 8,
        background: active && !disabled
          ? (danger ? 'var(--red-bg)' : 'var(--surface2)')
          : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: danger ? 'var(--red)' : 'var(--text)',
        transition: 'background .12s',
      }}
    >
      {icon
        ? <span style={{ color: danger ? 'var(--red)' : 'var(--text2)', display: 'flex', flexShrink: 0 }}><Icon name={icon} size={16} /></span>
        : <span style={{ width: 16, flexShrink: 0 }} />
      }
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && !isSubmenu && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{shortcut}</span>
      )}
      {isSubmenu && (
        <span style={{ color: 'var(--text3)', display: 'flex' }}>
          <Icon name="chevron-right" size={14} />
        </span>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

function MenuRoot({
  x, y, items, onClose,
}: {
  x: number; y: number; items: ContextMenuItem[]; onClose: () => void;
}) {
  ensureStyle();

  const [menuId] = useState(() => `ctx-menu-${Math.random().toString(36).slice(2)}`);
  const submenuId = `${menuId}-sub`;

  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null);
  const [subAnchor, setSubAnchor]   = useState<HTMLDivElement | null>(null);
  const [focusLevel, setFocusLevel] = useState<'main' | 'sub'>('main');
  const [subFocusedIdx, setSubFocusedIdx] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null!);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const restoreFocusEl = useRef<HTMLElement | null>(null);

  const focusable = focusableIndices(items);
  const [focusedIdx, setFocusedIdx] = useState<number>(focusable[0] ?? -1);

  // Edge-aware position
  const h = estimateH(items);
  const rx = x + MENU_W > window.innerWidth  - EDGE ? x - MENU_W : x;
  const ry = y + h       > window.innerHeight - EDGE ? y - h       : y;

  const handleClose = useCallback(() => {
    restoreFocusEl.current?.focus?.();
    onClose();
  }, [onClose]);

  // Focus management: remember what had focus, move focus into the menu
  useEffect(() => {
    restoreFocusEl.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onScroll() { handleClose(); }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [handleClose]);

  // click-outside (covers both menu + submenu)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if ((t as Element).closest?.('[data-ctx-sub]')) return;
      handleClose();
    }
    // slight delay so the contextmenu event itself doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDown); };
  }, [handleClose]);

  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setOpenSubIdx(null); setSubAnchor(null); setFocusLevel('main'); }, 160);
  }
  function cancelHide() { clearTimeout(hideTimer.current); }

  function openSubmenuAt(i: number, el: HTMLDivElement) {
    cancelHide();
    setOpenSubIdx(i);
    setSubAnchor(el);
  }

  function handleItemEnter(i: number, el: HTMLDivElement) {
    setFocusedIdx(i);
    setFocusLevel('main');
    cancelHide();
    setOpenSubIdx(null);
    setSubAnchor(null);
    if (items[i]?.type === 'submenu') {
      openSubmenuAt(i, el);
    }
  }

  const openSubItem = openSubIdx !== null ? items[openSubIdx] : null;
  const subItems    = openSubItem?.type === 'submenu' ? openSubItem.items : null;

  function activateItem(i: number) {
    const it = items[i];
    if (!it || it.type === 'separator' || it.type === 'header') return;
    if (it.type === 'submenu') {
      const el = document.getElementById(`${menuId}-item-${i}`) as HTMLDivElement | null;
      if (el) openSubmenuAt(i, el);
      setFocusLevel('sub');
      setSubFocusedIdx(0);
      return;
    }
    if (it.disabled) return;
    it.onClick();
    handleClose();
  }

  function moveFocus(dir: 1 | -1) {
    if (focusable.length === 0) return;
    const pos = focusable.indexOf(focusedIdx);
    const nextPos = (pos + dir + focusable.length) % focusable.length;
    setFocusedIdx(focusable[nextPos]!);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (focusLevel === 'sub') {
        setFocusLevel('main');
        scheduleHide();
      } else {
        handleClose();
      }
      return;
    }

    if (focusLevel === 'sub' && subItems) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSubFocusedIdx(i => (i + 1) % subItems.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSubFocusedIdx(i => (i - 1 + subItems.length) % subItems.length);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusLevel('main');
          scheduleHide();
          return;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const it = subItems[subFocusedIdx];
          if (it && !it.disabled) { it.onClick(); handleClose(); }
          return;
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        return;
      case 'ArrowRight': {
        const it = items[focusedIdx];
        if (it?.type === 'submenu') { e.preventDefault(); activateItem(focusedIdx); }
        return;
      }
      case 'Home':
        e.preventDefault();
        if (focusable[0] !== undefined) setFocusedIdx(focusable[0]);
        return;
      case 'End':
        e.preventDefault();
        if (focusable.length) setFocusedIdx(focusable[focusable.length - 1]!);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activateItem(focusedIdx);
        return;
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      {/* Menu panel */}
      <div
        ref={panelRef}
        id={menuId}
        role="menu"
        aria-orientation="vertical"
        tabIndex={-1}
        aria-activedescendant={focusedIdx >= 0 ? `${menuId}-item-${focusedIdx}` : undefined}
        onKeyDown={onKeyDown}
        style={{ ...CONTAINER, left: Math.max(EDGE, rx), top: Math.max(EDGE, ry), pointerEvents: 'auto' }}
      >
        {items.map((it, i) => {
          if (it.type === 'separator') {
            return <div key={i} role="separator" style={{ height: 1, background: 'var(--border)', margin: '6px' }} />;
          }
          if (it.type === 'header') {
            return (
              <div key={i} role="presentation" style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, padding: '8px 10px 4px' }}>
                {it.label}
              </div>
            );
          }
          if (it.type === 'submenu') {
            return (
              <MenuItem
                key={i}
                id={`${menuId}-item-${i}`}
                label={it.label}
                icon={it.icon}
                isSubmenu
                subOpen={openSubIdx === i}
                focused={focusedIdx === i && focusLevel === 'main'}
                submenuId={submenuId}
                onClick={() => {}}
                onEnter={el => handleItemEnter(i, el)}
                onLeave={scheduleHide}
              />
            );
          }
          return (
            <MenuItem
              key={i}
              id={`${menuId}-item-${i}`}
              label={it.label}
              icon={it.icon}
              shortcut={it.shortcut}
              danger={it.danger}
              disabled={it.disabled}
              focused={focusedIdx === i && focusLevel === 'main'}
              onClick={() => { it.onClick(); handleClose(); }}
              onEnter={el => handleItemEnter(i, el)}
              onLeave={() => {}}
            />
          );
        })}
      </div>

      {/* Submenu panel */}
      {subItems && subAnchor && (
        <div data-ctx-sub style={{ pointerEvents: 'auto' }}>
          <SubMenu
            items={subItems}
            anchorEl={subAnchor}
            menuId={submenuId}
            focusedIdx={focusLevel === 'sub' ? subFocusedIdx : -1}
            onHover={i => { setFocusLevel('sub'); setSubFocusedIdx(i); }}
            onClose={handleClose}
            onEnter={cancelHide}
            onLeave={scheduleHide}
          />
        </div>
      )}
    </div>
  );
}
