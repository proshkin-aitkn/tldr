import { useState, useEffect } from 'preact/hooks';
import type { SummaryDocument } from '@/lib/summarizer/types';
import type { ExtractedContent } from '@/lib/extractors/types';
import { MarkdownRenderer, InlineMarkdown } from '@/components/MarkdownRenderer';

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
}

export function SummaryContent({ summary, content, onExport, notionUrl, exporting }: SummaryContentProps) {
  const [mdSaved, setMdSaved] = useState(false);
  useEffect(() => setMdSaved(false), [summary]);
  return (
    <div>
      {/* TLDR */}
      <Section title="TL;DR" defaultOpen>
        <p style={{ font: 'var(--md-sys-typescale-body-large)', lineHeight: 1.5, color: 'var(--md-sys-color-on-surface)' }}><InlineMarkdown text={summary.tldr} /></p>
      </Section>

      {/* Key Takeaways */}
      {summary.keyTakeaways.length > 0 && (
        <Section title="Key Takeaways" defaultOpen>
          <ul style={{ paddingLeft: '20px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6, color: 'var(--md-sys-color-on-surface)' }}>
            {summary.keyTakeaways.map((point, i) => (
              <li key={i}><InlineMarkdown text={point} /></li>
            ))}
          </ul>
        </Section>
      )}

      {/* Summary */}
      <Section title="Summary" defaultOpen>
        <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
          <MarkdownRenderer content={summary.summary} />
        </div>
      </Section>

      {/* Notable Quotes */}
      {summary.notableQuotes.length > 0 && (
        <Section title="Notable Quotes">
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
        <Section title="Pros & Cons">
          <div style={{ display: 'flex', gap: '12px', font: 'var(--md-sys-typescale-body-medium)' }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--md-sys-color-success)' }}>Pros</strong>
              <ul style={{ paddingLeft: '16px', marginTop: '4px' }}>
                {summary.prosAndCons.pros.map((p, i) => <li key={i}><InlineMarkdown text={p} /></li>)}
              </ul>
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--md-sys-color-error)' }}>Cons</strong>
              <ul style={{ paddingLeft: '16px', marginTop: '4px' }}>
                {summary.prosAndCons.cons.map((c, i) => <li key={i}><InlineMarkdown text={c} /></li>)}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Comments Highlights */}
      {summary.commentsHighlights && summary.commentsHighlights.length > 0 && (
        <Section title="Comment Highlights">
          <ul style={{ paddingLeft: '20px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
            {summary.commentsHighlights.map((h, i) => <li key={i}><InlineMarkdown text={h} /></li>)}
          </ul>
        </Section>
      )}

      {/* Conclusion */}
      {summary.conclusion && (
        <Section title="Conclusion">
          <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.5 }}>
            <MarkdownRenderer content={summary.conclusion} />
          </div>
        </Section>
      )}

      {/* Extra sections (added via chat refinement) */}
      {summary.extraSections && summary.extraSections.length > 0 && summary.extraSections.map((section, i) => (
        <Section key={`extra-${i}`} title={section.title}>
          <div style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
            <MarkdownRenderer content={section.content} />
          </div>
        </Section>
      ))}

      {/* Related Topics */}
      {summary.relatedTopics.length > 0 && (
        <Section title="Related Topics">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {summary.relatedTopics.map((topic, i) => (
              <a
                key={i}
                href={`https://www.google.com/search?q=${encodeURIComponent(topic)}`}
                style={{
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                  padding: '4px 12px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  font: 'var(--md-sys-typescale-label-small)',
                  textDecoration: 'none',
                  cursor: 'pointer',
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
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {summary.tags.map((tag, i) => (
            <span key={i} style={{
              backgroundColor: 'var(--md-sys-color-surface-container-highest)',
              color: 'var(--md-sys-color-on-surface-variant)',
              padding: '2px 10px',
              borderRadius: 'var(--md-sys-shape-corner-small)',
              font: 'var(--md-sys-typescale-label-small)',
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Export actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingTop: '8px', paddingBottom: '8px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
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
          {content.type === 'youtube' ? 'YouTube' : content.type === 'facebook' ? 'Facebook' : content.type === 'reddit' ? 'Reddit' : content.type === 'twitter' ? 'X' : content.type}
        </span>
        {content.estimatedReadingTime > 0 && (
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
        {content.title || summary?.translatedTitle || summary?.inferredTitle || ''}
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

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: preact.ComponentChildren }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => setOpen(!open)}
        title={open ? `Collapse ${title}` : `Expand ${title}`}
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
      {open && <div style={{ paddingLeft: '4px', paddingBottom: '8px' }}>{children}</div>}
    </div>
  );
}

function summaryToMarkdown(summary: SummaryDocument, content: ExtractedContent | null): string {
  const lines: string[] = [];

  if (content) {
    const displayTitle = content.title || summary.translatedTitle || summary.inferredTitle || 'Untitled';
    lines.push(`# ${displayTitle}`, '');
    const meta: string[] = [];
    if (content.author || summary.inferredAuthor) meta.push(`**Author:** ${content.author || summary.inferredAuthor}`);
    if (content.publishDate || summary.inferredPublishDate) meta.push(`**Date:** ${content.publishDate || summary.inferredPublishDate}`);
    if (content.url) meta.push(`**Source:** ${content.url}`);
    if (meta.length) lines.push(meta.join(' | '), '');
  }

  lines.push('## TL;DR', '', summary.tldr, '');

  if (summary.keyTakeaways.length > 0) {
    lines.push('## Key Takeaways', '');
    for (const t of summary.keyTakeaways) lines.push(`- ${t}`);
    lines.push('');
  }

  lines.push('## Summary', '', summary.summary, '');

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

  if (summary.commentsHighlights && summary.commentsHighlights.length > 0) {
    lines.push('## Comment Highlights', '');
    for (const h of summary.commentsHighlights) lines.push(`- ${h}`);
    lines.push('');
  }

  if (summary.conclusion) {
    lines.push('## Conclusion', '', summary.conclusion, '');
  }

  if (summary.extraSections) {
    for (const s of summary.extraSections) {
      lines.push(`## ${s.title}`, '', s.content, '');
    }
  }

  if (summary.relatedTopics.length > 0) {
    lines.push('## Related Topics', '', summary.relatedTopics.join(', '), '');
  }

  if (summary.tags.length > 0) {
    lines.push('---', '', summary.tags.map((t) => `#${t}`).join(' '), '');
  }

  return lines.join('\n');
}

function downloadMarkdown(summary: SummaryDocument, content: ExtractedContent | null) {
  const md = summaryToMarkdown(summary, content);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const slug = (content?.title || summary.translatedTitle || summary.inferredTitle || 'summary').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
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
