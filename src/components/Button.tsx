import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: JSX.CSSProperties;
  title?: string;
  children?: preact.ComponentChildren;
}

export function Button({ variant = 'primary', size = 'md', loading, children, disabled, style, title, onClick }: ButtonProps) {
  const [hovered, setHovered] = useState(false);

  const baseStyle: JSX.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: 'none',
    borderRadius: '20px',
    cursor: disabled || loading ? 'default' : 'pointer',
    fontWeight: 500,
    font: 'var(--md-sys-typescale-label-large)',
    padding: size === 'sm' ? '6px 16px' : '10px 24px',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'filter 0.15s, opacity 0.15s',
    filter: hovered && !disabled && !loading ? 'brightness(1.1)' : 'none',
    ...(variant === 'primary' ? {
      backgroundColor: 'var(--md-sys-color-primary)',
      color: 'var(--md-sys-color-on-primary)',
    } : variant === 'secondary' ? {
      backgroundColor: 'var(--md-sys-color-secondary-container)',
      color: 'var(--md-sys-color-on-secondary-container)',
    } : {
      backgroundColor: 'transparent',
      color: 'var(--md-sys-color-primary)',
    }),
    ...style,
  };

  return (
    <button
      style={baseStyle}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {loading && <SpinnerIcon size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}

function SpinnerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
  );
}
