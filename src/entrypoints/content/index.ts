import { detectExtractor } from '@/lib/extractors/detector';
import { extractComments } from '@/lib/extractors/comments';
import { isFacebookPostContext, extractVisibleComments } from '@/lib/extractors/facebook';
import type { ExtractedContent } from '@/lib/extractors/types';
import type { ExtractResultMessage, Message } from '@/lib/messaging/types';

export default defineContentScript({
  matches: ['<all_urls>'],

  main() {
    const chromeRuntime = (globalThis as unknown as { chrome: { runtime: typeof chrome.runtime } }).chrome.runtime;

    // Watch for Facebook post modals appearing/changing → notify sidepanel
    if (/(^|\.)facebook\.com$/.test(window.location.hostname)) {
      let lastModalHeading = '';
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const observer = new MutationObserver(() => {
        if (debounceTimer) return; // debounce — skip if a check is already scheduled
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          const headings = document.querySelectorAll('h2');
          let currentHeading = '';
          for (const h of headings) {
            const text = h.textContent?.trim() || '';
            if (/'.?s Post$/.test(text)) {
              currentHeading = text;
              break;
            }
          }
          if (currentHeading && currentHeading !== lastModalHeading) {
            lastModalHeading = currentHeading;
            chromeRuntime.sendMessage({ type: 'CONTENT_CHANGED' }).catch(() => {});
          } else if (!currentHeading && lastModalHeading) {
            lastModalHeading = '';
          }
        }, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    chromeRuntime.onMessage.addListener(
      (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
        if (sender.id !== chromeRuntime.id) {
          sendResponse({ success: false, error: 'Unauthorized sender' });
          return;
        }
        const msg = message as { type: string; videoId?: string; hintLang?: string };
        if (msg.type === 'EXTRACT_CONTENT') {
          extractAndResolve()
            .then((content) => {
              sendResponse({ type: 'EXTRACT_RESULT', success: true, data: content } as ExtractResultMessage);
            })
            .catch((err) => {
              sendResponse({
                type: 'EXTRACT_RESULT',
                success: false,
                error: err instanceof Error ? err.message : String(err),
              } as ExtractResultMessage);
            });
          return true;
        }

        if (msg.type === 'EXTRACT_COMMENTS') {
          const url = window.location.href;
          const comments = isFacebookPostContext(url, document)
            ? extractVisibleComments(document)
            : extractComments(document, url);
          sendResponse({ success: true, comments });
          return true;
        }

        if (msg.type === 'SEEK_VIDEO') {
          const video = document.querySelector('video');
          if (video) {
            video.currentTime = (msg as { seconds: number }).seconds;
            video.play().catch(() => {});
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No video element found' });
          }
          return;
        }

        if (msg.type === 'FETCH_TRANSCRIPT') {
          fetchYouTubeTranscript(msg.videoId!, msg.hintLang)
            .then((transcript) => sendResponse({ success: true, transcript }))
            .catch((err) => sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }));
          return true;
        }
      },
    );
  },
});

async function extractAndResolve(): Promise<ExtractedContent> {
  const extractor = detectExtractor(window.location.href, document);
  const content = extractor.extract(window.location.href, document);

  const comments = extractComments(document, window.location.href);
  if (comments.length > 0) {
    content.comments = comments;
  }

  // Extract visible Facebook comments (synchronous — no loading delay)
  if (isFacebookPostContext(window.location.href, document)) {
    const fbComments = extractVisibleComments(document);
    if (fbComments.length > 0) {
      content.comments = fbComments;
      content.content += `\n\n## Comments (${fbComments.length})\n\n`;
      for (const c of fbComments) {
        const reactionStr = c.likes ? ` (${c.likes} reactions)` : '';
        content.content += `**${c.author || 'Unknown'}**${reactionStr}\n${c.text}\n\n`;
      }
      content.wordCount = content.content.split(/\s+/).filter(Boolean).length;
    }
  }

  // Resolve YouTube transcript inline so the sidepanel knows immediately
  const marker = '[YOUTUBE_TRANSCRIPT:';
  const markerIndex = content.content.indexOf(marker);
  if (markerIndex !== -1) {
    const endIndex = content.content.indexOf(']', markerIndex + marker.length);
    if (endIndex !== -1) {
      const markerBody = content.content.slice(markerIndex + marker.length, endIndex);
      const parts = markerBody.split(':');
      const videoId = parts[0];
      const hintLang = parts[1];

      try {
        const transcript = await fetchYouTubeTranscript(videoId, hintLang);
        content.content = content.content.replace(
          /\[Transcript available - fetching\.\.\.\]\n\n\[YOUTUBE_TRANSCRIPT:[^\]]+\]/,
          transcript,
        );
        content.wordCount = content.content.split(/\s+/).filter(Boolean).length;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        content.content = content.content.replace(
          /\[Transcript available - fetching\.\.\.\]\n\n\[YOUTUBE_TRANSCRIPT:[^\]]+\]/,
          `*Transcript could not be loaded: ${errMsg}*`,
        );
      }
    }
  }

  return content;
}

async function fetchYouTubeTranscript(videoId: string, hintLang?: string): Promise<string> {
  // Use ANDROID innertube client from page context.
  // - ANDROID client bypasses age-restriction checks
  // - Page context provides YouTube cookies (avoids 403 from service worker)
  // - Returns fresh caption URLs (unlike ytInitialPlayerResponse which has expired tokens)
  //
  // This is YouTube's public Innertube API key, embedded in YouTube's own frontend JS.
  // It is not a private credential — it is shipped to every YouTube visitor.
  // nosemgrep: generic-api-key
  const YOUTUBE_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // gitleaks:allow
  const playerResponse = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${YOUTUBE_INNERTUBE_KEY}&prettyPrint=false`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.02.39',
            androidSdkVersion: 34,
            hl: hintLang || 'en',
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    },
  );

  if (!playerResponse.ok) throw new Error(`Innertube API: ${playerResponse.status}`);

  const data = await playerResponse.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) throw new Error('No caption tracks available');

  // Pick best track: prefer hintLang, then manual track, then first
  let track = hintLang
    ? tracks.find((t: { languageCode: string }) => t.languageCode === hintLang)
    : undefined;
  if (!track) {
    track = tracks.find((t: { kind?: string }) => t.kind !== 'asr') || tracks[0];
  }

  let captionUrl: string = track.baseUrl;
  if (!captionUrl.includes('fmt=')) {
    captionUrl += (captionUrl.includes('?') ? '&' : '?') + 'fmt=srv3';
  }

  const captionResponse = await fetch(captionUrl);
  if (!captionResponse.ok) throw new Error(`Caption fetch: ${captionResponse.status}`);

  const xml = await captionResponse.text();
  const transcript = parseTranscriptXml(xml);
  if (!transcript) throw new Error('Empty transcript');
  return transcript;
}

function parseTranscriptXml(xml: string): string {
  const segments: string[] = [];

  // 1. Standard format: <text start="..." dur="...">words</text>
  const textMatches = xml.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g);
  for (const match of textMatches) {
    const attrs = match[1];
    const text = decodeXmlEntities(match[2]).trim();
    if (!text) continue;
    const startSec = parseFloat(attrs.match(/start="([^"]+)"/)?.[1] ?? '');
    segments.push(isNaN(startSec) ? text : `[${formatTimestamp(startSec)}] ${text}`);
  }
  if (segments.length > 0) return segments.join('\n');

  // 2. SRV3 format: <p t="..." d="..."><s>word</s>...</p>  (t is in ms)
  const pMatches = xml.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/g);
  for (const match of pMatches) {
    const attrs = match[1];
    const inner = match[2];
    const sMatches = inner.matchAll(/<s[^>]*>([^<]*)<\/s>/g);
    const words: string[] = [];
    for (const s of sMatches) {
      const w = decodeXmlEntities(s[1]);
      if (w) words.push(w);
    }
    let text: string;
    if (words.length > 0) {
      text = words.join('').trim();
    } else {
      text = decodeXmlEntities(inner.replace(/<[^>]+>/g, '')).trim();
    }
    if (!text) continue;
    const tMs = parseInt(attrs.match(/t="([^"]+)"/)?.[1] ?? '', 10);
    segments.push(isNaN(tMs) ? text : `[${formatTimestamp(tMs / 1000)}] ${text}`);
  }
  if (segments.length > 0) return segments.join('\n');

  // 3. Flat <s> elements (rare fallback — no timestamps available)
  const segMatches = xml.matchAll(/<s[^>]*>([\s\S]*?)<\/s>/g);
  for (const match of segMatches) {
    const text = decodeXmlEntities(match[1]).trim();
    if (text) segments.push(text);
  }

  return segments.join(' ');
}

function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, ' ');
}
