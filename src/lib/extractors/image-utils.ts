import type { ExtractedImage } from './types';

// Minimum dimensions for a thumbnail image
const MIN_THUMBNAIL_SOLO = 32;   // absolute minimum — skip if only image and smaller than this
const MIN_THUMBNAIL_WITH_ALT = 64; // skip if there are better candidates available

const GENERIC_ALT_PATTERNS = /^(image|photo|picture|img|icon|logo|avatar|thumbnail|banner|placeholder|decorative|spacer)$/i;

const AD_TRACKING_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'facebook.com/tr', 'pixel.', 'tracking.', 'analytics.',
  'ads.', 'adserver.', 'beacon.',
];

function isAdOrTracking(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_TRACKING_DOMAINS.some((d) => lower.includes(d));
}

function hasMeaningfulAlt(alt: string): boolean {
  return alt.length > 10 && !GENERIC_ALT_PATTERNS.test(alt.trim());
}

export function extractRichImages(container: HTMLElement): ExtractedImage[] {
  const results: ExtractedImage[] = [];
  const seen = new Set<string>();

  const imgs = container.querySelectorAll('img');
  for (const img of imgs) {
    const src = img.src || img.getAttribute('data-src') || '';
    if (!src || src.startsWith('data:')) continue;
    if (seen.has(src)) continue;
    if (isAdOrTracking(src)) continue;
    // Skip GIFs — LLM APIs only support JPEG, PNG, and WEBP
    if (/\.gif(\?|$)/i.test(src)) continue;

    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    if (width > 0 && width < 50) continue;
    if (height > 0 && height < 50) continue;

    const alt = img.alt || '';
    const figure = img.closest('figure');
    const caption = figure?.querySelector('figcaption')?.textContent?.trim() || undefined;

    const isInline = !!(caption || hasMeaningfulAlt(alt));

    seen.add(src);
    results.push({
      url: src,
      alt,
      caption,
      tier: isInline ? 'inline' : 'contextual',
      width: width || undefined,
      height: height || undefined,
    });
  }

  return results;
}

/**
 * Pick the best thumbnail from a list of candidate URLs.
 * Skips images that are too small to be meaningful thumbnails:
 * - Under 32x32: always rejected (icons, spacers, tracking pixels)
 * - Under 64x64: rejected if there are larger alternatives
 * Requires a DOM context to measure natural dimensions.
 */
export function pickThumbnail(container: HTMLElement, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;

  interface Measured { url: string; w: number; h: number }
  const measured: Measured[] = [];
  const imgMap = new Map<string, HTMLImageElement>();
  for (const img of container.querySelectorAll('img')) {
    const src = img.src || img.getAttribute('data-src') || '';
    if (src) imgMap.set(src, img);
  }

  for (const url of candidates) {
    const img = imgMap.get(url);
    const w = img ? (img.naturalWidth || img.width || 0) : 0;
    const h = img ? (img.naturalHeight || img.height || 0) : 0;
    measured.push({ url, w, h });
  }

  // Filter: reject anything below the absolute minimum
  const aboveMin = measured.filter(
    (m) => !m.w || !m.h || (m.w >= MIN_THUMBNAIL_SOLO && m.h >= MIN_THUMBNAIL_SOLO),
  );
  if (aboveMin.length === 0) return undefined;

  // If multiple candidates, raise the bar
  if (aboveMin.length > 1) {
    const aboveAlt = aboveMin.filter(
      (m) => !m.w || !m.h || (m.w >= MIN_THUMBNAIL_WITH_ALT && m.h >= MIN_THUMBNAIL_WITH_ALT),
    );
    if (aboveAlt.length > 0) return aboveAlt[0].url;
  }

  return aboveMin[0].url;
}
