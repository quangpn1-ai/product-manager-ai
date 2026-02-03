import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import type { ProviderAdapter, Message, GenerateOptions, GenerateResult } from './types.js';
import { calculateCost } from './types.js';

export class OpenAIAdapter implements ProviderAdapter {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(
    model: string,
    messages: Message[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stop: options.stopSequences,
        response_format: options.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;

      let json: Record<string, unknown> | undefined;
      if (options.responseFormat === 'json') {
        try {
          json = JSON.parse(content);
        } catch {
          logger.warn({ content: content.substring(0, 200) }, 'Failed to parse OpenAI JSON response');
        }
      }

      return {
        text: content,
        json,
        inputTokens,
        outputTokens,
        raw: response,
      };
    } catch (error) {
      logger.error({ error, model }, 'OpenAI generate failed');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return calculateCost(inputTokens, outputTokens, model);
  }
}
