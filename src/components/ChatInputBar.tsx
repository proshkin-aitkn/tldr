import { useRef, useEffect } from 'preact/hooks';
import type { JSX } from 'preact';

export type SummarizeVariant = 'primary' | 'amber' | 'disabled';

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isFirstSubmit: boolean;
  loading: boolean;
  summarizeVariant?: SummarizeVariant;
}

export function ChatInputBar({ value, onChange, onSubmit, isFirstSubmit, loading, summarizeVariant = 'primary' }: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 4 * 20 + 16; // 4 rows * lineHeight + padding
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
  }, [value]);

  const canSubmit = isFirstSubmit
    ? !loading && summarizeVariant !== 'disabled'
    : !loading && !!value.trim();

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  const placeholder = isFirstSubmit
    ? 'Type optional instructions and summarize...'
    : 'Ask about the summary...';

  return (
    <div
      style={{
        padding: '12px 16px',
        backgroundColor: 'var(--md-sys-color-surface-container-low)',
        borderTop: '1px solid var(--md-sys-color-outline-variant)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          backgroundColor: 'var(--md-sys-color-surface-container)',
          borderRadius: 'var(--md-sys-shape-corner-large)',
          padding: '4px 4px 4px 16px',
          border: '1px solid var(--md-sys-color-outline-variant)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            backgroundColor: 'transparent',
            font: 'var(--md-sys-typescale-body-medium)',
            color: 'var(--md-sys-color-on-surface)',
            resize: 'none',
            outline: 'none',
            lineHeight: '20px',
          }}
        />
        {isFirstSubmit ? (
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            title="Summarize page content"
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: summarizeVariant === 'disabled'
                ? 'var(--md-sys-color-surface-container-highest)'
                : summarizeVariant === 'amber'
                  ? '#f59e0b'
                  : 'var(--md-sys-color-primary)',
              color: summarizeVariant === 'disabled'
                ? 'var(--md-sys-color-outline)'
                : summarizeVariant === 'amber'
                  ? '#fff'
                  : 'var(--md-sys-color-on-primary)',
              font: 'var(--md-sys-typescale-label-large)',
              cursor: !canSubmit ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {loading ? <SmallSpinner /> : null}
            Summarize
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim() || loading}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: value.trim() && !loading ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-highest)',
              color: value.trim() && !loading ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-outline)',
              cursor: !value.trim() || loading ? 'default' : 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            aria-label="Send"
            title="Send message"
          >
            {loading ? <SmallSpinner /> : <SendIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
    </svg>
  );
}

function SmallSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
  );
}
