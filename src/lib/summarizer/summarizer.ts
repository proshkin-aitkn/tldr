import type { LLMProvider, ChatMessage, ImageContent } from '../llm/types';
import type { ExtractedContent } from '../extractors/types';
import type { SummaryDocument } from './types';
import type { FetchedImage } from '../images/fetcher';
import { chunkContent, type ChunkOptions } from './chunker';
import { parseJsonSafe } from '../json-repair';
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
  imageContents?: ImageContent[]; // URL mode — takes precedence over fetchedImages
}

export async function summarize(
  provider: LLMProvider,
  content: ExtractedContent,
  options: SummarizeOptions,
): Promise<SummaryDocument> {
  const { detailLevel, language, languageExcept, contextWindow, maxRetries = 2, userInstructions, fetchedImages, imageContents: directImageContents } = options;
  // Prefer pre-built imageContents (URL mode) over fetchedImages
  const imageContents: ImageContent[] | undefined = directImageContents || fetchedImages?.map((fi) => ({
    base64: fi.base64,
    mimeType: fi.mimeType,
  }));
  const hasImages = !!(imageContents?.length);
  let systemPrompt = getSystemPrompt(detailLevel, language, languageExcept, hasImages);
  if (userInstructions) {
    systemPrompt += `\n\nAdditional user instructions: ${userInstructions}`;
  }

  const chunkOptions: ChunkOptions = { contextWindow };
  const chunks = chunkContent(content.content, chunkOptions);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (chunks.length === 1) {
        return await oneShotSummarize(provider, content, systemPrompt, imageContents);
      } else {
        return await rollingContextSummarize(provider, content, chunks, systemPrompt, imageContents);
      }
    } catch (err) {
      // Don't retry if the LLM gave a text response, detected no content, or requested images — it won't change
      if (err instanceof LLMTextResponse || err instanceof NoContentError || err instanceof ImageRequestError) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
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
  images?: ImageContent[],
): Promise<SummaryDocument> {
  const userPrompt = getSummarizationPrompt(content);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt, images },
  ];

  const response = await provider.sendChat(messages, { maxTokens: 4096, jsonMode: true });
  return parseSummaryResponse(response, !!images?.length);
}

async function rollingContextSummarize(
  provider: LLMProvider,
  content: ExtractedContent,
  chunks: string[],
  systemPrompt: string,
  images?: ImageContent[],
): Promise<SummaryDocument> {
  let rollingSummary = '';

  for (let i = 0; i < chunks.length; i++) {
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
      userPrompt = getSummarizationPrompt(chunkContent);
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

    const response = await provider.sendChat(messages, { maxTokens: 4096, jsonMode: isLast });

    if (isLast) {
      return parseSummaryResponse(response, !!(i === 0 && images?.length));
    }

    // For intermediate chunks, use the response as rolling context
    rollingSummary = response;
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
  const parsed = parseJsonSafe(cleaned) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') {
    // LLM returned text instead of JSON — surface it as a chat message, not a broken summary
    throw new LLMTextResponse(cleaned);
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
