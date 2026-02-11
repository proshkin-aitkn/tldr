import type { ContentExtractor, ExtractedContent } from './types';

type GitHubPageType = 'pr' | 'issue' | 'code' | 'repo' | 'commit' | 'release';

const PAGE_PATTERNS: [RegExp, GitHubPageType][] = [
  [/^\/[^/]+\/[^/]+\/pull\/\d+\/(changes|files)/, 'commit'],  // commit diff or files-changed within PR
  [/^\/[^/]+\/[^/]+\/pull\/\d+/, 'pr'],
  [/^\/[^/]+\/[^/]+\/issues\/\d+/, 'issue'],
  [/^\/[^/]+\/[^/]+\/blob\//, 'code'],
  [/^\/[^/]+\/[^/]+\/commit\/[0-9a-f]+/, 'commit'],
  [/^\/[^/]+\/[^/]+\/releases\/tag\//, 'release'],
  [/^\/[^/]+\/[^/]+\/?$/, 'repo'],
];

function detectPageType(pathname: string): GitHubPageType | null {
  for (const [re, type] of PAGE_PATTERNS) {
    if (re.test(pathname)) return type;
  }
  return null;
}

export const githubExtractor: ContentExtractor = {
  canExtract(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.hostname !== 'github.com') return false;
      return detectPageType(u.pathname) !== null;
    } catch {
      return false;
    }
  },

  extract(url: string, doc: Document): ExtractedContent {
    const u = new URL(url);
    const pageType = detectPageType(u.pathname)!;

    switch (pageType) {
      case 'pr': return extractPR(url, doc);
      case 'issue': return extractIssue(url, doc);
      case 'code': return extractCode(url, doc);
      case 'repo': return extractRepo(url, doc);
      case 'commit': return extractCommit(url, doc);
      case 'release': return extractRelease(url, doc);
    }
  },
};

// ─── Shared helpers ────────────────────────────────────────────────────

interface TimelineComment {
  author: string;
  body: string;
  isBot: boolean;
  isAuthor: boolean;
  timestamp?: string;
}

interface ReviewComment {
  author: string;
  filePath: string;
  body: string;
  isBot: boolean;
}

function textOf(el: Element | null): string {
  return el?.textContent?.trim() || '';
}

/** Simple HTML→markdown for GitHub .markdown-body sections */
function ghHtmlToMarkdown(el: Element): string {
  let md = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      md += node.textContent || '';
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as HTMLElement;
    const tag = child.tagName.toLowerCase();
    const inner = ghHtmlToMarkdown(child);

    switch (tag) {
      case 'h1': md += `\n# ${inner}\n`; break;
      case 'h2': md += `\n## ${inner}\n`; break;
      case 'h3': md += `\n### ${inner}\n`; break;
      case 'h4': md += `\n#### ${inner}\n`; break;
      case 'p': md += `\n${inner}\n`; break;
      case 'br': md += '\n'; break;
      case 'strong': case 'b': md += `**${inner}**`; break;
      case 'em': case 'i': md += `*${inner}*`; break;
      case 'code':
        if (child.parentElement?.tagName.toLowerCase() === 'pre') md += inner;
        else md += `\`${inner}\``;
        break;
      case 'pre': md += `\n\`\`\`\n${inner}\n\`\`\`\n`; break;
      case 'a': {
        const href = child.getAttribute('href');
        md += href ? `[${inner}](${href})` : inner;
        break;
      }
      case 'ul': case 'ol': md += `\n${inner}\n`; break;
      case 'li': {
        const parent = child.parentElement;
        if (parent?.tagName.toLowerCase() === 'ol') {
          const idx = Array.from(parent.children).indexOf(child) + 1;
          md += `${idx}. ${inner}\n`;
        } else {
          md += `- ${inner}\n`;
        }
        break;
      }
      case 'blockquote': md += `\n> ${inner.trim().replace(/\n/g, '\n> ')}\n`; break;
      case 'img': {
        const src = child.getAttribute('src');
        const alt = child.getAttribute('alt') || '';
        if (src) md += `![${alt}](${src})`;
        break;
      }
      case 'hr': md += '\n---\n'; break;
      default: md += inner; break;
    }
  }
  return md;
}

/** Convert a GitHub .markdown-body element to clean markdown text */
function markdownBodyToText(el: Element | null): string {
  if (!el) return '';
  return ghHtmlToMarkdown(el).replace(/\n{3,}/g, '\n\n').trim();
}

/** Check if a comment author is a bot */
function isBot(commentEl: Element, author: string): boolean {
  // Badge with "Bot" text
  const badges = commentEl.querySelectorAll('.Label, [class*="Label"]');
  for (const badge of badges) {
    if (/\bbot\b/i.test(badge.textContent || '')) return true;
  }
  // Author name ending with [bot]
  return /\[bot\]$/i.test(author);
}

/** Check if the comment was written by the PR/Issue author */
function isAuthorBadge(commentEl: Element): boolean {
  const badges = commentEl.querySelectorAll('.Label, [class*="Label"]');
  for (const badge of badges) {
    if (/\bauthor\b/i.test(badge.textContent || '')) return true;
  }
  return false;
}

/** Extract timeline comments from a PR or Issue page */
function extractTimelineComments(doc: Document): TimelineComment[] {
  const comments: TimelineComment[] = [];
  const seenBodies = new Set<Element>();

  // Multiple selectors to cover GitHub's varying DOM — they often match nested
  // elements for the same comment, so we deduplicate via the body element.
  const commentEls = doc.querySelectorAll(
    '.timeline-comment, .js-timeline-item .js-comment-container, [id^="issuecomment-"]',
  );

  for (const el of commentEls) {
    const bodyEl = el.querySelector('.js-comment-body, .comment-body, .markdown-body');
    if (!bodyEl || seenBodies.has(bodyEl)) continue;
    seenBodies.add(bodyEl);

    const authorEl = el.querySelector('.author, a.Link--primary[data-hovercard-type="user"]');
    const author = textOf(authorEl);
    if (!author) continue;

    const body = markdownBodyToText(bodyEl);
    if (!body) continue;

    const isBotAuthor = isBot(el, author);

    const timeEl = el.querySelector('relative-time, time');
    const timestamp = timeEl?.getAttribute('datetime') || undefined;

    comments.push({
      author,
      body,
      isBot: isBotAuthor,
      isAuthor: isAuthorBadge(el),
      timestamp,
    });
  }

  return comments;
}

/** Extract review (inline) comments */
function extractReviewComments(doc: Document): ReviewComment[] {
  const comments: ReviewComment[] = [];

  const reviewEls = doc.querySelectorAll('.review-comment');
  for (const el of reviewEls) {
    const authorEl = el.querySelector('.author');
    const author = textOf(authorEl);
    if (!author) continue;

    const bodyEl = el.querySelector('.js-comment-body, .comment-body');
    const body = markdownBodyToText(bodyEl);
    if (!body) continue;

    // Find the parent file header for this review comment
    const fileContainer = el.closest('.file');
    const fileHeader = fileContainer?.querySelector('.file-header [title], .file-info a');
    const filePath = fileHeader?.getAttribute('title') || textOf(fileHeader);

    comments.push({
      author,
      filePath: filePath || 'unknown file',
      body,
      isBot: isBot(el, author),
    });
  }

  return comments;
}

/** Build FILE_MAP comment and file listing */
function buildFileMap(files: { path: string; url: string }[]): { comment: string; listing: string } {
  if (files.length === 0) return { comment: '', listing: '' };

  const map: Record<string, string> = {};
  const listLines: string[] = [];
  files.forEach((f, i) => {
    const n = String(i + 1);
    map[n] = f.url;
    listLines.push(`- {{FILE_${n}}}: \`${f.path}\``);
  });

  const comment = `<!-- FILE_MAP: ${JSON.stringify(map)} -->`;
  const listing = `**Files:**\n${listLines.join('\n')}`;
  return { comment, listing };
}

/** Format timeline comments into markdown */
function formatComments(comments: TimelineComment[]): string {
  if (comments.length === 0) return '';

  const lines: string[] = ['\n---\n\n## Discussion\n'];

  for (const c of comments) {
    const tag = c.isBot ? ' [BOT]' : c.isAuthor ? ' [AUTHOR]' : '';
    lines.push(`**${c.author}**${tag}:${c.timestamp ? ` *(${c.timestamp})*` : ''}`);
    lines.push(c.body);
    lines.push('');
  }

  return lines.join('\n');
}

function buildResult(
  url: string,
  pageType: GitHubPageType,
  title: string,
  content: string,
  extra: Partial<ExtractedContent> = {},
): ExtractedContent {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return {
    type: 'github',
    url,
    title,
    content,
    wordCount,
    estimatedReadingTime: Math.ceil(wordCount / 200),
    githubPageType: pageType,
    ...extra,
  };
}

// ─── Page-type extractors ──────────────────────────────────────────────

function extractPR(url: string, doc: Document): ExtractedContent {
  // Title
  const titleEl = doc.querySelector('.gh-header-title .js-issue-title') || doc.querySelector('h1 bdi');
  const title = textOf(titleEl) || 'Pull Request';

  // State badge
  const stateEl = doc.querySelector('.State, [title="Status: Open"], [title="Status: Closed"], [title="Status: Merged"]');
  const stateText = textOf(stateEl).toLowerCase();
  const prState: 'open' | 'closed' | 'merged' =
    stateText.includes('merged') ? 'merged'
    : stateText.includes('closed') ? 'closed'
    : 'open';

  // Author
  const authorEl = doc.querySelector('.gh-header-meta .author, .js-issue-header-author');
  const author = textOf(authorEl);

  // Branch info
  const headRef = textOf(doc.querySelector('.head-ref'));
  const baseRef = textOf(doc.querySelector('.base-ref'));

  // Stats (+N/-N)
  const diffstatEl = doc.querySelector('.diffstat, #diffstat');
  const diffstat = textOf(diffstatEl);

  // Labels
  const labelEls = doc.querySelectorAll('.IssueLabel, .js-issue-labels .IssueLabel');
  const labels = Array.from(labelEls).map(el => textOf(el)).filter(Boolean);

  // PR description (first comment body)
  const descBody = doc.querySelector('.js-discussion .js-comment-container:first-of-type .js-comment-body, .js-comment-body');
  const description = markdownBodyToText(descBody);

  // Changed files
  const fileHeaders = doc.querySelectorAll('.file-header [title], .file-info a[title]');
  const files: { path: string; url: string }[] = [];
  const baseUrl = url.replace(/\/pull\/\d+.*$/, '');
  for (const fh of fileHeaders) {
    const path = fh.getAttribute('title') || textOf(fh);
    if (path && !files.some(f => f.path === path)) {
      files.push({ path, url: `${baseUrl}/blob/HEAD/${path}` });
    }
  }

  const { comment: fileMapComment, listing: fileListing } = buildFileMap(files);

  // Timeline comments (skip first — it's the description)
  const allComments = extractTimelineComments(doc);
  const comments = allComments.slice(1); // skip PR body

  // Review (inline) comments
  const reviewComments = extractReviewComments(doc);

  // Build content
  const lines: string[] = [];
  if (fileMapComment) lines.push(fileMapComment, '');
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**State:** ${prState} | **Author:** ${author || 'unknown'}`);
  if (headRef && baseRef) lines.push(`**Branch:** ${headRef} → ${baseRef}`);
  if (diffstat) lines.push(`**Changes:** ${diffstat}`);
  if (labels.length) lines.push(`**Labels:** ${labels.join(', ')}`);
  lines.push('');

  if (description) {
    lines.push('## Description\n');
    lines.push(description);
    lines.push('');
  }

  if (fileListing) {
    lines.push(fileListing);
    lines.push('');
  }

  if (reviewComments.length > 0) {
    lines.push('## Review Comments\n');
    for (const rc of reviewComments) {
      const tag = rc.isBot ? ' [BOT]' : '';
      lines.push(`**${rc.author}**${tag} on \`${rc.filePath}\`:`);
      lines.push(rc.body);
      lines.push('');
    }
  }

  const commentsMd = formatComments(comments);
  if (commentsMd) lines.push(commentsMd);

  // Publish date from first timestamp
  const firstTime = doc.querySelector('.gh-header-meta relative-time, .gh-header-meta time');
  const publishDate = firstTime?.getAttribute('datetime') || undefined;

  return buildResult(url, 'pr', title, lines.join('\n'), {
    author,
    publishDate,
    prState,
  });
}

function extractIssue(url: string, doc: Document): ExtractedContent {
  // Title
  const titleEl = doc.querySelector('.gh-header-title .js-issue-title') || doc.querySelector('h1 bdi');
  const title = textOf(titleEl) || 'Issue';

  // State
  const stateEl = doc.querySelector('.State, [title="Status: Open"], [title="Status: Closed"]');
  const stateText = textOf(stateEl).toLowerCase();
  const issueState: 'open' | 'closed' = stateText.includes('closed') ? 'closed' : 'open';

  // Author
  const authorEl = doc.querySelector('.gh-header-meta .author, .js-issue-header-author');
  const author = textOf(authorEl);

  // Labels
  const labelEls = doc.querySelectorAll('.IssueLabel, .js-issue-labels .IssueLabel');
  const labels = Array.from(labelEls).map(el => textOf(el)).filter(Boolean);

  // Assignees
  const assigneeEls = doc.querySelectorAll('.js-issue-assignees .assignee, [data-hovercard-type="user"].assignee');
  const assignees = Array.from(assigneeEls).map(el => textOf(el)).filter(Boolean);

  // Milestone
  const milestoneEl = doc.querySelector('.milestone-name, a.Truncate[href*="milestone"]');
  const milestone = textOf(milestoneEl);

  // Issue body
  const descBody = doc.querySelector('.js-discussion .js-comment-container:first-of-type .js-comment-body, .js-comment-body');
  const description = markdownBodyToText(descBody);

  // Comments
  const allComments = extractTimelineComments(doc);
  const comments = allComments.slice(1);

  // Build content
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`**State:** ${issueState} | **Author:** ${author || 'unknown'}`);
  if (labels.length) lines.push(`**Labels:** ${labels.join(', ')}`);
  if (assignees.length) lines.push(`**Assignees:** ${assignees.join(', ')}`);
  if (milestone) lines.push(`**Milestone:** ${milestone}`);
  lines.push('');

  if (description) {
    lines.push('## Description\n');
    lines.push(description);
    lines.push('');
  }

  const commentsMd = formatComments(comments);
  if (commentsMd) lines.push(commentsMd);

  const firstTime = doc.querySelector('.gh-header-meta relative-time, .gh-header-meta time');
  const publishDate = firstTime?.getAttribute('datetime') || undefined;

  return buildResult(url, 'issue', title, lines.join('\n'), {
    author,
    publishDate,
    issueState,
  });
}

function extractCode(url: string, doc: Document): ExtractedContent {
  // Full path — URL is the most reliable source
  const u = new URL(url);
  const blobMatch = u.pathname.match(/\/blob\/[^/]+\/(.+)/);
  const fullPath = blobMatch ? decodeURIComponent(blobMatch[1])
    : textOf(doc.querySelector('.final-path, #file-name-id'))
    || u.pathname.split('/').pop() || 'file';

  // Language from file extension
  const ext = fullPath.split('.').pop() || '';

  // Code lines — try multiple selector generations (GitHub keeps changing the DOM)
  const codeLines: string[] = [];
  const oldCodeEls = doc.querySelectorAll('.blob-code-inner, [data-code-text]');
  const newCodeEls = doc.querySelectorAll('[class*="react-file-line"]');

  if (oldCodeEls.length > 0) {
    for (const el of oldCodeEls) {
      const text = el.getAttribute('data-code-text') ?? (el.textContent || '');
      codeLines.push(text);
    }
  } else if (newCodeEls.length > 0) {
    for (const el of newCodeEls) {
      codeLines.push(el.textContent || '');
    }
  } else {
    // Last resort: try raw code block
    const rawEl = doc.querySelector('.blob-wrapper table, .highlight pre, [data-testid="raw-content"]');
    if (rawEl) {
      codeLines.push(...(rawEl.textContent || '').split('\n'));
    }
  }

  const totalLines = codeLines.length;
  const codeContent = codeLines.join('\n');

  // Build FILE_MAP for this single file
  const fileMap: Record<string, string> = { '1': url };
  const fileMapComment = `<!-- FILE_MAP: ${JSON.stringify(fileMap)} -->`;

  // Build content
  const lines: string[] = [];
  lines.push(fileMapComment, '');
  lines.push(`# ${fullPath}`);
  lines.push('');
  lines.push(`**Language:** ${ext || 'unknown'} | **Lines:** ${totalLines}`);
  lines.push(`**File:** {{FILE_1}}`);
  lines.push('');
  lines.push(`\`\`\`${ext}`);
  // Include line numbers so the LLM can reference exact lines (e.g. #L42)
  for (let i = 0; i < codeLines.length; i++) {
    lines.push(`${i + 1}: ${codeLines[i]}`);
  }
  lines.push('```');

  return buildResult(url, 'code', fullPath, lines.join('\n'));
}

function extractRepo(url: string, doc: Document): ExtractedContent {
  const u = new URL(url);
  const repoName = u.pathname.replace(/^\//, '').replace(/\/$/, '');

  // Description
  const descEl = doc.querySelector('[itemprop="about"] p, .f4.my-3, .BorderGrid-row p.f4');
  const description = textOf(descEl);

  // Topics
  const topicEls = doc.querySelectorAll('.topic-tag, a[data-octo-click="topic_click"]');
  const topics = Array.from(topicEls).map(el => textOf(el)).filter(Boolean);

  // Stars/Forks from social counts
  const socialCounts = doc.querySelectorAll('.social-count, a[href$="/stargazers"], a[href$="/forks"]');
  let stars: number | undefined;
  let forks: number | undefined;
  for (const el of socialCounts) {
    const href = (el as HTMLAnchorElement).href || el.closest('a')?.href || '';
    const count = parseCount(textOf(el));
    if (href.includes('stargazers') && count !== undefined) stars = count;
    else if (href.includes('forks') && count !== undefined) forks = count;
  }

  // Language stats
  const langEls = doc.querySelectorAll('.Progress-item, [data-testid="language-color"]');
  const languages: string[] = [];
  const langLabels = doc.querySelectorAll('.BorderGrid-cell [class*="color-fg"] a[href*="search"], .repository-lang-stats a');
  for (const el of langLabels) {
    const lang = textOf(el);
    if (lang) languages.push(lang);
  }

  // License
  const licenseEl = doc.querySelector('.octicon-law')?.closest('a') || doc.querySelector('a[href*="LICENSE"]');
  const license = textOf(licenseEl);

  // README
  const readmeEl = doc.querySelector('#readme .markdown-body, #readme article');
  const readmeContent = markdownBodyToText(readmeEl);

  // Build content
  const lines: string[] = [];
  lines.push(`# ${repoName}`);
  lines.push('');
  if (description) lines.push(`> ${description}`);
  lines.push('');

  const metaParts: string[] = [];
  if (stars !== undefined) metaParts.push(`**Stars:** ${stars.toLocaleString()}`);
  if (forks !== undefined) metaParts.push(`**Forks:** ${forks.toLocaleString()}`);
  if (license) metaParts.push(`**License:** ${license}`);
  if (metaParts.length) lines.push(metaParts.join(' | '));

  if (topics.length) lines.push(`**Topics:** ${topics.join(', ')}`);
  if (languages.length) lines.push(`**Languages:** ${languages.join(', ')}`);
  lines.push('');

  if (readmeContent) {
    lines.push('## README\n');
    lines.push(readmeContent);
  }

  return buildResult(url, 'repo', repoName, lines.join('\n'), {
    repoStars: stars,
  });
}

function extractCommit(url: string, doc: Document): ExtractedContent {
  const u = new URL(url);
  const isPRSubPage = /\/pull\/\d+\/(changes|files)/.test(u.pathname);

  if (isPRSubPage) {
    return extractPRDiff(url, doc);
  }

  // Commit message
  const titleEl = doc.querySelector('.commit-title, .js-commits-list-item .markdown-title');
  const commitTitle = textOf(titleEl) || 'Commit';
  const descEl = doc.querySelector('.commit-desc');
  const commitDesc = textOf(descEl);

  // Author
  const authorEl = doc.querySelector('.commit-author, .user-mention, [data-testid="author-avatar"] + a');
  const author = textOf(authorEl);

  // SHA from URL
  const shaMatch = u.pathname.match(/\/commit\/([0-9a-f]+)/);
  const sha = shaMatch ? shaMatch[1].slice(0, 7) : '';

  // Stats
  const statsEl = doc.querySelector('.diffstat, #diffstat, .toc-diff-stats');
  const stats = textOf(statsEl);

  // Changed files
  const fileHeaders = doc.querySelectorAll('.file-header [title], .file-info a[title]');
  const files: { path: string; url: string }[] = [];
  const repoBase = u.pathname.replace(/\/commit\/.*$/, '');
  for (const fh of fileHeaders) {
    const path = fh.getAttribute('title') || textOf(fh);
    if (path && !files.some(f => f.path === path)) {
      files.push({ path, url: `https://github.com${repoBase}/blob/${shaMatch?.[1] || 'HEAD'}/${path}` });
    }
  }

  const { comment: fileMapComment, listing: fileListing } = buildFileMap(files);

  // Full diff content
  const diffEls = doc.querySelectorAll('.blob-code-inner');
  let diffContent = '';
  for (const el of diffEls) {
    diffContent += (el.textContent || '') + '\n';
  }

  // Publish date
  const timeEl = doc.querySelector('relative-time, time[datetime]');
  const publishDate = timeEl?.getAttribute('datetime') || undefined;

  // Build content
  const lines: string[] = [];
  if (fileMapComment) lines.push(fileMapComment, '');
  lines.push(`# Commit: ${commitTitle}`);
  if (commitDesc) lines.push('', commitDesc);
  lines.push('');
  lines.push(`**Author:** ${author || 'unknown'} | **SHA:** ${sha}`);
  if (stats) lines.push(`**Stats:** ${stats}`);
  lines.push('');

  if (fileListing) {
    lines.push(fileListing);
    lines.push('');
  }

  if (diffContent.trim()) {
    lines.push('## Diff\n');
    lines.push('```');
    lines.push(diffContent.trim());
    lines.push('```');
  }

  return buildResult(url, 'commit', commitTitle, lines.join('\n'), {
    author,
    publishDate,
  });
}

/** Extract diff content from a PR sub-page (/pull/N/changes/SHA or /pull/N/files) */
function extractPRDiff(url: string, doc: Document): ExtractedContent {
  const u = new URL(url);

  // PR title from page header
  const titleEl = doc.querySelector('.gh-header-title .js-issue-title') || doc.querySelector('h1 bdi');
  let title = textOf(titleEl) || '';

  // SHA from URL if this is a specific commit view
  const shaMatch = u.pathname.match(/\/changes\/([0-9a-f]+)/);
  const sha = shaMatch ? shaMatch[1].slice(0, 7) : '';
  if (sha) title = title ? `${title} (commit ${sha})` : `Commit ${sha}`;
  else if (!title) title = 'PR Files Changed';

  // Stats
  const statsEl = doc.querySelector('.diffstat, #diffstat, .toc-diff-stats');
  const stats = textOf(statsEl);

  // Files — use data-file-path (modern GitHub) then fall back to file-header [title]
  const repoBase = u.pathname.replace(/\/pull\/.*$/, '');
  const files: { path: string; url: string }[] = [];
  const filePathEls = doc.querySelectorAll('[data-file-path]');
  for (const el of filePathEls) {
    const path = el.getAttribute('data-file-path');
    if (path && !files.some(f => f.path === path)) {
      files.push({ path, url: `https://github.com${repoBase}/blob/HEAD/${path}` });
    }
  }
  if (files.length === 0) {
    const fileHeaders = doc.querySelectorAll('.file-header [title], .file-info a[title]');
    for (const fh of fileHeaders) {
      const path = fh.getAttribute('title') || textOf(fh);
      if (path && !files.some(f => f.path === path)) {
        files.push({ path, url: `https://github.com${repoBase}/blob/HEAD/${path}` });
      }
    }
  }

  const { comment: fileMapComment, listing: fileListing } = buildFileMap(files);

  // Diff content
  const diffEls = doc.querySelectorAll('.blob-code-inner');
  let diffContent = '';
  for (const el of diffEls) {
    diffContent += (el.textContent || '') + '\n';
  }

  // Review comments (inline review threads)
  const reviewBodies = doc.querySelectorAll('.markdown-body');
  const reviewComments: string[] = [];
  const seenBodies = new Set<Element>();
  for (const el of reviewBodies) {
    if (seenBodies.has(el)) continue;
    seenBodies.add(el);
    const text = markdownBodyToText(el);
    if (text && text.length > 10) {
      const container = el.closest('[class*="ReviewThreadComment"]') || el.parentElement;
      const authorEl = container?.querySelector('.author, a[data-hovercard-type="user"]');
      const author = textOf(authorEl);
      const isBotAuthor = author ? /\[bot\]$/i.test(author) : false;
      const tag = isBotAuthor ? ' [BOT]' : '';
      reviewComments.push(`**${author || 'unknown'}**${tag}: ${text}`);
    }
  }

  // Author from header meta
  const authorEl = doc.querySelector('.gh-header-meta .author, .js-issue-header-author');
  const author = textOf(authorEl);

  // Build content
  const lines: string[] = [];
  if (fileMapComment) lines.push(fileMapComment, '');
  lines.push(`# ${title}`);
  lines.push('');
  if (author) lines.push(`**Author:** ${author}`);
  if (sha) lines.push(`**Commit:** ${sha}`);
  if (stats) lines.push(`**Stats:** ${stats}`);
  if (files.length) lines.push(`**Files changed:** ${files.length}`);
  lines.push('');

  if (fileListing) {
    lines.push(fileListing);
    lines.push('');
  }

  if (diffContent.trim()) {
    lines.push('## Diff\n');
    lines.push('```');
    lines.push(diffContent.trim());
    lines.push('```');
    lines.push('');
  }

  if (reviewComments.length > 0) {
    lines.push('## Review Comments\n');
    for (const rc of reviewComments) {
      lines.push(rc);
      lines.push('');
    }
  }

  return buildResult(url, 'commit', title, lines.join('\n'), { author });
}

function extractRelease(url: string, doc: Document): ExtractedContent {
  // Tag name and title
  const tagEl = doc.querySelector('.release-header .f1 a, .release-header .css-truncate-target');
  const tagName = textOf(tagEl);

  const titleEl = doc.querySelector('.release-header .markdown-title, .release-header h1');
  const releaseTitle = textOf(titleEl) || tagName || 'Release';

  // Body
  const bodyEl = doc.querySelector('.release-body .markdown-body');
  const body = markdownBodyToText(bodyEl);

  // Author
  const authorEl = doc.querySelector('.release-header .author, .release-header a[data-hovercard-type="user"]');
  const author = textOf(authorEl);

  // Date
  const timeEl = doc.querySelector('.release-header relative-time, .release-header time');
  const publishDate = timeEl?.getAttribute('datetime') || undefined;

  // Assets
  const assetEls = doc.querySelectorAll('.release-main-section details .Box-row a[href*="/releases/download/"]');
  const assets: string[] = [];
  for (const el of assetEls) {
    const name = textOf(el);
    const sizeEl = el.closest('.Box-row')?.querySelector('.text-small, .color-fg-muted');
    const size = textOf(sizeEl);
    if (name) assets.push(size ? `${name} (${size})` : name);
  }

  // Build content
  const lines: string[] = [];
  lines.push(`# Release: ${releaseTitle}`);
  if (tagName && tagName !== releaseTitle) lines.push(`**Tag:** ${tagName}`);
  lines.push(`**Author:** ${author || 'unknown'}`);
  if (publishDate) lines.push(`**Date:** ${publishDate}`);
  lines.push('');

  if (body) {
    lines.push('## Release Notes\n');
    lines.push(body);
    lines.push('');
  }

  if (assets.length > 0) {
    lines.push('## Assets\n');
    for (const a of assets) lines.push(`- ${a}`);
    lines.push('');
  }

  return buildResult(url, 'release', releaseTitle, lines.join('\n'), {
    author,
    publishDate,
  });
}

// ─── Utility ───────────────────────────────────────────────────────────

function parseCount(text: string): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[,\s]/g, '');
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  const kMatch = cleaned.match(/^([\d.]+)[kK]$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^([\d.]+)[mM]$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  return undefined;
}
