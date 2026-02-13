import type { LLMProvider, ChatMessage, ImageContent } from '../llm/types';
import type { ExtractedContent } from '../extractors/types';
import { coerceExtraSections, type SummaryDocument } from './types';
import type { FetchedImage } from '../images/fetcher';
import { chunkContent, type ChunkOptions } from './chunker';
import { parseJsonSafe, findMatchingBrace } from '../json-repair';
import {
  getSystemPrompt,
  getSummarizationPrompt,
  getRollingContextPrompt,
  getFinalChunkPrompt,
} from './prompts';

/** Thrown when the LLM returns a text response instead of structured JSON (e.g. refusal). Not retryable. */
export class LLMTextResponse extends Error {
  constructor(public readonly llmResponse: string) {
    super(llmResponse);
    this.name = 'LLMTextResponse';
  }
}

/** Thrown when the LLM detects no meaningful content to summarize. Not retryable. */
export class NoContentError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'NoContentError';
  }
}

/** Thrown when the LLM requests specific images for analysis. Caught by background orchestrator. */
export class ImageRequestError extends Error {
  constructor(public readonly requestedImages: string[]) {
    super('LLM requested additional images');
    this.name = 'ImageRequestError';
  }
}

export interface SummarizeOptions {
  detailLevel: 'brief' | 'standard' | 'detailed';
  language: string;
  languageExcept?: string[];
  contextWindow: number;
  maxRetries?: number;
  userInstructions?: string;
  fetchedImages?: FetchedImage[];
  imageUrlList?: { url: string; alt: string }[];
  signal?: AbortSignal;
  /** Called with each raw LLM response string (for debug panel). */
  onRawResponse?: (response: string) => void;
  /** Called with the final system prompt (for debug panel). */
  onSystemPrompt?: (prompt: string) => void;
  /** Called with the full conversation messages before each LLM call (for debug panel). */
  onConversation?: (messages: ChatMessage[]) => void;
  /** Called with the rolling summary text when chunked summarization is used (for debug panel). */
  onRollingSummary?: (summary: string) => void;
}

/** Build the full system prompt for summarization (includes skill catalog when appropriate). */
export function buildSummarizationSystemPrompt(
  detailLevel: 'brief' | 'standard' | 'detailed',
  language: string,
  languageExcept: string[] | undefined,
  hasImages: boolean,
  wordCount: number,
  contentType?: string,
  githubPageType?: string,
  userInstructions?: string,
): string {
  let systemPrompt = getSystemPrompt(detailLevel, language, languageExcept, hasImages, wordCount, contentType, githubPageType);

  if (userInstructions) {
    systemPrompt += `\n\nAdditional user instructions (HIGHEST PRIORITY — these override any prior rules or guidelines above): ${userInstructions}`;
  }

  return systemPrompt;
}

export async function summarize(
  provider: LLMProvider,
  content: ExtractedContent,
  options: SummarizeOptions,
): Promise<SummaryDocument> {
  const { detailLevel, language, languageExcept, contextWindow, maxRetries = 2, userInstructions, fetchedImages, imageUrlList, signal, onRawResponse, onSystemPrompt, onConversation, onRollingSummary } = options;
  const imageContents: ImageContent[] | undefined = fetchedImages?.map((fi) => ({
    base64: fi.base64,
    mimeType: fi.mimeType,
  }));
  const hasImages = !!(imageContents?.length);
  const systemPrompt = buildSummarizationSystemPrompt(detailLevel, language, languageExcept, hasImages, content.wordCount, content.type, content.githubPageType, userInstructions);

  onSystemPrompt?.(systemPrompt);

  const chunkOptions: ChunkOptions = { contextWindow };
  const chunks = chunkContent(content.content, chunkOptions);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('Summarization cancelled');
    try {
      if (chunks.length === 1) {
        return await oneShotSummarize(provider, content, systemPrompt, detailLevel, imageContents, imageUrlList, signal, onRawResponse, onConversation);
      } else {
        return await rollingContextSummarize(provider, content, chunks, systemPrompt, detailLevel, imageContents, imageUrlList, signal, onRawResponse, onConversation, onRollingSummary);
      }
    } catch (err) {
      // Don't retry cancellation, text responses, no-content, or image requests
      if (err instanceof LLMTextResponse || err instanceof NoContentError || err instanceof ImageRequestError) throw err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg === 'Summarization cancelled') throw err;
      lastError = err instanceof Error ? err : new Error(errMsg);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('Summarization failed');
}

async function oneShotSummarize(
  provider: LLMProvider,
  content: ExtractedContent,
  systemPrompt: string,
  detailLevel: 'brief' | 'standard' | 'detailed',
  images?: ImageContent[],
  imageUrlList?: { url: string; alt: string }[],
  signal?: AbortSignal,
  onRawResponse?: (response: string) => void,
  onConversation?: (messages: ChatMessage[]) => void,
): Promise<SummaryDocument> {
  let userPrompt = getSummarizationPrompt(content, detailLevel);
  if (images?.length && imageUrlList?.length) {
    userPrompt += formatImageUrlListing(imageUrlList);
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt, images },
  ];

  onConversation?.(messages);
  const response = await provider.sendChat(messages, { maxTokens: 8192, jsonMode: true, signal });
  onRawResponse?.(response);
  return replacePlaceholders(parseSummaryResponse(response, !!images?.length), buildPlaceholders(content, imageUrlList));
}

async function rollingContextSummarize(
  provider: LLMProvider,
  content: ExtractedContent,
  chunks: string[],
  systemPrompt: string,
  detailLevel: 'brief' | 'standard' | 'detailed',
  images?: ImageContent[],
  imageUrlList?: { url: string; alt: string }[],
  signal?: AbortSignal,
  onRawResponse?: (response: string) => void,
  onConversation?: (messages: ChatMessage[]) => void,
  onRollingSummary?: (summary: string) => void,
): Promise<SummaryDocument> {
  let rollingSummary = '';

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new Error('Summarization cancelled');
    const isLast = i === chunks.length - 1;

    // Build a modified content object with just this chunk
    const chunkContent: ExtractedContent = {
      ...content,
      content: chunks[i],
      // Only include comments in the last chunk
      comments: isLast ? content.comments : undefined,
    };

    let userPrompt = '';

    if (i === 0) {
      userPrompt = getSummarizationPrompt(chunkContent, detailLevel);
      if (images?.length && imageUrlList?.length) {
        userPrompt += formatImageUrlListing(imageUrlList);
      }
    } else {
      userPrompt = getRollingContextPrompt(rollingSummary) + '\n\n';
      if (isLast) {
        userPrompt += getFinalChunkPrompt() + '\n\n';
      }
      userPrompt += `**Content (part ${i + 1} of ${chunks.length}):**\n\n${chunks[i]}`;

      if (isLast && content.comments && content.comments.length > 0) {
        userPrompt += `\n\n**User Comments:**\n\n`;
        for (const comment of content.comments.slice(0, 20)) {
          const author = comment.author ? `**${comment.author}**` : 'Anonymous';
          userPrompt += `- ${author}: ${comment.text}\n`;
        }
      }
    }

    // Attach images only to the first chunk (token budget)
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt, images: i === 0 ? images : undefined },
    ];

    onConversation?.(messages);
    const response = await provider.sendChat(messages, { maxTokens: 8192, jsonMode: isLast, signal });
    onRawResponse?.(response);

    if (isLast) {
      return replacePlaceholders(parseSummaryResponse(response, !!(i === 0 && images?.length)), buildPlaceholders(content, imageUrlList));
    }

    // For intermediate chunks, use the response as rolling context
    rollingSummary = response;
    onRollingSummary?.(rollingSummary);
  }

  throw new Error('No chunks to process');
}

function parseSummaryResponse(response: string, imageAnalysisEnabled = false): SummaryDocument {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // Try standard JSON.parse first, then fall back to repair for broken LLM output
  let parsed = parseJsonSafe(cleaned) as Record<string, unknown> | null;

  // If full-text parse failed, try to extract JSON embedded in surrounding text
  if (!parsed || typeof parsed !== 'object') {
    const braceIdx = cleaned.indexOf('{');
    if (braceIdx > 0) {
      const braceEnd = findMatchingBrace(cleaned, braceIdx);
      if (braceEnd !== -1) {
        parsed = parseJsonSafe(cleaned.slice(braceIdx, braceEnd + 1)) as Record<string, unknown> | null;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    // LLM returned text instead of JSON — surface it as a chat message, not a broken summary
    throw new LLMTextResponse(cleaned);
  }

  // LLM respected "don't summarize" request — surface the message as a chat response
  if (parsed.noSummary) {
    throw new LLMTextResponse((parsed.message as string) || 'OK, feel free to ask questions about the content.');
  }

  if (parsed.noContent) {
    throw new NoContentError((parsed.reason as string) || 'No meaningful content found on this page.');
  }
  // Check if LLM is requesting additional images for analysis
  if (imageAnalysisEnabled && Array.isArray(parsed.requestedImages) && parsed.requestedImages.length > 0) {
    throw new ImageRequestError(parsed.requestedImages as string[]);
  }
  const pc = parsed.prosAndCons as Record<string, unknown> | undefined;
  return {
    tldr: (parsed.tldr as string) || '',
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
    summary: (parsed.summary as string) || '',
    notableQuotes: Array.isArray(parsed.notableQuotes) ? parsed.notableQuotes : [],
    conclusion: (parsed.conclusion as string) || '',
    prosAndCons: pc ? { pros: Array.isArray(pc.pros) ? pc.pros : [], cons: Array.isArray(pc.cons) ? pc.cons : [] } : undefined,
    factCheck: typeof parsed.factCheck === 'string' ? parsed.factCheck : undefined,
    commentsHighlights: Array.isArray(parsed.commentsHighlights) ? parsed.commentsHighlights : undefined,
    extraSections: coerceExtraSections(parsed.extraSections),
    relatedTopics: Array.isArray(parsed.relatedTopics) ? parsed.relatedTopics : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    sourceLanguage: (parsed.sourceLanguage as string) || undefined,
    summaryLanguage: (parsed.summaryLanguage as string) || undefined,
    translatedTitle: (parsed.translatedTitle as string) || undefined,
    inferredTitle: (parsed.inferredTitle as string) || undefined,
    inferredAuthor: (parsed.inferredAuthor as string) || undefined,
    inferredPublishDate: (parsed.inferredPublishDate as string) || undefined,
  };
}

function formatImageUrlListing(imageUrlList: { url: string; alt: string }[]): string {
  const lines = imageUrlList.map((img, i) =>
    `${i + 1}. {{IMG_${i + 1}}}${img.alt ? ` — "${img.alt}"` : ''}`,
  );
  return `\n\n**Attached images (use placeholder IDs for embeds, e.g. ![alt]({{IMG_1}})):**\n${lines.join('\n')}`;
}

/** Replace {{PLACEHOLDER}} tokens with actual URLs in all text fields of the summary. */
export function replacePlaceholders(doc: SummaryDocument, replacements: [string, string][]): SummaryDocument {
  if (replacements.length === 0) return doc;

  const r = (s: string): string => {
    let result = s;
    for (const [placeholder, url] of replacements) {
      result = result.replaceAll(placeholder, url);
    }
    return result;
  };
  const ra = (arr: string[]): string[] => arr.map(r);

  return {
    ...doc,
    tldr: r(doc.tldr),
    summary: r(doc.summary),
    conclusion: r(doc.conclusion),
    keyTakeaways: ra(doc.keyTakeaways),
    notableQuotes: ra(doc.notableQuotes),
    relatedTopics: ra(doc.relatedTopics),
    factCheck: doc.factCheck ? r(doc.factCheck) : undefined,
    commentsHighlights: doc.commentsHighlights ? ra(doc.commentsHighlights) : undefined,
    prosAndCons: doc.prosAndCons ? { pros: ra(doc.prosAndCons.pros), cons: ra(doc.prosAndCons.cons) } : undefined,
    extraSections: doc.extraSections
      ? Object.fromEntries(Object.entries(doc.extraSections).map(([title, content]) => [r(title), r(content)]))
      : undefined,
  };
}

export function buildPlaceholders(content: ExtractedContent, imageUrlList?: { url: string; alt: string }[]): [string, string][] {
  const replacements: [string, string][] = [];
  if (imageUrlList?.length) {
    imageUrlList.forEach((img, i) => replacements.push([`{{IMG_${i + 1}}}`, img.url]));
  }
  if (content.type === 'youtube') {
    const cleanUrl = content.url.replace(/[&?]t=\d+s?/g, '');
    replacements.push(['{{VIDEO_URL}}', cleanUrl]);
  }
  // GitHub file references
  if (content.type === 'github') {
    const fileMapMatch = content.content.match(/<!-- FILE_MAP: ({.*?}) -->/);
    if (fileMapMatch) {
      try {
        const fileMap = JSON.parse(fileMapMatch[1]) as Record<string, string>;
        for (const [n, url] of Object.entries(fileMap)) {
          replacements.push([`{{FILE_${n}}}`, url]);
        }
      } catch { /* skip malformed */ }
    }
  }
  return replacements;
}
