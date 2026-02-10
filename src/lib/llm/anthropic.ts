import type { ChatMessage, ChatOptions, LLMProvider, ProviderConfig } from './types';

const DEFAULT_ENDPOINT = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  private config: ProviderConfig;
  private endpoint: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
  }

  async sendChat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const { system, userMessages } = splitMessages(messages);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: userMessages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.3,
    };
    if (system) body.system = system;

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), 90_000);
    const signal = options?.signal
      ? AbortSignal.any([timeoutController.signal, options.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(`${this.endpoint}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (options?.signal?.aborted) throw new Error('Summarization cancelled');
        throw new Error('Anthropic request timed out after 90s');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const { system, userMessages } = splitMessages(messages);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: userMessages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.3,
      stream: true,
    };
    if (system) body.system = system;

    const response = await fetch(`${this.endpoint}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch {
            // skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.sendChat(
        [{ role: 'user', content: 'Reply with "ok"' }],
        { maxTokens: 10 },
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }
}

function splitMessages(messages: ChatMessage[]): {
  system: string | undefined;
  userMessages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
} {
  let system: string | undefined;
  const userMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = (system ? system + '\n' : '') + msg.content;
    } else if (msg.images?.length) {
      const parts: Array<Record<string, unknown>> = [{ type: 'text', text: msg.content }];
      for (const img of msg.images) {
        if ('url' in img) {
          parts.push({ type: 'image', source: { type: 'url', url: img.url } });
        } else {
          parts.push({
            type: 'image',
            source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
          });
        }
      }
      userMessages.push({ role: msg.role as 'user' | 'assistant', content: parts });
    } else {
      userMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  return { system, userMessages };
}
