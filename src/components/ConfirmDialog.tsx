import { useEffect } from 'preact/hooks';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  onDismiss: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onDismiss,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 900,
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          borderRadius: 'var(--md-sys-shape-corner-extra-large)',
          padding: '24px',
          margin: '24px',
          maxWidth: '320px',
          width: '100%',
          boxShadow: 'var(--md-sys-elevation-3)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <div style={{
            font: 'var(--md-sys-typescale-title-medium)',
            color: 'var(--md-sys-color-on-surface)',
          }}>
            {title}
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--md-sys-color-on-surface-variant)',
              padding: '4px',
              marginRight: '-4px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{
          font: 'var(--md-sys-typescale-body-medium)',
          color: 'var(--md-sys-color-on-surface-variant)',
          marginBottom: '20px',
          lineHeight: 1.5,
        }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onSecondary}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: '1px solid var(--md-sys-color-outline)',
              backgroundColor: 'transparent',
              color: 'var(--md-sys-color-primary)',
              font: 'var(--md-sys-typescale-label-large)',
              cursor: 'pointer',
            }}
          >
            {secondaryLabel}
          </button>
          <button
            onClick={onPrimary}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
              font: 'var(--md-sys-typescale-label-large)',
              cursor: 'pointer',
            }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
