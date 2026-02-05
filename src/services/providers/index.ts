import { config } from '../../config/index.js';
import { providerRepository } from '../../db/repositories/provider-repository.js';
import { ProviderNotConfiguredError } from '../../utils/errors.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import type { ProviderAdapter } from './types.js';
import type { AIProvider } from '../../types/index.js';

export * from './types.js';
export { OpenAIAdapter } from './openai-adapter.js';
export { AnthropicAdapter } from './anthropic-adapter.js';
export { GoogleAdapter } from './google-adapter.js';

/**
 * Gets a provider adapter for the given organization and provider
 * Handles BYOK vs managed mode
 */
export async function getProviderAdapter(
  orgId: string,
  provider: AIProvider
): Promise<ProviderAdapter> {
  const providerConfig = await providerRepository.findProviderConfig(orgId, provider);

  let apiKey: string | undefined;

  if (providerConfig) {
    if (!providerConfig.isEnabled) {
      throw new ProviderNotConfiguredError(provider);
    }

    if (providerConfig.mode === 'byok') {
      apiKey = providerRepository.getDecryptedApiKey(providerConfig) ?? undefined;
    } else {
      // Managed mode - use platform key
      apiKey = getManagedKey(provider);
    }
  } else {
    // No config - try managed key as fallback
    apiKey = getManagedKey(provider);
  }

  if (!apiKey) {
    throw new ProviderNotConfiguredError(provider);
  }

  return createAdapter(provider, apiKey);
}

/**
 * Gets the default model for a provider in an organization
 */
export async function getDefaultModel(orgId: string, provider: AIProvider): Promise<string> {
  const providerConfig = await providerRepository.findProviderConfig(orgId, provider);

  if (providerConfig?.defaultModel) {
    return providerConfig.defaultModel;
  }

  // Default models by provider
  const defaults: Record<AIProvider, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    google: 'gemini-1.5-pro',
  };

  return defaults[provider];
}

/**
 * Checks if a model is allowed for use in an organization
 */
export async function isModelAllowed(
  orgId: string,
  provider: AIProvider,
  model: string
): Promise<boolean> {
  const providerConfig = await providerRepository.findProviderConfig(orgId, provider);

  if (!providerConfig) {
    return true; // No restrictions if no config
  }

  if (!providerConfig.allowedModels || providerConfig.allowedModels.length === 0) {
    return true; // No restrictions
  }

  return providerConfig.allowedModels.includes(model);
}

function getManagedKey(provider: AIProvider): string | undefined {
  const keys: Record<AIProvider, string | undefined> = {
    openai: config.managedProviders.openai,
    anthropic: config.managedProviders.anthropic,
    google: config.managedProviders.google,
  };
  return keys[provider];
}

function createAdapter(provider: AIProvider, apiKey: string): ProviderAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(apiKey);
    case 'anthropic':
      return new AnthropicAdapter(apiKey);
    case 'google':
      return new GoogleAdapter(apiKey);
    default:
      throw new ProviderNotConfiguredError(provider);
  }
}
