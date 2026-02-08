export type VisionSupport = 'unknown' | 'none' | 'base64' | 'url';
// 'url' means model accepts both URLs AND base64 (url is a superset)

export interface ModelCapabilities {
  vision: VisionSupport;
  probedAt: number; // timestamp for cache invalidation
}

export type ImageContent =
  | { base64: string; mimeType: string }
  | { url: string };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ImageContent[];
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** When true, ask the provider to enforce valid JSON output. */
  jsonMode?: boolean;
}

export interface LLMProvider {
  id: string;
  name: string;
  sendChat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
  testConnection(): Promise<boolean>;
}

export interface ProviderConfig {
  providerId: string;
  apiKey: string;
  model: string;
  endpoint?: string;
  contextWindow: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  defaultEndpoint: string;
  defaultContextWindow: number;
  apiKeyUrl?: string;
  /** @deprecated Use per-model vision probe via modelCapabilities instead */
  supportsVision?: boolean;
}
