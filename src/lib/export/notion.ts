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
    if (!databaseId) {
      databaseId = await this.createDatabase();
    }

    // Ensure new columns exist on older databases
    await this.ensureProperties(databaseId, {
      'LLM Provider': { rich_text: {} },
      'LLM Model': { rich_text: {} },
    });

    // Build page properties
    const properties = this.buildProperties(summary, content);

    // Build page content blocks
    const children = this.buildContentBlocks(summary, content);

    // Create page
    const body: Record<string, unknown> = {
      parent: { database_id: databaseId },
      properties,
      children,
    };

    // Set YouTube thumbnail as cover image
    if (content.type === 'youtube' && content.thumbnailUrl) {
      body.cover = {
        type: 'external',
        external: { url: content.thumbnailUrl },
      };
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
    return { url: page.url, databaseId };
  }

  private async createDatabase(): Promise<string> {
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
      throw new Error('No pages found. Please share at least one page with your Notion integration.');
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
        : 'Web Page';

    const properties: Record<string, unknown> = {
      Title: {
        title: [{ text: { content: summary.translatedTitle || content.title } }],
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

  private buildContentBlocks(summary: SummaryDocument, content: ExtractedContent): unknown[] {
    const blocks: unknown[] = [];

    // YouTube thumbnail
    if (content.type === 'youtube' && content.thumbnailUrl) {
      blocks.push({
        object: 'block',
        type: 'image',
        image: { type: 'external', external: { url: content.thumbnailUrl } },
      });
    }

    // TL;DR section
    blocks.push(
      heading2('TL;DR'),
      paragraph(summary.tldr),
      divider(),
    );

    // Key Takeaways
    if (summary.keyTakeaways.length > 0) {
      blocks.push(heading2('Key Takeaways'));
      for (const point of summary.keyTakeaways) {
        blocks.push(bulletItem(point));
      }
      blocks.push(divider());
    }

    // Summary
    blocks.push(heading2('Summary'));
    const summaryBlocks = markdownToNotionBlocks(summary.summary);
    blocks.push(...summaryBlocks);
    blocks.push(divider());

    // Notable Quotes
    if (summary.notableQuotes.length > 0) {
      blocks.push(heading2('Notable Quotes'));
      for (const quote of summary.notableQuotes) {
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: { rich_text: [{ type: 'text', text: { content: `"${quote}"` } }] },
        });
      }
      blocks.push(divider());
    }

    // Pros and Cons
    if (summary.prosAndCons) {
      blocks.push(heading2('Pros & Cons'));
      blocks.push(heading3('Pros'));
      for (const pro of summary.prosAndCons.pros) {
        blocks.push(bulletItem(pro));
      }
      blocks.push(heading3('Cons'));
      for (const con of summary.prosAndCons.cons) {
        blocks.push(bulletItem(con));
      }
      blocks.push(divider());
    }

    // Comments Highlights
    if (summary.commentsHighlights && summary.commentsHighlights.length > 0) {
      blocks.push(heading2('Comment Highlights'));
      for (const highlight of summary.commentsHighlights) {
        blocks.push(bulletItem(highlight));
      }
      blocks.push(divider());
    }

    // Conclusion
    if (summary.conclusion) {
      blocks.push(heading2('Conclusion'));
      blocks.push(paragraph(summary.conclusion));
      blocks.push(divider());
    }

    // Extra sections (chat-added)
    if (summary.extraSections && summary.extraSections.length > 0) {
      for (const section of summary.extraSections) {
        blocks.push(heading2(section.title));
        blocks.push(...markdownToNotionBlocks(section.content));
        blocks.push(divider());
      }
    }

    // Related Topics
    if (summary.relatedTopics.length > 0) {
      blocks.push(heading2('Related Topics'));
      for (const topic of summary.relatedTopics) {
        blocks.push(bulletItem(topic));
      }
    }

    // "Created with" attribution
    blocks.push(
      divider(),
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

function heading2(text: string) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
  };
}

function heading3(text: string) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content: text } }] },
  };
}

function paragraph(text: string) {
  // Split if too long for Notion
  if (text.length <= 2000) {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
    };
  }

  // Return first 2000 chars — the rest gets truncated
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }],
    },
  };
}

function bulletItem(text: string) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }],
    },
  };
}

function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}
