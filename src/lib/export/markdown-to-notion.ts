import { marked, type Token, type Tokens } from 'marked';

// Notion block types used
interface NotionRichText {
  type: 'text';
  text: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
}

interface NotionBlock {
  object: 'block';
  type: string;
  [key: string]: unknown;
}

const MAX_RICH_TEXT_LENGTH = 2000;

export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const tokens = marked.lexer(markdown);
  return tokensToBlocks(tokens);
}

function tokensToBlocks(tokens: Token[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const t = token as Tokens.Heading;
        const level = Math.min(t.depth, 3);
        const type = `heading_${level}` as 'heading_1' | 'heading_2' | 'heading_3';
        blocks.push({
          object: 'block',
          type,
          [type]: { rich_text: inlineTokensToRichText(t.tokens || []) },
        });
        break;
      }

      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        // Check if it's an image-only paragraph
        if (t.tokens?.length === 1 && t.tokens[0].type === 'image') {
          const img = t.tokens[0] as Tokens.Image;
          blocks.push({
            object: 'block',
            type: 'image',
            image: {
              type: 'external',
              external: { url: img.href },
            },
          });
        } else {
          const richText = inlineTokensToRichText(t.tokens || []);
          blocks.push(...splitParagraphBlock(richText));
        }
        break;
      }

      case 'list': {
        const t = token as Tokens.List;
        const listType = t.ordered ? 'numbered_list_item' : 'bulleted_list_item';
        for (const item of t.items) {
          const richText = inlineTokensToRichText(item.tokens ? flattenInlineTokens(item.tokens) : []);
          blocks.push({
            object: 'block',
            type: listType,
            [listType]: { rich_text: richText },
          });
        }
        break;
      }

      case 'blockquote': {
        const t = token as Tokens.Blockquote;
        const innerText = t.tokens
          ? t.tokens.map((inner) => {
            if ('tokens' in inner && inner.tokens) {
              return inlineTokensToRichText(inner.tokens);
            }
            return [makeRichText('text' in inner ? String(inner.text) : '')];
          }).flat()
          : [makeRichText(t.raw.replace(/^>\s*/gm, ''))];

        blocks.push({
          object: 'block',
          type: 'quote',
          quote: { rich_text: innerText },
        });
        break;
      }

      case 'code': {
        const t = token as Tokens.Code;
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: splitRichText(t.text),
            language: mapLanguage(t.lang || 'plain text'),
          },
        });
        break;
      }

      case 'table': {
        const t = token as Tokens.Table;
        const columnCount = t.header.length;
        const rows: NotionBlock[] = [];

        // Header row
        const headerCells = t.header.map((cell) => [
          { type: 'text' as const, text: { content: cell.text }, annotations: { bold: true } },
        ]);
        rows.push({
          object: 'block',
          type: 'table_row',
          table_row: { cells: headerCells },
        });

        // Body rows
        for (const row of t.rows) {
          const cells = row.map((cell) => inlineTokensToRichText(cell.tokens || []));
          // Pad to column count if needed
          while (cells.length < columnCount) cells.push([makeRichText('')]);
          rows.push({
            object: 'block',
            type: 'table_row',
            table_row: { cells },
          });
        }

        blocks.push({
          object: 'block',
          type: 'table',
          table: {
            table_width: columnCount,
            has_column_header: true,
            has_row_header: false,
            children: rows,
          },
        });
        break;
      }

      case 'hr': {
        blocks.push({
          object: 'block',
          type: 'divider',
          divider: {},
        });
        break;
      }

      case 'space': {
        // Skip whitespace tokens
        break;
      }

      default: {
        // For any other token type, try to render as paragraph
        if ('text' in token && typeof token.text === 'string' && token.text.trim()) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: splitRichText(token.text) },
          });
        }
        break;
      }
    }
  }

  return blocks;
}

function flattenInlineTokens(tokens: Token[]): Token[] {
  const result: Token[] = [];
  for (const token of tokens) {
    if (token.type === 'paragraph' && 'tokens' in token && token.tokens) {
      result.push(...token.tokens);
    } else {
      result.push(token);
    }
  }
  return result;
}

function inlineTokensToRichText(tokens: Token[]): NotionRichText[] {
  const result: NotionRichText[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if ('tokens' in t && t.tokens && t.tokens.length > 0) {
          result.push(...inlineTokensToRichText(t.tokens));
        } else {
          result.push(makeRichText(t.text));
        }
        break;
      }
      case 'strong': {
        const t = token as Tokens.Strong;
        const inner = inlineTokensToRichText(t.tokens || []);
        for (const rt of inner) {
          rt.annotations = { ...rt.annotations, bold: true };
        }
        result.push(...inner);
        break;
      }
      case 'em': {
        const t = token as Tokens.Em;
        const inner = inlineTokensToRichText(t.tokens || []);
        for (const rt of inner) {
          rt.annotations = { ...rt.annotations, italic: true };
        }
        result.push(...inner);
        break;
      }
      case 'codespan': {
        const t = token as Tokens.Codespan;
        result.push({
          type: 'text',
          text: { content: t.text },
          annotations: { code: true },
        });
        break;
      }
      case 'link': {
        const t = token as Tokens.Link;
        const text = t.tokens ? inlineTokensToRichText(t.tokens).map((r) => r.text.content).join('') : t.text;
        result.push({
          type: 'text',
          text: { content: text, link: { url: t.href } },
        });
        break;
      }
      case 'br': {
        result.push(makeRichText('\n'));
        break;
      }
      case 'escape': {
        const t = token as Tokens.Escape;
        result.push(makeRichText(t.text));
        break;
      }
      default: {
        if ('text' in token && typeof token.text === 'string') {
          result.push(makeRichText(token.text));
        } else if ('raw' in token && typeof token.raw === 'string') {
          result.push(makeRichText(token.raw));
        }
        break;
      }
    }
  }

  return result;
}

function makeRichText(content: string): NotionRichText {
  return { type: 'text', text: { content } };
}

function splitRichText(text: string): NotionRichText[] {
  if (text.length <= MAX_RICH_TEXT_LENGTH) {
    return [makeRichText(text)];
  }

  const chunks: NotionRichText[] = [];
  for (let i = 0; i < text.length; i += MAX_RICH_TEXT_LENGTH) {
    chunks.push(makeRichText(text.slice(i, i + MAX_RICH_TEXT_LENGTH)));
  }
  return chunks;
}

function splitParagraphBlock(richText: NotionRichText[]): NotionBlock[] {
  // Check total content length
  const totalLength = richText.reduce((sum, rt) => sum + rt.text.content.length, 0);
  if (totalLength <= MAX_RICH_TEXT_LENGTH) {
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: richText },
    }];
  }

  // Split into multiple paragraph blocks
  const blocks: NotionBlock[] = [];
  let currentBatch: NotionRichText[] = [];
  let currentLength = 0;

  for (const rt of richText) {
    if (currentLength + rt.text.content.length > MAX_RICH_TEXT_LENGTH && currentBatch.length > 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: currentBatch },
      });
      currentBatch = [];
      currentLength = 0;
    }

    if (rt.text.content.length > MAX_RICH_TEXT_LENGTH) {
      // Split this single rich text element
      for (let i = 0; i < rt.text.content.length; i += MAX_RICH_TEXT_LENGTH) {
        const chunk = { ...rt, text: { ...rt.text, content: rt.text.content.slice(i, i + MAX_RICH_TEXT_LENGTH) } };
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [chunk] },
        });
      }
    } else {
      currentBatch.push(rt);
      currentLength += rt.text.content.length;
    }
  }

  if (currentBatch.length > 0) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: currentBatch },
    });
  }

  return blocks;
}

function mapLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    yml: 'yaml',
    md: 'markdown',
  };
  return langMap[lang] || lang || 'plain text';
}

