import type { ChatMessage, ChatOptions, LLMProvider, ProviderConfig } from './types';

/**
 * Base provider for OpenAI-compatible APIs.
 * Works for: OpenAI, xAI (Grok), DeepSeek, self-hosted (Ollama, LM Studio).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: string;
  readonly name: string;
  private config: ProviderConfig;
  private endpoint: string;
  private isOpenAI: boolean;

  constructor(config: ProviderConfig, name: string, defaultEndpoint: string) {
    this.id = config.providerId;
    this.name = name;
    this.config = config;
    this.endpoint = config.endpoint || defaultEndpoint;
    this.isOpenAI = config.providerId === 'openai';
  }

  private tokenLimitParam(maxTokens: number): Record<string, number> {
    // OpenAI's newer models (o-series, gpt-4.1, etc.) require max_completion_tokens
    return this.isOpenAI
      ? { max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens };
  }

  private formatMessage(m: ChatMessage): Record<string, unknown> {
    if (m.images?.length) {
      const parts: Array<Record<string, unknown>> = [{ type: 'text', text: m.content }];
      for (const img of m.images) {
        if ('url' in img) {
          parts.push({ type: 'image_url', image_url: { url: img.url } });
        } else {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          });
        }
      }
      return { role: m.role, content: parts };
    }
    return { role: m.role, content: m.content };
  }

  async sendChat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const url = `${this.endpoint}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => this.formatMessage(m)),
      temperature: options?.temperature ?? 0.3,
      ...this.tokenLimitParam(options?.maxTokens ?? 4096),
      stream: false,
    };
    if (options?.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('LLM request timed out after 90s');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const url = `${this.endpoint}/v1/chat/completions`;
    const body = {
      model: this.config.model,
      messages: messages.map((m) => this.formatMessage(m)),
      temperature: options?.temperature ?? 0.3,
      ...this.tokenLimitParam(options?.maxTokens ?? 4096),
      stream: true,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    yield* parseSSEStream(response);
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

export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
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
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
