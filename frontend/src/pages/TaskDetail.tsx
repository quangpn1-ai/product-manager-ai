import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi } from '../lib/api';
import {
  ArrowLeft,
  Play,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  Link,
  FileText as TextIcon,
  CheckSquare,
  ExternalLink,
  Lightbulb,
  AlertCircle,
  HelpCircle,
  Target,
  Loader2,
  Send,
  X,
  Globe,
} from 'lucide-react';

interface ContextItem {
  type: 'link' | 'text' | 'decision';
  title: string;
  url?: string;
  content?: string;
  notes?: string;
}

interface Recommendation {
  type: 'clarification' | 'context' | 'action' | 'warning';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedAction?: string;
}

interface RecommendationResult {
  recommendations: Recommendation[];
  summary: string;
  readinessScore: number;
}

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const { currentOrgId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'document' | 'runs'>('overview');
  const [clarifications, setClarifications] = useState<Array<{ key: string; value: string }>>([]);
  const [newClarificationKey, setNewClarificationKey] = useState('');
  const [newClarificationValue, setNewClarificationValue] = useState('');

  // Context items state
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [showAddContext, setShowAddContext] = useState(false);
  const [newContextType, setNewContextType] = useState<'link' | 'text' | 'decision'>('link');
  const [newContextTitle, setNewContextTitle] = useState('');
  const [newContextUrl, setNewContextUrl] = useState('');
  const [newContextContent, setNewContextContent] = useState('');
  const [newContextNotes, setNewContextNotes] = useState('');

  const { data: taskData, isLoading } = useQuery({
    queryKey: ['task', currentOrgId, taskId],
    queryFn: () => tasksApi.get(currentOrgId!, taskId!),
    enabled: !!currentOrgId && !!taskId,
  });

  const { data: documentsData } = useQuery({
    queryKey: ['documents', currentOrgId, taskId],
    queryFn: () => tasksApi.getDocuments(currentOrgId!, taskId!),
    enabled: !!currentOrgId && !!taskId,
  });

  const { data: runsData } = useQuery({
    queryKey: ['runs', currentOrgId, taskId],
    queryFn: () => tasksApi.getRuns(currentOrgId!, taskId!),
    enabled: !!currentOrgId && !!taskId,
  });

  const { data: recommendationsData, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useQuery({
    queryKey: ['recommendations', currentOrgId, taskId],
    queryFn: () => tasksApi.getRecommendations(currentOrgId!, taskId!),
    enabled: !!currentOrgId && !!taskId && ['NEW', 'CLARIFYING'].includes(taskData?.data?.data?.status || ''),
    staleTime: 60000, // Cache for 1 minute
  });

  const task = taskData?.data?.data;
  const documents = documentsData?.data?.data || [];
  const runs = runsData?.data?.data || [];
  const latestDocument = documents[0];
  const recommendations: RecommendationResult | null = recommendationsData?.data?.data || null;

  // Load clarifications when task loads
  useEffect(() => {
    if (task?.clarification_json) {
      const entries = Object.entries(task.clarification_json).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setClarifications(entries);
    }
  }, [task?.clarification_json]);

  // Load context items when task loads
  useEffect(() => {
    if (task?.context_items_json) {
      setContextItems(task.context_items_json);
    }
  }, [task?.context_items_json]);

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => tasksApi.update(currentOrgId!, taskId!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', currentOrgId, taskId] });
    },
  });

  const saveClarificationsMutation = useMutation({
    mutationFn: (clarificationJson: Record<string, string>) =>
      tasksApi.update(currentOrgId!, taskId!, { clarification_json: clarificationJson }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', currentOrgId, taskId] });
    },
  });

  const handleAddClarification = () => {
    if (newClarificationKey.trim() && newClarificationValue.trim()) {
      setClarifications([...clarifications, { key: newClarificationKey.trim(), value: newClarificationValue.trim() }]);
      setNewClarificationKey('');
      setNewClarificationValue('');
    }
  };

  const handleRemoveClarification = (index: number) => {
    setClarifications(clarifications.filter((_, i) => i !== index));
  };

  const handleSaveClarifications = () => {
    const clarificationJson: Record<string, string> = {};
    clarifications.forEach(({ key, value }) => {
      clarificationJson[key] = value;
    });
    saveClarificationsMutation.mutate(clarificationJson);
  };

  // Context items mutations and handlers
  const saveContextItemsMutation = useMutation({
    mutationFn: (items: ContextItem[]) =>
      tasksApi.update(currentOrgId!, taskId!, { context_items_json: items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', currentOrgId, taskId] });
    },
  });

  const handleAddContextItem = () => {
    if (!newContextTitle.trim()) return;

    const newItem: ContextItem = {
      type: newContextType,
      title: newContextTitle.trim(),
      ...(newContextType === 'link' && newContextUrl && { url: newContextUrl.trim() }),
      ...(newContextType !== 'link' && newContextContent && { content: newContextContent.trim() }),
      ...(newContextNotes && { notes: newContextNotes.trim() }),
    };

    const updatedItems = [...contextItems, newItem];
    setContextItems(updatedItems);
    saveContextItemsMutation.mutate(updatedItems);

    // Reset form
    setNewContextTitle('');
    setNewContextUrl('');
    setNewContextContent('');
    setNewContextNotes('');
    setShowAddContext(false);
  };

  const handleRemoveContextItem = (index: number) => {
    const updatedItems = contextItems.filter((_, i) => i !== index);
    setContextItems(updatedItems);
    saveContextItemsMutation.mutate(updatedItems);
  };

  const createRunMutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = `${taskId}-${Date.now()}`;
      return tasksApi.createRun(currentOrgId!, taskId!, idempotencyKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', currentOrgId, taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', currentOrgId, taskId] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: (format: string) => tasksApi.exportDocument(currentOrgId!, taskId!, format),
    onSuccess: (response) => {
      const content = response.data.data.content;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${task?.title || 'document'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  // Publish state and mutation
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishPlatform, setPublishPlatform] = useState<'webhook' | 'confluence' | 'notion'>('webhook');
  const [publishUrl, setPublishUrl] = useState('');
  const [publishToken, setPublishToken] = useState('');
  const [publishError, setPublishError] = useState('');

  const publishMutation = useMutation({
    mutationFn: (config: Parameters<typeof tasksApi.publishDocument>[2]) =>
      tasksApi.publishDocument(currentOrgId!, taskId!, config),
    onSuccess: (response) => {
      if (response.data.data.success) {
        setShowPublishModal(false);
        queryClient.invalidateQueries({ queryKey: ['task', currentOrgId, taskId] });
        setPublishUrl('');
        setPublishToken('');
      } else {
        setPublishError(response.data.data.error || 'Publish failed');
      }
    },
    onError: (err: any) => {
      setPublishError(err.response?.data?.error?.message || 'Failed to publish');
    },
  });

  const handlePublish = () => {
    setPublishError('');
    const config: Parameters<typeof tasksApi.publishDocument>[2] = {
      platform: publishPlatform,
    };

    if (publishPlatform === 'webhook') {
      if (!publishUrl) {
        setPublishError('Webhook URL is required');
        return;
      }
      config.webhook_url = publishUrl;
    } else if (publishPlatform === 'confluence') {
      config.confluence_base_url = publishUrl || undefined;
      config.api_token = publishToken || undefined;
    } else if (publishPlatform === 'notion') {
      config.notion_database_id = publishUrl || undefined;
      config.api_token = publishToken || undefined;
    }

    publishMutation.mutate(config);
  };

  if (isLoading || !task) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/tasks')}
            className="p-2 hover:bg-gray-100 rounded-md mt-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={task.status} />
              {task.urgency && <UrgencyBadge urgency={task.urgency} />}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* NEW → CLARIFYING */}
          {task.status === 'NEW' && (
            <button
              onClick={() => updateStatusMutation.mutate('CLARIFYING')}
              disabled={updateStatusMutation.isPending}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm disabled:opacity-50"
            >
              {updateStatusMutation.isPending ? 'Updating...' : 'Start Clarification'}
            </button>
          )}

          {/* CLARIFYING → READY_FOR_GENERATION */}
          {task.status === 'CLARIFYING' && (
            <button
              onClick={() => updateStatusMutation.mutate('READY_FOR_GENERATION')}
              disabled={updateStatusMutation.isPending}
              className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm disabled:opacity-50"
            >
              {updateStatusMutation.isPending ? 'Updating...' : 'Ready for Generation'}
            </button>
          )}

          {/* READY_FOR_GENERATION → Generate */}
          {task.status === 'READY_FOR_GENERATION' && (
            <button
              onClick={() => createRunMutation.mutate()}
              disabled={createRunMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {createRunMutation.isPending ? 'Starting...' : 'Generate Brief'}
            </button>
          )}

          {/* APPROVED → Export & Publish */}
          {task.status === 'APPROVED' && (
            <>
              <button
                onClick={() => exportMutation.mutate('markdown')}
                disabled={exportMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                onClick={() => setShowPublishModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Send className="h-4 w-4" />
                Publish
              </button>
            </>
          )}

          {/* FAILED → Retry */}
          {task.status === 'FAILED' && (
            <button
              onClick={() => updateStatusMutation.mutate('READY_FOR_GENERATION')}
              disabled={updateStatusMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              {updateStatusMutation.isPending ? 'Updating...' : 'Retry Generation'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          {(['overview', 'document', 'runs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
          {/* AI Recommendations - Show for NEW and CLARIFYING status */}
          {(task.status === 'NEW' || task.status === 'CLARIFYING') && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  <h3 className="font-medium text-gray-900">AI Recommendations</h3>
                </div>
                <button
                  onClick={() => refetchRecommendations()}
                  disabled={recommendationsLoading}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {recommendationsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </button>
              </div>

              {recommendationsLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing task...</span>
                </div>
              ) : recommendations ? (
                <div className="space-y-3">
                  {/* Readiness Score */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          recommendations.readinessScore >= 70
                            ? 'bg-green-500'
                            : recommendations.readinessScore >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${recommendations.readinessScore}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-600 w-12">
                      {recommendations.readinessScore}%
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="text-sm text-gray-600">{recommendations.summary}</p>

                  {/* Recommendations List */}
                  {recommendations.recommendations.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {recommendations.recommendations.map((rec, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-md border ${
                            rec.priority === 'high'
                              ? 'bg-red-50 border-red-200'
                              : rec.priority === 'medium'
                              ? 'bg-yellow-50 border-yellow-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-shrink-0 mt-0.5">
                              {rec.type === 'clarification' && (
                                <HelpCircle className="h-4 w-4 text-blue-500" />
                              )}
                              {rec.type === 'context' && (
                                <Link className="h-4 w-4 text-green-500" />
                              )}
                              {rec.type === 'action' && (
                                <Target className="h-4 w-4 text-purple-500" />
                              )}
                              {rec.type === 'warning' && (
                                <AlertCircle className="h-4 w-4 text-orange-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm text-gray-800">
                                  {rec.title}
                                </span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    rec.priority === 'high'
                                      ? 'bg-red-100 text-red-700'
                                      : rec.priority === 'medium'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {rec.priority}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                              {rec.suggestedAction && (
                                <p className="text-xs text-blue-600 mt-1 font-medium">
                                  → {rec.suggestedAction}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No recommendations available.</p>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Request</h3>
            <p className="text-gray-900 whitespace-pre-wrap">{task.request_text}</p>
          </div>

          {task.requester_name && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Requester</h3>
              <p className="text-gray-900">{task.requester_name}</p>
            </div>
          )}

          {task.tags && task.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {task.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Context Items Section */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-500">Context & Sources</h3>
              {(task.status === 'NEW' || task.status === 'CLARIFYING') && (
                <button
                  onClick={() => setShowAddContext(!showAddContext)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Context
                </button>
              )}
            </div>

            {/* Add Context Form */}
            {showAddContext && (
              <div className="bg-gray-50 p-4 rounded-md mb-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewContextType('link')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm ${
                      newContextType === 'link' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600'
                    }`}
                  >
                    <Link className="h-4 w-4" /> Link
                  </button>
                  <button
                    onClick={() => setNewContextType('text')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm ${
                      newContextType === 'text' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600'
                    }`}
                  >
                    <TextIcon className="h-4 w-4" /> Text
                  </button>
                  <button
                    onClick={() => setNewContextType('decision')}
                    className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm ${
                      newContextType === 'decision' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-600'
                    }`}
                  >
                    <CheckSquare className="h-4 w-4" /> Decision
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Title *</label>
                  <input
                    type="text"
                    value={newContextTitle}
                    onChange={(e) => setNewContextTitle(e.target.value)}
                    placeholder="e.g., Product Requirements Doc"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>

                {newContextType === 'link' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">URL</label>
                    <input
                      type="url"
                      value={newContextUrl}
                      onChange={(e) => setNewContextUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                )}

                {(newContextType === 'text' || newContextType === 'decision') && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      {newContextType === 'decision' ? 'Decision Details' : 'Content'}
                    </label>
                    <textarea
                      value={newContextContent}
                      onChange={(e) => setNewContextContent(e.target.value)}
                      placeholder={newContextType === 'decision' ? 'Describe the decision made...' : 'Enter text content...'}
                      className="w-full px-3 py-2 border rounded-md text-sm h-24"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={newContextNotes}
                    onChange={(e) => setNewContextNotes(e.target.value)}
                    placeholder="Additional notes..."
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddContext(false)}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddContextItem}
                    disabled={!newContextTitle.trim() || saveContextItemsMutation.isPending}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saveContextItemsMutation.isPending ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {/* Context Items List */}
            {contextItems.length > 0 ? (
              <div className="space-y-2">
                {contextItems.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 bg-gray-50 p-3 rounded-md">
                    <div className="flex-shrink-0 mt-0.5">
                      {item.type === 'link' && <Link className="h-4 w-4 text-blue-500" />}
                      {item.type === 'text' && <TextIcon className="h-4 w-4 text-green-500" />}
                      {item.type === 'decision' && <CheckSquare className="h-4 w-4 text-purple-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-800">{item.title}</span>
                        {item.type === 'link' && item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-600"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {item.content && (
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.content}</p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-gray-400 mt-1 italic">{item.notes}</p>
                      )}
                    </div>
                    {(task.status === 'NEW' || task.status === 'CLARIFYING') && (
                      <button
                        onClick={() => handleRemoveContextItem(index)}
                        className="flex-shrink-0 p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No context items added yet.</p>
            )}
          </div>

          {/* Clarification Form - shown when CLARIFYING */}
          {task.status === 'CLARIFYING' && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 mb-4">Add Clarifications</h3>

              {/* Existing clarifications */}
              {clarifications.length > 0 && (
                <div className="space-y-2 mb-4">
                  {clarifications.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded-md">
                      <span className="font-medium text-sm text-gray-700 min-w-[120px]">{item.key}:</span>
                      <span className="text-sm text-gray-600 flex-1">{item.value}</span>
                      <button
                        onClick={() => handleRemoveClarification(index)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new clarification */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Question/Field</label>
                  <input
                    type="text"
                    value={newClarificationKey}
                    onChange={(e) => setNewClarificationKey(e.target.value)}
                    placeholder="e.g., Target Users"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Answer/Value</label>
                  <input
                    type="text"
                    value={newClarificationValue}
                    onChange={(e) => setNewClarificationValue(e.target.value)}
                    placeholder="e.g., Enterprise customers"
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <button
                  onClick={handleAddClarification}
                  disabled={!newClarificationKey.trim() || !newClarificationValue.trim()}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Save button */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSaveClarifications}
                  disabled={saveClarificationsMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saveClarificationsMutation.isPending ? 'Saving...' : 'Save Clarifications'}
                </button>
              </div>
            </div>
          )}

          {/* Show saved clarifications for other statuses */}
          {task.status !== 'CLARIFYING' && task.clarification_json && Object.keys(task.clarification_json).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Clarifications</h3>
              <div className="space-y-2">
                {Object.entries(task.clarification_json).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 p-2 rounded-md">
                    <span className="font-medium text-sm text-gray-700">{key}:</span>{' '}
                    <span className="text-sm text-gray-600">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'document' && (
        <div className="bg-white rounded-lg shadow-sm border">
          {latestDocument ? (
            <DocumentViewer orgId={currentOrgId!} taskId={taskId!} document={latestDocument} />
          ) : (
            <div className="p-12 text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No document generated yet</p>
              {task.status === 'READY_FOR_GENERATION' && (
                <button
                  onClick={() => createRunMutation.mutate()}
                  className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Generate Brief
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'runs' && (
        <div className="bg-white rounded-lg shadow-sm border">
          {runs.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <RefreshCw className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No runs yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {runs.map((run: any) => (
                <div key={run.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <RunStatusIcon status={run.status} />
                        <span className="font-medium">{run.status}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        Started: {run.started_at ? new Date(run.started_at).toLocaleString() : 'Pending'}
                      </p>
                      {run.finished_at && (
                        <p className="text-sm text-gray-500">
                          Finished: {new Date(run.finished_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-green-600" />
                <h3 className="text-lg font-medium">Publish Document</h3>
              </div>
              <button
                onClick={() => {
                  setShowPublishModal(false);
                  setPublishError('');
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {publishError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  {publishError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
                <div className="flex gap-2">
                  {(['webhook', 'confluence', 'notion'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPublishPlatform(p)}
                      className={`px-3 py-2 rounded-md text-sm font-medium capitalize ${
                        publishPlatform === p
                          ? 'bg-green-100 text-green-700 border-2 border-green-500'
                          : 'bg-gray-100 text-gray-700 border-2 border-transparent'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {publishPlatform === 'webhook' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook URL *
                  </label>
                  <input
                    type="url"
                    value={publishUrl}
                    onChange={(e) => setPublishUrl(e.target.value)}
                    placeholder="https://your-endpoint.com/webhook"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              )}

              {publishPlatform === 'confluence' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confluence Base URL
                    </label>
                    <input
                      type="url"
                      value={publishUrl}
                      onChange={(e) => setPublishUrl(e.target.value)}
                      placeholder="https://your-domain.atlassian.net"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Token
                    </label>
                    <input
                      type="password"
                      value={publishToken}
                      onChange={(e) => setPublishToken(e.target.value)}
                      placeholder="Your Confluence API token"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </>
              )}

              {publishPlatform === 'notion' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Database ID
                    </label>
                    <input
                      type="text"
                      value={publishUrl}
                      onChange={(e) => setPublishUrl(e.target.value)}
                      placeholder="Your Notion database ID"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Integration Token
                    </label>
                    <input
                      type="password"
                      value={publishToken}
                      onChange={(e) => setPublishToken(e.target.value)}
                      placeholder="Your Notion integration token"
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </>
              )}

              <p className="text-xs text-gray-500">
                Note: Confluence and Notion integrations require additional setup. Webhook is recommended for quick integrations.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowPublishModal(false);
                    setPublishError('');
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {publishMutation.isPending ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentViewer({ orgId, taskId, document }: { orgId: string; taskId: string; document: any }) {
  const queryClient = useQueryClient();
  const [showJson, setShowJson] = useState(false);

  const { data: fullDocData } = useQuery({
    queryKey: ['document', orgId, taskId, document.id],
    queryFn: () => tasksApi.getDocument(orgId, taskId, document.id),
  });

  const approveMutation = useMutation({
    mutationFn: (approved: boolean) => tasksApi.approveDocument(orgId, taskId, document.id, approved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', orgId, taskId] });
      queryClient.invalidateQueries({ queryKey: ['documents', orgId, taskId] });
    },
  });

  const fullDoc = fullDocData?.data?.data;
  const content = fullDoc?.content_json?.final || fullDoc?.content_json;

  if (!fullDoc) {
    return <div className="p-4">Loading document...</div>;
  }

  return (
    <div className="divide-y">
      <div className="p-4 flex justify-between items-center bg-gray-50">
        <div>
          <span className="font-medium">Version {fullDoc.version}</span>
          {fullDoc.approved_at && (
            <span className="ml-2 text-green-600 text-sm">
              ✓ Approved {new Date(fullDoc.approved_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJson(!showJson)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {showJson ? 'Show Formatted' : 'Show JSON'}
          </button>
          {!fullDoc.approved_at && (
            <>
              <button
                onClick={() => approveMutation.mutate(false)}
                disabled={approveMutation.isPending}
                className="px-3 py-1 border border-red-300 text-red-600 rounded-md hover:bg-red-50 text-sm"
              >
                Reject
              </button>
              <button
                onClick={() => approveMutation.mutate(true)}
                disabled={approveMutation.isPending}
                className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
              >
                Approve
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-6">
        {showJson ? (
          <pre className="bg-gray-50 p-4 rounded-md text-sm overflow-auto max-h-[600px]">
            {JSON.stringify(fullDoc.content_json, null, 2)}
          </pre>
        ) : content ? (
          <div className="prose max-w-none">
            {Object.entries(content).map(([key, value]) => (
              <Section key={key} title={key} content={value} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No content</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: any }) {
  const formattedTitle = title
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase());

  const renderContent = (value: any): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">N/A</span>;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <span>{String(value)}</span>;
    }
    if (Array.isArray(value)) {
      return (
        <ul className="list-disc list-inside space-y-1 ml-4">
          {value.map((item, i) => (
            <li key={i} className="text-gray-700">{renderContent(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === 'object') {
      return (
        <div className="ml-4 space-y-2">
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <span className="font-medium text-gray-600">{k.replace(/_/g, ' ')}: </span>
              {renderContent(v)}
            </div>
          ))}
        </div>
      );
    }
    return <span>{String(value)}</span>;
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{formattedTitle}</h3>
      <div className="text-gray-700">{renderContent(content)}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    NEW: 'bg-gray-100 text-gray-800',
    CLARIFYING: 'bg-blue-100 text-blue-800',
    READY_FOR_GENERATION: 'bg-purple-100 text-purple-800',
    DRAFT_GENERATED: 'bg-indigo-100 text-indigo-800',
    IN_REVIEW: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    EXPORTED: 'bg-teal-100 text-teal-800',
    PUBLISHED: 'bg-emerald-100 text-emerald-800',
    ON_HOLD: 'bg-orange-100 text-orange-800',
    FAILED: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const styles: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${styles[urgency] || ''}`}>
      {urgency}
    </span>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'SUCCEEDED':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'FAILED':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'RUNNING':
      return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
    default:
      return <Clock className="h-5 w-5 text-gray-400" />;
  }
}
