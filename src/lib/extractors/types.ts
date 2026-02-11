export type ContentType = 'article' | 'youtube' | 'facebook' | 'reddit' | 'twitter' | 'github' | 'generic';

export interface ExtractedContent {
  type: ContentType;
  url: string;
  title: string;
  author?: string;
  publishDate?: string;
  language?: string;
  content: string; // main text content (markdown)
  wordCount: number;
  estimatedReadingTime: number; // minutes

  // YouTube-specific
  channelName?: string;
  duration?: string;
  viewCount?: string;
  thumbnailUrl?: string;
  thumbnailUrls?: string[]; // multiple thumbnails for collage display (e.g. X multi-image posts)
  description?: string;

  // Reddit-specific
  subreddit?: string;
  postScore?: number;
  commentCount?: number;

  // GitHub-specific
  githubPageType?: 'pr' | 'issue' | 'code' | 'repo' | 'commit' | 'release';
  prState?: 'open' | 'closed' | 'merged';
  issueState?: 'open' | 'closed';
  repoStars?: number;

  // Comments
  comments?: ExtractedComment[];

  // Images
  images?: string[];
  richImages?: ExtractedImage[];
}

export interface ExtractedImage {
  url: string;
  alt: string;
  caption?: string;
  tier: 'inline' | 'contextual';
  width?: number;
  height?: number;
}

export interface ExtractedComment {
  author?: string;
  text: string;
  likes?: number;
}

export interface ContentExtractor {
  canExtract(url: string, document: Document): boolean;
  extract(url: string, document: Document): ExtractedContent;
}
