import { useState } from 'preact/hooks';
import type { SummaryDocument } from '@/lib/summarizer/types';
import type { ExtractedContent } from '@/lib/extractors/types';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

const LANG_LABELS: Record<string, string> = {
  en: 'EN', es: 'ES', fr: 'FR', de: 'DE',
  pt: 'PT', ru: 'RU', zh: 'ZH', ja: 'JA', ko: 'KO',
};

interface SummaryContentProps {
  summary: SummaryDocument;
  content: ExtractedContent | null;
  onExport?: () => void;
}

export function SummaryContent({ summary, content, onExport }: SummaryContentProps) {
  return (
    <div>
      {/* TLDR */}
      <Section title="TL;DR" defaultOpen>
        <p style={{ font: 'var(--md-sys-typescale-body-large)', lineHeight: 1.5, color: 'var(--md-sys-color-on-surface)' }}>{summary.tldr}</p>
      </Section>

      {/* Key Takeaways */}
      {summary.keyTakeaways.length > 0 && (
        <Section title="Key Takeaways" defaultOpen>
          <ul style={{ paddingLeft: '20px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6, color: 'var(--md-sys-color-on-surface)' }}>
            {summary.keyTakeaways.map((point, i) => (
              <li key={i}>{point}</li>
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
              "{quote}"
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
                {summary.prosAndCons.pros.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--md-sys-color-error)' }}>Cons</strong>
              <ul style={{ paddingLeft: '16px', marginTop: '4px' }}>
                {summary.prosAndCons.cons.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Comments Highlights */}
      {summary.commentsHighlights && summary.commentsHighlights.length > 0 && (
        <Section title="Comment Highlights">
          <ul style={{ paddingLeft: '20px', font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.6 }}>
            {summary.commentsHighlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        </Section>
      )}

      {/* Conclusion */}
      {summary.conclusion && (
        <Section title="Conclusion">
          <p style={{ font: 'var(--md-sys-typescale-body-medium)', lineHeight: 1.5, color: 'var(--md-sys-color-on-surface)' }}>{summary.conclusion}</p>
        </Section>
      )}

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

      {/* Export action */}
      {onExport && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
          <button
            onClick={onExport}
            title="Export summary to Notion"
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: 'var(--md-sys-color-primary)',
              color: 'var(--md-sys-color-on-primary)',
              font: 'var(--md-sys-typescale-label-large)',
              cursor: 'pointer',
            }}
          >
            Export to Notion
          </button>
        </div>
      )}
    </div>
  );
}

export function MetadataHeader({ content, summary }: { content: ExtractedContent; summary?: SummaryDocument }) {
  const badgeColors: Record<string, { bg: string; text: string }> = {
    article: { bg: 'var(--md-sys-color-success-container)', text: 'var(--md-sys-color-on-success-container)' },
    youtube: { bg: 'var(--md-sys-color-error-container)', text: 'var(--md-sys-color-on-error-container)' },
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
          {content.type === 'youtube' ? 'YouTube' : content.type}
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
      </div>

      {content.type === 'youtube' && content.thumbnailUrl && (
        <img
          src={content.thumbnailUrl}
          alt={content.title}
          style={{ width: '100%', borderRadius: 'var(--md-sys-shape-corner-medium)', marginBottom: '8px' }}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            const hqFallback = content.thumbnailUrl!.replace(/\/[^/]+\.jpg$/, '/hqdefault.jpg');
            if (img.src !== hqFallback) {
              img.src = hqFallback;
            } else {
              img.style.display = 'none';
            }
          }}
        />
      )}

      <h2 style={{ font: 'var(--md-sys-typescale-title-medium)', lineHeight: 1.3, margin: '4px 0', color: 'var(--md-sys-color-on-surface)' }}>
        {content.title}
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
