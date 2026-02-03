import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../utils/logger.js';
import type { ProviderAdapter, Message, GenerateOptions, GenerateResult } from './types.js';
import { calculateCost } from './types.js';

export class GoogleAdapter implements ProviderAdapter {
  name = 'google';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generate(
    model: string,
    messages: Message[],
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    try {
      const genModel = this.client.getGenerativeModel({
        model,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 4096,
          stopSequences: options.stopSequences,
          responseMimeType: options.responseFormat === 'json' ? 'application/json' : undefined,
        },
      });

      // Convert messages to Gemini format
      const systemInstruction = messages.find((m) => m.role === 'system')?.content;
      const history = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      // Get the last user message for the current turn
      const lastMessage = history.pop();
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      const chat = genModel.startChat({
        history: history.map((h) => ({
          role: h.role as 'user' | 'model',
          parts: h.parts,
        })),
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      });

      const result = await chat.sendMessage(lastMessage.parts[0]!.text);
      const response = result.response;
      const content = response.text();

      // Estimate tokens (Gemini doesn't always return exact counts)
      const inputTokens = response.usageMetadata?.promptTokenCount ??
        Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
      const outputTokens = response.usageMetadata?.candidatesTokenCount ??
        Math.ceil(content.length / 4);

      let json: Record<string, unknown> | undefined;
      if (options.responseFormat === 'json') {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            json = JSON.parse(jsonMatch[0]);
          }
        } catch {
          logger.warn({ content: content.substring(0, 200) }, 'Failed to parse Google JSON response');
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
      logger.error({ error, model }, 'Google generate failed');
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const model = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await model.generateContent('Hi');
      return true;
    } catch {
      return false;
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return calculateCost(inputTokens, outputTokens, model);
  }
}
