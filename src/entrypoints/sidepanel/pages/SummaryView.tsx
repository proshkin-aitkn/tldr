import { useState, useEffect, useRef } from 'preact/hooks';
import type { SummaryDocument } from '@/lib/summarizer/types';
import type { ExtractedContent } from '@/lib/extractors/types';
import { MarkdownRenderer, InlineMarkdown, fixMermaidSyntax } from '@/components/MarkdownRenderer';

const LANG_LABELS: Record<string, string> = {
  en: 'EN', es: 'ES', fr: 'FR', de: 'DE',
  pt: 'PT', ru: 'RU', zh: 'ZH', ja: 'JA', ko: 'KO',
};

interface SummaryContentProps {
  summary: SummaryDocument;
  content: ExtractedContent | null;
  onExport?: () => void;
  notionUrl?: string | null;
  exporting?: boolean;
  onNavigate?: (url: string) => void;
  onDeleteSection?: (sectionKey: string) => void;
  onAdjustSection?: (sectionTitle: string, direction: 'more' | 'less') => void;
}

export function SummaryContent({ summary, content, onExport, notionUrl, exporting, onNavigate, onDeleteSection, onAdjustSection }: SummaryContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mdSaved, setMdSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setMdSaved(false); setCopied(false); }, [summary]);

  // Split TL;DR into body and status line for color-coded rendering
  const { body: tldrBody, statusLabel, statusText } = splitTldrStatus(summary.tldr);

  // Intercept link clicks — navigate the active browser tab instead of the sidepanel
  const handleLinkClick = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    const url = anchor.href;
    if (!url || url.startsWith('javascript:')) return;
    e.preventDefault();
    e.stopPropagation();
    if (onNavigate) onNavigate(url);
    else window.open(url, '_blank');
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
    <div ref={containerRef} data-summary-container onClick={handleLinkClick}>
      {/* TLDR */}
      {summary.tldr && (
        <Section title="TL;DR" defaultOpen
          onDelete={onDeleteSection ? () => onDeleteSection('tldr') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('TL;DR', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('TL;DR', 'less') : undefined}
        >
          <div class="summary-callout">
            <div style={{ font: 'var(--md-sys-typescale-body-large)', lineHeight: 1.5 }}><MarkdownRenderer content={tldrBody} /></div>
            {(statusLabel || statusText) && (
              <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: 'var(--md-sys-shape-corner-medium)', backgroundColor: 'var(--md-sys-color-surface-container)', display: 'flex', alignItems: 'baseline', gap: '8px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.4 }}>
                {statusLabel && <StatusBadge label={statusLabel} fallbackState={content?.prState || content?.issueState} />}
                {statusText && <span style={{ color: 'var(--md-sys-color-on-surface)' }}><InlineMarkdown text={statusText} /></span>}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Key Takeaways */}
      {summary.keyTakeaways.length > 0 && (
        <Section title="Key Takeaways" defaultOpen
          onDelete={onDeleteSection ? () => onDeleteSection('keyTakeaways') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Key Takeaways', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Key Takeaways', 'less') : undefined}
        >
          <ol style={{ paddingLeft: '24px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6, color: 'var(--md-sys-color-on-surface)' }}>
            {summary.keyTakeaways.map((point, i) => (
              <li key={i} style={{ marginBottom: '4px', paddingLeft: '4px' }}><InlineMarkdown text={point} /></li>
            ))}
          </ol>
        </Section>
      )}

      {/* Summary */}
      {summary.summary && (
        <Section title="Summary" defaultOpen
          onDelete={onDeleteSection ? () => onDeleteSection('summary') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Summary', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Summary', 'less') : undefined}
        >
          <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
            <MarkdownRenderer content={summary.summary} />
          </div>
        </Section>
      )}

      {/* Notable Quotes */}
      {summary.notableQuotes.length > 0 && (
        <Section title="Notable Quotes"
          onDelete={onDeleteSection ? () => onDeleteSection('notableQuotes') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Notable Quotes', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Notable Quotes', 'less') : undefined}
        >
          {summary.notableQuotes.map((quote, i) => (
            <blockquote key={i} style={{
              borderLeft: '3px solid var(--md-sys-color-outline-variant)',
              paddingLeft: '12px',
              margin: '8px 0',
              color: 'var(--md-sys-color-on-surface-variant)',
              font: 'var(--md-sys-typescale-body-medium)',
              fontStyle: 'italic',
            }}>
              "<InlineMarkdown text={quote} />"
            </blockquote>
          ))}
        </Section>
      )}

      {/* Pros and Cons */}
      {summary.prosAndCons && (
        <Section title="Pros & Cons"
          onDelete={onDeleteSection ? () => onDeleteSection('prosAndCons') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Pros & Cons', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Pros & Cons', 'less') : undefined}
        >
          <div class="pros-cons-grid">
            <div class="pros-card">
              <strong>Pros</strong>
              <ul>
                {summary.prosAndCons.pros.map((p, i) => <li key={i}><InlineMarkdown text={p} /></li>)}
              </ul>
            </div>
            <div class="cons-card">
              <strong>Cons</strong>
              <ul>
                {summary.prosAndCons.cons.map((c, i) => <li key={i}><InlineMarkdown text={c} /></li>)}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Fact Check */}
      {summary.factCheck && (
        <Section title="Fact Check"
          onDelete={onDeleteSection ? () => onDeleteSection('factCheck') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Fact Check', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Fact Check', 'less') : undefined}
        >
          <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.5 }}>
            <MarkdownRenderer content={summary.factCheck} />
          </div>
        </Section>
      )}

      {/* Comments Highlights */}
      {summary.commentsHighlights && summary.commentsHighlights.length > 0 && (
        <Section title="Comment Highlights"
          onDelete={onDeleteSection ? () => onDeleteSection('commentsHighlights') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Comment Highlights', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Comment Highlights', 'less') : undefined}
        >
          <ul style={{ paddingLeft: '20px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
            {summary.commentsHighlights.map((h, i) => <li key={i}><InlineMarkdown text={h} /></li>)}
          </ul>
        </Section>
      )}

      {/* Conclusion */}
      {summary.conclusion && (
        <Section title="Conclusion"
          onDelete={onDeleteSection ? () => onDeleteSection('conclusion') : undefined}
          onMore={onAdjustSection ? () => onAdjustSection('Conclusion', 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection('Conclusion', 'less') : undefined}
        >
          <div class="summary-callout-conclusion">
            <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.5 }}>
              <MarkdownRenderer content={summary.conclusion} />
            </div>
          </div>
        </Section>
      )}

      {/* Extra sections (added via chat refinement) */}
      {summary.extraSections && Object.entries(summary.extraSections).map(([title, content]) => (
        <Section key={`extra-${title}`} title={title}
          onDelete={onDeleteSection ? () => onDeleteSection(`extra:${title}`) : undefined}
          onMore={onAdjustSection ? () => onAdjustSection(title, 'more') : undefined}
          onLess={onAdjustSection ? () => onAdjustSection(title, 'less') : undefined}
        >
          <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
            <MarkdownRenderer content={content} />
          </div>
        </Section>
      ))}

      {/* Related Topics */}
      {summary.relatedTopics.length > 0 && (
        <Section title="Related Topics" onDelete={onDeleteSection ? () => onDeleteSection('relatedTopics') : undefined}>
          <div>
            {summary.relatedTopics.map((topic, i) => (
              <a
                key={i}
                href={`https://www.google.com/search?q=${encodeURIComponent(topic)}`}
                style={{
                  display: 'inline-block',
                  backgroundColor: '#e8edf8',
                  color: '#1a3c8a',
                  padding: '4px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  margin: '0 6px 6px 0',
                }}
              >
                {topic}
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Tags */}
      {summary.tags.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          {summary.tags.map((tag, i) => (
            <span key={i} style={{
              display: 'inline-block',
              backgroundColor: '#e8e8ec',
              color: '#5f6066',
              padding: '2px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              margin: '0 4px 4px 0',
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Export actions */}
      <div class="no-print" style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
        {onExport && (
          notionUrl ? (
            <a
              href={notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open exported page in Notion"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                borderRadius: '20px',
                border: '1px solid var(--md-sys-color-outline)',
                backgroundColor: 'transparent',
                color: 'var(--md-sys-color-on-surface)',
                font: 'var(--md-sys-typescale-label-large)',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
            >
              Open in Notion
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M6 3H3v10h10v-3M9 3h4v4M14 2L7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          ) : (
            <button
              onClick={onExport}
              disabled={exporting}
              title="Export summary to Notion"
              style={{
                padding: '8px 20px',
                borderRadius: '20px',
                border: 'none',
                backgroundColor: 'var(--md-sys-color-primary)',
                color: 'var(--md-sys-color-on-primary)',
                font: 'var(--md-sys-typescale-label-large)',
                cursor: exporting ? 'default' : 'pointer',
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? 'Exporting…' : 'Export to Notion'}
            </button>
          )
        )}
        <button
          onClick={() => {
            downloadMarkdown(summary, content);
            setMdSaved(true);
          }}
          disabled={mdSaved}
          title={mdSaved ? 'Markdown saved' : 'Download summary as Markdown'}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: '1px solid var(--md-sys-color-outline)',
            backgroundColor: 'transparent',
            color: mdSaved ? 'var(--md-sys-color-on-surface-variant)' : 'var(--md-sys-color-on-surface)',
            font: 'var(--md-sys-typescale-label-large)',
            cursor: mdSaved ? 'default' : 'pointer',
            opacity: mdSaved ? 0.5 : 1,
          }}
        >
          {mdSaved ? 'Saved' : 'Save .md'}
        </button>
        <button
          onClick={() => {
            copyToClipboard(summary, content, containerRef.current).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          disabled={copied}
          title={copied ? 'Copied!' : 'Copy as rich text (Ctrl+V) or plain markdown (Ctrl+Shift+V)'}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: '1px solid var(--md-sys-color-outline)',
            backgroundColor: 'transparent',
            color: copied ? 'var(--md-sys-color-tertiary)' : 'var(--md-sys-color-on-surface)',
            font: 'var(--md-sys-typescale-label-large)',
            cursor: copied ? 'default' : 'pointer',
            opacity: copied ? 0.7 : 1,
          }}
        >
          {copied ? '\u2713 Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function MetadataHeader({ content, summary, providerName, modelName, onProviderClick }: {
  content: ExtractedContent;
  summary?: SummaryDocument;
  providerName?: string;
  modelName?: string;
  onProviderClick?: () => void;
}) {
  const badgeColors: Record<string, { bg: string; text: string }> = {
    article: { bg: 'var(--md-sys-color-success-container)', text: 'var(--md-sys-color-on-success-container)' },
    youtube: { bg: 'var(--md-sys-color-error-container)', text: 'var(--md-sys-color-on-error-container)' },
    facebook: { bg: 'var(--md-sys-color-primary-container)', text: 'var(--md-sys-color-on-primary-container)' },
    reddit: { bg: '#FFE0B2', text: '#E65100' },
    twitter: { bg: '#E3F2FD', text: '#1565C0' },
    github: { bg: '#e1e4e8', text: '#24292e' },
    generic: { bg: 'var(--md-sys-color-surface-container-highest)', text: 'var(--md-sys-color-on-surface-variant)' },
  };
  const badge = badgeColors[content.type] || badgeColors.generic;

  return (
    <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{
          backgroundColor: badge.bg,
          color: badge.text,
          padding: '2px 10px',
          borderRadius: 'var(--md-sys-shape-corner-small)',
          font: 'var(--md-sys-typescale-label-small)',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {content.type === 'youtube' ? 'YouTube' : content.type === 'facebook' ? 'Facebook' : content.type === 'reddit' ? 'Reddit' : content.type === 'twitter' ? 'X' : content.type === 'github' ? 'GitHub' : content.type}
        </span>
        {content.type !== 'github' && content.estimatedReadingTime > 0 && (
          <span style={{ color: 'var(--md-sys-color-on-surface-variant)', font: 'var(--md-sys-typescale-label-small)' }}>
            {content.estimatedReadingTime} min read
          </span>
        )}
        {summary?.sourceLanguage && summary?.summaryLanguage && summary.sourceLanguage !== summary.summaryLanguage && (
          <span style={{
            backgroundColor: 'var(--md-sys-color-tertiary-container)',
            color: 'var(--md-sys-color-on-tertiary-container)',
            padding: '2px 10px',
            borderRadius: 'var(--md-sys-shape-corner-small)',
            font: 'var(--md-sys-typescale-label-small)',
            fontWeight: 600,
          }}>
            {(LANG_LABELS[summary.sourceLanguage] || summary.sourceLanguage.toUpperCase())} → {(LANG_LABELS[summary.summaryLanguage] || summary.summaryLanguage.toUpperCase())}
          </span>
        )}
        {(() => {
          const label = summary?.llmProvider || providerName;
          const tooltip = summary?.llmModel || modelName || '';
          const configured = !!label;
          return (
            <span
              title={configured ? tooltip : 'Click to configure LLM provider'}
              onClick={onProviderClick}
              style={{
                backgroundColor: configured ? 'var(--md-sys-color-secondary-container)' : '#fef3c7',
                color: configured ? 'var(--md-sys-color-on-secondary-container)' : '#92400e',
                padding: '2px 10px',
                borderRadius: 'var(--md-sys-shape-corner-small)',
                font: 'var(--md-sys-typescale-label-small)',
                fontWeight: 600,
                cursor: onProviderClick ? 'pointer' : 'default',
              }}
            >
              {configured ? label : 'Configure LLM'}
            </span>
          );
        })()}
      </div>

      {content.thumbnailUrls && content.thumbnailUrls.length >= 2 ? (
        <ThumbnailCollage urls={content.thumbnailUrls} title={content.title} fallbackUrl={content.thumbnailUrl} />
      ) : content.thumbnailUrl ? (
        <img
          src={content.thumbnailUrl}
          alt={content.title}
          style={{ width: '100%', borderRadius: 'var(--md-sys-shape-corner-medium)', marginBottom: '8px' }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (content.type === 'youtube') {
              const hqFallback = content.thumbnailUrl!.replace(/\/[^/]+\.jpg$/, '/hqdefault.jpg');
              if (img.src !== hqFallback) {
                img.src = hqFallback;
                return;
              }
            }
            img.style.display = 'none';
          }}
        />
      ) : null}

      <h2 style={{ font: 'var(--md-sys-typescale-title-medium)', lineHeight: 1.3, margin: '4px 0', color: 'var(--md-sys-color-on-surface)' }}>
        {summary?.translatedTitle || content.title || summary?.inferredTitle || ''}
      </h2>

      <div style={{ font: 'var(--md-sys-typescale-body-small)', color: 'var(--md-sys-color-on-surface-variant)', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
        {(content.author || summary?.inferredAuthor) && (
          <span>By {content.author || summary?.inferredAuthor}</span>
        )}
        {(content.publishDate || summary?.inferredPublishDate) && (
          <span>{formatDate(content.publishDate || summary?.inferredPublishDate || '')}</span>
        )}
        {content.duration && <span>{content.duration}</span>}
        {content.viewCount && <span>{content.viewCount} views</span>}
        {content.type === 'github' && content.prState && (
          <span style={{
            backgroundColor: content.prState === 'merged' ? '#8250df' : content.prState === 'open' ? '#1a7f37' : '#cf222e',
            color: '#fff', padding: '2px 8px', borderRadius: '12px',
            font: 'var(--md-sys-typescale-label-small)', fontWeight: 600,
          }}>
            {content.prState.charAt(0).toUpperCase() + content.prState.slice(1)}
          </span>
        )}
        {content.type === 'github' && content.issueState && !content.prState && (
          <span style={{
            backgroundColor: content.issueState === 'open' ? '#1a7f37' : '#cf222e',
            color: '#fff', padding: '2px 8px', borderRadius: '12px',
            font: 'var(--md-sys-typescale-label-small)', fontWeight: 600,
          }}>
            {content.issueState.charAt(0).toUpperCase() + content.issueState.slice(1)}
          </span>
        )}
      </div>
    </div>
  );
}

function ThumbnailCollage({ urls, title, fallbackUrl }: { urls: string[]; title: string; fallbackUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const count = urls.length; // 2, 3, or 4

  if (failed) {
    // Fallback to single image
    return fallbackUrl ? (
      <img
        src={fallbackUrl}
        alt={title}
        style={{ width: '100%', borderRadius: 'var(--md-sys-shape-corner-medium)', marginBottom: '8px' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    ) : null;
  }

  const gap = '2px';
  const imgStyle = { objectFit: 'cover' as const, width: '100%', height: '100%', display: 'block' as const };

  const onImgError = () => setFailed(true);

  if (count === 2) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap, borderRadius: 'var(--md-sys-shape-corner-medium)', overflow: 'hidden', aspectRatio: '16/9', marginBottom: '8px' }}>
        <img src={urls[0]} alt={title} style={imgStyle} onError={onImgError} />
        <img src={urls[1]} alt={title} style={imgStyle} onError={onImgError} />
      </div>
    );
  }

  if (count === 3) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap, borderRadius: 'var(--md-sys-shape-corner-medium)', overflow: 'hidden', aspectRatio: '16/9', marginBottom: '8px' }}>
        <img src={urls[0]} alt={title} style={{ ...imgStyle, gridRow: '1 / 3' }} onError={onImgError} />
        <img src={urls[1]} alt={title} style={imgStyle} onError={onImgError} />
        <img src={urls[2]} alt={title} style={imgStyle} onError={onImgError} />
      </div>
    );
  }

  // count === 4
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap, borderRadius: 'var(--md-sys-shape-corner-medium)', overflow: 'hidden', aspectRatio: '16/9', marginBottom: '8px' }}>
      <img src={urls[0]} alt={title} style={imgStyle} onError={onImgError} />
      <img src={urls[1]} alt={title} style={imgStyle} onError={onImgError} />
      <img src={urls[2]} alt={title} style={imgStyle} onError={onImgError} />
      <img src={urls[3]} alt={title} style={imgStyle} onError={onImgError} />
    </div>
  );
}

// Track user-toggled section state by title so it survives re-renders / remounts
const sectionUserState = new Map<string, boolean>();

/** Reset user section overrides (call when generating a fresh summary for a new page). */
export function resetSectionState() { sectionUserState.clear(); }

function Section({ title, defaultOpen = false, onDelete, onMore, onLess, children }: {
  title: string;
  defaultOpen?: boolean;
  onDelete?: () => void;
  onMore?: () => void;
  onLess?: () => void;
  children: preact.ComponentChildren;
}) {
  const [open, setOpen] = useState(sectionUserState.get(title) ?? defaultOpen);

  const toggle = () => {
    const next = !open;
    sectionUserState.set(title, next);
    setOpen(next);
  };

  const hasToolbar = onDelete || onMore || onLess;

  return (
    <div class="summary-section" style={{ marginBottom: '4px', position: 'relative' }}>
      <button
        onClick={toggle}
        title={open ? `Collapse ${title}` : `Expand ${title}`}
        class="section-toggle"
        style={{
          background: 'none',
          border: 'none',
          width: '100%',
          textAlign: 'left',
          padding: '10px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          font: 'var(--md-sys-typescale-title-small)',
          color: 'var(--md-sys-color-on-surface)',
          userSelect: 'text',
        }}
      >
        <span style={{
          transform: open ? 'rotate(90deg)' : 'rotate(0)',
          transition: 'transform 0.15s',
          fontSize: '10px',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}>&#9654;</span>
        {title}
      </button>
      {hasToolbar && (
        <div class="section-toolbar no-print">
          {onMore && (
            <button onClick={(e) => { e.stopPropagation(); onMore(); }} title="Elaborate more">+</button>
          )}
          {onLess && (
            <button onClick={(e) => { e.stopPropagation(); onLess(); }} title="Make shorter">&minus;</button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} class="section-toolbar-delete" title={`Remove ${title}`}>&#215;</button>
          )}
        </div>
      )}
      <div class="section-content" style={{ paddingLeft: '4px', paddingBottom: '8px', display: open ? 'block' : 'none' }}>{children}</div>
    </div>
  );
}

function summaryToMarkdown(summary: SummaryDocument, content: ExtractedContent | null): string {
  const lines: string[] = [];

  if (content) {
    const displayTitle = summary.translatedTitle || content.title || summary.inferredTitle || 'Untitled';
    lines.push(`# ${displayTitle}`, '');
    const meta: string[] = [];
    if (content.author || summary.inferredAuthor) meta.push(`**Author:** ${content.author || summary.inferredAuthor}`);
    if (content.publishDate || summary.inferredPublishDate) meta.push(`**Date:** ${content.publishDate || summary.inferredPublishDate}`);
    if (content.url) meta.push(`**Source:** ${content.url}`);
    if (meta.length) lines.push(meta.join(' | '), '');
  }

  if (summary.tldr) {
    lines.push('## TL;DR', '', summary.tldr, '');
  }

  if (summary.keyTakeaways.length > 0) {
    lines.push('## Key Takeaways', '');
    summary.keyTakeaways.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push('');
  }

  if (summary.summary) {
    lines.push('## Summary', '', summary.summary, '');
  }

  if (summary.notableQuotes.length > 0) {
    lines.push('## Notable Quotes', '');
    for (const q of summary.notableQuotes) lines.push(`> "${q}"`, '');
  }

  if (summary.prosAndCons) {
    lines.push('## Pros & Cons', '', '**Pros**', '');
    for (const p of summary.prosAndCons.pros) lines.push(`- ${p}`);
    lines.push('', '**Cons**', '');
    for (const c of summary.prosAndCons.cons) lines.push(`- ${c}`);
    lines.push('');
  }

  if (summary.factCheck) {
    lines.push('## Fact Check', '', summary.factCheck, '');
  }

  if (summary.commentsHighlights && summary.commentsHighlights.length > 0) {
    lines.push('## Comment Highlights', '');
    for (const h of summary.commentsHighlights) lines.push(`- ${h}`);
    lines.push('');
  }

  if (summary.conclusion) {
    lines.push('## Conclusion', '', summary.conclusion, '');
  }

  if (summary.extraSections) {
    for (const [title, content] of Object.entries(summary.extraSections)) {
      lines.push(`## ${title}`, '', content, '');
    }
  }

  if (summary.relatedTopics.length > 0) {
    lines.push('## Related Topics', '', summary.relatedTopics.map(t => `[${t}](https://www.google.com/search?q=${encodeURIComponent(t)})`).join(' | '), '');
  }

  if (summary.tags.length > 0) {
    lines.push('---', '', summary.tags.map((t) => `#${t}`).join(' '), '');
  }

  if (content?.url) {
    lines.push('---', '', `[Original source](${content.url})`, '');
  }

  lines.push(`*Generated with [TL;DR](https://chromewebstore.google.com/detail/pikdhogjjbaakcpedmahckhmajdgdeon)*`);

  return fixMermaidSyntax(lines.join('\n'));
}

export function downloadMarkdown(summary: SummaryDocument, content: ExtractedContent | null) {
  const md = summaryToMarkdown(summary, content);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug = (summary.translatedTitle || content?.title || summary.inferredTitle || 'summary').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert a live-DOM SVG to PNG by replacing foreignObject elements with SVG <text>,
 *  reading computed styles from the live DOM. foreignObject HTML can't be rendered
 *  via Image+canvas due to browser security restrictions. */
async function svgToPng(liveSvg: SVGSVGElement): Promise<string> {
  // Use the actual on-screen rendered size so the PNG matches the panel
  const rect = liveSvg.getBoundingClientRect();
  const renderW = Math.round(rect.width);
  const renderH = Math.round(rect.height);

  const svgStr = new XMLSerializer().serializeToString(liveSvg);
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  const svg = doc.querySelector('svg')!;

  // Force the SVG to render at the on-screen size (overrides viewBox-only sizing)
  svg.setAttribute('width', String(renderW));
  svg.setAttribute('height', String(renderH));

  // Replace foreignObject with SVG <text> using computed styles from the live DOM
  const liveFOs = liveSvg.querySelectorAll('foreignObject');
  const cloneFOs = doc.querySelectorAll('foreignObject');
  for (let i = 0; i < liveFOs.length && i < cloneFOs.length; i++) {
    const fo = cloneFOs[i];
    const liveFO = liveFOs[i];
    const x = parseFloat(fo.getAttribute('x') || '0');
    const y = parseFloat(fo.getAttribute('y') || '0');
    const w = parseFloat(fo.getAttribute('width') || '100');
    const h = parseFloat(fo.getAttribute('height') || '30');

    // Read text content and style from the live DOM element
    const liveEl = liveFO.querySelector('div, span, p') || liveFO;
    const rawText = (liveEl.textContent || '').trim();
    const cs = getComputedStyle(liveEl);
    const fill = cs.color || '#000';
    const fSize = parseFloat(cs.fontSize) || 14;

    const textEl = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', String(x + w / 2));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('fill', fill);
    textEl.setAttribute('font-size', String(fSize));
    textEl.setAttribute('font-family', cs.fontFamily || 'sans-serif');

    const lines = rawText.split('\n').filter(l => l.trim());
    const lh = fSize * 1.3;
    const startY = y + h / 2 - ((lines.length - 1) * lh) / 2;
    for (let j = 0; j < lines.length; j++) {
      const tspan = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', String(x + w / 2));
      tspan.setAttribute('y', String(startY + j * lh));
      tspan.textContent = lines[j].trim();
      textEl.appendChild(tspan);
    }
    fo.replaceWith(textEl);
  }

  const finalSvg = new XMLSerializer().serializeToString(doc);
  const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });
    const scale = 2; // 2x for retina sharpness
    const canvas = document.createElement('canvas');
    canvas.width = renderW * scale;
    canvas.height = renderH * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, renderW, renderH);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STORE_URL = 'https://chromewebstore.google.com/detail/pikdhogjjbaakcpedmahckhmajdgdeon';

export async function copyToClipboard(summary: SummaryDocument, content: ExtractedContent | null, containerEl: HTMLElement | null) {
  const md = summaryToMarkdown(summary, content);

  // Clone rendered DOM to preserve mermaid diagrams, then clean up UI chrome
  let html = md; // fallback
  if (containerEl) {
    const clone = containerEl.cloneNode(true) as HTMLElement;
    // Remove export buttons, dismiss buttons, etc.
    clone.querySelectorAll('.no-print').forEach(el => el.remove());
    // Expand all collapsed sections
    clone.querySelectorAll('.section-content').forEach(el => {
      (el as HTMLElement).style.display = 'block';
    });
    // Convert section toggle buttons to headings
    clone.querySelectorAll('.section-toggle').forEach(btn => {
      const h3 = document.createElement('h3');
      btn.querySelector('span')?.remove();
      h3.textContent = btn.textContent?.trim() || '';
      btn.replaceWith(h3);
    });
    // Temporarily expand collapsed sections in the live DOM so SVGs are measurable
    const liveSections = containerEl.querySelectorAll<HTMLElement>('.section-content');
    const savedDisplay = Array.from(liveSections, el => el.style.display);
    liveSections.forEach(el => { el.style.display = 'block'; });

    // Convert mermaid SVGs to PNG (foreignObject → SVG <text>, then canvas)
    const livePres = containerEl.querySelectorAll('pre.mermaid');
    const clonePres = clone.querySelectorAll('pre.mermaid');
    for (let i = 0; i < livePres.length && i < clonePres.length; i++) {
      const liveSvg = livePres[i].querySelector('svg');
      if (!liveSvg || !clonePres[i]) continue;
      try {
        const pngUrl = await svgToPng(liveSvg as SVGSVGElement);
        const img = document.createElement('img');
        img.src = pngUrl;
        img.alt = 'Diagram';
        img.style.maxWidth = '100%';
        // Preserve auto-generated legend from the clone
        const legendEl = clonePres[i].querySelector('.mermaid-legend');
        if (legendEl) {
          const wrapper = document.createElement('div');
          wrapper.appendChild(img);
          wrapper.appendChild(legendEl);
          clonePres[i].replaceWith(wrapper);
        } else {
          clonePres[i].replaceWith(img);
        }
      } catch {
        clonePres[i].remove();
      }
    }

    // Restore collapsed sections
    liveSections.forEach((el, i) => { el.style.display = savedDisplay[i]; });

    // Replace Related Topics with a simple comma-separated link list (Google Docs strips inline-block/margin)
    if (summary.relatedTopics.length > 0) {
      const topicSections = clone.querySelectorAll('.section-content');
      // The Related Topics section-content is the last or second-to-last — find it by link pattern
      for (const sc of topicSections) {
        const links = sc.querySelectorAll('a[href*="google.com/search"]');
        if (links.length === 0) continue;
        const p = document.createElement('p');
        links.forEach((a, idx) => {
          if (idx > 0) p.appendChild(document.createTextNode(' \u00b7 '));
          const link = document.createElement('a');
          link.href = (a as HTMLAnchorElement).href;
          link.textContent = a.textContent || '';
          p.appendChild(link);
        });
        sc.innerHTML = '';
        sc.appendChild(p);
      }
    }

    // Replace Tags with a plain-text paragraph
    if (summary.tags.length > 0) {
      // Tags container is the last div with inline-block spans
      const allDivs = clone.querySelectorAll(':scope > div');
      for (const div of allDivs) {
        const spans = div.querySelectorAll('span');
        if (spans.length > 0 && spans[0].textContent?.startsWith('#')) {
          const p = document.createElement('p');
          p.style.color = '#666';
          p.style.fontSize = '13px';
          p.textContent = Array.from(spans, s => s.textContent?.trim()).join('  ');
          div.replaceWith(p);
          break;
        }
      }
    }

    // --- Build header with thumbnail + metadata ---
    const title = summary.translatedTitle || content?.title || summary.inferredTitle || '';
    const author = content?.author || summary.inferredAuthor;
    const date = content?.publishDate || summary.inferredPublishDate;
    let header = '';
    if (content?.thumbnailUrl) {
      header += `<img src="${content.thumbnailUrl}" alt="${title}" style="max-width:100%;border-radius:8px;margin-bottom:8px;" />\n`;
    }
    if (title) header += `<h1>${title}</h1>\n`;
    const metaParts: string[] = [];
    if (author) metaParts.push(`By ${author}`);
    if (date) metaParts.push(formatDate(date));
    if (content?.estimatedReadingTime) metaParts.push(`${content.estimatedReadingTime} min read`);
    if (metaParts.length) header += `<p style="color:#666;font-size:14px;">${metaParts.join(' &middot; ')}</p>\n<hr />\n`;

    // --- Build footer with source link + attribution ---
    let footer = '<hr />\n';
    if (content?.url) {
      footer += `<p><a href="${content.url}">Original source</a></p>\n`;
    }
    footer += `<p style="color:#999;font-size:12px;"><em>Generated with <a href="${STORE_URL}">TL;DR</a></em></p>`;

    html = header + clone.innerHTML + footer;
  }

  const item = new ClipboardItem({
    'text/plain': new Blob([md], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
  });
  await navigator.clipboard.write([item]);
}

/** Status label → badge color mapping */
const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  // PR statuses
  'ready to merge': { bg: '#1a7f37', text: '#fff' },
  'needs attention': { bg: '#bf8700', text: '#fff' },
  'blocked':        { bg: '#cf222e', text: '#fff' },
  'open':           { bg: '#57606a', text: '#fff' },
  'merged':         { bg: '#8250df', text: '#fff' },
  'closed':         { bg: '#cf222e', text: '#fff' },
  // Issue statuses
  'has fix':        { bg: '#1a7f37', text: '#fff' },
  'confirmed':      { bg: '#bf8700', text: '#fff' },
  'needs triage':   { bg: '#57606a', text: '#fff' },
  'stale':          { bg: '#57606a', text: '#fff' },
};

/** Known status labels to detect at the start of a status line */
const STATUS_LABELS = Object.keys(STATUS_BADGES).sort((a, b) => b.length - a.length);

/** Split TL;DR text into body and an optional status line (detected by **Status:** pattern) */
function splitTldrStatus(tldr: string): { body: string; statusLabel: string | null; statusText: string | null } {
  // Accept both \n and \n\n before **Status:** (LLMs sometimes use a single newline)
  const match = tldr.match(/\n\n?\*\*Status:\*\*\s*(.*?)$/s);
  if (!match) return { body: tldr, statusLabel: null, statusText: null };

  let rest = match[1].trim();
  // Strip markdown bold/italic wrapping from label: "**Needs attention** — text" → "Needs attention — text"
  rest = rest.replace(/^([*_]{1,2})(.+?)\1(?=\s*[—–\-:]|\s*$)/, '$2').trim();

  // Try to extract a known status label from the beginning
  const lower = rest.toLowerCase();
  for (const label of STATUS_LABELS) {
    if (lower.startsWith(label)) {
      const statusLabel = rest.slice(0, label.length);
      let statusText = rest.slice(label.length).replace(/^\s*[—–\-:]\s*/, '').trim();
      return { body: tldr.slice(0, match.index!).trim(), statusLabel, statusText: statusText || null };
    }
  }
  // No known label — fall back to raw GitHub state words
  const stateMatch = rest.match(/^(Open|Closed|Merged)\s*[—–\-:]\s*/i);
  if (stateMatch) {
    return { body: tldr.slice(0, match.index!).trim(), statusLabel: stateMatch[1], statusText: rest.slice(stateMatch[0].length).trim() || null };
  }
  // Unknown format — show entire text with no badge
  return { body: tldr.slice(0, match.index!).trim(), statusLabel: null, statusText: rest };
}

function StatusBadge({ label, fallbackState }: { label: string | null; fallbackState?: string }) {
  const key = (label || fallbackState || 'open').toLowerCase();
  const c = STATUS_BADGES[key] || STATUS_BADGES.open;
  const display = label || (fallbackState ? fallbackState.charAt(0).toUpperCase() + fallbackState.slice(1) : 'Open');

  return (
    <span style={{
      backgroundColor: c.bg,
      color: c.text,
      padding: '2px 8px',
      borderRadius: '12px',
      font: 'var(--md-sys-typescale-label-small)',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {display}
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
