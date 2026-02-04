import React, { useState } from 'react';
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
} from 'lucide-react';

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const { currentOrgId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'document' | 'runs'>('overview');

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

  const task = taskData?.data?.data;
  const documents = documentsData?.data?.data || [];
  const runs = runsData?.data?.data || [];
  const latestDocument = documents[0];

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => tasksApi.update(currentOrgId!, taskId!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', currentOrgId, taskId] });
    },
  });

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
          {task.allowed_transitions?.includes('READY_FOR_GENERATION') && (
            <button
              onClick={() => updateStatusMutation.mutate('READY_FOR_GENERATION')}
              className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
            >
              Ready for Generation
            </button>
          )}

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

          {task.status === 'APPROVED' && (
            <button
              onClick={() => exportMutation.mutate('markdown')}
              disabled={exportMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export Markdown
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

          {task.clarification_json && Object.keys(task.clarification_json).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Clarifications</h3>
              <pre className="bg-gray-50 p-4 rounded-md text-sm overflow-auto">
                {JSON.stringify(task.clarification_json, null, 2)}
              </pre>
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

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{formattedTitle}</h3>
      {Array.isArray(content) ? (
        <ul className="list-disc list-inside space-y-1">
          {content.map((item, i) => (
            <li key={i} className="text-gray-700">{String(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-700">{String(content)}</p>
      )}
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
