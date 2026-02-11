import type { ContentExtractor } from './types';
import { youtubeExtractor } from './youtube';
import { gdocsExtractor } from './gdocs';
import { facebookExtractor } from './facebook';
import { redditExtractor } from './reddit';
import { twitterExtractor } from './twitter';
import { githubExtractor } from './github';
import { articleExtractor } from './article';
import { genericExtractor } from './generic';

const extractors: ContentExtractor[] = [
  youtubeExtractor,
  gdocsExtractor,
  facebookExtractor,
  redditExtractor,
  twitterExtractor,
  githubExtractor,
  articleExtractor,
  genericExtractor, // always last — fallback
];

export function detectExtractor(url: string, doc: Document): ContentExtractor {
  for (const extractor of extractors) {
    if (extractor.canExtract(url, doc)) {
      return extractor;
    }
  }
  return genericExtractor; // should never reach here since generic always matches
}
