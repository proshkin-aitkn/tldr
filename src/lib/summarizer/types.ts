export interface SummaryDocument {
  tldr: string;
  keyTakeaways: string[];
  summary: string;
  notableQuotes: string[];
  conclusion: string;
  prosAndCons?: { pros: string[]; cons: string[] };
  factCheck?: string;
  commentsHighlights?: string[];
  relatedTopics: string[];
  tags: string[];
  extraSections?: Array<{ title: string; content: string }>; // custom sections added via chat refinement
  sourceLanguage?: string; // detected source language code, e.g. 'ru'
  summaryLanguage?: string; // language the summary is written in, e.g. 'en'
  translatedTitle?: string; // title translated to summary language (only when translated)
  inferredTitle?: string; // title inferred from content when not in metadata (e.g. Facebook posts)
  inferredAuthor?: string; // author inferred from content when not in metadata
  inferredPublishDate?: string; // publish date inferred from content when not in metadata
  llmProvider?: string; // display name of the LLM provider used, e.g. 'OpenAI'
  llmModel?: string; // model ID used for summarization, e.g. 'gpt-4o'
}
