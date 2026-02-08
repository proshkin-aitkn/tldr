import { getSettings, saveSettings } from '@/lib/storage/settings';
import { getActiveProviderConfig } from '@/lib/storage/types';
import { createProvider, getProviderDefinition } from '@/lib/llm/registry';
import { fetchModels } from '@/lib/llm/models';
import { summarize, ImageRequestError } from '@/lib/summarizer/summarizer';
import { fetchImages } from '@/lib/images/fetcher';
import { probeVision } from '@/lib/llm/vision-probe';
import type { FetchedImage } from '@/lib/images/fetcher';
import type { Message, ExtractResultMessage, SummaryResultMessage, ChatResponseMessage, ConnectionTestResultMessage, SettingsResultMessage, SaveSettingsResultMessage, NotionDatabasesResultMessage, ExportResultMessage, FetchModelsResultMessage } from '@/lib/messaging/types';
import type { ChatMessage, ImageContent, VisionSupport, LLMProvider } from '@/lib/llm/types';
import type { SummaryDocument } from '@/lib/summarizer/types';
import type { ExtractedContent } from '@/lib/extractors/types';

// Persist images across service worker restarts via chrome.storage.session
const chromeStorage = () => (globalThis as unknown as { chrome: { storage: typeof chrome.storage } }).chrome.storage;

async function cacheImages(images: ImageContent[], urls: { url: string; alt: string }[]): Promise<void> {
  await chromeStorage().session.set({ _cachedImages: images, _cachedImageUrls: urls });
}

async function getCachedImages(): Promise<{ images: ImageContent[]; urls: { url: string; alt: string }[] }> {
  const result = await chromeStorage().session.get(['_cachedImages', '_cachedImageUrls']);
  return {
    images: (result._cachedImages as ImageContent[]) || [],
    urls: (result._cachedImageUrls as { url: string; alt: string }[]) || [],
  };
}

export default defineBackground(() => {
  const chromeObj = (globalThis as unknown as { chrome: typeof chrome }).chrome;

  // Open side panel when extension icon is clicked
  (chromeObj as unknown as { sidePanel?: { setPanelBehavior: (opts: { openPanelOnActionClick: boolean }) => Promise<void> } })
    .sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);

  chromeObj.runtime.onMessage.addListener(
    (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
      if (sender.id !== chromeObj.runtime.id) {
        sendResponse({ success: false, error: 'Unauthorized sender' });
        return;
      }
      handleMessage(message as Message)
        .then(sendResponse)
        .catch((err) => {
          console.warn(`[TLDR] ${(message as Message).type} failed:`, err);
          sendResponse({ type: (message as Message).type, success: false, error: String(err) });
        });
      return true; // keep channel open for async response
    },
  );
});

async function getModelVision(
  provider: LLMProvider,
  providerId: string,
  model: string,
): Promise<VisionSupport> {
  const settings = await getSettings();
  const key = `${providerId}:${model}`;
  const cached = settings.modelCapabilities?.[key];

  // Return cached if known and < 30 days old
  if (cached && cached.vision !== 'unknown' && Date.now() - cached.probedAt < 30 * 86400000) {
    return cached.vision;
  }

  const vision = await probeVision(provider);

  // Only cache definitive results
  if (vision !== 'unknown') {
    await saveSettings({
      modelCapabilities: {
        ...settings.modelCapabilities,
        [key]: { vision, probedAt: Date.now() },
      },
    });
  }

  return vision;
}

async function handleMessage(message: Message): Promise<Message> {
  switch (message.type) {
    case 'EXTRACT_CONTENT':
      return handleExtractContent();
    case 'EXTRACT_COMMENTS':
      return handleExtractComments();
    case 'SUMMARIZE':
      return handleSummarize(message.content, message.userInstructions);
    case 'CHAT_MESSAGE':
      return handleChatMessage(message.messages, message.summary, message.content);
    case 'EXPORT':
      return handleExport(message.adapterId, message.summary, message.content, message.replacePageId);
    case 'CHECK_NOTION_DUPLICATE':
      return handleCheckNotionDuplicate(message.url);
    case 'TEST_LLM_CONNECTION':
      return handleTestLLMConnection();
    case 'PROBE_VISION':
      return handleProbeVision(message);
    case 'TEST_NOTION_CONNECTION':
      return handleTestNotionConnection();
    case 'GET_SETTINGS':
      return handleGetSettings();
    case 'SAVE_SETTINGS':
      return handleSaveSettings(message.settings);
    case 'FETCH_NOTION_DATABASES':
      return handleFetchNotionDatabases();
    case 'FETCH_MODELS':
      return handleFetchModels(message.providerId, message.apiKey, message.endpoint);
    default:
      return { type: (message as Message).type, success: false, error: 'Unknown message type' } as Message;
  }
}

/**
 * Resolve the target tab: normally the active tab, but if the active tab is
 * the extension itself (opened as a tab for debugging), fall back to the most
 * recently accessed non-extension tab in the same window.
 */
async function resolveTargetTab(): Promise<chrome.tabs.Tab> {
  const chromeTabs = (globalThis as unknown as { chrome: { tabs: typeof chrome.tabs } }).chrome.tabs;
  let [tab] = await chromeTabs.query({ active: true, currentWindow: true });

  if (tab?.url?.startsWith('chrome-extension://')) {
    const allTabs = await chromeTabs.query({ currentWindow: true });
    const candidates = allTabs
      .filter(t => t.id !== tab!.id && !t.url?.startsWith('chrome-extension://'))
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    if (candidates.length) tab = candidates[0];
  }

  if (!tab?.id) throw new Error('No active tab found');
  return tab;
}

function sendToTab(tabId: number, message: unknown): Promise<unknown> {
  const chromeTabs = (globalThis as unknown as { chrome: { tabs: typeof chrome.tabs } }).chrome.tabs;
  return new Promise((resolve, reject) => {
    chromeTabs.sendMessage(tabId, message, (resp: unknown) => {
      const chromeRT = (globalThis as unknown as { chrome: { runtime: typeof chrome.runtime } }).chrome.runtime;
      if (chromeRT.lastError) reject(new Error(chromeRT.lastError.message));
      else resolve(resp);
    });
  });
}

async function handleExtractContent(): Promise<ExtractResultMessage> {
  try {
    const tab = await resolveTargetTab();

    let response: unknown;
    try {
      response = await sendToTab(tab.id, { type: 'EXTRACT_CONTENT' });
    } catch {
      // Content script not injected yet (page was open before extension loaded).
      // Inject it programmatically and retry.
      const chromeScripting = (globalThis as unknown as { chrome: { scripting: typeof chrome.scripting } }).chrome.scripting;
      await chromeScripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      });
      response = await sendToTab(tab.id, { type: 'EXTRACT_CONTENT' });
    }
    const result = response as ExtractResultMessage;
    result.tabId = tab.id;

    // Resolve Google Docs export from background (no CORS restrictions here)
    if (result.success && result.data) {
      const gdocsMarker = '[GDOCS_EXPORT:';
      const idx = result.data.content.indexOf(gdocsMarker);
      if (idx !== -1) {
        const end = result.data.content.indexOf(']', idx + gdocsMarker.length);
        if (end !== -1) {
          const docId = result.data.content.slice(idx + gdocsMarker.length, end);
          try {
            const text = await fetchGoogleDocText(docId);
            result.data.content = text;
            result.data.wordCount = text.split(/\s+/).filter(Boolean).length;
            result.data.estimatedReadingTime = Math.ceil(result.data.wordCount / 200);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            result.data.content = `*Could not extract Google Doc content: ${errMsg}*`;
          }
        }
      }
    }

    return result;
  } catch (err) {
    return {
      type: 'EXTRACT_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleExtractComments(): Promise<Message> {
  try {
    const tab = await resolveTargetTab();

    let response: unknown;
    try {
      response = await sendToTab(tab.id, { type: 'EXTRACT_COMMENTS' });
    } catch {
      const chromeScripting = (globalThis as unknown as { chrome: { scripting: typeof chrome.scripting } }).chrome.scripting;
      await chromeScripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/content.js'],
      });
      response = await sendToTab(tab.id, { type: 'EXTRACT_COMMENTS' });
    }
    return response as Message;
  } catch (err) {
    return { type: 'EXTRACT_COMMENTS', success: false, error: err instanceof Error ? err.message : String(err) } as Message;
  }
}

async function handleSummarize(content: ExtractedContent, userInstructions?: string): Promise<SummaryResultMessage> {
  try {
    // Clear stale image cache from previous summarization
    await cacheImages([], []);
    const settings = await getSettings();
    const llmConfig = getActiveProviderConfig(settings);

    if (!llmConfig.apiKey && llmConfig.providerId !== 'self-hosted') {
      throw new Error('Please configure your LLM API key in Settings');
    }

    const provider = createProvider(llmConfig);

    let imageAnalysisEnabled = false;
    let modelVision: VisionSupport = 'unknown';
    if (settings.enableImageAnalysis && content.richImages?.length) {
      modelVision = await getModelVision(provider, llmConfig.providerId, llmConfig.model);
      imageAnalysisEnabled = modelVision === 'base64' || modelVision === 'url';
    }

    let allFetchedImages: FetchedImage[] = [];
    let imageUrlList: { url: string; alt: string }[] = [];

    if (imageAnalysisEnabled) {
      // Send all images as actual image data (inline first, then contextual)
      const richImages = content.richImages!;
      const sorted = [
        ...richImages.filter((i) => i.tier === 'inline'),
        ...richImages.filter((i) => i.tier === 'contextual'),
      ];

      // Always fetch and encode as base64 — sending URLs directly is unreliable
      // because the remote LLM API can't access images behind auth/cookies (e.g. x.com)
      // or served with unsupported content-types. The service worker has the user's
      // session and fetchImages() converts unsupported formats to JPEG.
      allFetchedImages = await fetchImages(sorted, 5);
      imageUrlList = allFetchedImages.map((fi) => ({ url: fi.url, alt: fi.alt }));
    }

    // Cache images + URLs for chat to reuse (survives service worker restarts)
    const cachedImageContents: ImageContent[] = allFetchedImages.map((fi) => ({ base64: fi.base64, mimeType: fi.mimeType }));
    await cacheImages(cachedImageContents, imageUrlList);

    const MAX_TOTAL_IMAGES = 5;

    const providerDef = getProviderDefinition(llmConfig.providerId);
    const providerName = providerDef?.name || llmConfig.providerId;

    try {
      const result = await summarize(provider, content, {
        detailLevel: settings.summaryDetailLevel,
        language: settings.summaryLanguage,
        languageExcept: settings.summaryLanguageExcept,
        contextWindow: llmConfig.contextWindow,
        userInstructions,
        fetchedImages: allFetchedImages.length > 0 ? allFetchedImages : undefined,
        imageUrlList: imageUrlList.length > 0 ? imageUrlList : undefined,
      });
      result.llmProvider = providerName;
      result.llmModel = llmConfig.model;
      return { type: 'SUMMARY_RESULT', success: true, data: result };
    } catch (err) {
      // Round-trip: LLM requested additional images
      if (err instanceof ImageRequestError && imageAnalysisEnabled) {
        const requestedUrls = err.requestedImages.slice(0, 3);
        const remaining = MAX_TOTAL_IMAGES - allFetchedImages.length;
        if (remaining > 0 && requestedUrls.length > 0) {
          const additionalUrlList = requestedUrls.slice(0, remaining).map((url) => ({ url, alt: '' }));
          imageUrlList = [...imageUrlList, ...additionalUrlList];
          const requestedExtracted = requestedUrls.slice(0, remaining).map((url) => ({
            url,
            alt: '',
            tier: 'contextual' as const,
          }));
          const additionalImages = await fetchImages(requestedExtracted, remaining);
          allFetchedImages = [...allFetchedImages, ...additionalImages];
        }

        // Retry summarization with all images — no further round-trips
        const result = await summarize(provider, content, {
          detailLevel: settings.summaryDetailLevel,
          language: settings.summaryLanguage,
          languageExcept: settings.summaryLanguageExcept,
          contextWindow: llmConfig.contextWindow,
          userInstructions,
          fetchedImages: allFetchedImages.length > 0 ? allFetchedImages : undefined,
          imageUrlList: imageUrlList.length > 0 ? imageUrlList : undefined,
        });
        result.llmProvider = providerName;
        result.llmModel = llmConfig.model;
        return { type: 'SUMMARY_RESULT', success: true, data: result };
      }
      throw err;
    }
  } catch (err) {
    return {
      type: 'SUMMARY_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleChatMessage(
  messages: ChatMessage[],
  summary: SummaryDocument,
  content: ExtractedContent,
): Promise<ChatResponseMessage> {
  try {
    const settings = await getSettings();
    const llmConfig = getActiveProviderConfig(settings);
    const provider = createProvider(llmConfig);
    const key = `${llmConfig.providerId}:${llmConfig.model}`;
    const visionCached = settings.modelCapabilities?.[key]?.vision;
    const hasVisionCapability = visionCached === 'base64' || visionCached === 'url';
    const cached = (settings.enableImageAnalysis && hasVisionCapability) ? await getCachedImages() : { images: [], urls: [] };
    const cachedImages = cached.images;
    const cachedImageUrls = cached.urls;
    const hasImages = cachedImages.length > 0;

    const metaLines = [`Title: ${content.title}`, `URL: ${content.url}`];
    if (content.channelName) metaLines.push(`Channel: ${content.channelName}`);
    if (content.description) metaLines.push(`Description: ${content.description}`);

    let systemPrompt = `You are a helpful assistant that helps refine and discuss content summaries.
The user has a summary of a ${content.type === 'youtube' ? 'YouTube video' : 'web page'}.

Source metadata:
${metaLines.join('\n')}

Current summary (JSON):
${JSON.stringify(summary, null, 2)}

Response format rules:
- You MUST respond with a JSON object matching this structure: {"text": "your message", "summary": <updated summary object or null>}
- The "text" field contains your message to the user (explanation, answer, comment). Markdown formatting is supported. Use an empty string if you have nothing to say beyond the update.
- The "summary" field contains the COMPLETE updated summary object (all fields) when you need to update it. Set to null if no update is needed.
- IMPORTANT: Always respond with valid JSON. Do not include anything outside the JSON object — no markdown fences, no extra text.
- When updating the summary, always return the COMPLETE JSON object (all fields), not just the changed parts.
- To add custom sections (cheat sheets, tables, extras the user requests), use the "extraSections" array field: [{"title": "Section Name", "content": "markdown content"}]. Content supports full markdown and mermaid diagrams (flowchart, sequence, timeline, etc.).
- MERMAID SYNTAX (MANDATORY): Node IDs must be ONLY letters or digits (A, B, C1, node1) — NO colons, dashes, dots, spaces, or any special characters in IDs. ALL display text goes inside brackets: A["Label with special:chars"], B{"Decision?"}. Edge labels use |label| syntax. Always use \`flowchart TD\` or \`flowchart LR\`, never \`graph\`. Example: \`flowchart TD\\n  A["Start"] --> B{"Check?"}\\n  B -->|Yes| C["Done"]\``;

    if (hasImages) {
      systemPrompt += `\n\nYou have multimodal capabilities — images from the page are attached to this conversation. You can analyze and reference them when answering questions or updating the summary.`;
      if (cachedImageUrls.length > 0) {
        const urlLines = cachedImageUrls.map((img, i) =>
          `${i + 1}. ${img.url}${img.alt ? ` — "${img.alt}"` : ''}`,
        );
        systemPrompt += `\n\nOriginal image URLs (use for ![alt](url) embeds in summary/responses):\n${urlLines.join('\n')}`;
      }
    }

    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Attach cached images to the first user message so the model has visual context
    if (hasImages) {
      const firstUserIdx = chatMessages.findIndex((m) => m.role === 'user');
      if (firstUserIdx >= 0) {
        chatMessages[firstUserIdx] = { ...chatMessages[firstUserIdx], images: cachedImages };
      }
    }

    const response = await provider.sendChat(chatMessages, { jsonMode: true });
    return { type: 'CHAT_RESPONSE', success: true, message: response };
  } catch (err) {
    return {
      type: 'CHAT_RESPONSE',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleExport(
  adapterId: string,
  summary: SummaryDocument,
  content: ExtractedContent,
  replacePageId?: string,
): Promise<ExportResultMessage> {
  try {
    if (adapterId !== 'notion') {
      throw new Error(`Unknown export adapter: ${adapterId}`);
    }

    const settings = await getSettings();
    if (!settings.notion.apiKey) {
      throw new Error('Please configure your Notion API key in Settings');
    }

    const { NotionAdapter } = await import('@/lib/export/notion');
    const adapter = new NotionAdapter(settings.notion);

    if (replacePageId) {
      await adapter.archivePage(replacePageId);
    }

    const result = await adapter.export(summary, content);

    if (result.databaseId && !settings.notion.databaseId) {
      await saveSettings({
        notion: { ...settings.notion, databaseId: result.databaseId },
      });
    }

    return { type: 'EXPORT_RESULT', success: true, url: result.url };
  } catch (err) {
    return {
      type: 'EXPORT_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleCheckNotionDuplicate(url: string): Promise<import('@/lib/messaging/types').CheckNotionDuplicateResultMessage> {
  try {
    const settings = await getSettings();
    if (!settings.notion.apiKey) {
      return { type: 'CHECK_NOTION_DUPLICATE_RESULT', success: true };
    }

    const { NotionAdapter } = await import('@/lib/export/notion');
    const adapter = new NotionAdapter(settings.notion);
    const dup = await adapter.findDuplicateByUrl(url);

    if (dup) {
      return {
        type: 'CHECK_NOTION_DUPLICATE_RESULT',
        success: true,
        duplicatePageId: dup.pageId,
        duplicatePageUrl: dup.pageUrl,
        duplicateTitle: dup.title,
      };
    }
    return { type: 'CHECK_NOTION_DUPLICATE_RESULT', success: true };
  } catch {
    // Non-blocking — fall through to normal export
    return { type: 'CHECK_NOTION_DUPLICATE_RESULT', success: true };
  }
}

async function handleTestLLMConnection(): Promise<ConnectionTestResultMessage> {
  try {
    const settings = await getSettings();
    const llmConfig = getActiveProviderConfig(settings);
    const provider = createProvider(llmConfig);
    // Call sendChat directly instead of testConnection() so errors propagate.
    // If sendChat doesn't throw, the connection works (even if response is empty
    // due to e.g. Gemini safety filters on trivial prompts).
    await provider.sendChat(
      [{ role: 'user', content: 'Reply with "ok"' }],
      { maxTokens: 10 },
    );

    // Probe vision capabilities
    const vision = await getModelVision(provider, llmConfig.providerId, llmConfig.model);

    return { type: 'CONNECTION_TEST_RESULT', success: true, visionSupport: vision };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Try to extract a readable message from JSON error responses
    const readable = extractApiError(raw);
    return {
      type: 'CONNECTION_TEST_RESULT',
      success: false,
      error: readable,
    };
  }
}

async function handleProbeVision(msg: import('@/lib/messaging/types').ProbeVisionMessage): Promise<Message> {
  try {
    const settings = await getSettings();
    // Use provided config (from unsaved UI state) or fall back to saved settings
    const llmConfig = msg.providerId && msg.model ? {
      providerId: msg.providerId,
      apiKey: msg.apiKey || '',
      model: msg.model,
      endpoint: msg.endpoint,
      contextWindow: 100000,
    } : getActiveProviderConfig(settings);
    if (!llmConfig.apiKey && llmConfig.providerId !== 'self-hosted') {
      return { type: 'PROBE_VISION_RESULT', success: false, error: 'No API key' } as Message;
    }
    const provider = createProvider(llmConfig);
    const vision = await getModelVision(provider, llmConfig.providerId, llmConfig.model);
    return { type: 'PROBE_VISION_RESULT', success: true, vision } as Message;
  } catch (err) {
    return { type: 'PROBE_VISION_RESULT', success: false, error: err instanceof Error ? err.message : String(err) } as Message;
  }
}

function extractApiError(raw: string): string {
  try {
    // Match JSON embedded in error strings like "API error (400): {...}"
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const msg = parsed.error?.message || parsed.message;
      if (msg) return msg;
    }
  } catch { /* not JSON */ }
  return raw;
}

async function handleTestNotionConnection(): Promise<ConnectionTestResultMessage> {
  try {
    const settings = await getSettings();
    if (!settings.notion.apiKey) throw new Error('Notion API key not configured');

    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${settings.notion.apiKey}`,
        'Notion-Version': '2022-06-28',
      },
    });

    return { type: 'CONNECTION_TEST_RESULT', success: response.ok };
  } catch (err) {
    return {
      type: 'CONNECTION_TEST_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleGetSettings(): Promise<SettingsResultMessage> {
  const settings = await getSettings();
  return { type: 'SETTINGS_RESULT', settings };
}

async function handleSaveSettings(partial: object): Promise<SaveSettingsResultMessage> {
  try {
    await saveSettings(partial);
    return { type: 'SAVE_SETTINGS_RESULT', success: true };
  } catch {
    return { type: 'SAVE_SETTINGS_RESULT', success: false };
  }
}

async function handleFetchNotionDatabases(): Promise<NotionDatabasesResultMessage> {
  try {
    const settings = await getSettings();
    if (!settings.notion.apiKey) throw new Error('Notion API key not configured');

    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.notion.apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'database', property: 'object' },
        page_size: 100,
      }),
    });

    if (!response.ok) throw new Error('Failed to fetch databases');

    const data = await response.json();
    const databases = data.results.map((db: Record<string, unknown>) => ({
      id: db.id,
      title: ((db.title as Array<{ plain_text: string }>)?.[0]?.plain_text) || 'Untitled',
    }));

    return { type: 'NOTION_DATABASES_RESULT', success: true, databases };
  } catch (err) {
    return {
      type: 'NOTION_DATABASES_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleFetchModels(
  providerId: string,
  apiKey: string,
  endpoint?: string,
): Promise<FetchModelsResultMessage> {
  try {
    const models = await fetchModels(providerId, apiKey, endpoint);
    // Cache results in storage
    const settings = await getSettings();
    await saveSettings({
      cachedModels: { ...settings.cachedModels, [providerId]: models },
    });
    return { type: 'FETCH_MODELS_RESULT', success: true, models };
  } catch (err) {
    return {
      type: 'FETCH_MODELS_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchGoogleDocText(docId: string): Promise<string> {
  // Background service worker can fetch cross-origin with cookies (host_permissions: <all_urls>)
  const url = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Google Docs export failed (${response.status}). The document may not be accessible.`);
    }
    const text = await response.text();
    if (!text.trim()) {
      throw new Error('Document appears to be empty.');
    }
    return text.trim();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Google Docs export timed out after 30s');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
