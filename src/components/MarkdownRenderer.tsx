import { useRef, useEffect, useState } from 'preact/hooks';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

const MERMAID_THEME_VARS = {
  light: {
    primaryColor: '#dbe4ff',
    primaryTextColor: '#0a2463',
    primaryBorderColor: '#1a56db',
    secondaryColor: '#e8eaf6',
    secondaryTextColor: '#1a1c2e',
    secondaryBorderColor: '#74777f',
    tertiaryColor: '#dcfce7',
    tertiaryTextColor: '#052e16',
    tertiaryBorderColor: '#16a34a',
    lineColor: '#74777f',
    textColor: '#1a1c1e',
    mainBkg: '#dbe4ff',
    nodeBorder: '#1a56db',
    clusterBkg: '#f3f4f6',
    clusterBorder: '#c4c6d0',
    titleColor: '#0a2463',
    edgeLabelBackground: '#ffffff',
    nodeTextColor: '#0a2463',
    // Sequence diagram
    actorTextColor: '#0a2463',
    actorBkg: '#dbe4ff',
    actorBorder: '#1a56db',
    actorLineColor: '#74777f',
    signalColor: '#1a1c1e',
    signalTextColor: '#1a1c1e',
    labelBoxBkgColor: '#dbe4ff',
    labelBoxBorderColor: '#1a56db',
    labelTextColor: '#0a2463',
    loopTextColor: '#0a2463',
    noteBkgColor: '#e8eaf6',
    noteTextColor: '#1a1c2e',
    noteBorderColor: '#74777f',
    activationBkgColor: '#dbe4ff',
    activationBorderColor: '#1a56db',
    // Pie / other
    pie1: '#1a56db',
    pie2: '#16a34a',
    pie3: '#d97706',
    pie4: '#dc2626',
    pie5: '#7c3aed',
    pie6: '#0891b2',
    pie7: '#be185d',
    pie8: '#4f46e5',
    pieTitleTextColor: '#0a2463',
    pieSectionTextColor: '#ffffff',
    pieLegendTextColor: '#1a1c1e',
    pieStrokeColor: '#ffffff',
    // State / class
    labelColor: '#1a1c1e',
    altBackground: '#f3f4f6',
    fillType0: '#dbe4ff',
    fillType1: '#e8eaf6',
    fillType2: '#dcfce7',
    fillType3: '#fef3c7',
  },
  dark: {
    primaryColor: '#1a3a8a',
    primaryTextColor: '#dbe4ff',
    primaryBorderColor: '#b4c5ff',
    secondaryColor: '#3a3d52',
    secondaryTextColor: '#e0e1f5',
    secondaryBorderColor: '#8e9099',
    tertiaryColor: '#052e16',
    tertiaryTextColor: '#dcfce7',
    tertiaryBorderColor: '#4ade80',
    lineColor: '#8e9099',
    textColor: '#e3e2e6',
    mainBkg: '#1a3a8a',
    nodeBorder: '#b4c5ff',
    clusterBkg: '#212326',
    clusterBorder: '#44474e',
    titleColor: '#dbe4ff',
    edgeLabelBackground: '#2b2d31',
    nodeTextColor: '#dbe4ff',
    // Sequence diagram
    actorTextColor: '#dbe4ff',
    actorBkg: '#1a3a8a',
    actorBorder: '#b4c5ff',
    actorLineColor: '#8e9099',
    signalColor: '#e3e2e6',
    signalTextColor: '#e3e2e6',
    labelBoxBkgColor: '#1a3a8a',
    labelBoxBorderColor: '#b4c5ff',
    labelTextColor: '#dbe4ff',
    loopTextColor: '#dbe4ff',
    noteBkgColor: '#3a3d52',
    noteTextColor: '#e0e1f5',
    noteBorderColor: '#8e9099',
    activationBkgColor: '#1a3a8a',
    activationBorderColor: '#b4c5ff',
    // Pie / other
    pie1: '#b4c5ff',
    pie2: '#4ade80',
    pie3: '#fbbf24',
    pie4: '#f87171',
    pie5: '#a78bfa',
    pie6: '#22d3ee',
    pie7: '#f472b6',
    pie8: '#818cf8',
    pieTitleTextColor: '#dbe4ff',
    pieSectionTextColor: '#1a1c1e',
    pieLegendTextColor: '#e3e2e6',
    pieStrokeColor: '#212326',
    // State / class
    labelColor: '#e3e2e6',
    altBackground: '#2b2d31',
    fillType0: '#1a3a8a',
    fillType1: '#3a3d52',
    fillType2: '#052e16',
    fillType3: '#78350f',
  },
} as const;

function getMermaidConfig(theme: 'light' | 'dark') {
  return {
    startOnLoad: false,
    theme: 'base' as const,
    securityLevel: 'strict' as const,
    themeVariables: MERMAID_THEME_VARS[theme],
  };
}

let mermaidInitialized = false;

function initMermaid(theme: 'light' | 'dark') {
  if (mermaidInitialized) return;
  mermaidInitialized = true;
  mermaid.initialize(getMermaidConfig(theme));
}

// Custom renderer: turn ```mermaid blocks into <pre class="mermaid"> for mermaid.run()
const renderer = new marked.Renderer();
const origCode = renderer.code.bind(renderer);
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${text}</pre>`;
  }
  return origCode({ type: 'code', raw: text, text, lang });
};

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

function useResolvedTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme as 'light' | 'dark') || 'light',
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme as 'light' | 'dark';
      if (t) setTheme(t);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function InlineMarkdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parseInline(text, { async: false }) as string);
  return <span class="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const html = DOMPurify.sanitize(marked.parse(content, { async: false }) as string);

  // Hide broken images gracefully (URLs may expire, especially social media thumbnails)
  useEffect(() => {
    if (!ref.current) return;
    const handleError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) e.target.style.display = 'none';
    };
    // error events don't bubble — must use capture phase
    ref.current.addEventListener('error', handleError, true);
    return () => ref.current?.removeEventListener('error', handleError, true);
  }, [html]);

  useEffect(() => {
    if (!ref.current) return;
    const mermaidEls = ref.current.querySelectorAll<HTMLElement>('pre.mermaid');
    if (mermaidEls.length === 0) return;

    // Restore original source text so mermaid can re-render (it replaces content with SVG)
    for (const el of mermaidEls) {
      if (el.dataset.source) {
        el.removeAttribute('data-processed');
        el.textContent = el.dataset.source ?? '';
      } else {
        el.dataset.source = el.textContent || '';
      }
    }

    initMermaid(theme);
    mermaid.initialize(getMermaidConfig(theme));
    mermaid.run({ nodes: mermaidEls }).catch(() => {
      // If mermaid fails to parse, leave the raw text visible
    });
  }, [html, theme]);

  return <div ref={ref} class="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
