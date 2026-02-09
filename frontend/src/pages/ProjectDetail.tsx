import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectsApi } from '../lib/api';
import {
  ArrowLeft,
  FileText,
  BookOpen,
  Upload,
  Plus,
  Trash2,
  Edit,
  X,
  Check,
  AlertTriangle,
  File,
  Download,
  Eye,
} from 'lucide-react';

type Tab = 'documents' | 'rules' | 'context';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentOrgId } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('documents');

  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ['project', currentOrgId, projectId],
    queryFn: () => projectsApi.get(currentOrgId!, projectId!),
    enabled: !!currentOrgId && !!projectId,
  });

  const project = projectData?.data?.data;

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Project not found</h2>
        <Link to="/projects" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/projects')}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && (
            <p className="text-gray-500 mt-1">{project.description}</p>
          )}
        </div>
        {project.domain && (
          <span className="px-3 py-1 text-sm font-medium bg-gray-100 text-gray-600 rounded-full">
            {project.domain}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{project.document_count || 0}</p>
              <p className="text-sm text-gray-500">Documents</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BookOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{project.rule_count || 0}</p>
              <p className="text-sm text-gray-500">Context Rules</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{project.task_count || 0}</p>
              <p className="text-sm text-gray-500">Tasks</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {(['documents', 'rules', 'context'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'documents' && 'Documents'}
              {tab === 'rules' && 'Context Rules'}
              {tab === 'context' && 'AI Context Preview'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'documents' && (
        <DocumentsTab orgId={currentOrgId!} projectId={projectId!} />
      )}
      {activeTab === 'rules' && (
        <RulesTab orgId={currentOrgId!} projectId={projectId!} />
      )}
      {activeTab === 'context' && (
        <ContextPreviewTab orgId={currentOrgId!} projectId={projectId!} />
      )}
    </div>
  );
}

// Documents Tab
function DocumentsTab({ orgId, projectId }: { orgId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: '',
    type: 'other' as string,
    priority: 'medium' as string,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['project-documents', orgId, projectId],
    queryFn: () => projectsApi.listDocuments(orgId, projectId),
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => projectsApi.deleteDocument(orgId, projectId, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-documents'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
    },
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', uploadData.title || file.name.replace(/\.[^/.]+$/, ''));
      formData.append('type', uploadData.type);
      formData.append('priority', uploadData.priority);

      await projectsApi.uploadDocument(orgId, projectId, formData);
      queryClient.invalidateQueries({ queryKey: ['project-documents'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      setUploadData({ title: '', type: 'other', priority: 'medium' });
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  const documents = data?.data?.data || [];

  if (isLoading) {
    return <div className="text-center py-8">Loading documents...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Upload Document</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
            <input
              type="text"
              value={uploadData.title}
              onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Document title..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={uploadData.type}
              onChange={(e) => setUploadData({ ...uploadData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="functional_spec">Functional Spec</option>
              <option value="technical_spec">Technical Spec</option>
              <option value="api_doc">API Documentation</option>
              <option value="business_rules">Business Rules</option>
              <option value="glossary">Glossary</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={uploadData.priority}
              onChange={(e) => setUploadData({ ...uploadData, priority: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-gray-500">
            {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
          </p>
          <p className="text-sm text-gray-400 mt-1">MD, TXT, PDF (max 10MB)</p>
        </div>
      </div>

      {/* Documents List */}
      {documents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No documents uploaded yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {documents.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <File className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{doc.title}</p>
                        <p className="text-sm text-gray-500">{doc.file_type.toUpperCase()} - {formatFileSize(doc.file_size)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{formatDocType(doc.type)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <PriorityBadge priority={doc.priority} />
                  </td>
                  <td className="px-6 py-4">
                    {doc.is_active ? (
                      <span className="text-green-600 text-sm flex items-center gap-1">
                        <Check className="h-4 w-4" /> Active
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => deleteMutation.mutate(doc.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Rules Tab
function RulesTab({ orgId, projectId }: { orgId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState({
    category: 'constraint' as 'constraint' | 'standard' | 'tone' | 'do_not',
    rule_text: '',
    priority: 0,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['project-rules', orgId, projectId],
    queryFn: () => projectsApi.listRules(orgId, projectId),
  });

  const createMutation = useMutation({
    mutationFn: (data: { category: string; rule_text: string; priority?: number }) =>
      projectsApi.createRule(orgId, projectId, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-rules'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      setShowAddModal(false);
      setNewRule({ category: 'constraint', rule_text: '', priority: 0 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => projectsApi.deleteRule(orgId, projectId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-rules'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
    },
  });

  const rules = data?.data?.data?.rules || [];
  const grouped = data?.data?.data?.grouped || {};

  if (isLoading) {
    return <div className="text-center py-8">Loading rules...</div>;
  }

  const categoryInfo: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    constraint: { label: 'Constraints (MUST follow)', color: 'red', icon: <AlertTriangle className="h-5 w-5" /> },
    standard: { label: 'Standards', color: 'blue', icon: <BookOpen className="h-5 w-5" /> },
    tone: { label: 'Tone & Style', color: 'purple', icon: <Edit className="h-5 w-5" /> },
    do_not: { label: 'DO NOT', color: 'orange', icon: <X className="h-5 w-5" /> },
  };

  return (
    <div className="space-y-4">
      {/* Add Rule Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>

      {/* Rules by Category */}
      {rules.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No context rules defined yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Add rules to guide AI behavior for this project
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(categoryInfo).map(([category, info]) => {
            const categoryRules = grouped[category] || [];
            if (categoryRules.length === 0) return null;

            return (
              <div key={category} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className={`px-4 py-3 bg-${info.color}-50 border-b flex items-center gap-2`}>
                  <span className={`text-${info.color}-600`}>{info.icon}</span>
                  <h3 className={`font-semibold text-${info.color}-800`}>{info.label}</h3>
                  <span className="text-sm text-gray-500">({categoryRules.length})</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {categoryRules.map((rule: any) => (
                    <li key={rule.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                      <span className="text-gray-700">{rule.rule_text}</span>
                      <button
                        onClick={() => deleteMutation.mutate(rule.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Add Context Rule</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select
                  value={newRule.category}
                  onChange={(e) => setNewRule({ ...newRule, category: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="constraint">Constraint (MUST follow)</option>
                  <option value="standard">Standard</option>
                  <option value="tone">Tone & Style</option>
                  <option value="do_not">DO NOT</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Text *</label>
                <textarea
                  value={newRule.rule_text}
                  onChange={(e) => setNewRule({ ...newRule, rule_text: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter the rule..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMutation.mutate(newRule)}
                  disabled={!newRule.rule_text.trim() || createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Adding...' : 'Add Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Context Preview Tab
function ContextPreviewTab({ orgId, projectId }: { orgId: string; projectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['project-context', orgId, projectId],
    queryFn: () => projectsApi.getContext(orgId, projectId),
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading context preview...</div>;
  }

  const context = data?.data?.data;

  if (context?.warning) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
        <p className="text-orange-700">{context.warning}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Context Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{context?.meta?.total_documents || 0}</p>
            <p className="text-sm text-gray-500">Active Documents</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{context?.meta?.total_rules || 0}</p>
            <p className="text-sm text-gray-500">Active Rules</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">~{context?.meta?.estimated_tokens || 0}</p>
            <p className="text-sm text-gray-500">Estimated Tokens</p>
          </div>
        </div>
      </div>

      {/* Rules Preview */}
      {context?.rules && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Rules to be Injected</h3>
          <div className="space-y-4">
            {context.rules.constraints?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2">Constraints</h4>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {context.rules.constraints.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {context.rules.standards?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-blue-600 mb-2">Standards</h4>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {context.rules.standards.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {context.rules.tone?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-purple-600 mb-2">Tone & Style</h4>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {context.rules.tone.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {context.rules.do_not?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-orange-600 mb-2">DO NOT</h4>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {context.rules.do_not.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents Preview */}
      {context?.documents?.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Documents to be Injected</h3>
          <div className="space-y-3">
            {context.documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <File className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">{doc.title}</p>
                    <p className="text-sm text-gray-500">{formatDocType(doc.type)} - ~{doc.estimated_tokens} tokens</p>
                  </div>
                </div>
                <PriorityBadge priority={doc.priority} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components
function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[priority] || 'bg-gray-100'}`}>
      {priority}
    </span>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDocType(type: string): string {
  const labels: Record<string, string> = {
    functional_spec: 'Functional Spec',
    technical_spec: 'Technical Spec',
    api_doc: 'API Doc',
    business_rules: 'Business Rules',
    glossary: 'Glossary',
    other: 'Other',
  };
  return labels[type] || type;
}
