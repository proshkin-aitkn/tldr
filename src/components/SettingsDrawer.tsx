import { useEffect, useCallback } from 'preact/hooks';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  children: preact.ComponentChildren;
}

export function SettingsDrawer({ open, onClose, children }: SettingsDrawerProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'var(--md-sys-color-scrim)',
          zIndex: 100,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          backgroundColor: 'var(--md-sys-color-surface)',
          zIndex: 101,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px',
            borderBottom: '1px solid var(--md-sys-color-outline-variant)',
            flexShrink: 0,
          }}
        >
          <span style={{ font: 'var(--md-sys-typescale-title-large)', color: 'var(--md-sys-color-on-surface)' }}>
            Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: 'var(--md-sys-shape-corner-small)',
              color: 'var(--md-sys-color-on-surface-variant)',
              fontSize: '20px',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close settings"
            title="Close settings"
          >
            &#10005;
          </button>
        </div>
        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </>
  );
}
