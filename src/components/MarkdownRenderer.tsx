import { useRef, useEffect, useState } from 'preact/hooks';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

/** Master color palette — 12 colors per theme. Used for pie, cScale, xyChart, and auto-legends. */
export const PALETTE = {
  light: ['#1a56db','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#4f46e5',
          '#059669','#ea580c','#4338ca','#b91c1c'],
  dark:  ['#b4c5ff','#4ade80','#fbbf24','#f87171','#a78bfa','#22d3ee','#f472b6','#818cf8',
          '#34d399','#fb923c','#a5b4fc','#fca5a5'],
} as const;

/** Derive pie1-12, cScale0-11 (+ label/peer), git0-7, fillType0-7 from PALETTE */
function paletteVars(theme: 'light' | 'dark') {
  const colors = PALETTE[theme];
  const labelColor = theme === 'dark' ? '#1a1c1e' : '#ffffff';
  const vars: Record<string, string> = {};
  for (let i = 0; i < colors.length; i++) {
    vars[`pie${i + 1}`] = colors[i];
    vars[`cScale${i}`] = colors[i];
    vars[`cScaleLabel${i}`] = labelColor;
    vars[`cScalePeer${i}`] = colors[i];
  }
  // gitGraph branch colors (git0..7)
  for (let i = 0; i < 8; i++) {
    vars[`git${i}`] = colors[i % colors.length];
  }
  // fillType for journey/state (0..7)
  const fills = theme === 'light'
    ? ['#dbe4ff', '#e8eaf6', '#dcfce7', '#fef3c7', '#fce7f3', '#e0e7ff', '#d1fae5', '#fff7ed']
    : ['#1a3a8a', '#3a3d52', '#052e16', '#78350f', '#831843', '#312e81', '#064e3b', '#7c2d12'];
  for (let i = 0; i < fills.length; i++) {
    vars[`fillType${i}`] = fills[i];
  }
  return vars;
}

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
    // Pie / timeline / cScale — generated from PALETTE
    ...paletteVars('light'),
    pieTitleTextColor: '#0a2463',
    pieSectionTextColor: '#ffffff',
    pieLegendTextColor: '#1a1c1e',
    pieStrokeColor: '#ffffff',
    // State / class
    labelColor: '#1a1c1e',
    altBackground: '#f3f4f6',
    // Flowchart
    defaultLinkColor: '#74777f',
    // Mindmap
    mindmapRootColor: '#dbe4ff',
    mindmapTextColor: '#0a2463',
    mindmapMainColor: '#1a56db',
    mindmapSecondaryColor: '#e8eaf6',
    mindmapLineColor: '#74777f',
    // Gantt
    sectionBkgColor: '#dbe4ff',
    sectionBkgColor2: '#e8eaf6',
    altSectionBkgColor: '#f3f4f6',
    taskBkgColor: '#dbe4ff',
    taskBorderColor: '#1a56db',
    taskTextColor: '#0a2463',
    doneTaskBkgColor: '#dcfce7',
    critBkgColor: '#fef3c7',
    todayLineColor: '#dc2626',
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
    // Pie / timeline / cScale — generated from PALETTE
    ...paletteVars('dark'),
    pieTitleTextColor: '#dbe4ff',
    pieSectionTextColor: '#1a1c1e',
    pieLegendTextColor: '#e3e2e6',
    pieStrokeColor: '#212326',
    // State / class
    labelColor: '#e3e2e6',
    altBackground: '#2b2d31',
    // Flowchart
    defaultLinkColor: '#8e9099',
    // Mindmap
    mindmapRootColor: '#1a3a8a',
    mindmapTextColor: '#dbe4ff',
    mindmapMainColor: '#b4c5ff',
    mindmapSecondaryColor: '#3a3d52',
    mindmapLineColor: '#8e9099',
    // Gantt
    sectionBkgColor: '#1a3a8a',
    sectionBkgColor2: '#3a3d52',
    altSectionBkgColor: '#212326',
    taskBkgColor: '#1a3a8a',
    taskBorderColor: '#b4c5ff',
    taskTextColor: '#dbe4ff',
    doneTaskBkgColor: '#052e16',
    critBkgColor: '#78350f',
    todayLineColor: '#f87171',
  },
} as const;

function getMermaidConfig(theme: 'light' | 'dark') {
  return {
    startOnLoad: false,
    theme: 'base' as const,
    securityLevel: 'strict' as const,
    themeVariables: {
      ...MERMAID_THEME_VARS[theme],
      xyChart: {
        backgroundColor: theme === 'dark' ? '#212326' : '#f3f4f6',
        plotColorPalette: PALETTE[theme].join(', '),
      },
    },
  };
}

let mermaidInitialized = false;
let renderCounter = 0;

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

// Override del tokenizer: require double tildes ~~text~~ only (not single ~text~)
marked.use({
  tokenizer: {
    del(src) {
      const match = src.match(/^~~(?=\S)([\s\S]*?\S)~~/);
      if (match) {
        return {
          type: 'del',
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1]),
        };
      }
      return undefined;
    },
  },
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

// Extract raw mermaid source blocks from markdown before DOMPurify can modify them
export function extractMermaidSources(md: string): string[] {
  const sources: string[] = [];
  const re = /```mermaid\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    sources.push(m[1].replace(/\n$/, ''));
  }
  return sources;
}

/** Remove ```mermaid...``` blocks whose source matches any in the broken list, plus trailing legend lines. */
export function stripBrokenMermaidBlocks(md: string, brokenSources: string[]): string {
  if (brokenSources.length === 0) return md;
  let result = md;
  for (const source of brokenSources) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the mermaid block + optional trailing blank line + legend line (colored squares/circles like 🟦 🟧 🟩 🔵 🟠 🟢)
    const re = new RegExp('```mermaid\\n' + escaped + '\\n```\\n*(?:[^\n]*[🟥🟧🟨🟩🟦🟪🟫⬜⬛🔴🟠🟡🟢🔵🟣🟤⚪⚫●][^\n]*\\n?)?', 'g');
    result = result.replace(re, '');
  }
  return result;
}

// Fix unlabeled mermaid code blocks: ```\nflowchart → ```mermaid\nflowchart
const MERMAID_KEYWORDS = 'flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitgraph|mindmap|timeline|sankey|xychart|block|packet|architecture|kanban';
const FIX_MERMAID_RE = new RegExp('```\\n((?:' + MERMAID_KEYWORDS + ')\\b)', 'g');
export function fixMermaidBlocks(md: string): string {
  return md.replace(FIX_MERMAID_RE, '```mermaid\n$1');
}

/**
 * Apply all mermaid syntax fixes to full markdown text.
 * Fixes ER-style arrows in classDiagram blocks so exported .md is also clean.
 */
export function fixMermaidSyntax(md: string): string {
  return md.replace(/```mermaid\n([\s\S]*?)```/g, (block, source: string) => {
    const fixed = fixClassDiagramRelations(source);
    return fixed === source ? block : '```mermaid\n' + fixed + '```';
  });
}

/** Parse xychart-beta series — returns array of {type, name} or null if <2 series. */
function parseXyChartSeries(source: string): { type: 'line' | 'bar'; name: string }[] | null {
  const re = /^\s*(line|bar)\s*(?:"([^"]*)")?\s*\[/gm;
  const series: { type: 'line' | 'bar'; name: string }[] = [];
  let m;
  let idx = 0;
  while ((m = re.exec(source)) !== null) {
    idx++;
    series.push({ type: m[1] as 'line' | 'bar', name: m[2] || `Series ${idx}` });
  }
  return series.length >= 2 ? series : null;
}

/**
 * Transform xychart-beta bar series for visual stacking.
 * Mermaid draws bars overlapping at the same x position (later series on top).
 * To create a stacked effect, each bar's values become the cumulative sum of
 * itself + all subsequent bar series. The first bar (at back) is tallest,
 * the last bar (in front) keeps its original values.
 */
function stackBarSeries(source: string): string {
  if (!source.match(/^\s*xychart-beta/m)) return source;

  // Collect bar lines with their values
  const barRe = /^(\s*bar\s*(?:"[^"]*")?\s*)\[([\d\s.,eE+-]+)\]/gm;
  const bars: { fullMatch: string; prefix: string; values: number[] }[] = [];
  let m;
  while ((m = barRe.exec(source)) !== null) {
    bars.push({
      fullMatch: m[0],
      prefix: m[1],
      values: m[2].split(',').map(v => parseFloat(v.trim())),
    });
  }
  if (bars.length < 2) return source;

  // Compute reverse cumulative: bar[i] += bar[i+1] + bar[i+2] + ...
  const len = bars[0].values.length;
  const cumulative = bars.map(b => [...b.values]);
  for (let i = bars.length - 2; i >= 0; i--) {
    for (let j = 0; j < len; j++) {
      cumulative[i][j] = (cumulative[i][j] || 0) + (cumulative[i + 1][j] || 0);
    }
  }

  // Replace values in source; also fix y-axis max if specified
  let result = source;
  for (let i = 0; i < bars.length; i++) {
    result = result.replace(bars[i].fullMatch, bars[i].prefix + '[' + cumulative[i].join(', ') + ']');
  }

  // Adjust y-axis max if explicitly set and cumulative total exceeds it
  const yAxisRe = /^(\s*y-axis\s+"[^"]*"\s+[\d.]+\s*-->\s*)([\d.]+)/m;
  const yMatch = result.match(yAxisRe);
  if (yMatch) {
    const currentMax = parseFloat(yMatch[2]);
    const stackMax = Math.max(...cumulative[0]);
    if (stackMax > currentMax) {
      result = result.replace(yAxisRe, '$1' + Math.ceil(stackMax * 1.1));
    }
  }

  return result;
}

/**
 * Fix ER-style relationship arrows in classDiagram.
 * LLMs frequently generate `||--o{`, `}|--|{` etc. which are erDiagram-only.
 * Replace with `-->` so the diagram renders instead of crashing.
 */
function fixClassDiagramRelations(source: string): string {
  if (!source.match(/^\s*classDiagram/m)) return source;
  // Match relationship lines where the arrow contains { or } (ER cardinality markers)
  return source.replace(
    /^(\s*\w+\s+)(\S*[{}]\S*)(\s+\w+\s*(?::.*)?$)/gm,
    '$1-->$3',
  );
}

/** Create a legend element for xychart-beta series. Uses inline styles for copy/paste survival. */
function createLegendElement(series: { type: 'line' | 'bar'; name: string }[], theme: 'light' | 'dark'): HTMLDivElement {
  const colors = PALETTE[theme];
  const legend = document.createElement('div');
  legend.className = 'mermaid-legend';
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const color = colors[i % colors.length];
    const item = document.createElement('span');
    item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
    const swatch = document.createElement('span');
    if (s.type === 'line') {
      swatch.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};`;
    } else {
      swatch.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};`;
    }
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(s.name));
    legend.appendChild(item);
  }
  return legend;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const fixed = fixMermaidBlocks(content);
  const mermaidSources = extractMermaidSources(fixed);
  const html = DOMPurify.sanitize(marked.parse(fixed, { async: false }) as string);

  // Hide broken images gracefully (URLs may expire, especially social media thumbnails)
  useEffect(() => {
    if (!ref.current) return;
    const handleError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) {
        const wrapper = e.target.closest('.dismissable-media');
        if (wrapper) (wrapper as HTMLElement).style.display = 'none';
        else e.target.style.display = 'none';
      }
    };
    // error events don't bubble — must use capture phase
    ref.current.addEventListener('error', handleError, true);
    return () => ref.current?.removeEventListener('error', handleError, true);
  }, [html]);

  useEffect(() => {
    if (!ref.current) return;
    const mermaidEls = ref.current.querySelectorAll<HTMLElement>('pre.mermaid');
    if (mermaidEls.length === 0) return;

    // Inject raw mermaid source directly from markdown (bypasses DOMPurify text mangling)
    for (let i = 0; i < mermaidEls.length; i++) {
      const el = mermaidEls[i];
      const source = mermaidSources[i] ?? el.dataset.source ?? el.textContent ?? '';
      el.removeAttribute('data-processed');
      el.textContent = source;
      el.dataset.source = source;
    }

    initMermaid(theme);
    mermaid.initialize(getMermaidConfig(theme));

    // Render each diagram individually for isolation and proper error display
    let cancelled = false;
    (async () => {
      for (let i = 0; i < mermaidEls.length; i++) {
        if (cancelled) return;
        const el = mermaidEls[i];
        const source = el.dataset.source || el.textContent || '';
        if (!source.trim()) continue;
        const renderId = `mermaid-${Date.now()}-${renderCounter++}`;
        const renderSource = fixClassDiagramRelations(stackBarSeries(source));
        try {
          const { svg, bindFunctions } = await mermaid.render(renderId, renderSource);
          if (cancelled) return;
          el.innerHTML = svg;
          bindFunctions?.(el);
          // Add dismiss button
          if (!el.querySelector('.dismiss-media-btn')) {
            const btn = document.createElement('button');
            btn.className = 'dismiss-media-btn no-print';
            btn.textContent = '\u00d7';
            btn.title = 'Remove diagram';
            btn.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
            el.appendChild(btn);
          }
          // Auto-legend for xychart-beta (only type needing it — pie has built-in, others have visible labels)
          const xySeries = parseXyChartSeries(source);
          if (xySeries) {
            el.querySelector('.mermaid-legend')?.remove();
            el.appendChild(createLegendElement(xySeries, theme));
          }
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          el.dataset.error = msg;
          // Hide broken diagram entirely — autoFixMermaid handles recovery
          el.style.display = 'none';
          // Clean up orphaned mermaid render container
          document.getElementById('d' + renderId)?.remove();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [html, theme]);

  // Add dismiss buttons to images
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      if (img.style.display === 'none') return;
      if (img.closest('.dismissable-media')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'dismissable-media';
      img.parentNode!.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      const btn = document.createElement('button');
      btn.className = 'dismiss-media-btn no-print';
      btn.textContent = '\u00d7';
      btn.title = 'Remove image';
      btn.addEventListener('click', (e) => { e.stopPropagation(); wrapper.remove(); });
      wrapper.appendChild(btn);
    });
  }, [html]);

  return <div ref={ref} class="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
