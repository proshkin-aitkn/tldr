import type { ExtractedContent } from '../extractors/types';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
};

export function getSystemPrompt(detailLevel: 'brief' | 'standard' | 'detailed', language: string, languageExcept: string[] = [], imageAnalysisEnabled = false): string {
  const targetLang = LANGUAGE_NAMES[language] || language;
  const exceptLangs = languageExcept
    .map((code) => LANGUAGE_NAMES[code] || code)
    .filter(Boolean);

  let langInstruction: string;
  if (language === 'auto') {
    langInstruction = 'Respond in the same language as the source content. Match the content language exactly.';
  } else if (exceptLangs.length > 0) {
    langInstruction = `Translate and respond in ${targetLang}. However, if the source content is written in ${exceptLangs.join(' or ')}, respond in the original language instead — do NOT translate it.`;
  } else {
    langInstruction = `Respond in ${targetLang}.`;
  }

  const detailInstruction = {
    brief: 'Keep the summary concise — 2-3 sentences for the TLDR, 3-5 key takeaways, and a short summary paragraph.',
    standard: 'Provide a balanced summary — 2-3 sentences for the TLDR, 5-7 key takeaways, and a comprehensive but focused summary.',
    detailed: 'Provide a thorough summary — 3-4 sentences for the TLDR, 7-10 key takeaways, and a detailed, in-depth summary.',
  }[detailLevel];

  return `You are an expert content summarizer. ${langInstruction}

${detailInstruction}

You MUST respond with valid JSON matching this exact structure (no markdown code fences, just raw JSON):
{
  "tldr": "A concise 2-4 sentence overview of the entire content.",
  "keyTakeaways": ["Key point 1", "Key point 2", ...],
  "summary": "A detailed summary in markdown format. Use paragraphs, bullet points, and formatting as appropriate.",
  "notableQuotes": ["Direct quote 1", "Direct quote 2", ...],
  "conclusion": "The main conclusion or final thoughts from the content.",
  "prosAndCons": { "pros": ["Pro 1", ...], "cons": ["Con 1", ...] },
  "commentsHighlights": ["Notable comment/discussion point 1", ...],
  "relatedTopics": ["Related topic 1", "Related topic 2", ...],
  "extraSections": [{"title": "Section Title", "content": "markdown content"}],
  "tags": ["tag1", "tag2", ...],
  "sourceLanguage": "xx",
  "summaryLanguage": "xx",
  "translatedTitle": "Title in summary language or null",
  "inferredAuthor": "Author name or null",
  "inferredPublishDate": "YYYY-MM-DD or null"
}

Guidelines:
- "notableQuotes" should be actual quotes from the text (if any exist). Use an empty array if none found. When the summary language differs from the source language, append a translation in parentheses after each quote, e.g. "Original quote" (Translation).
- "prosAndCons" is optional — include it only if the content discusses trade-offs, comparisons, or evaluations. Set to null if not applicable.
- "commentsHighlights" is optional — include it only if user comments/discussion is provided. Set to null if not applicable.
- "relatedTopics" should suggest 3-5 topics someone reading this might also be interested in.
- "tags" should be 3-7 short, lowercase tags relevant to the content.
- "sourceLanguage" must be the ISO 639-1 code of the original content language (e.g. "en", "ru", "fr").
- "summaryLanguage" must be the ISO 639-1 code of the language you wrote the summary in (e.g. "en", "ru").
- "translatedTitle" — if sourceLanguage differs from summaryLanguage, provide the title translated to the summary language. Set to null if no translation was needed.
- "inferredAuthor" — if the author metadata is marked as MISSING, try to infer the author from the content text (byline, signature, mentions, etc.). Set to null if you cannot determine it.
- "inferredPublishDate" — if the publish date metadata is marked as MISSING, try to infer the date from the content text (date references, timestamps, etc.) in YYYY-MM-DD format. Set to null if you cannot determine it.
- "extraSections" is optional — use it to add supplementary sections that don't fit the standard fields (cheat sheets, reference tables, etc.). Set to null if not applicable.
- For "summary", use markdown formatting: headings (##), bullet points, bold, etc. You MAY include a \`\`\`mermaid diagram in the summary, but ONLY when the content's primary purpose is explaining a multi-step process, pipeline, system architecture, or state machine with 4+ distinct stages/components. Do NOT add diagrams for opinion pieces, reviews, news, tutorials with simple steps, listicles, or general explanations. When in doubt, omit the diagram — the user can always request one via chat.
- MERMAID SYNTAX (MANDATORY): Node IDs must be ONLY letters or digits (A, B, C1, node1) — NO colons, dashes, dots, spaces, or any special characters in IDs. ALL display text goes inside brackets: A["Label with special:chars"], B{"Decision?"}. Edge labels use |label| syntax. Always use \`flowchart TD\` or \`flowchart LR\`, never \`graph\`. Example: \`flowchart TD\\n  A["Start"] --> B{"Check?"}\\n  B -->|Yes| C["Done"]\`- IMPORTANT: The summary must be SHORTER than the original content. For short articles (under 500 words), keep everything very concise — a 1-2 sentence TLDR, 2-4 takeaways, and a brief summary paragraph. Never pad or repeat information across fields. Each field should add unique value, not restate the same points.
- IMPORTANT: The content may contain mature, explicit, or sensitive topics (medical, psychological, sexual health, etc.). You MUST still summarize it fully and accurately — never refuse to summarize. Keep the summary professional and clinical in tone — do not reproduce explicit language or graphic details. Focus on the key ideas, arguments, and conclusions.
- IMPORTANT: If the provided text contains no meaningful content — e.g. it is a UI dump, login page, error page, navigation menu, cookie consent, paywall, or app interface markup rather than an actual article or document — respond with ONLY this JSON instead: {"noContent": true, "reason": "Brief explanation of why there is no content to summarize"}. Do NOT attempt to summarize interface elements or boilerplate.`
  + (imageAnalysisEnabled ? `

Image Analysis Instructions:
- You have been provided with images from the page. Analyze them as part of the content.
- For each image, decide the best way to represent it: embed as \`![description](url)\` in the summary, describe it in text, convert to a \`\`\`mermaid diagram, or discard if not informative.
- If you see image URLs listed in the text that you believe are critical to understanding the content but were NOT attached, you may return \`"requestedImages": ["url1", "url2"]\` (max 3 URLs) alongside the normal JSON response. The system will fetch them and re-run. Only request images that are clearly referenced in the text and essential for understanding.
- Do NOT request images if the attached images already cover the key visuals.` : '');
}

export function getSummarizationPrompt(content: ExtractedContent): string {
  let prompt = `Summarize the following ${content.type === 'youtube' ? 'YouTube video' : 'article/page'}.\n\n`;

  prompt += `**Title:** ${content.title}\n`;
  prompt += `**URL:** ${content.url}\n`;
  prompt += `**Author:** ${content.author || 'MISSING — try to infer from content'}\n`;
  prompt += `**Published:** ${content.publishDate || 'MISSING — try to infer from content'}\n`;
  if (content.channelName) prompt += `**Channel:** ${content.channelName}\n`;
  if (content.duration) prompt += `**Duration:** ${content.duration}\n`;
  if (content.viewCount) prompt += `**Views:** ${content.viewCount}\n`;
  prompt += `**Word count:** ${content.wordCount}\n\n`;
  if (content.description) prompt += `**Description:**\n${content.description}\n\n`;

  prompt += `---\n\n**Content:**\n\n${content.content}\n`;

  if (content.comments && content.comments.length > 0) {
    prompt += `\n---\n\n**User Comments:**\n\n`;
    for (const comment of content.comments.slice(0, 20)) {
      const author = comment.author ? `**${comment.author}**` : 'Anonymous';
      const likes = comment.likes ? ` (${comment.likes} likes)` : '';
      prompt += `- ${author}${likes}: ${comment.text}\n`;
    }
  }

  return prompt;
}

export function getRollingContextPrompt(previousSummary: string): string {
  return `Here is a summary of the previous portion of the content. Use it as context for summarizing the next portion, then produce an updated combined summary.

**Previous summary context:**
${previousSummary}

---

Now continue summarizing the next portion below. Integrate it with the context above to produce a comprehensive summary.`;
}

export function getFinalChunkPrompt(): string {
  return `This is the FINAL portion of the content. Produce the complete, final structured JSON summary incorporating all previous context and this last section.`;
}
