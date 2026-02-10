import type { ExportAdapter, ExportResult } from './types';
import type { SummaryDocument } from '../summarizer/types';
import type { ExtractedContent } from '../extractors/types';
import type { NotionConfig } from '../storage/types';
import { markdownToNotionBlocks } from './markdown-to-notion';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/pikdhogjjbaakcpedmahckhmajdgdeon';

export class NotionAdapter implements ExportAdapter {
  readonly id = 'notion';
  readonly name = 'Notion';
  private config: NotionConfig;

  constructor(config: NotionConfig) {
    this.config = config;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.notionFetch('/users/me');
      return response.ok;
    } catch {
      return false;
    }
  }

  async findDuplicateByUrl(url: string): Promise<{ pageId: string; pageUrl: string; title: string } | null> {
    if (!this.config.databaseId) return null;

    const response = await this.notionFetch(`/databases/${this.config.databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: 'URL', url: { equals: url } },
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        page_size: 1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const page = data.results?.[0];
    if (!page) return null;

    const titleProp = page.properties?.Title?.title;
    const title = titleProp?.[0]?.plain_text || 'Untitled';
    return { pageId: page.id, pageUrl: page.url, title };
  }

  async archivePage(pageId: string): Promise<void> {
    await this.notionFetch(`/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
  }

  async export(summary: SummaryDocument, content: ExtractedContent): Promise<ExportResult> {
    // Ensure database exists
    let databaseId = this.config.databaseId;
    let databaseName = this.config.databaseName;
    if (!databaseId) {
      databaseId = await this.createDatabase();
      databaseName = 'TL;DR Summaries';
    }

    // Ensure new columns exist on older databases
    await this.ensureProperties(databaseId, {
      'LLM Provider': { rich_text: {} },
      'LLM Model': { rich_text: {} },
    });

    // Upload thumbnail to Notion if available
    let thumbnailRef: { type: 'file_upload'; file_upload: { id: string } } | { type: 'external'; external: { url: string } } | null = null;
    if (content.thumbnailUrl) {
      const uploadId = await this.uploadImageToNotion(content.thumbnailUrl);
      if (uploadId) {
        thumbnailRef = { type: 'file_upload', file_upload: { id: uploadId } };
      } else if (content.type !== 'facebook') {
        // Fallback to external URL for non-Facebook (public URLs)
        thumbnailRef = { type: 'external', external: { url: content.thumbnailUrl } };
      }
    }

    // Build page properties
    const properties = this.buildProperties(summary, content);

    // Build page content blocks
    const children = this.buildContentBlocks(summary, content, thumbnailRef);

    // Create page
    const body: Record<string, unknown> = {
      parent: { database_id: databaseId },
      properties,
      children,
    };

    // Set thumbnail as cover image
    if (thumbnailRef) {
      body.cover = thumbnailRef;
    }

    const response = await this.notionFetch('/pages', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Notion API error (${response.status}): ${errorData}`);
    }

    const page = await response.json();
    return { url: page.url, databaseId, databaseName };
  }

  async createDatabase(): Promise<string> {
    // First, find a page to use as parent (search for pages the integration has access to)
    const searchResponse = await this.notionFetch('/search', {
      method: 'POST',
      body: JSON.stringify({
        filter: { value: 'page', property: 'object' },
        page_size: 1,
      }),
    });

    if (!searchResponse.ok) throw new Error('Failed to search for parent page');

    const searchData = await searchResponse.json();
    const parentPage = searchData.results?.[0];
    if (!parentPage) {
      throw new Error('No pages shared with your Notion integration. Open Notion, go to a page (or create one, e.g. "TL;DR"), click "..." (top-right) → "Connections" → add your integration. Then retry.');
    }

    const response = await this.notionFetch('/databases', {
      method: 'POST',
      body: JSON.stringify({
        parent: { page_id: parentPage.id },
        title: [{ type: 'text', text: { content: 'TL;DR Summaries' } }],
        properties: {
          Title: { title: {} },
          URL: { url: {} },
          Author: { rich_text: {} },
          'Source Type': {
            select: {
              options: [
                { name: 'YouTube Video', color: 'red' },
                { name: 'Article', color: 'green' },
                { name: 'Facebook Post', color: 'blue' },
                { name: 'Reddit Discussion', color: 'orange' },
                { name: 'X Thread', color: 'default' },
                { name: 'Web Page', color: 'gray' },
              ],
            },
          },
          'Publish Date': { date: {} },
          'Captured At': { date: {} },
          Duration: { rich_text: {} },
          Language: {
            select: {
              options: [
                { name: 'en', color: 'blue' },
                { name: 'es', color: 'yellow' },
                { name: 'fr', color: 'purple' },
                { name: 'de', color: 'orange' },
              ],
            },
          },
          Tags: { multi_select: {} },
          'Reading Time': { number: {} },
          'LLM Provider': { rich_text: {} },
          'LLM Model': { rich_text: {} },
          Status: {
            select: {
              options: [
                { name: 'New', color: 'blue' },
                { name: 'Read', color: 'green' },
                { name: 'Archived', color: 'gray' },
              ],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to create database: ${errorData}`);
    }

    const db = await response.json();
    return db.id;
  }

  /** Add missing properties to an existing database (no-op for properties that already exist). */
  private async ensureProperties(databaseId: string, required: Record<string, unknown>): Promise<void> {
    const resp = await this.notionFetch(`/databases/${databaseId}`);
    if (!resp.ok) return; // best-effort — don't block export

    const db = await resp.json();
    const existing = db.properties as Record<string, unknown> | undefined;
    const missing: Record<string, unknown> = {};
    for (const key of Object.keys(required)) {
      if (!existing?.[key]) missing[key] = required[key];
    }
    if (Object.keys(missing).length === 0) return;

    await this.notionFetch(`/databases/${databaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: missing }),
    });
  }

  private buildProperties(summary: SummaryDocument, content: ExtractedContent): Record<string, unknown> {
    const sourceType = content.type === 'youtube'
      ? 'YouTube Video'
      : content.type === 'article'
        ? 'Article'
        : content.type === 'facebook'
          ? 'Facebook Post'
          : content.type === 'reddit'
            ? 'Reddit Discussion'
            : content.type === 'twitter'
              ? 'X Thread'
              : 'Web Page';

    const properties: Record<string, unknown> = {
      Title: {
        title: [{ text: { content: summary.translatedTitle || content.title || summary.inferredTitle || 'Untitled' } }],
      },
      URL: { url: content.url },
      'Source Type': { select: { name: sourceType } },
      'Captured At': { date: { start: new Date().toISOString() } },
      Status: { select: { name: 'New' } },
      'Reading Time': { number: content.estimatedReadingTime },
    };

    const author = content.author || summary.inferredAuthor;
    if (author) {
      properties.Author = {
        rich_text: [{ text: { content: author } }],
      };
    }

    const publishDate = content.publishDate || summary.inferredPublishDate;
    if (publishDate) {
      try {
        const date = new Date(publishDate);
        if (!isNaN(date.getTime())) {
          properties['Publish Date'] = { date: { start: date.toISOString().split('T')[0] } };
        }
      } catch {
        // skip invalid date
      }
    }

    if (content.duration) {
      properties.Duration = {
        rich_text: [{ text: { content: content.duration } }],
      };
    }

    if (content.language) {
      properties.Language = { select: { name: content.language } };
    }

    if (summary.tags.length > 0) {
      properties.Tags = {
        multi_select: summary.tags.map((tag) => ({ name: tag })),
      };
    }

    if (summary.llmProvider) {
      properties['LLM Provider'] = {
        rich_text: [{ text: { content: summary.llmProvider } }],
      };
    }

    if (summary.llmModel) {
      properties['LLM Model'] = {
        rich_text: [{ text: { content: summary.llmModel } }],
      };
    }

    return properties;
  }

  /** Upload an image to Notion's file storage. Returns the upload ID, or null on failure. */
  private async uploadImageToNotion(imageUrl: string): Promise<string | null> {
    try {
      // Fetch the image (background service worker has host_permissions for all URLs)
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) return null;
      const blob = await imgResponse.blob();
      if (blob.size === 0 || blob.size > 20 * 1024 * 1024) return null;

      // Step 1: Create file upload object
      const createResp = await this.notionFetch('/file_uploads', { method: 'POST', body: '{}' });
      if (!createResp.ok) return null;
      const { id: uploadId } = await createResp.json() as { id: string };

      // Step 2: Send file contents as multipart/form-data
      const form = new FormData();
      const ext = blob.type.split('/')[1] || 'jpg';
      form.append('file', blob, `thumbnail.${ext}`);

      const sendResp = await fetch(`${NOTION_API}/file_uploads/${uploadId}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Notion-Version': NOTION_VERSION,
          // Note: do NOT set Content-Type — browser sets it with boundary for FormData
        },
        body: form,
      });
      if (!sendResp.ok) return null;

      return uploadId;
    } catch {
      return null; // Non-fatal — export continues without thumbnail
    }
  }

  private buildContentBlocks(summary: SummaryDocument, content: ExtractedContent, thumbnailRef?: { type: string; [key: string]: unknown } | null): unknown[] {
    // Build the entire page as markdown, then parse uniformly
    const sections: string[] = [];

    sections.push('## TL;DR\n\n' + summary.tldr);

    if (summary.keyTakeaways.length > 0) {
      sections.push('## Key Takeaways\n\n' + summary.keyTakeaways.map((t, i) => `${i + 1}. ${t}`).join('\n'));
    }

    sections.push('## Summary\n\n' + summary.summary);

    if (summary.notableQuotes.length > 0) {
      sections.push('## Notable Quotes\n\n' + summary.notableQuotes.map((q) => `> "${q}"`).join('\n\n'));
    }

    if (summary.prosAndCons) {
      let pc = '## Pros & Cons\n\n### Pros\n\n';
      pc += summary.prosAndCons.pros.map((p) => `- ${p}`).join('\n');
      pc += '\n\n### Cons\n\n';
      pc += summary.prosAndCons.cons.map((c) => `- ${c}`).join('\n');
      sections.push(pc);
    }

    if (summary.factCheck) {
      sections.push('## Fact Check\n\n' + summary.factCheck);
    }

    if (summary.commentsHighlights && summary.commentsHighlights.length > 0) {
      sections.push('## Comment Highlights\n\n' + summary.commentsHighlights.map((h) => `- ${h}`).join('\n'));
    }

    if (summary.conclusion) {
      sections.push('## Conclusion\n\n' + summary.conclusion);
    }

    if (summary.extraSections && summary.extraSections.length > 0) {
      for (const section of summary.extraSections) {
        sections.push(`## ${section.title}\n\n${section.content}`);
      }
    }

    if (summary.relatedTopics.length > 0) {
      sections.push('## Related Topics\n\n' + summary.relatedTopics.map((t) => `- ${t}`).join('\n'));
    }

    // Parse all content through one markdown pipeline
    const blocks: unknown[] = [];

    if (thumbnailRef) {
      blocks.push({ object: 'block', type: 'image', image: thumbnailRef });
    }

    const contentBlocks = markdownToNotionBlocks(sections.join('\n\n---\n\n'));
    blocks.push(...contentBlocks);

    // "Created with" attribution
    blocks.push(
      { object: 'block', type: 'divider', divider: {} },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: 'Created with ' } },
            {
              type: 'text',
              text: { content: 'TL;DR', link: { url: CHROME_STORE_URL } },
              annotations: { bold: true },
            },
            { type: 'text', text: { content: ' — AI-powered summaries for Chrome' } },
          ],
        },
      },
    );

    // Notion API limits children to 100 blocks per request
    return blocks.slice(0, 100);
  }

  private async notionFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> || {}),
      },
    });
  }
}

