import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import {
  Key,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  CheckCircle,
  Loader2,
  Sparkles,
  Bot,
  Cpu,
} from 'lucide-react';

interface ProviderConfig {
  provider: string;
  mode: 'byok' | 'managed' | 'disabled';
  api_key_last4?: string;
  is_healthy: boolean;
  updated_at: string;
}

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: Sparkles, color: 'text-green-600 bg-green-100' },
  { id: 'anthropic', name: 'Anthropic (Claude)', icon: Bot, color: 'text-purple-600 bg-purple-100' },
  { id: 'google', name: 'Google AI (Gemini)', icon: Cpu, color: 'text-blue-600 bg-blue-100' },
];

export default function AISettings() {
  const { currentOrgId } = useAuth();
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: providersData, isLoading } = useQuery({
    queryKey: ['ai-providers', currentOrgId],
    queryFn: () => api.get(`/orgs/${currentOrgId}/ai/providers`),
    enabled: !!currentOrgId,
  });

  // Default models for each provider
  const DEFAULT_MODELS: Record<string, string> = {
    openai: 'gpt-4',
    anthropic: 'claude-3-5-sonnet-20241022',
    google: 'gemini-1.5-pro',
  };

  const saveMutation = useMutation({
    mutationFn: ({ provider, mode, apiKey }: { provider: string; mode: string; apiKey?: string }) =>
      api.put(`/orgs/${currentOrgId}/ai/providers/${provider}`, {
        mode,
        api_key: apiKey,
        default_model: DEFAULT_MODELS[provider],
        is_enabled: mode !== 'disabled',
      }),
    onSuccess: (_, variables) => {
      setSaveSuccess(variables.provider);
      setSaveError(null);
      setEditingProvider(null);
      setApiKey('');
      queryClient.invalidateQueries({ queryKey: ['ai-providers', currentOrgId] });
      setTimeout(() => setSaveSuccess(null), 3000);
    },
    onError: (err: any, variables) => {
      setSaveError(err.response?.data?.error?.message || 'Failed to save configuration');
    },
  });

  // Test connection - not implemented yet
  const handleTestConnection = (provider: string) => {
    setSaveError('Test connection is not available yet. Please save the configuration and try using the API.');
  };

  const providers: ProviderConfig[] = providersData?.data?.data || [];

  const getProviderConfig = (providerId: string): ProviderConfig | undefined => {
    return providers.find((p) => p.provider === providerId);
  };

  const handleSave = (providerId: string, mode: string) => {
    if (mode === 'disabled') {
      // Just close the editing panel - no config needed for disabled
      setEditingProvider(null);
      setApiKey('');
      setSaveSuccess(providerId);
      setTimeout(() => setSaveSuccess(null), 3000);
      return;
    }
    saveMutation.mutate({
      provider: providerId,
      mode,
      apiKey: mode === 'byok' ? apiKey : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Provider Settings</h1>
        <p className="mt-1 text-gray-500">
          Configure your AI providers. You can use your own API keys (BYOK) or use managed keys.
        </p>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{saveError}</span>
        </div>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const config = getProviderConfig(provider.id);
          const Icon = provider.icon;
          const isEditing = editingProvider === provider.id;

          return (
            <div key={provider.id} className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${provider.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{provider.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        config?.mode === 'byok'
                          ? 'bg-blue-100 text-blue-800'
                          : config?.mode === 'managed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {config?.mode === 'byok' ? 'BYOK' : config?.mode === 'managed' ? 'Managed' : 'Disabled'}
                      </span>
                      {config?.mode !== 'disabled' && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          config?.is_healthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {config?.is_healthy ? 'Healthy' : 'Unhealthy'}
                        </span>
                      )}
                      {config?.api_key_last4 && (
                        <span className="text-sm text-gray-500">
                          Key: ****{config.api_key_last4}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saveSuccess === provider.id && (
                    <span className="flex items-center gap-1 text-green-600 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      Saved
                    </span>
                  )}
                  {!isEditing && (
                    <button
                      onClick={() => setEditingProvider(provider.id)}
                      className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      Configure
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-6 pt-6 border-t space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Configuration Mode
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`mode-${provider.id}`}
                          value="byok"
                          defaultChecked={config?.mode === 'byok'}
                          className="text-blue-600"
                        />
                        <span className="text-sm">Use my own API key (BYOK)</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`mode-${provider.id}`}
                          value="managed"
                          defaultChecked={config?.mode === 'managed'}
                          className="text-blue-600"
                        />
                        <span className="text-sm">Use managed key</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`mode-${provider.id}`}
                          value="disabled"
                          defaultChecked={config?.mode === 'disabled' || !config}
                          className="text-blue-600"
                        />
                        <span className="text-sm">Disabled</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Key (for BYOK mode)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Key className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={config?.api_key_last4 ? `Current key: ****${config.api_key_last4}` : 'Enter your API key'}
                        className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {showKey ? (
                          <EyeOff className="h-5 w-5 text-gray-400" />
                        ) : (
                          <Eye className="h-5 w-5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setEditingProvider(null);
                        setApiKey('');
                      }}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleTestConnection(provider.id)}
                      className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Test Connection
                    </button>
                    <button
                      onClick={() => {
                        const mode = (document.querySelector(`input[name="mode-${provider.id}"]:checked`) as HTMLInputElement)?.value || 'disabled';
                        handleSave(provider.id, mode);
                      }}
                      disabled={saveMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {saveMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
