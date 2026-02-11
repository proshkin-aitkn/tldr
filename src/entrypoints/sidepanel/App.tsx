import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { SummaryDocument } from '@/lib/summarizer/types';
import type { ExtractedContent } from '@/lib/extractors/types';
import type { ChatMessage, VisionSupport } from '@/lib/llm/types';
import type { Settings } from '@/lib/storage/types';
import { getActiveProviderConfig } from '@/lib/storage/types';
import { DEFAULT_SETTINGS } from '@/lib/storage/types';
import { parseJsonSafe, findMatchingBrace } from '@/lib/json-repair';
import { sendMessage } from '@/lib/messaging/bridge';
import type {
  ExtractResultMessage,
  SummaryResultMessage,
  ChatResponseMessage,
  ConnectionTestResultMessage,
  SettingsResultMessage,
  SaveSettingsResultMessage,
  NotionDatabasesResultMessage,
  ExportResultMessage,
  FetchModelsResultMessage,
  ProbeVisionResultMessage,
  CheckNotionDuplicateResultMessage,
  SeekVideoMessage,
} from '@/lib/messaging/types';
import type { ModelInfo } from '@/lib/llm/types';
import { SummaryContent, MetadataHeader, downloadMarkdown } from './pages/SummaryView';
import { SettingsView } from './pages/SettingsView';
import { getProviderDefinition } from '@/lib/llm/registry';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Spinner } from '@/components/Spinner';
import { MarkdownRenderer, extractMermaidSources } from '@/components/MarkdownRenderer';
import mermaid from 'mermaid';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { ChatInputBar } from '@/components/ChatInputBar';
import type { SummarizeVariant } from '@/components/ChatInputBar';
import { useTheme } from '@/hooks/useTheme';
import { getSystemPrompt, getSummarizationPrompt } from '@/lib/summarizer/prompts';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  internal?: boolean;
}

interface TabState {
  content: ExtractedContent | null;
  summary: SummaryDocument | null;
  chatMessages: DisplayMessage[];
  rawResponses: string[];
  notionUrl: string | null;
  extractEpoch: number;
  loading: boolean;
  chatLoading: boolean;
  inputValue: string;
  scrollTop: number;
}


async function findMermaidErrors(
  summary: SummaryDocument,
): Promise<Array<{ source: string; error: string }>> {
  const fields = [
    summary.tldr, summary.summary, summary.factCheck,
    summary.conclusion,
    ...(summary.extraSections?.map(s => s.content) || []),
  ].filter(Boolean) as string[];

  const errors: Array<{ source: string; error: string }> = [];
  for (const field of fields) {
    for (const source of extractMermaidSources(field)) {
      try {
        await mermaid.parse(source);
      } catch (err) {
        errors.push({ source, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return errors;
}

/** Validate mermaid blocks in a summary and auto-fix via chat round-trip (max 2 attempts). */
async function autoFixMermaid(
  summary: SummaryDocument,
  content: ExtractedContent,
  theme: 'light' | 'dark',
  baseChatMessages: DisplayMessage[],
  setChatMessages: (fn: (prev: DisplayMessage[]) => DisplayMessage[]) => void,
  setRawResponses: (fn: (prev: string[]) => string[]) => void,
): Promise<SummaryDocument> {
  let finalSummary = summary;
  const fixMessages: DisplayMessage[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const errors = await findMermaidErrors(finalSummary);
    if (errors.length === 0) break;

    const errorDescs = errors.map(e =>
      `Error: ${e.error}\n\nBroken diagram:\n\`\`\`mermaid\n${e.source}\n\`\`\``
    ).join('\n\n---\n\n');

    const fixRequest = `The following mermaid diagram(s) in the summary have syntax errors and failed to render:\n\n${errorDescs}\n\nFix the mermaid syntax errors silently. Rules:\n- Return ONLY the corrected fields in "updates". Set "text" to "".\n- Do NOT add any commentary, changelog, or "fixes applied" notes to the content — just fix the syntax.\n- All diagrams MUST use \`\`\`mermaid fenced code blocks (not plain \`\`\`).`;
    const userMsg: DisplayMessage = { role: 'user', content: fixRequest, internal: true };
    fixMessages.push(userMsg);
    setChatMessages(prev => [...prev, userMsg]);

    const allMessages: ChatMessage[] = [
      ...baseChatMessages.map(m => ({ role: m.role, content: m.content })),
      ...fixMessages.map(m => ({ role: m.role, content: m.content })),
    ];

    const fixResponse = await sendMessage({
      type: 'CHAT_MESSAGE',
      messages: allMessages,
      summary: finalSummary,
      content,
      theme,
    }) as ChatResponseMessage;

    if (fixResponse.success && fixResponse.message) {
      setRawResponses(prev => [...prev, fixResponse.message!]);
      const { updates: fixUpdates, text: chatText } = extractJsonAndText(fixResponse.message);
      const displayText = chatText || (fixUpdates ? 'Summary corrected.' : 'Failed to fix mermaid diagrams.');
      const assistantMsg: DisplayMessage = { role: 'assistant', content: displayText, internal: true };
      fixMessages.push(assistantMsg);
      setChatMessages(prev => [...prev, assistantMsg]);
      if (fixUpdates) {
        finalSummary = mergeSummaryUpdates(finalSummary, fixUpdates);
        finalSummary.llmProvider = summary.llmProvider;
        finalSummary.llmModel = summary.llmModel;
      } else break;
    } else break;
  }

  return finalSummary;
}

export function App() {
  const { mode: themeMode, resolved: resolvedTheme, setMode: setThemeMode } = useTheme();

  // CSS zoom (Ctrl+Plus / Ctrl+Minus / Ctrl+0)
  useEffect(() => {
    const ZOOM_KEY = 'tldr-zoom';
    const STEP = 0.1;
    const MIN = 0.5;
    const MAX = 2.0;

    const apply = (z: number) => {
      document.documentElement.style.zoom = String(z);
      localStorage.setItem(ZOOM_KEY, String(z));
    };

    // Restore saved zoom
    const saved = parseFloat(localStorage.getItem(ZOOM_KEY) || '1');
    if (saved !== 1) apply(saved);

    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const current = parseFloat(document.documentElement.style.zoom || '1');
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        apply(Math.min(MAX, Math.round((current + STEP) * 10) / 10));
      } else if (e.key === '-') {
        e.preventDefault();
        apply(Math.max(MIN, Math.round((current - STEP) * 10) / 10));
      } else if (e.key === '0') {
        e.preventDefault();
        apply(1);
      }
    };

    const wheelHandler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const current = parseFloat(document.documentElement.style.zoom || '1');
      const delta = e.deltaY < 0 ? STEP : -STEP;
      apply(Math.min(MAX, Math.max(MIN, Math.round((current + delta) * 10) / 10)));
    };

    document.addEventListener('keydown', handler);
    document.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('wheel', wheelHandler);
    };
  }, []);

  // Intercept all link clicks and open in a new tab to avoid resetting the side panel.
  // YouTube timestamp links for the current video seek the player instead.
  useEffect(() => {
    const YT_VIDEO_RE = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      let parsed: URL;
      try { parsed = new URL(href, location.href); if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return; } catch { return; }
      e.preventDefault();

      // Check if this is a same-video YouTube timestamp link
      const cur = contentRef.current;
      if (cur?.type === 'youtube') {
        const linkVideoId = href.match(YT_VIDEO_RE)?.[1];
        const curVideoId = cur.url.match(YT_VIDEO_RE)?.[1];
        if (linkVideoId && linkVideoId === curVideoId) {
          // Use the last &t= param (first may be from the original URL)
          const tValues = parsed.searchParams.getAll('t');
          const t = tValues.length > 0 ? tValues[tValues.length - 1] : null;
          if (t) {
            const seconds = parseInt(t, 10);
            if (!isNaN(seconds)) {
              sendMessage({ type: 'SEEK_VIDEO', seconds } as SeekVideoMessage).catch(() => {});
              return;
            }
          }
        }
      }

      window.open(href, '_blank', 'noopener,noreferrer');
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const [summary, setSummary] = useState<SummaryDocument | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [extractEpoch, setExtractEpoch] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [notionUrl, setNotionUrl] = useState<string | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<DisplayMessage[]>([]);
  const [rawResponses, setRawResponses] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Settings drawer
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Debug prompt viewer
  const [debugOpen, setDebugOpen] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(false);

  // Per-tab state backing store
  const tabStatesRef = useRef<Map<number, TabState>>(new Map());

  // Window ID — set once on mount to filter cross-window events
  const windowIdRef = useRef<number | null>(null);

  // Ref-mirrors: reflect latest state so event handlers never read stale closures.
  // Synced directly in the component body (not via effects) for immediate consistency.
  const contentRef = useRef<ExtractedContent | null>(null);
  const summaryRef = useRef<SummaryDocument | null>(null);
  const chatMessagesRef = useRef<DisplayMessage[]>([]);
  const rawResponsesRef = useRef<string[]>([]);
  const notionUrlRef = useRef<string | null>(null);
  const extractEpochRef = useRef<number>(0);
  const activeTabIdRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const chatLoadingRef = useRef(false);
  const inputValueRef = useRef('');

  // Sync refs on every render (synchronous — no timing gap unlike useEffect)
  contentRef.current = content;
  summaryRef.current = summary;
  chatMessagesRef.current = chatMessages;
  rawResponsesRef.current = rawResponses;
  notionUrlRef.current = notionUrl;
  extractEpochRef.current = extractEpoch;
  activeTabIdRef.current = activeTabId;
  loadingRef.current = loading;
  chatLoadingRef.current = chatLoading;
  inputValueRef.current = inputValue;

  const saveTabState = useCallback((tabId: number | null) => {
    if (tabId == null) return;
    tabStatesRef.current.set(tabId, {
      content: contentRef.current,
      summary: summaryRef.current,
      chatMessages: chatMessagesRef.current,
      rawResponses: rawResponsesRef.current,
      notionUrl: notionUrlRef.current,
      extractEpoch: extractEpochRef.current,
      loading: loadingRef.current,
      chatLoading: chatLoadingRef.current,
      inputValue: inputValueRef.current,
      scrollTop: scrollAreaRef.current?.scrollTop ?? 0,
    });
  }, []);

  const restoreTabState = useCallback((tabId: number) => {
    skipScrollRef.current = true;
    const saved = tabStatesRef.current.get(tabId);
    if (saved) {
      setContent(saved.content);
      setSummary(saved.summary);
      setChatMessages(saved.chatMessages);
      setRawResponses(saved.rawResponses);
      setNotionUrl(saved.notionUrl);
      setExtractEpoch(saved.extractEpoch);
      setLoading(saved.loading);
      setChatLoading(saved.chatLoading);
      setInputValue(saved.inputValue);
      const top = saved.scrollTop;
      requestAnimationFrame(() => {
        if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = top;
      });
    } else {
      setContent(null);
      setSummary(null);
      setChatMessages([]);
      setRawResponses([]);
      setNotionUrl(null);
      setLoading(false);
      setChatLoading(false);
      setInputValue('');
    }
  }, []);

  // Extract content from active tab
  const extractContent = useCallback(async () => {
    setExtracting(true);
    try {
      const response = await sendMessage({ type: 'EXTRACT_CONTENT' }) as ExtractResultMessage;
      if (response.success && response.data) {
        // Discard if user switched tabs during extraction
        if (response.tabId && activeTabIdRef.current != null && response.tabId !== activeTabIdRef.current) {
          return;
        }
        setContent(response.data);
        setExtractEpoch((n) => n + 1);
        setSummary(null);
        setNotionUrl(null);
        setChatMessages([]);
        setPendingResummarize(false);
      }
    } catch {
      // Silently fail — user can still click Summarize which will retry
    } finally {
      setExtracting(false);
    }
  }, []);

  // Refresh: cancel in-flight summarization, clear cached state, then re-extract
  const handleRefresh = useCallback(() => {
    const tabId = activeTabIdRef.current;
    if (tabId != null) {
      if (loadingRef.current) {
        sendMessage({ type: 'CANCEL_SUMMARIZE', tabId } as import('@/lib/messaging/types').CancelSummarizeMessage).catch(() => {});
        setLoading(false);
      }
      tabStatesRef.current.delete(tabId);
    }
    setSummary(null);
    setChatMessages([]);
    setNotionUrl(null);
    setPendingResummarize(false);
    extractContent();
  }, [extractContent]);

  // Load settings on mount
  useEffect(() => {
    sendMessage({ type: 'GET_SETTINGS' }).then((response) => {
      const res = response as SettingsResultMessage;
      if (res.settings) {
        setSettings(res.settings);
        if (res.settings.theme) {
          setThemeMode(res.settings.theme);
        }
      }
    });
  }, [setThemeMode]);

  // Auto-extract on mount
  useEffect(() => {
    extractContent();
  }, [extractContent]);

  // Capture window ID and seed active tab on mount
  useEffect(() => {
    const chromeObj = (globalThis as unknown as { chrome: typeof chrome }).chrome;
    chromeObj.windows.getCurrent((win) => {
      windowIdRef.current = win.id ?? null;
    });
    chromeObj.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id != null) setActiveTabId(tabs[0].id);
    });
  }, []);

  // Unified tab event listeners
  useEffect(() => {
    const chromeObj = (globalThis as unknown as { chrome: typeof chrome }).chrome;
    let spaTimer: ReturnType<typeof setTimeout> | null = null;

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      if (windowIdRef.current != null && info.windowId !== windowIdRef.current) return;
      const prevTabId = activeTabIdRef.current;
      saveTabState(prevTabId);
      setActiveTabId(info.tabId);
      const cached = tabStatesRef.current.get(info.tabId);
      if (cached?.content) {
        restoreTabState(info.tabId);
      } else {
        // Clear stale UI before attempting extraction on the new tab
        setContent(null);
        setSummary(null);
        setChatMessages([]);
        setNotionUrl(null);
        setLoading(false);
        setChatLoading(false);
        setInputValue('');
        extractContent();
      }
    };

    const isUnreachable = (url?: string) =>
      !url || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://');

    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tabId === activeTabIdRef.current) {
        if (isUnreachable(changeInfo.url ?? tab.url)) return;
        // Cancel in-flight summarization on URL change or page reload
        if ((changeInfo.url || changeInfo.status === 'loading') && loadingRef.current) {
          sendMessage({ type: 'CANCEL_SUMMARIZE', tabId } as import('@/lib/messaging/types').CancelSummarizeMessage).catch(() => {});
          setLoading(false);
          setSummary(null);
          setChatMessages([]);
          setNotionUrl(null);
        }
        if (changeInfo.status === 'complete') extractContent();
        if (changeInfo.url) {
          if (spaTimer) clearTimeout(spaTimer);
          spaTimer = setTimeout(() => extractContent(), 1500);
        }
      } else if (tabStatesRef.current.has(tabId)) {
        // Background tab navigated — invalidate cache; re-extract on next switch
        tabStatesRef.current.delete(tabId);
      }
    };

    const onMessage = (message: unknown, sender: chrome.runtime.MessageSender) => {
      const msg = message as { type?: string };
      if (msg?.type !== 'CONTENT_CHANGED') return;
      if (sender.tab?.id != null && sender.tab.id !== activeTabIdRef.current) return;
      if (spaTimer) clearTimeout(spaTimer);
      spaTimer = setTimeout(() => extractContent(), 800);
    };

    const onRemoved = (tabId: number) => {
      tabStatesRef.current.delete(tabId);
      if (tabId === activeTabIdRef.current) {
        setActiveTabId(null);
        setContent(null);
        setSummary(null);
        setChatMessages([]);
        setNotionUrl(null);
        setLoading(false);
        setChatLoading(false);
        setInputValue('');
        // Chrome fires onActivated for the next tab automatically
      }
    };

    chromeObj.tabs.onActivated.addListener(onActivated);
    chromeObj.tabs.onUpdated.addListener(onUpdated);
    chromeObj.tabs.onRemoved.addListener(onRemoved);
    chromeObj.runtime.onMessage.addListener(onMessage);

    return () => {
      chromeObj.tabs.onActivated.removeListener(onActivated);
      chromeObj.tabs.onUpdated.removeListener(onUpdated);
      chromeObj.tabs.onRemoved.removeListener(onRemoved);
      chromeObj.runtime.onMessage.removeListener(onMessage);
      if (spaTimer) clearTimeout(spaTimer);
    };
  }, [extractContent, saveTabState, restoreTabState]);

  // YouTube/Facebook lazy-load comments as the user scrolls — poll periodically to pick up new ones
  useEffect(() => {
    if (!content || (content.type !== 'youtube' && content.type !== 'facebook' && content.type !== 'twitter')) return;

    let lastCount = content.comments?.length ?? 0;
    let stableRounds = 0;

    const poll = async () => {
      try {
        const resp = await sendMessage({ type: 'EXTRACT_COMMENTS' }) as { success: boolean; comments?: ExtractedContent['comments'] };
        if (resp.success && resp.comments) {
          if (resp.comments.length > lastCount) {
            lastCount = resp.comments.length;
            stableRounds = 0;
            setContent((prev) => prev ? { ...prev, comments: resp.comments } : prev);
          } else {
            stableRounds++;
          }
        }
      } catch { /* ignore */ }
    };

    // Poll at increasing intervals; stop after count stabilizes for several rounds
    const id = setInterval(() => {
      if (stableRounds >= 10) { clearInterval(id); return; }
      poll();
    }, 5000);

    // Also do an immediate check after a short delay for initial load
    const initial = setTimeout(poll, 2000);

    return () => { clearInterval(id); clearTimeout(initial); };
  }, [extractEpoch, activeTabId]); // re-run on every new extraction or tab switch

  // Scroll to bottom when new chat messages arrive (skip on tab restore)
  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Track the detail level that produced the current summary, so cycling back clears the re-summarize state
  const [pendingResummarize, setPendingResummarize] = useState(false);
  const summaryDetailLevelRef = useRef<Settings['summaryDetailLevel'] | null>(null);

  const isFirstSubmit = pendingResummarize || (!summary && chatMessages.length === 0);

  // Check whether the active LLM provider is configured
  const isLLMConfigured = (() => {
    const cfg = getActiveProviderConfig(settings);
    return !!(cfg.apiKey || cfg.providerId === 'self-hosted');
  })();

  // Compute summarize button state
  const summarizeVariant: SummarizeVariant = (() => {
    if (!isLLMConfigured) return 'disabled';
    if (!content) return 'primary';
    if (content.type !== 'youtube') return 'primary';

    const hasTranscriptMarker = content.content.includes('[YOUTUBE_TRANSCRIPT:');
    const hasTranscriptError = content.content.includes('*Transcript could not be loaded:');
    const transcriptLoaded = !hasTranscriptMarker && !hasTranscriptError;

    if (transcriptLoaded) return 'primary';
    // No transcript — amber warning (comments may still be loading lazily)
    return 'amber';
  })();

  const handleSummarize = useCallback(async (userInstructions?: string) => {
    const originTabId = activeTabIdRef.current;
    setLoading(true);
    setNotionUrl(null);

    // Show user instructions in chat if provided
    if (userInstructions) {
      setChatMessages((prev) => [...prev, { role: 'user', content: userInstructions }]);
    }

    try {
      // Re-extract if we don't have content yet
      let extractedContent = content;
      if (!extractedContent) {
        const extractResponse = await sendMessage({ type: 'EXTRACT_CONTENT' }) as ExtractResultMessage;
        if (!extractResponse.success || !extractResponse.data) {
          throw new Error(extractResponse.error || 'Failed to extract content');
        }
        extractedContent = extractResponse.data;
        if (activeTabIdRef.current === originTabId) {
          setContent(extractedContent);
        }
      }

      const summaryResponse = await sendMessage({
        type: 'SUMMARIZE',
        content: extractedContent,
        userInstructions,
        tabId: originTabId ?? undefined,
      }) as SummaryResultMessage;

      if (!summaryResponse.success || !summaryResponse.data) {
        throw new Error(summaryResponse.error || 'Failed to generate summary');
      }

      // Validate mermaid diagrams and auto-fix via chat round-trip (spinner stays active)
      const finalSummary = await autoFixMermaid(
        summaryResponse.data, extractedContent, resolvedTheme,
        chatMessagesRef.current, setChatMessages, setRawResponses,
      );

      if (activeTabIdRef.current === originTabId) {
        setSummary(finalSummary);
        summaryDetailLevelRef.current = settings.summaryDetailLevel;
      } else if (originTabId != null) {
        const saved = tabStatesRef.current.get(originTabId);
        if (saved) {
          saved.summary = finalSummary;
          saved.loading = false;
        }
      }
    } catch (err) {
      // Route failures to chat as assistant messages (silently swallow cancellation)
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Summarization cancelled') return;
      if (activeTabIdRef.current === originTabId) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: message }]);
      } else if (originTabId != null) {
        const saved = tabStatesRef.current.get(originTabId);
        if (saved) {
          saved.chatMessages = [...saved.chatMessages, { role: 'assistant', content: message }];
          saved.loading = false;
        }
      }
    } finally {
      if (activeTabIdRef.current === originTabId) {
        setLoading(false);
      } else if (originTabId != null) {
        const saved = tabStatesRef.current.get(originTabId);
        if (saved) saved.loading = false;
      }
    }
  }, [content, resolvedTheme]);

  const [exporting, setExporting] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ pageId: string; pageUrl: string; title: string } | null>(null);

  const doExport = useCallback(async (replacePageId?: string) => {
    if (!summary || !content) return;

    setExporting(true);
    setDuplicateInfo(null);
    try {
      const response = await sendMessage({
        type: 'EXPORT',
        adapterId: 'notion',
        summary,
        content,
        replacePageId,
      }) as ExportResultMessage;

      if (response.success && response.url) {
        setNotionUrl(response.url);
        setToast({ message: replacePageId ? 'Updated in Notion!' : 'Exported to Notion!', type: 'success' });
      } else {
        setToast({ message: response.error || 'Export failed', type: 'error' });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Export failed', type: 'error' });
    } finally {
      setExporting(false);
    }
  }, [summary, content]);

  // Navigate the active browser tab instead of opening new windows
  const handleNavigate = useCallback((url: string) => {
    const tabId = activeTabIdRef.current;
    const chromeObj = (globalThis as unknown as { chrome: typeof chrome }).chrome;
    if (tabId == null) { chromeObj.tabs.create({ url }); return; }

    // Parse link and current page to detect same-page hash navigation
    try {
      const link = new URL(url);
      const current = contentRef.current?.url ? new URL(contentRef.current.url) : null;
      // Same page, just a different hash (e.g. #L42) → scroll programmatically, don't change URL
      if (current && link.origin === current.origin && link.pathname === current.pathname && link.hash) {
        const elementId = link.hash.slice(1); // strip leading #
        chromeObj.scripting.executeScript({
          target: { tabId },
          func: (id: string) => {
            // Try exact ID first, then GitHub-specific variants (LC = line content)
            const el = document.getElementById(id)
              || document.getElementById('LC' + id.replace(/^L/, ''))
              || document.querySelector(`[data-line-number="${id.replace(/^L/, '')}"]`);
            if (el) {
              // Scroll vertically only — scrollIntoView also scrolls horizontally,
              // which hides GitHub's line number gutter
              const rect = el.getBoundingClientRect();
              const targetY = window.scrollY + rect.top - window.innerHeight / 2;
              window.scrollTo({ top: targetY, behavior: 'instant' });
              // Brief highlight
              const prev = el.style.backgroundColor;
              el.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';
              setTimeout(() => { el.style.backgroundColor = prev; }, 2000);
            }
          },
          args: [elementId],
        });
        return;
      }
    } catch { /* malformed URL — fall through to tab update */ }

    chromeObj.tabs.update(tabId, { url });
  }, []);

  const handleExport = useCallback(async () => {
    if (!summary || !content || exporting) return;

    setExporting(true);
    try {
      const dupResponse = await sendMessage({
        type: 'CHECK_NOTION_DUPLICATE',
        url: content.url,
      }) as CheckNotionDuplicateResultMessage;

      if (dupResponse.success && dupResponse.duplicatePageId) {
        setDuplicateInfo({
          pageId: dupResponse.duplicatePageId,
          pageUrl: dupResponse.duplicatePageUrl || '',
          title: dupResponse.duplicateTitle || 'Untitled',
        });
        setExporting(false);
        return;
      }
    } catch {
      // Non-blocking — proceed with normal export
    }

    // No duplicate found — export directly
    setExporting(false);
    doExport();
  }, [summary, content, exporting, doExport]);

  const handleChatSend = useCallback(async (text: string) => {
    if (!content) return;
    const originTabId = activeTabIdRef.current;

    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);

    try {
      const allMessages: ChatMessage[] = chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      allMessages.push({ role: 'user', content: text });

      const emptySummary: SummaryDocument = {
        tldr: '', keyTakeaways: [], summary: '', notableQuotes: [],
        conclusion: '', relatedTopics: [], tags: [],
      };

      const response = await sendMessage({
        type: 'CHAT_MESSAGE',
        messages: allMessages,
        summary: summary || emptySummary,
        content,
        theme: resolvedTheme,
      }) as ChatResponseMessage;

      if (!response.success || !response.message) {
        throw new Error(response.error || 'Chat failed');
      }

      // Store raw LLM response for debug panel
      setRawResponses(prev => [...prev, response.message!]);

      // Parse response: extract updates (partial or full) and remaining text (chat)
      const { updates, text: chatText } = extractJsonAndText(response.message!);

      // Merge updates into existing summary
      let updatedSummary: SummaryDocument | null = null;
      if (updates) {
        const base = summary || emptySummary;
        updatedSummary = mergeSummaryUpdates(base, updates);
        // Preserve app-managed fields
        if (summary) {
          updatedSummary.llmProvider = summary.llmProvider;
          updatedSummary.llmModel = summary.llmModel;
        }
      }

      // Never show raw JSON — use chat text if available, otherwise a status message
      const displayText = chatText || (updatedSummary ? 'Summary updated.' : 'Failed to update summary — please try again.');

      // Auto-fix broken mermaid diagrams in the updated summary
      const fixedJson = updatedSummary
        ? await autoFixMermaid(updatedSummary, content, resolvedTheme, chatMessagesRef.current, setChatMessages, setRawResponses)
        : null;

      if (activeTabIdRef.current === originTabId) {
        if (fixedJson) {
          setSummary(fixedJson);
          setNotionUrl(null);
          setToast({ message: 'Summary updated', type: 'success' });
        }
        setChatMessages((prev) => [...prev, { role: 'assistant', content: displayText }]);
      } else if (originTabId != null) {
        const saved = tabStatesRef.current.get(originTabId);
        if (saved) {
          if (fixedJson) {
            saved.summary = fixedJson;
            saved.notionUrl = null;
          }
          saved.chatMessages = [...saved.chatMessages, { role: 'assistant', content: displayText }];
          saved.rawResponses = [...saved.rawResponses, response.message!];
          saved.chatLoading = false;
        }
      }
    } catch (err) {
      const errMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
      if (activeTabIdRef.current === originTabId) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
      } else if (originTabId != null) {
        const saved = tabStatesRef.current.get(originTabId);
        if (saved) {
          saved.chatMessages = [...saved.chatMessages, { role: 'assistant', content: errMsg }];
          saved.chatLoading = false;
        }
      }
    } finally {
      if (activeTabIdRef.current === originTabId) {
        setChatLoading(false);
      } else if (originTabId != null) {
        const saved = tabStatesRef.current.get(originTabId);
        if (saved) saved.chatLoading = false;
      }
    }
  }, [summary, content, chatMessages, resolvedTheme]);

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (!text && isFirstSubmit) {
      if (summarizeVariant === 'amber') {
        setToast({ message: 'No transcript available — summarizing from comments only', type: 'info' });
      }
      if (pendingResummarize) {
        setSummary(null);
        setChatMessages([]);
        setNotionUrl(null);
      }
      setPendingResummarize(false);
      handleSummarize();
      setInputValue('');
      return;
    }
    if (!text) return;

    setInputValue('');
    if (isFirstSubmit) {
      if (summarizeVariant === 'amber') {
        setToast({ message: 'No transcript available — summarizing from comments only', type: 'info' });
      }
      if (pendingResummarize) {
        setSummary(null);
        setChatMessages([]);
        setNotionUrl(null);
      }
      setPendingResummarize(false);
      handleSummarize(text);
    } else {
      handleChatSend(text);
    }
  }, [inputValue, isFirstSubmit, handleSummarize, handleChatSend, summarizeVariant]);

  const handleSaveSettings = useCallback(async (newSettings: Settings) => {
    const response = await sendMessage({
      type: 'SAVE_SETTINGS',
      settings: newSettings,
    }) as SaveSettingsResultMessage;

    if (response.success) {
      setSettings(newSettings);
    }
  }, []);

  const handleTestLLM = useCallback(async (): Promise<{ success: boolean; error?: string; visionSupport?: VisionSupport }> => {
    const response = await sendMessage({ type: 'TEST_LLM_CONNECTION' }) as ConnectionTestResultMessage;
    // Reload settings to pick up cached vision probe result
    if (response.visionSupport) {
      const settingsResp = await sendMessage({ type: 'GET_SETTINGS' }) as SettingsResultMessage;
      if (settingsResp.settings) setSettings(settingsResp.settings);
    }
    return { success: response.success, error: response.error, visionSupport: response.visionSupport };
  }, []);

  const handleProbeVision = useCallback(async (providerId?: string, apiKey?: string, model?: string, endpoint?: string): Promise<VisionSupport | undefined> => {
    const response = await sendMessage({ type: 'PROBE_VISION', providerId, apiKey, model, endpoint }) as ProbeVisionResultMessage;
    if (response.success && response.vision) {
      return response.vision;
    }
    return undefined;
  }, []);

  const handleTestNotion = useCallback(async (): Promise<{ success: boolean; warning?: string; databaseId?: string; databaseName?: string }> => {
    const response = await sendMessage({ type: 'TEST_NOTION_CONNECTION' }) as ConnectionTestResultMessage;
    return { success: response.success, warning: response.warning, databaseId: response.databaseId, databaseName: response.databaseName };
  }, []);

  const handleFetchNotionDatabases = useCallback(async (): Promise<Array<{ id: string; title: string }>> => {
    const response = await sendMessage({ type: 'FETCH_NOTION_DATABASES' }) as NotionDatabasesResultMessage;
    return response.databases || [];
  }, []);

  const handleFetchModels = useCallback(async (providerId: string, apiKey: string, endpoint?: string): Promise<ModelInfo[]> => {
    const response = await sendMessage({ type: 'FETCH_MODELS', providerId, apiKey, endpoint }) as FetchModelsResultMessage;
    if (!response.success) throw new Error(response.error || 'Failed to fetch models');
    return response.models || [];
  }, []);

  const handleOpenTab = useCallback(async (url: string): Promise<void> => {
    await sendMessage({ type: 'OPEN_TAB', url });
  }, []);

  const handleCloseOnboardingTabs = useCallback(async (): Promise<void> => {
    await sendMessage({ type: 'CLOSE_ONBOARDING_TABS' });
  }, []);

  const handleThemeChange = useCallback((mode: Settings['theme']) => {
    setThemeMode(mode);
    sendMessage({ type: 'SAVE_SETTINGS', settings: { theme: mode } });
  }, [setThemeMode]);

  const handleDetailLevelCycle = useCallback(() => {
    const levels: Settings['summaryDetailLevel'][] = ['brief', 'standard', 'detailed'];
    const currentIdx = levels.indexOf(settings.summaryDetailLevel);
    const next = levels[(currentIdx + 1) % levels.length];
    setSettings({ ...settings, summaryDetailLevel: next });
    sendMessage({ type: 'SAVE_SETTINGS', settings: { summaryDetailLevel: next } });
    if (summary) {
      // Cycling back to the level that produced the current summary — cancel re-summarize
      setPendingResummarize(next !== summaryDetailLevelRef.current);
    }
  }, [settings, summary]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--md-sys-color-surface)' }}>
      {/* Header */}
      <Header
        onThemeToggle={() => {
          const next = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
          handleThemeChange(next);
        }}
        themeMode={themeMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={handleRefresh}
        onExport={settings.notion.apiKey && summary ? handleExport : undefined}
        onSaveMd={summary && content ? () => downloadMarkdown(summary, content) : undefined}
        notionUrl={notionUrl}
        exporting={exporting}
        detailLevel={settings.summaryDetailLevel}
        onDetailLevelCycle={handleDetailLevelCycle}
        debugOpen={debugOpen}
        onToggleDebug={() => setDebugOpen((v) => !v)}
        onPrint={summary ? () => window.print() : undefined}
      />

      {/* Scrollable content area */}
      <div ref={scrollAreaRef} class="print-content" style={{ flex: 1, overflow: 'auto' }}>
        {/* Extracting state */}
        {extracting && !content && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Spinner label="Reading page..." />
          </div>
        )}

        {/* No content extracted (e.g. chrome:// pages) */}
        {!content && !extracting && !loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{
              font: 'var(--md-sys-typescale-title-large)',
              color: 'var(--md-sys-color-on-surface)',
              marginBottom: '8px',
            }}>
              <span title="Too Long; Didn't Read">TL;DR</span>
            </div>
            <p style={{
              font: 'var(--md-sys-typescale-body-medium)',
              color: 'var(--md-sys-color-on-surface-variant)',
            }}>
              Navigate to a page to get started.
            </p>
          </div>
        )}

        {/* Page metadata — always visible when content is extracted */}
        {content && (
          <div style={{ padding: '16px' }}>
            <MetadataHeader
              content={content}
              summary={summary || undefined}
              providerName={(() => {
                const cfg = getActiveProviderConfig(settings);
                if (!cfg.apiKey && cfg.providerId !== 'self-hosted') return undefined;
                return getProviderDefinition(settings.activeProviderId)?.name || settings.activeProviderId;
              })()}
              modelName={getActiveProviderConfig(settings).model || undefined}
              onProviderClick={() => setSettingsOpen(true)}
            />
            <ContentIndicators content={content} settings={settings} />
          </div>
        )}

        {/* Debug prompt viewer */}
        {debugOpen && content && (
          <DebugPanel
            content={content}
            settings={settings}
            summary={summary}
            chatMessages={chatMessages}
            rawResponses={rawResponses}
          />
        )}

        {/* Onboarding prompt when LLM is not configured */}
        {!isLLMConfigured && !loading && !summary && chatMessages.length === 0 && (
          <div style={{
            margin: '0 16px 16px',
            padding: '20px',
            borderRadius: 'var(--md-sys-shape-corner-large)',
            backgroundColor: 'var(--md-sys-color-surface-container)',
            textAlign: 'center',
          }}>
            <div style={{
              font: 'var(--md-sys-typescale-title-medium)',
              color: 'var(--md-sys-color-on-surface)',
              marginBottom: '8px',
            }}>
              Welcome to <span title="Too Long; Didn't Read">TL;DR</span>!
            </div>
            <p style={{
              font: 'var(--md-sys-typescale-body-medium)',
              color: 'var(--md-sys-color-on-surface-variant)',
              margin: '0 0 12px',
            }}>
              Configure your LLM provider to start summarizing pages and videos.
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
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
              Open Settings
            </button>
          </div>
        )}

        {/* Loading summary spinner */}
        {loading && (
          <div style={{ padding: '0 16px 16px' }}>
            <Spinner label="Generating summary..." />
          </div>
        )}

        {/* Summary section */}
        {summary && !loading && (
          <div style={{ padding: '0 16px' }}>
            <SummaryContent
              summary={summary}
              content={content}
              onExport={settings.notion.apiKey ? handleExport : undefined}
              notionUrl={notionUrl}
              exporting={exporting}
              onNavigate={handleNavigate}
            />
          </div>
        )}

        {/* Chat section */}
        {chatMessages.some(m => !m.internal) && (
          <div style={{ padding: '8px 16px 16px' }}>
            <div style={{
              font: 'var(--md-sys-typescale-label-medium)',
              color: 'var(--md-sys-color-on-surface-variant)',
              padding: '8px 0',
              marginBottom: '4px',
              borderTop: '1px solid var(--md-sys-color-outline-variant)',
            }}>
              Chat
            </div>
            {chatMessages.filter(m => !m.internal).map((msg, i) => (
              <ChatBubble key={i} role={msg.role} content={msg.content} />
            ))}
            {chatLoading && (
              <div style={{ padding: '8px 12px', font: 'var(--md-sys-typescale-body-medium)', color: 'var(--md-sys-color-on-surface-variant)' }}>
                Thinking...
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <ChatInputBar
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        isFirstSubmit={isFirstSubmit}
        loading={loading || chatLoading}
        summarizeVariant={isFirstSubmit ? summarizeVariant : 'primary'}
        summarizeLabel={pendingResummarize ? 'Re-summarize' : 'Summarize'}
      />

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <SettingsView
          settings={settings}
          onSave={handleSaveSettings}
          onTestLLM={handleTestLLM}
          onTestNotion={handleTestNotion}
          onFetchNotionDatabases={handleFetchNotionDatabases}
          onFetchModels={handleFetchModels}
          onProbeVision={handleProbeVision}
          onThemeChange={handleThemeChange}
          onOpenTab={handleOpenTab}
          onCloseOnboardingTabs={handleCloseOnboardingTabs}
          onClose={() => setSettingsOpen(false)}
          currentTheme={themeMode}
        />
      </SettingsDrawer>

      {/* Duplicate page dialog */}
      <ConfirmDialog
        open={!!duplicateInfo}
        title="Page already exported"
        message={`"${duplicateInfo?.title}" is already in your Notion database. Update it or create a new page?`}
        primaryLabel="Update existing"
        secondaryLabel="Create new"
        onPrimary={() => doExport(duplicateInfo!.pageId)}
        onSecondary={() => doExport()}
        onDismiss={() => setDuplicateInfo(null)}
      />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function normalizeSummary(parsed: Record<string, unknown>): SummaryDocument {
  const pc = parsed.prosAndCons as { pros?: unknown; cons?: unknown } | undefined;
  return {
    tldr: (parsed.tldr as string) || '',
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
    summary: (parsed.summary as string) || '',
    notableQuotes: Array.isArray(parsed.notableQuotes) ? parsed.notableQuotes : [],
    conclusion: (parsed.conclusion as string) || '',
    prosAndCons: pc ? { pros: Array.isArray(pc.pros) ? pc.pros : [], cons: Array.isArray(pc.cons) ? pc.cons : [] } : undefined,
    commentsHighlights: Array.isArray(parsed.commentsHighlights) ? parsed.commentsHighlights : undefined,
    extraSections: Array.isArray(parsed.extraSections)
      ? parsed.extraSections.filter((s: unknown) => s && typeof (s as Record<string, unknown>).title === 'string' && typeof (s as Record<string, unknown>).content === 'string') as Array<{ title: string; content: string }>
      : undefined,
    relatedTopics: Array.isArray(parsed.relatedTopics) ? parsed.relatedTopics : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    sourceLanguage: (parsed.sourceLanguage as string) || undefined,
    summaryLanguage: (parsed.summaryLanguage as string) || undefined,
    translatedTitle: (parsed.translatedTitle as string) || undefined,
    inferredAuthor: (parsed.inferredAuthor as string) || undefined,
    inferredPublishDate: (parsed.inferredPublishDate as string) || undefined,
  };
}

const DELETE_SENTINEL = '__DELETE__';

/** Process partial update from LLM — validate/coerce each field, strip app-managed keys. */
function sanitizePartialUpdate(raw: Record<string, unknown>): Partial<SummaryDocument> | null {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'llmProvider' || key === 'llmModel') continue;
    if (value === DELETE_SENTINEL) {
      result[key] = undefined; // marks for removal during merge
      continue;
    }
    // Type-coerce the same way normalizeSummary does
    switch (key) {
      case 'tldr': case 'summary': case 'conclusion': case 'factCheck':
      case 'sourceLanguage': case 'summaryLanguage': case 'translatedTitle':
      case 'inferredTitle': case 'inferredAuthor': case 'inferredPublishDate':
        if (typeof value === 'string') result[key] = value;
        break;
      case 'keyTakeaways': case 'notableQuotes': case 'relatedTopics':
      case 'tags': case 'commentsHighlights':
        if (Array.isArray(value)) result[key] = value;
        break;
      case 'prosAndCons': {
        const pc = value as { pros?: unknown; cons?: unknown } | undefined;
        if (pc && typeof pc === 'object') {
          result[key] = {
            pros: Array.isArray(pc.pros) ? pc.pros : [],
            cons: Array.isArray(pc.cons) ? pc.cons : [],
          };
        }
        break;
      }
      case 'extraSections':
        if (Array.isArray(value)) {
          result[key] = value.filter(
            (s: unknown) =>
              s && typeof (s as Record<string, unknown>).title === 'string' &&
              typeof (s as Record<string, unknown>).content === 'string',
          ) as Array<{ title: string; content: string }>;
        }
        break;
    }
  }
  const keys = Object.keys(result);
  return keys.length > 0 ? (result as Partial<SummaryDocument>) : null;
}

/** Merge partial updates into an existing SummaryDocument. undefined values delete keys. */
function mergeSummaryUpdates(existing: SummaryDocument, updates: Partial<SummaryDocument>): SummaryDocument {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'llmProvider' || key === 'llmModel') continue;
    if (value === undefined) {
      delete (merged as Record<string, unknown>)[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function extractJsonAndText(raw: string): { updates: Partial<SummaryDocument> | null; text: string } {
  // Strategy 1: Structured JSON response — {"text": "...", "updates": {...} | null}
  // Also handles backward-compat {"text": "...", "summary": {...} | null}
  {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const parsed = parseJsonSafe(cleaned) as Record<string, unknown> | null;
    if (parsed && typeof parsed === 'object' && 'text' in parsed) {
      const text = typeof parsed.text === 'string' ? parsed.text : '';
      // New format: partial "updates" field; fallback: legacy full "summary"
      const source = parsed.updates ?? parsed.summary;
      let updates: Partial<SummaryDocument> | null = null;
      if (source && typeof source === 'object') {
        if (parsed.updates) {
          // Partial update — only changed fields
          updates = sanitizePartialUpdate(source as Record<string, unknown>);
        } else {
          // Legacy full summary — all fields present → full replacement
          const s = source as Record<string, unknown>;
          if (s.tldr && s.summary) updates = normalizeSummary(s);
        }
      }
      return { updates, text };
    }
    // Also handle a flat summary object (has tldr+summary but no text field)
    if (parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).tldr && (parsed as Record<string, unknown>).summary) {
      return { updates: normalizeSummary(parsed as Record<string, unknown>), text: '' };
    }
  }

  // Strategy 2: Look for an explicit ```json fence (legacy format).
  const fenceStart = raw.indexOf('```json');

  if (fenceStart !== -1) {
    const jsonStart = raw.indexOf('{', fenceStart);
    if (jsonStart !== -1) {
      const jsonEnd = findMatchingBrace(raw, jsonStart);
      let updates: Partial<SummaryDocument> | null = null;
      if (jsonEnd !== -1) {
        const parsed = parseJsonSafe(raw.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown> | null;
        if (parsed && parsed.tldr && parsed.summary) {
          updates = normalizeSummary(parsed);
        }
      }
      // Always strip the ```json block from chat text
      const searchFrom = jsonEnd !== -1 ? jsonEnd + 1 : fenceStart + 7;
      const closingFence = raw.indexOf('```', searchFrom);
      const endIdx = closingFence !== -1 ? closingFence + 3 : raw.length;
      const text = (raw.slice(0, fenceStart) + raw.slice(endIdx)).trim();
      return { updates, text };
    }
  }

  // Strategy 3: Unfenced JSON object embedded in surrounding text.
  const braceIdx = raw.indexOf('{');
  if (braceIdx !== -1) {
    const braceEnd = findMatchingBrace(raw, braceIdx);
    if (braceEnd !== -1) {
      const parsed = parseJsonSafe(raw.slice(braceIdx, braceEnd + 1)) as Record<string, unknown> | null;
      if (parsed && parsed.tldr && parsed.summary) {
        const text = (raw.slice(0, braceIdx) + raw.slice(braceEnd + 1)).trim();
        return { updates: normalizeSummary(parsed), text };
      }
    }
  }

  return { updates: null, text: raw };
}

function ContentIndicators({ content, settings }: { content: ExtractedContent; settings: Settings }) {
  const isYouTube = content.type === 'youtube';
  const commentCount = content.comments?.length ?? 0;

  // Transcript is resolved during extraction now.
  const hasTranscriptMarker = content.content.includes('[YOUTUBE_TRANSCRIPT:');
  const hasTranscriptError = content.content.includes('*Transcript could not be loaded:');
  const transcriptLoaded = isYouTube && !hasTranscriptMarker && !hasTranscriptError;

  const commentWords = content.comments
    ? content.comments.reduce((sum, c) => sum + c.text.split(/\s+/).length, 0)
    : 0;

  const imageCount = content.richImages?.length ?? 0;

  // Compute image analysis status based on model capabilities
  let willAnalyze = false;
  if (imageCount > 0) {
    const activeConfig = getActiveProviderConfig(settings);
    const key = `${settings.activeProviderId}:${activeConfig.model}`;
    const vision = settings.modelCapabilities?.[key]?.vision;
    willAnalyze = !!((settings.enableImageAnalysis ?? true) && (vision === 'base64' || vision === 'url'));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
      {isYouTube ? (
        <IndicatorChip
          icon={transcriptLoaded ? '\u2713' : '\u2717'}
          label={transcriptLoaded ? `Transcript \u00B7 ${content.wordCount.toLocaleString()} words` : 'No transcript'}
          variant={transcriptLoaded ? 'success' : 'warning'}
        />
      ) : (
        <IndicatorChip icon={'\u2713'} label={`${content.wordCount.toLocaleString()} words`} variant="success" />
      )}
      {commentCount > 0 && (
        <IndicatorChip icon={String.fromCodePoint(0x1F4AC)} label={`${commentCount} comments \u00B7 ${commentWords.toLocaleString()} words`} variant="success" />
      )}
      {imageCount > 0 && (
        <IndicatorChip
          icon={String.fromCodePoint(0x1F5BC)}
          label={willAnalyze
            ? `${imageCount} image${imageCount > 1 ? 's' : ''} \u2014 will analyze`
            : `${imageCount} image${imageCount > 1 ? 's' : ''}`}
          variant={willAnalyze ? 'success' : 'neutral'}
        />
      )}
    </div>
  );
}

function IndicatorChip({ icon, label, variant }: { icon: string; label: string; variant: 'success' | 'neutral' | 'warning' }) {
  const colors = {
    success: { bg: 'var(--md-sys-color-success-container)', fg: 'var(--md-sys-color-on-success-container)' },
    warning: { bg: 'var(--md-sys-color-warning-container)', fg: 'var(--md-sys-color-on-warning-container)' },
    neutral: { bg: 'var(--md-sys-color-surface-container-high)', fg: 'var(--md-sys-color-on-surface-variant)' },
  };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '3px 10px',
      borderRadius: 'var(--md-sys-shape-corner-extra-large)',
      font: 'var(--md-sys-typescale-label-small)',
      backgroundColor: colors[variant].bg,
      color: colors[variant].fg,
    }}>
      <span>{icon}</span>
      {label}
    </span>
  );
}

function Header({ onThemeToggle, themeMode, onOpenSettings, onRefresh, onExport, onSaveMd, notionUrl, exporting, detailLevel, onDetailLevelCycle, debugOpen, onToggleDebug, onPrint }: {
  onThemeToggle: () => void;
  themeMode: string;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onExport?: () => void;
  onSaveMd?: () => void;
  notionUrl?: string | null;
  exporting?: boolean;
  detailLevel: 'brief' | 'standard' | 'detailed';
  onDetailLevelCycle: () => void;
  debugOpen: boolean;
  onToggleDebug: () => void;
  onPrint?: () => void;
}) {
  const [mdSaved, setMdSaved] = useState(false);
  // Reset mdSaved when onSaveMd changes (new summary)
  useEffect(() => setMdSaved(false), [onSaveMd]);

  return (
    <div class="no-print" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
      flexShrink: 0,
      backgroundColor: 'var(--md-sys-color-surface)',
      zIndex: 10,
      position: 'relative',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span title="Too Long; Didn't Read" style={{ font: 'var(--md-sys-typescale-title-large)', color: 'var(--md-sys-color-on-surface)' }}>
          TL;DR
        </span>
        <IconButton onClick={() => window.open('https://buymeacoffee.com/aitkn', '_blank', 'noopener,noreferrer')} label="Support">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
        </IconButton>
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {notionUrl ? (
          <IconButton onClick={() => window.open(notionUrl, '_blank', 'noopener,noreferrer')} label="Open in Notion">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 19h14V5h-7V3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5c-1.1 0-2-.9-2-2v-7h2v7zM10 3v2H6.41l9.83 9.83-1.41 1.41L5 6.41V10H3V3h7z" /></svg>
          </IconButton>
        ) : (
          <IconButton onClick={onExport ? () => onExport() : undefined} label={exporting ? 'Exporting...' : 'Export to Notion'} disabled={!onExport || exporting}>
            {exporting ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                <circle cx="12" cy="12" r="10" stroke="var(--md-sys-color-outline-variant)" stroke-width="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--md-sys-color-primary)" stroke-width="3" stroke-linecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" /></svg>
            )}
          </IconButton>
        )}
        <IconButton onClick={onSaveMd && !mdSaved ? () => { onSaveMd(); setMdSaved(true); } : undefined} label={mdSaved ? 'Saved' : 'Save .md'} disabled={!onSaveMd || mdSaved}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
        </IconButton>
        <IconButton onClick={onPrint} label="Print" disabled={!onPrint}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" /></svg>
        </IconButton>
        <DetailLevelButton level={detailLevel} onClick={onDetailLevelCycle} />
        <IconButton onClick={onRefresh} label="Refresh">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" /></svg>
        </IconButton>
        <IconButton onClick={onThemeToggle} label={`Theme: ${themeMode}`}>
          {themeMode === 'dark' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.37 5.51A7.35 7.35 0 0 0 9.1 7.5c0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27A7.014 7.014 0 0 1 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></svg>
          ) : themeMode === 'light' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h6v2H8v2h8v-2h-2v-2h6c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H4V5h16v10z" /></svg>
          )}
        </IconButton>
        <IconButton onClick={onToggleDebug} label="Debug prompts" active={debugOpen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" /></svg>
        </IconButton>
        <IconButton onClick={onOpenSettings} label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}

function DetailLevelButton({ level, onClick }: { level: 'brief' | 'standard' | 'detailed'; onClick: () => void }) {
  const config = {
    brief:    { label: 'Brief', bars: 1 },
    standard: { label: 'Standard', bars: 2 },
    detailed: { label: 'Detailed', bars: 3 },
  }[level];

  return (
    <button
      onClick={onClick}
      aria-label={`Detail: ${config.label} (click to cycle)`}
      title={`Detail: ${config.label}`}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: 'var(--md-sys-shape-corner-small)',
        color: 'var(--md-sys-color-on-surface-variant)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        {/* Three horizontal bars — filled bars indicate level */}
        <rect x="3" y="4" width="14" height="2.5" rx="1" opacity={config.bars >= 1 ? 1 : 0.2} />
        <rect x="3" y="9" width="14" height="2.5" rx="1" opacity={config.bars >= 2 ? 1 : 0.2} />
        <rect x="3" y="14" width="14" height="2.5" rx="1" opacity={config.bars >= 3 ? 1 : 0.2} />
      </svg>
    </button>
  );
}

function IconButton({ onClick, label, children, disabled, active }: { onClick?: () => void; label: string; children: preact.ComponentChildren; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      style={{
        background: active ? 'var(--md-sys-color-primary-container)' : 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        padding: '8px',
        borderRadius: 'var(--md-sys-shape-corner-small)',
        color: active ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
        opacity: disabled ? 0.35 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function ChatBubble({ role, content: text }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        marginBottom: '8px',
        padding: '10px 14px',
        borderRadius: 'var(--md-sys-shape-corner-medium)',
        font: 'var(--md-sys-typescale-body-medium)',
        lineHeight: 1.5,
        backgroundColor: isUser ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)',
        color: isUser ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface)',
        maxWidth: '90%',
        marginLeft: isUser ? 'auto' : '0',
        marginRight: isUser ? '0' : 'auto',
      }}
    >
      {isUser ? text : <MarkdownRenderer content={text} />}
    </div>
  );
}

function DebugPanel({ content, settings, summary, chatMessages, rawResponses }: {
  content: ExtractedContent;
  settings: Settings;
  summary: SummaryDocument | null;
  chatMessages: DisplayMessage[];
  rawResponses: string[];
}) {
  const imageCount = content.richImages?.length ?? 0;
  let imageAnalysisEnabled = false;
  if (imageCount > 0) {
    const activeConfig = getActiveProviderConfig(settings);
    const key = `${settings.activeProviderId}:${activeConfig.model}`;
    const vision = settings.modelCapabilities?.[key]?.vision;
    imageAnalysisEnabled = !!((settings.enableImageAnalysis ?? true) && (vision === 'base64' || vision === 'url'));
  }

  const systemPrompt = getSystemPrompt(
    settings.summaryDetailLevel,
    settings.summaryLanguage,
    settings.summaryLanguageExcept,
    imageAnalysisEnabled,
    content.wordCount,
    content.type,
    content.githubPageType,
  );
  const userPrompt = getSummarizationPrompt(content, settings.summaryDetailLevel);

  return (
    <div style={{
      margin: '0 16px 12px',
      padding: '10px',
      borderRadius: 'var(--md-sys-shape-corner-medium)',
      backgroundColor: 'var(--md-sys-color-surface-container-low)',
      border: '1px solid var(--md-sys-color-outline-variant)',
    }}>
      <div style={{
        font: 'var(--md-sys-typescale-label-medium)',
        color: 'var(--md-sys-color-on-surface-variant)',
        marginBottom: '6px',
      }}>
        Debug: Prompts
      </div>
      <DebugSection title="System Prompt" content={systemPrompt} />
      <DebugSection title="User Prompt" content={userPrompt} />
      <DebugSection title="Extracted Content" content={content.content} />
      {summary && (
        <DebugSection title="Summary JSON" content={JSON.stringify(summary, null, 2)} />
      )}
      {chatMessages.length > 0 && (
        <DebugSection
          title="Chat"
          content={chatMessages.map((m) => `[${m.role}${m.internal ? ' (auto-fix)' : ''}]\n${m.content}`).join('\n\n---\n\n')}
        />
      )}
      {rawResponses.length > 0 && (
        <DebugSection
          title={`Raw LLM Responses (${rawResponses.length})`}
          content={rawResponses.map((r, i) => `--- Response ${i + 1} ---\n${r}`).join('\n\n')}
        />
      )}
    </div>
  );
}

function DebugSection({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          font: 'var(--md-sys-typescale-label-small)',
          color: 'var(--md-sys-color-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span style={{ fontSize: '10px' }}>{open ? '\u25BC' : '\u25B6'}</span>
        {title}
        <span style={{ color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 'normal' }}>
          ({content.length.toLocaleString()} chars)
        </span>
      </button>
      {open && (
        <pre style={{
          maxHeight: '300px',
          overflow: 'auto',
          fontSize: '11px',
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: '2px 0 4px',
          padding: '8px',
          borderRadius: 'var(--md-sys-shape-corner-small)',
          backgroundColor: 'var(--md-sys-color-surface-container)',
          color: 'var(--md-sys-color-on-surface)',
          border: '1px solid var(--md-sys-color-outline-variant)',
        }}>
          {content}
        </pre>
      )}
    </div>
  );
}
