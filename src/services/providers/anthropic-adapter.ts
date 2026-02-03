import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger.js';
import type { ProviderAdapter, Message, GenerateOptions, GenerateResult } from './types.js';
import { calculateCost } from './types.js';

export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(
    model: string,
    messages: Message[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    try {
      // Extract system message if present
      const systemMessage = messages.find((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');

      const response = await this.client.messages.create({
        model,
        system: systemMessage?.content,
        messages: nonSystemMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        stop_sequences: options.stopSequences,
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      let json: Record<string, unknown> | undefined;
      if (options.responseFormat === 'json') {
        try {
          // Try to extract JSON from the response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            json = JSON.parse(jsonMatch[0]);
          }
        } catch {
          logger.warn({ content: content.substring(0, 200) }, 'Failed to parse Anthropic JSON response');
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
      logger.error({ error, model }, 'Anthropic generate failed');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple health check by making a minimal request
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return calculateCost(inputTokens, outputTokens, model);
  }
}
