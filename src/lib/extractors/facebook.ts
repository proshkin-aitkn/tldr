import type { ContentExtractor, ExtractedComment, ExtractedContent } from './types';

const FB_POST_URL_RE =
  /facebook\.com\/(photo[./]|permalink\.php|story\.php|watch\/?\?|reel\/|.+\/(posts|videos)\/)/;

/** Detect a single-post modal overlay (opened from feed/profile). */
function findPostModal(doc: Document): Element | null {
  // Facebook post modals have a heading ending with "'s Post"
  const headings = doc.querySelectorAll('h2');
  for (const h of headings) {
    if (/'.?s Post$/.test(h.textContent?.trim() || '')) {
      // Walk up to find the scrollable modal container
      let el: Element | null = h;
      while (el) {
        if (
          el.getAttribute('role') === 'dialog' ||
          el.getAttribute('role') === 'complementary' ||
          (el instanceof HTMLElement &&
            (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 50)
        ) {
          return el;
        }
        el = el.parentElement;
      }
      // If no scrollable ancestor, return heading's nearest container
      return h.parentElement;
    }
  }
  return null;
}

/** Check if the current context is a Facebook post (URL-based or modal). */
export function isFacebookPostContext(url: string, doc: Document): boolean {
  if (!/(^|\.)facebook\.com$/.test(new URL(url).hostname)) return false;
  return FB_POST_URL_RE.test(url) || findPostModal(doc) !== null;
}

export const facebookExtractor: ContentExtractor = {
  canExtract(url: string, doc: Document): boolean {
    return isFacebookPostContext(url, doc);
  },

  extract(url: string, doc: Document): ExtractedContent {
    // Scope extraction to the post modal if present (feed overlay case)
    const modal = findPostModal(doc);

    // Click "See more" on main post to reveal full text
    clickSeeMoreOnPost(doc, modal);

    const scope = modal || doc;
    const permalink = extractPermalink(url, scope);
    const author = extractAuthor(doc, scope);
    const postText = extractPostText(doc, scope);
    const images = extractImages(scope);
    const postMedia = extractPostMediaUrls(scope);
    const { reactions, commentCount, shareCount } = extractMetadata(scope);

    let content = '';
    if (author) content += `# Post by ${author}\n\n`;
    if (postText) content += `${postText}\n\n`;
    if (reactions || commentCount || shareCount) {
      const parts: string[] = [];
      if (reactions) parts.push(reactions);
      if (commentCount) parts.push(`${commentCount} comments`);
      if (shareCount) parts.push(`${shareCount} shares`);
      content += `---\n${parts.join(' | ')}\n`;
    }

    // Leave title empty so the LLM infers a meaningful one from the content
    const title = '';
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    return {
      type: 'facebook',
      url: permalink,
      title,
      author: author || undefined,
      language: doc.documentElement.lang || undefined,
      content,
      wordCount,
      estimatedReadingTime: Math.ceil(wordCount / 200),
      thumbnailUrl: postMedia[0] || undefined,
      thumbnailUrls: postMedia.length > 1 ? postMedia.slice(0, 4) : undefined,
      images: images.length > 0 ? images : undefined,
    };
  },
};

/** Extract the direct permalink for the post, stripping tracking params. */
function extractPermalink(pageUrl: string, scope: Element | Document): string {
  // If the page URL already looks like a post permalink, clean and return it
  if (FB_POST_URL_RE.test(pageUrl)) {
    return cleanFacebookUrl(pageUrl);
  }

  // Modal case: look for links pointing to the post
  const links = scope.querySelectorAll('a[href]');

  // First pass: links NOT inside comment articles (post's own timestamp link)
  for (const link of links) {
    const article = link.closest('[role="article"]');
    if (article) {
      const label = article.getAttribute('aria-label') || '';
      if (label.startsWith('Comment by') || label.startsWith('Reply by')) continue;
    }
    const href = link.getAttribute('href') || '';
    if (FB_POST_URL_RE.test(href)) {
      try { return cleanFacebookUrl(new URL(href, pageUrl).href); } catch { /* skip */ }
    }
  }

  // Second pass: any link (including comment timestamps), strip comment_id
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    if (FB_POST_URL_RE.test(href)) {
      try { return cleanFacebookUrl(new URL(href, pageUrl).href); } catch { /* skip */ }
    }
  }

  return pageUrl;
}

/** Remove Facebook tracking params and comment_id from a URL. */
function cleanFacebookUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Remove all __* tracking params and comment_id
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('__') || key === 'comment_id') u.searchParams.delete(key);
    }
    u.hash = '';
    return u.href;
  } catch {
    return raw;
  }
}

function clickSeeMoreOnPost(doc: Document, scope: Element | null): void {
  const root = scope || doc;
  // The post's "See more" button is inside the story message container
  const storyMsg = root.querySelector('[data-ad-rendering-role="story_message"]');
  if (storyMsg) {
    const seeMore = findButtonByText(storyMsg, /^See more$/);
    if (seeMore) (seeMore as HTMLElement).click();
  }
  // Also try outside the story_message container (photo view / modal variant)
  const buttons = root.querySelectorAll('[role="button"]');
  for (const btn of buttons) {
    if (btn.textContent?.trim() === 'See more' && !btn.closest('[role="article"]')) {
      (btn as HTMLElement).click();
      break;
    }
  }
}

function extractAuthor(doc: Document, scope: Element | Document): string | null {
  // Title pattern: "(N) Post text... - AuthorName | Facebook"
  const titleText = doc.title || '';
  const titleMatch = titleText.match(/\s-\s(.+?)\s*\|\s*Facebook\s*$/);
  if (titleMatch) return titleMatch[1].trim();

  // Modal heading: "Jason A. Cochran's Post" → extract author name
  const headings = scope.querySelectorAll('h2');
  for (const h of headings) {
    const hText = h.textContent?.trim() || '';
    const headingMatch = hText.match(/^(.+?)(?:'s|'s)\s+Post$/);
    if (headingMatch) return headingMatch[1].trim();
  }

  // Fallback: first profile link in the scope
  const links = scope.querySelectorAll('a');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    if (href.includes('facebook.com/') && !href.includes('/posts/') && !href.includes('/photo')) {
      const text = link.textContent?.trim();
      if (text && text.length > 1 && text.length < 100) return text;
    }
  }

  return null;
}

function extractPostText(doc: Document, scope: Element | Document): string {
  // Primary: data-ad-rendering-role="story_message" container (within scope)
  const storyMsg = scope.querySelector('[data-ad-rendering-role="story_message"]');
  if (storyMsg) {
    return getCleanText(storyMsg);
  }

  // Fallback: data-ad-comet-preview="message"
  const previewMsg = scope.querySelector('[data-ad-comet-preview="message"]');
  if (previewMsg) {
    return getCleanText(previewMsg);
  }

  // Fallback: walk text nodes in scope, excluding comment articles
  const root = scope instanceof Element ? scope : (doc.querySelector('[role="dialog"]') || doc.querySelector('[role="complementary"]'));
  if (root) {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Exclude text inside comment articles
        let parent = node.parentElement;
        while (parent && parent !== root) {
          if (parent.getAttribute('role') === 'article') {
            const label = parent.getAttribute('aria-label') || '';
            if (label.startsWith('Comment by') || label.startsWith('Reply by')) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          parent = parent.parentElement;
        }
        // Skip buttons, headings (modal title), timestamps
        const directParent = node.parentElement;
        if (directParent?.getAttribute('role') === 'button') return NodeFilter.FILTER_REJECT;
        if (directParent?.tagName === 'H2') return NodeFilter.FILTER_REJECT;
        const text = node.textContent?.trim();
        if (!text || text === '…') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textParts: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text && text.length > 20) {
        textParts.push(text);
      }
    }
    if (textParts.length > 0) return textParts.join('\n\n');
  }

  return '';
}

function extractImages(scope: Element | Document): string[] {
  const images: string[] = [];
  const imgElements = scope.querySelectorAll('img');
  for (const img of imgElements) {
    const src = img.src || img.getAttribute('src') || '';
    if (src.includes('fbcdn.net') && !src.includes('emoji') && !src.includes('rsrc.php')) {
      // Skip tiny images (profile pics, icons)
      const width = img.naturalWidth || img.width || 0;
      if (width > 100 || width === 0) {
        images.push(src);
      }
    }
  }
  // Deduplicate
  return [...new Set(images)];
}

/** Extract media URLs (images + video posters) from the main post only, excluding comments */
function extractPostMediaUrls(scope: Element | Document): string[] {
  const urls: string[] = [];

  // Images not inside comment articles
  const imgs = scope.querySelectorAll('img');
  for (const img of imgs) {
    if (isInsideComment(img)) continue;
    const src = img.src || img.getAttribute('src') || '';
    if (!src.includes('fbcdn.net') || src.includes('emoji') || src.includes('rsrc.php')) continue;
    const width = img.naturalWidth || img.width || 0;
    if (width > 0 && width <= 100) continue;
    urls.push(src);
  }

  // Video posters not inside comment articles
  const videos = scope.querySelectorAll('video');
  for (const video of videos) {
    if (isInsideComment(video)) continue;
    const poster = video.poster || '';
    if (poster && poster.includes('fbcdn.net')) urls.push(poster);
  }

  return [...new Set(urls)];
}

function isInsideComment(el: Element): boolean {
  const article = el.closest('[role="article"]');
  if (!article) return false;
  const label = article.getAttribute('aria-label') || '';
  return label.startsWith('Comment by') || label.startsWith('Reply by');
}

function extractMetadata(scope: Element | Document): {
  reactions: string | null;
  commentCount: string | null;
  shareCount: string | null;
} {
  let reactions: string | null = null;
  let commentCount: string | null = null;
  let shareCount: string | null = null;

  const buttons = scope.querySelectorAll('[role="button"]');
  const reactionParts: string[] = [];

  for (const btn of buttons) {
    // Skip buttons inside comment articles
    if (btn.closest('[role="article"]')) continue;

    const text = btn.textContent?.trim() || '';

    // Reaction buttons: "Like: 4.9K people", "Wow: 1.1K people"
    const reactionMatch = text.match(/^(Like|Love|Haha|Wow|Sad|Angry|Care):\s*(.+?)\s*people?$/i);
    if (reactionMatch) {
      reactionParts.push(`${reactionMatch[2]} ${reactionMatch[1]}`);
      continue;
    }

    // "All reactions: 6.6K"
    if (/^All reactions:/i.test(text)) continue;

    // Comment count: "399 comments" or just "399" near the reaction area
    const commentMatch = text.match(/^(\d[\d,.]*K?)\s*comments?$/i);
    if (commentMatch) {
      commentCount = commentMatch[1];
      continue;
    }

    // Share count: "711 shares" or just "711"
    const shareMatch = text.match(/^(\d[\d,.]*K?)\s*shares?$/i);
    if (shareMatch) {
      shareCount = shareMatch[1];
      continue;
    }
  }

  if (reactionParts.length > 0) {
    reactions = `Reactions: ${reactionParts.join(', ')}`;
  }

  return { reactions, commentCount, shareCount };
}

function extractTitleFromDoc(doc: Document): string {
  const raw = doc.title || '';
  // Strip "(N) " prefix and " | Facebook" suffix
  return raw.replace(/^\(\d+\+?\)\s*/, '').replace(/\s*\|\s*Facebook\s*$/, '').trim() || 'Facebook Post';
}

function getCleanText(el: Element): string {
  // Walk text nodes, skip hidden elements and buttons like "See more"
  const parts: string[] = [];
  const walker = el.ownerDocument!.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // Skip "See more" / "See less" buttons
      if (parent.getAttribute('role') === 'button') return NodeFilter.FILTER_REJECT;
      // Skip ellipsis
      if (node.textContent === '…') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text) parts.push(text);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// --- Synchronous comment extraction (visible comments only) ---

/** Extract comments already visible in the DOM — no async loading. */
export function extractVisibleComments(doc: Document): ExtractedComment[] {
  const modal = findPostModal(doc);
  const scope = modal || doc;

  // Click "See more" on visible comments to reveal truncated text
  const articles = scope.querySelectorAll('[role="article"]');
  for (const article of articles) {
    const label = article.getAttribute('aria-label') || '';
    if (!label.startsWith('Comment by') && !label.startsWith('Reply by')) continue;
    const seeMore = findButtonByText(article, /^See more$/);
    if (seeMore) (seeMore as HTMLElement).click();
  }

  return extractCommentsFromScope(scope);
}

function extractCommentsFromScope(scope: Element | Document): ExtractedComment[] {
  const comments: ExtractedComment[] = [];
  const articles = scope.querySelectorAll('[role="article"]');

  for (const article of articles) {
    const label = article.getAttribute('aria-label') || '';
    if (!label.startsWith('Comment by') && !label.startsWith('Reply by')) continue;

    // Author from aria-label: "Comment by Author Name 6 hours ago"
    const authorMatch = label.match(/^(?:Comment|Reply) by (.+?)(?:\s+\d+\s+(?:hour|minute|second|day|week|month|year)s?\s+ago)?$/i);
    const author = authorMatch?.[1]?.trim() || undefined;

    // Text content: skip buttons, links with "Like"/"Reply", and hidden elements
    const text = extractCommentText(article);
    if (!text) continue;

    // Reaction count: "236 reactions; see who reacted to this" or "5 reactions..."
    let likes: number | undefined;
    const reactionBtns = article.querySelectorAll('[role="button"]');
    for (const btn of reactionBtns) {
      const btnText = btn.textContent?.trim() || '';
      const reactMatch = btnText.match(/^(\d[\d,.]*K?M?)\s*reactions?/i);
      if (reactMatch) {
        likes = parseReactionCount(reactMatch[1]);
        break;
      }
    }

    comments.push({ author, text, likes });
  }

  return comments;
}

function extractCommentText(article: Element): string {
  const parts: string[] = [];
  const walker = article.ownerDocument!.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip buttons (Like, Reply, See more, Hide or report, reactions)
      if (parent.closest('[role="button"]')) return NodeFilter.FILTER_REJECT;

      // Skip links that are action links (timestamps like "6h", author links)
      const link = parent.closest('a');
      if (link) {
        const linkText = link.textContent?.trim() || '';
        // Keep links that are part of the comment text (mentions, URLs)
        // Skip short time-stamp links like "6h", "10h", "2d"
        if (/^\d+[hmdywst]$/.test(linkText)) return NodeFilter.FILTER_REJECT;
        // Skip author name link (first link in the article)
        const firstLink = article.querySelector('a');
        if (link === firstLink) return NodeFilter.FILTER_REJECT;
      }

      // Skip ellipsis
      if (node.textContent === '…') return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text) parts.push(text);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseReactionCount(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[,\s]/g, '');
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)K$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^(\d+(?:\.\d+)?)M$/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  return undefined;
}

// --- Helpers ---

function findButtonByText(root: Document | Element, pattern: RegExp): Element | null {
  const buttons = root.querySelectorAll('[role="button"]');
  for (const btn of buttons) {
    if (pattern.test(btn.textContent?.trim() || '')) return btn;
  }
  return null;
}
