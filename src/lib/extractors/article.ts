import { Readability, isProbablyReaderable } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import type { ContentExtractor, ExtractedContent } from './types';
import { extractRichImages, pickThumbnail } from './image-utils';
import { refineTitleIfGeneric } from './title-utils';

export const articleExtractor: ContentExtractor = {
  canExtract(_url: string, doc: Document): boolean {
    return isProbablyReaderable(doc);
  },

  extract(url: string, doc: Document): ExtractedContent {
    const clonedDoc = doc.cloneNode(true) as Document;
    const reader = new Readability(clonedDoc);
    const article = reader.parse();

    if (!article) {
      throw new Error('Failed to parse article content');
    }

    const language =
      doc.documentElement.lang ||
      doc.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content') ||
      undefined;

    const publishDate =
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
      undefined;

    const author =
      article.byline ||
      doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
      undefined;

    // Convert HTML content to simple markdown
    const content = htmlToMarkdown(article.content);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    // Extract image URLs
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = DOMPurify.sanitize(article.content);
    const images = Array.from(tempDiv.querySelectorAll('img'))
      .map((img) => img.src)
      .filter(Boolean);
    const richImages = extractRichImages(tempDiv);

    // Hero image: og:image, twitter:image, or best article image (skip tiny icons)
    const thumbnailUrl =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      pickThumbnail(tempDiv, images) ||
      undefined;

    return {
      type: 'article',
      url,
      title: refineTitleIfGeneric(article.title, doc, url),
      author,
      publishDate,
      language,
      content,
      wordCount,
      estimatedReadingTime: Math.ceil(wordCount / 200),
      thumbnailUrl,
      images,
      richImages,
    };
  },
};

function htmlToMarkdown(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = DOMPurify.sanitize(html);

  let md = '';

  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const children = Array.from(el.childNodes).map(processNode).join('');

    switch (tag) {
      case 'h1':
        return `\n# ${children}\n`;
      case 'h2':
        return `\n## ${children}\n`;
      case 'h3':
        return `\n### ${children}\n`;
      case 'h4':
        return `\n#### ${children}\n`;
      case 'h5':
        return `\n##### ${children}\n`;
      case 'h6':
        return `\n###### ${children}\n`;
      case 'p':
        return `\n${children}\n`;
      case 'br':
        return '\n';
      case 'strong':
      case 'b':
        return `**${children}**`;
      case 'em':
      case 'i':
        return `*${children}*`;
      case 'a': {
        const href = el.getAttribute('href');
        return href ? `[${children}](${href})` : children;
      }
      case 'ul':
        return `\n${children}\n`;
      case 'ol':
        return `\n${children}\n`;
      case 'li': {
        const parent = el.parentElement;
        if (parent?.tagName.toLowerCase() === 'ol') {
          const index = Array.from(parent.children).indexOf(el) + 1;
          return `${index}. ${children}\n`;
        }
        return `- ${children}\n`;
      }
      case 'blockquote':
        return `\n> ${children.trim().replace(/\n/g, '\n> ')}\n`;
      case 'code':
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return children;
        }
        return `\`${children}\``;
      case 'pre':
        return `\n\`\`\`\n${children}\n\`\`\`\n`;
      case 'img': {
        const src = el.getAttribute('src');
        const alt = el.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
      }
      case 'hr':
        return '\n---\n';
      case 'figure':
        return `\n${children}\n`;
      case 'figcaption':
        return `\n*${children.trim()}*\n`;
      case 'div':
      case 'section':
      case 'article':
      case 'main':
      case 'span':
        return children;
      default:
        return children;
    }
  }

  md = processNode(div);

  // Clean up excessive whitespace
  return md.replace(/\n{3,}/g, '\n\n').trim();
}
