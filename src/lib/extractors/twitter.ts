import type { ContentExtractor, ExtractedContent, ExtractedImage } from './types';

const TWITTER_STATUS_RE = /(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;

export const twitterExtractor: ContentExtractor = {
  canExtract(url: string): boolean {
    return TWITTER_STATUS_RE.test(url);
  },

  extract(url: string, doc: Document): ExtractedContent {
    const urlMatch = url.match(TWITTER_STATUS_RE);
    const mainAuthor = urlMatch?.[1] || '';

    // Find all article elements (tweets)
    const articles = doc.querySelectorAll('article');
    const tweets: ParsedTweet[] = [];

    for (const article of articles) {
      const tweet = parseArticle(article);
      if (tweet) tweets.push(tweet);
    }

    // First tweet in the conversation region is the main tweet
    // It's the one whose author matches the URL, or simply the first one
    let mainTweet: ParsedTweet | undefined;
    let replies: ParsedTweet[] = [];

    const mainIdx = tweets.findIndex(
      (t) => t.handle.toLowerCase() === mainAuthor.toLowerCase(),
    );
    if (mainIdx >= 0) {
      mainTweet = tweets[mainIdx];
      replies = tweets.filter((_, i) => i !== mainIdx);
    } else if (tweets.length > 0) {
      mainTweet = tweets[0];
      replies = tweets.slice(1);
    }

    // Detect threads: sequential replies by the same author as the main tweet
    const threadParts: string[] = [];
    const nonThreadReplies: ParsedTweet[] = [];

    if (mainTweet) {
      for (const reply of replies) {
        if (reply.handle.toLowerCase() === mainTweet.handle.toLowerCase() && nonThreadReplies.length === 0) {
          // Part of the thread (only consecutive same-author replies before other replies)
          threadParts.push(reply.text);
        } else {
          nonThreadReplies.push(reply);
        }
      }
    }

    // Build content
    const lines: string[] = [];

    if (mainTweet) {
      lines.push(`# ${mainTweet.displayName} (@${mainTweet.handle})`);
      lines.push('');
      lines.push(mainTweet.text);
      if (threadParts.length > 0) {
        for (const part of threadParts) {
          lines.push('');
          lines.push(part);
        }
      }
      lines.push('');

      // Engagement metrics
      const metrics: string[] = [];
      if (mainTweet.replies !== undefined) metrics.push(`${formatCount(mainTweet.replies)} replies`);
      if (mainTweet.reposts !== undefined) metrics.push(`${formatCount(mainTweet.reposts)} reposts`);
      if (mainTweet.likes !== undefined) metrics.push(`${formatCount(mainTweet.likes)} likes`);
      if (mainTweet.views !== undefined) metrics.push(`${formatCount(mainTweet.views)} views`);
      if (metrics.length > 0) {
        lines.push(`---`);
        lines.push(metrics.join(' | '));
        lines.push('');
      }
    }

    // Replies section
    if (nonThreadReplies.length > 0) {
      lines.push('## Replies');
      lines.push('');

      for (const reply of nonThreadReplies) {
        const likes = reply.likes !== undefined ? ` (${formatCount(reply.likes)} likes)` : '';
        lines.push(`**${reply.displayName}** (@${reply.handle})${likes}: ${reply.text}`);
        lines.push('');
      }
    }

    const content = lines.join('\n');
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const title = mainTweet?.text
      ? mainTweet.text.slice(0, 120).trim() + (mainTweet.text.length > 120 ? '...' : '')
      : '';

    // Extract images from tweets
    const richImages = extractTweetImages(doc);
    // X/Twitter og:image is always a generic logo — use actual tweet images instead
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    const hasRealOgImage = ogImage && !ogImage.includes('abs.twimg.com/rweb/');
    const thumbnailUrl =
      (richImages.length > 0 ? richImages[0].url : undefined) ||
      (hasRealOgImage ? ogImage : undefined);

    return {
      type: 'twitter',
      url: normalizeTwitterUrl(url),
      title,
      author: mainTweet?.displayName || mainAuthor || undefined,
      language: doc.documentElement.lang || undefined,
      content,
      wordCount,
      estimatedReadingTime: Math.ceil(wordCount / 200),
      thumbnailUrl,
      richImages: richImages.length > 0 ? richImages : undefined,
    };
  },
};

interface ParsedTweet {
  displayName: string;
  handle: string;
  text: string;
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
}

function parseArticle(article: Element): ParsedTweet | null {
  // Extract from the aria-label which contains a structured summary
  const ariaLabel = article.getAttribute('aria-label') || '';

  // aria-label format: "DisplayName Verified account @handle Date Text N replies, N reposts, N likes, N bookmarks, N views"
  // Parse engagement from buttons instead (more reliable)

  // Get author info from links within the article
  let displayName = '';
  let handle = '';

  // Find all links - author links typically come first
  const links = article.querySelectorAll('a');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const text = link.textContent?.trim() || '';

    // Handle link: "/@username"
    if (/^\/\w+$/.test(href) && !href.startsWith('/i/') && !href.includes('/status/')) {
      if (text.startsWith('@')) {
        handle = text.slice(1);
      } else if (text && !displayName && text.length < 100) {
        displayName = text;
      }
    }
  }

  if (!handle && !displayName) return null;

  // Extract tweet text from StaticText nodes that aren't part of buttons/links
  const text = extractTweetText(article);
  if (!text) return null;

  // Parse engagement metrics from buttons
  const buttons = article.querySelectorAll('button');
  let replies: number | undefined;
  let reposts: number | undefined;
  let likes: number | undefined;
  let views: number | undefined;

  for (const btn of buttons) {
    const btnText = btn.textContent?.trim() || '';
    const ariaLbl = btn.getAttribute('aria-label') || btnText;

    const replyMatch = ariaLbl.match(/^(\d[\d,.]*[KMB]?)\s*Repl/i);
    if (replyMatch) { replies = parseMetricCount(replyMatch[1]); continue; }

    const repostMatch = ariaLbl.match(/^(\d[\d,.]*[KMB]?)\s*repost/i);
    if (repostMatch) { reposts = parseMetricCount(repostMatch[1]); continue; }

    const likeMatch = ariaLbl.match(/^(\d[\d,.]*[KMB]?)\s*Like/i);
    if (likeMatch) { likes = parseMetricCount(likeMatch[1]); continue; }
  }

  // Views are in a link, not a button
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    if (href.includes('/analytics')) {
      const viewText = link.textContent?.trim() || '';
      const viewMatch = viewText.match(/([\d,.]+[KMB]?)/);
      if (viewMatch) views = parseMetricCount(viewMatch[1]);
    }
  }

  return { displayName, handle, text, replies, reposts, likes, views };
}

function extractTweetText(article: Element): string {
  // Use X's data-testid="tweetText" container — reliably contains only the tweet text
  // with @mentions and URLs preserved, excluding all UI chrome.
  const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
  if (tweetTextEl) {
    return (tweetTextEl.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function parseMetricCount(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[,\s]/g, '');
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  const kMatch = cleaned.match(/^([\d.]+)K$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^([\d.]+)M$/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  const bMatch = cleaned.match(/^([\d.]+)B$/i);
  if (bMatch) return Math.round(parseFloat(bMatch[1]) * 1000000000);
  return undefined;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function extractTweetImages(doc: Document): ExtractedImage[] {
  const results: ExtractedImage[] = [];
  const seen = new Set<string>();

  const articles = doc.querySelectorAll('article');
  for (const article of articles) {
    const imgs = article.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src || '';
      if (!src.includes('pbs.twimg.com')) continue;
      // Skip profile pictures and emoji
      if (src.includes('profile_images') || src.includes('emoji')) continue;
      if (seen.has(src)) continue;
      seen.add(src);

      const alt = img.alt || '';
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;

      results.push({
        url: src,
        alt,
        tier: alt.length > 10 ? 'inline' : 'contextual',
        width: width || undefined,
        height: height || undefined,
      });
    }
  }

  return results;
}

function normalizeTwitterUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}
