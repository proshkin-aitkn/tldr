import type { ExtractedComment } from './types';

export function extractComments(doc: Document, url: string): ExtractedComment[] {
  // Facebook comments are handled by the async loader in content/index.ts
  if (/facebook\.com/.test(url)) return [];
  // Reddit comments come from background JSON fetch
  if (/reddit\.com/.test(url)) return [];
  // X replies are extracted by the X extractor
  if (/(?:twitter|x)\.com/.test(url)) return [];
  // GitHub comments are embedded by the GitHub extractor
  if (/github\.com/.test(url)) return [];

  if (/youtube\.com|youtu\.be/.test(url)) {
    return extractYouTubeComments(doc);
  }
  return extractGenericComments(doc);
}

function extractYouTubeComments(doc: Document): ExtractedComment[] {
  const comments: ExtractedComment[] = [];

  // YouTube renders comments dynamically; try to grab what's in the DOM
  const commentRenderers = doc.querySelectorAll('ytd-comment-renderer, ytd-comment-view-model');
  for (const renderer of commentRenderers) {
    const author =
      renderer.querySelector('#author-text')?.textContent?.trim() ||
      renderer.querySelector('.author-text')?.textContent?.trim() ||
      undefined;

    const text =
      renderer.querySelector('#content-text')?.textContent?.trim() ||
      renderer.querySelector('.comment-text')?.textContent?.trim() ||
      '';

    const likesEl = renderer.querySelector('#vote-count-middle, .vote-count');
    const likesText = likesEl?.textContent?.trim() || '';
    const likes = parseLikeCount(likesText);

    if (text) {
      comments.push({ author, text, likes });
    }
  }

  return comments;
}

function extractGenericComments(doc: Document): ExtractedComment[] {
  const comments: ExtractedComment[] = [];

  // Heuristic selectors for common comment patterns
  const selectors = [
    // Disqus
    '.post-message',
    // WordPress
    '.comment-content',
    '.comment-body',
    // Generic
    '[data-comment]',
    '[class*="comment-text"]',
    '[class*="comment-body"]',
    '[class*="comment-content"]',
    '.comment p',
    '#comments .text',
  ];

  // Try to find a comment section container
  const commentSection =
    doc.querySelector('#comments') ||
    doc.querySelector('[class*="comments"]') ||
    doc.querySelector('[id*="comments"]') ||
    doc.querySelector('.discussion');

  const searchRoot = commentSection || doc;

  for (const selector of selectors) {
    const elements = searchRoot.querySelectorAll(selector);
    if (elements.length === 0) continue;

    for (const el of elements) {
      const text = el.textContent?.trim() || '';
      if (text.length < 5) continue;

      // Try to find author near this comment
      const parent = el.closest('[class*="comment"]') || el.parentElement;
      const authorEl =
        parent?.querySelector('[class*="author"]') ||
        parent?.querySelector('[class*="username"]') ||
        parent?.querySelector('[class*="user-name"]') ||
        parent?.querySelector('a[rel="author"]');

      const author = authorEl?.textContent?.trim() || undefined;

      comments.push({ author, text });
    }

    if (comments.length > 0) break; // use first selector that matches
  }

  // Deduplicate by text
  const seen = new Set<string>();
  return comments.filter((c) => {
    if (seen.has(c.text)) return false;
    seen.add(c.text);
    return true;
  });
}

function parseLikeCount(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[,\s]/g, '');
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)K$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^(\d+(?:\.\d+)?)M$/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  return undefined;
}
