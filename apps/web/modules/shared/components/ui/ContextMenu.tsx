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
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
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
  onClose,
}: {
  item: ContextMenuSubItem;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 8,
        background: hover && !item.disabled ? 'var(--surface2)' : 'transparent',
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
  onClose,
  onEnter,
  onLeave,
}: {
  items: ContextMenuSubItem[];
  anchorEl: HTMLDivElement;
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
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ ...CONTAINER, left: Math.max(EDGE, x), top: Math.max(EDGE, y), zIndex: 10000, minWidth: SUB_W }}
    >
      {items.map((it, i) => <SubItem key={i} item={it} onClose={onClose} />)}
    </div>
  );
}

// ── Menu item ──────────────────────────────────────────────────────────────────

function MenuItem({
  label,
  icon,
  shortcut,
  danger = false,
  disabled = false,
  isSubmenu = false,
  subOpen = false,
  onClick,
  onEnter,
  onLeave,
}: {
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  isSubmenu?: boolean;
  subOpen?: boolean;
  onClick: () => void;
  onEnter: (el: HTMLDivElement) => void;
  onLeave: () => void;
}) {
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = hover || subOpen;

  return (
    <div
      ref={ref}
      onMouseEnter={() => { setHover(true); onEnter(ref.current!); }}
      onMouseLeave={() => { setHover(false); onLeave(); }}
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

  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null);
  const [subAnchor, setSubAnchor]   = useState<HTMLDivElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null!);
  const menuRef   = useRef<HTMLDivElement>(null);

  // Edge-aware position
  const h = estimateH(items);
  const rx = x + MENU_W > window.innerWidth  - EDGE ? x - MENU_W : x;
  const ry = y + h       > window.innerHeight - EDGE ? y - h       : y;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // check if click is inside an open submenu — handled by portal, can't detect easily
        // so we rely on Escape and item clicks
      }
    }
    function onScroll() { onClose(); }
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  // click-outside on the wrapper div (covers both menu + submenu)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      // if it's inside our menu root div OR inside any ctx-submenu, ignore
      if (menuRef.current?.contains(t)) return;
      if ((t as Element).closest?.('[data-ctx-sub]')) return;
      onClose();
    }
    // slight delay so the contextmenu event itself doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { setOpenSubIdx(null); setSubAnchor(null); }, 160);
  }
  function cancelHide() { clearTimeout(hideTimer.current); }

  function handleItemEnter(i: number, el: HTMLDivElement) {
    cancelHide();
    setOpenSubIdx(null);
    setSubAnchor(null);
    if (items[i]?.type === 'submenu') {
      setOpenSubIdx(i);
      setSubAnchor(el);
    }
  }

  const openSubItem = openSubIdx !== null ? items[openSubIdx] : null;
  const subItems    = openSubItem?.type === 'submenu' ? openSubItem.items : null;

  return (
    <div ref={menuRef} style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      {/* Menu panel */}
      <div
        style={{ ...CONTAINER, left: Math.max(EDGE, rx), top: Math.max(EDGE, ry), pointerEvents: 'auto' }}
      >
        {items.map((it, i) => {
          if (it.type === 'separator') {
            return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '6px' }} />;
          }
          if (it.type === 'header') {
            return (
              <div key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1.4, padding: '8px 10px 4px' }}>
                {it.label}
              </div>
            );
          }
          if (it.type === 'submenu') {
            return (
              <MenuItem
                key={i}
                label={it.label}
                icon={it.icon}
                isSubmenu
                subOpen={openSubIdx === i}
                onClick={() => {}}
                onEnter={el => handleItemEnter(i, el)}
                onLeave={scheduleHide}
              />
            );
          }
          return (
            <MenuItem
              key={i}
              label={it.label}
              icon={it.icon}
              shortcut={it.shortcut}
              danger={it.danger}
              disabled={it.disabled}
              onClick={() => { it.onClick(); onClose(); }}
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
            onClose={onClose}
            onEnter={cancelHide}
            onLeave={scheduleHide}
          />
        </div>
      )}
    </div>
  );
}
