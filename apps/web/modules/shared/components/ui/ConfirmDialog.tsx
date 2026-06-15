'use client';

import { useCallback, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {variant === 'danger' && (
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--red-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 4px',
          }}>
            <Icon name="trash" size={20} color="var(--red)" />
          </div>
        )}
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.65 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>{cancelLabel}</Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── AlertDialog ─────────────────────────────────────────────────────────────

interface AlertDialogProps {
  title?: string;
  message: string;
  variant?: 'info' | 'error' | 'success';
  onClose: () => void;
}

const ALERT_ICON: Record<string, string> = { info: 'warning', error: 'warning', success: 'check' };
const ALERT_BG: Record<string, string> = {
  info:    'var(--blue-bg)',
  error:   'var(--red-bg)',
  success: 'var(--green-bg)',
};
const ALERT_COLOR: Record<string, string> = {
  info:    'var(--blue)',
  error:   'var(--red)',
  success: 'var(--green)',
};

export function AlertDialog({
  title = 'Notice',
  message,
  variant = 'info',
  onClose,
}: AlertDialogProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: ALERT_BG[variant],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 4px',
        }}>
          <Icon name={ALERT_ICON[variant] ?? 'warning'} size={20} color={ALERT_COLOR[variant]} />
        </div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={onClose}>OK</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const ask = useCallback((opts: ConfirmOptions) => setState(opts), []);
  const close = useCallback(() => setState(null), []);
  const el = state ? <ConfirmDialog {...state} onClose={close} /> : null;
  return { ask, el } as const;
}

interface AlertOptions {
  title?: string;
  message: string;
  variant?: 'info' | 'error' | 'success';
}

export function useAlert() {
  const [state, setState] = useState<AlertOptions | null>(null);
  const show = useCallback((message: string, opts?: Omit<AlertOptions, 'message'>) =>
    setState({ message, ...opts }), []);
  const close = useCallback(() => setState(null), []);
  const el = state ? <AlertDialog {...state} onClose={close} /> : null;
  return { show, el } as const;
}
