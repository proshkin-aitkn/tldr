import type { ExtractedContent } from '../extractors/types';
import type { SummaryDocument } from '../summarizer/types';
import type { ChatMessage, ModelInfo, VisionSupport } from '../llm/types';
import type { Settings } from '../storage/types';

export type MessageType =
  | 'EXTRACT_CONTENT'
  | 'EXTRACT_RESULT'
  | 'SUMMARIZE'
  | 'SUMMARY_CHUNK'
  | 'SUMMARY_RESULT'
  | 'CHAT_MESSAGE'
  | 'CHAT_RESPONSE'
  | 'CHAT_CHUNK'
  | 'EXPORT'
  | 'EXPORT_RESULT'
  | 'TEST_LLM_CONNECTION'
  | 'TEST_NOTION_CONNECTION'
  | 'CONNECTION_TEST_RESULT'
  | 'GET_SETTINGS'
  | 'SETTINGS_RESULT'
  | 'SAVE_SETTINGS'
  | 'SAVE_SETTINGS_RESULT'
  | 'FETCH_NOTION_DATABASES'
  | 'NOTION_DATABASES_RESULT'
  | 'FETCH_MODELS'
  | 'FETCH_MODELS_RESULT'
  | 'FETCH_IMAGES'
  | 'FETCH_IMAGES_RESULT'
  | 'PROBE_VISION'
  | 'PROBE_VISION_RESULT'
  | 'CHECK_NOTION_DUPLICATE'
  | 'CHECK_NOTION_DUPLICATE_RESULT';

export interface ExtractContentMessage {
  type: 'EXTRACT_CONTENT';
}

export interface ExtractResultMessage {
  type: 'EXTRACT_RESULT';
  success: boolean;
  data?: ExtractedContent;
  tabId?: number;
  error?: string;
}

export interface SummarizeMessage {
  type: 'SUMMARIZE';
  content: ExtractedContent;
  userInstructions?: string;
}

export interface SummaryChunkMessage {
  type: 'SUMMARY_CHUNK';
  chunk: string;
}

export interface SummaryResultMessage {
  type: 'SUMMARY_RESULT';
  success: boolean;
  data?: SummaryDocument;
  error?: string;
}

export interface ChatMessageRequest {
  type: 'CHAT_MESSAGE';
  messages: ChatMessage[];
  summary: SummaryDocument;
  content: ExtractedContent;
  theme?: 'light' | 'dark';
}

export interface ChatResponseMessage {
  type: 'CHAT_RESPONSE';
  success: boolean;
  message?: string;
  error?: string;
}

export interface ChatChunkMessage {
  type: 'CHAT_CHUNK';
  chunk: string;
}

export interface ExportMessage {
  type: 'EXPORT';
  adapterId: string;
  summary: SummaryDocument;
  content: ExtractedContent;
  replacePageId?: string;
}

export interface ExportResultMessage {
  type: 'EXPORT_RESULT';
  success: boolean;
  url?: string;
  error?: string;
}

export interface TestLLMConnectionMessage {
  type: 'TEST_LLM_CONNECTION';
}

export interface TestNotionConnectionMessage {
  type: 'TEST_NOTION_CONNECTION';
}

export interface ConnectionTestResultMessage {
  type: 'CONNECTION_TEST_RESULT';
  success: boolean;
  error?: string;
  warning?: string;
  visionSupport?: VisionSupport;
  databaseId?: string;
  databaseName?: string;
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

export interface SettingsResultMessage {
  type: 'SETTINGS_RESULT';
  settings: Settings;
}

export interface SaveSettingsMessage {
  type: 'SAVE_SETTINGS';
  settings: Partial<Settings>;
}

export interface SaveSettingsResultMessage {
  type: 'SAVE_SETTINGS_RESULT';
  success: boolean;
}

export interface FetchNotionDatabasesMessage {
  type: 'FETCH_NOTION_DATABASES';
}

export interface NotionDatabasesResultMessage {
  type: 'NOTION_DATABASES_RESULT';
  success: boolean;
  databases?: Array<{ id: string; title: string }>;
  error?: string;
}

// API key is passed in the message (not read from storage) because the user may
// be testing unsaved credentials in Settings before committing them.
export interface FetchModelsMessage {
  type: 'FETCH_MODELS';
  providerId: string;
  apiKey: string;
  endpoint?: string;
}

export interface FetchModelsResultMessage {
  type: 'FETCH_MODELS_RESULT';
  success: boolean;
  models?: ModelInfo[];
  error?: string;
}

export interface FetchImagesMessage {
  type: 'FETCH_IMAGES';
  imageUrls: string[];
}

export interface FetchImagesResultMessage {
  type: 'FETCH_IMAGES_RESULT';
  success: boolean;
  error?: string;
}

// Unsaved credentials passed in message — user may be testing a new provider
// config in Settings before saving. Falls back to saved settings if omitted.
export interface ProbeVisionMessage {
  type: 'PROBE_VISION';
  providerId?: string;
  apiKey?: string;
  model?: string;
  endpoint?: string;
}

export interface ProbeVisionResultMessage {
  type: 'PROBE_VISION_RESULT';
  success: boolean;
  vision?: VisionSupport;
  error?: string;
}

export interface CheckNotionDuplicateMessage {
  type: 'CHECK_NOTION_DUPLICATE';
  url: string;
}

export interface CheckNotionDuplicateResultMessage {
  type: 'CHECK_NOTION_DUPLICATE_RESULT';
  success: boolean;
  duplicatePageId?: string;
  duplicatePageUrl?: string;
  duplicateTitle?: string;
  error?: string;
}

export type Message =
  | ExtractContentMessage
  | ExtractResultMessage
  | SummarizeMessage
  | SummaryChunkMessage
  | SummaryResultMessage
  | ChatMessageRequest
  | ChatResponseMessage
  | ChatChunkMessage
  | ExportMessage
  | ExportResultMessage
  | TestLLMConnectionMessage
  | TestNotionConnectionMessage
  | ConnectionTestResultMessage
  | GetSettingsMessage
  | SettingsResultMessage
  | SaveSettingsMessage
  | SaveSettingsResultMessage
  | FetchNotionDatabasesMessage
  | NotionDatabasesResultMessage
  | FetchModelsMessage
  | FetchModelsResultMessage
  | FetchImagesMessage
  | FetchImagesResultMessage
  | ProbeVisionMessage
  | ProbeVisionResultMessage
  | CheckNotionDuplicateMessage
  | CheckNotionDuplicateResultMessage;
