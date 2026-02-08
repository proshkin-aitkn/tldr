import type { ChatMessage, ChatOptions, LLMProvider, ProviderConfig } from './types';

const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com';

export class GoogleProvider implements LLMProvider {
  readonly id = 'google';
  readonly name = 'Google Gemini';
  private config: ProviderConfig;
  private endpoint: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
  }

  async sendChat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const { systemInstruction, contents } = convertMessages(messages);
    const url = `${this.endpoint}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const generationConfig: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 4096,
    };
    if (options?.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Gemini request timed out after 90s');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const { systemInstruction, contents } = convertMessages(messages);
    const url = `${this.endpoint}/v1beta/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    const streamGenConfig: Record<string, unknown> = {
      temperature: options?.temperature ?? 0.3,
      maxOutputTokens: options?.maxTokens ?? 4096,
    };
    if (options?.jsonMode) {
      streamGenConfig.responseMimeType = 'application/json';
    }

    const body: Record<string, unknown> = { contents, generationConfig: streamGenConfig };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
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
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) yield text;
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

function convertMessages(messages: ChatMessage[]): {
  systemInstruction: { parts: Array<{ text: string }> } | undefined;
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
} {
  let systemInstruction: { parts: Array<{ text: string }> } | undefined;
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (!systemInstruction) {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        systemInstruction.parts.push({ text: msg.content });
      }
    } else {
      const parts: Array<Record<string, unknown>> = [{ text: msg.content }];
      if (msg.images?.length) {
        for (const img of msg.images) {
          if ('url' in img) {
            // Google doesn't support arbitrary URLs — skip URL images for Gemini
            // (This path shouldn't be reached because probe will return 'base64' for Gemini)
          } else {
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
          }
        }
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }
  }

  return { systemInstruction, contents };
}
