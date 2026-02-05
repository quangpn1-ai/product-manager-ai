// AI Provider Adapter Types

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  responseFormat?: 'text' | 'json';
}

export interface GenerateResult {
  text: string;
  json?: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  raw?: unknown;
}

export interface ProviderAdapter {
  name: string;
  generate(model: string, messages: Message[], options?: GenerateOptions): Promise<GenerateResult>;
  healthCheck(): Promise<boolean>;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
}

// Model pricing (per 1M tokens in cents)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4': { input: 300, output: 600 },
  'gpt-4-turbo': { input: 1000, output: 3000 },
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
  'gpt-3.5-turbo': { input: 50, output: 150 },
  // Anthropic
  'claude-3-5-sonnet-20241022': { input: 300, output: 1500 },
  'claude-3-opus-20240229': { input: 1500, output: 7500 },
  'claude-3-sonnet-20240229': { input: 300, output: 1500 },
  'claude-3-haiku-20240307': { input: 25, output: 125 },
  // Google
  'gemini-1.5-pro': { input: 125, output: 500 },
  'gemini-1.5-flash': { input: 7.5, output: 30 },
};

export function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] ?? { input: 100, output: 300 }; // Default pricing
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.ceil((inputCost + outputCost) * 100); // Convert to cents
}
