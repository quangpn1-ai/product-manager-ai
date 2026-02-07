import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { decisionsApi } from '../lib/api';
import {
  BookOpen,
  Plus,
  Search,
  Tag,
  Calendar,
  User,
  ExternalLink,
  Trash2,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Decision {
  id: string;
  summary: string;
  rationale: string;
  owner: string | null;
  decided_at: string;
  links: Array<{ title: string; url: string }>;
  tags: string[] | null;
  created_by: string;
  created_at: string;
}

interface Link {
  title: string;
  url: string;
}

export default function Decisions() {
  const { currentOrgId } = useAuth();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [summary, setSummary] = useState('');
  const [rationale, setRationale] = useState('');
  const [owner, setOwner] = useState('');
  const [decidedAt, setDecidedAt] = useState(new Date().toISOString().split('T')[0]);
  const [links, setLinks] = useState<Link[]>([]);
  const [tags, setTags] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [formError, setFormError] = useState('');

  const { data: decisionsData, isLoading } = useQuery({
    queryKey: ['decisions', currentOrgId, searchQuery],
    queryFn: () => decisionsApi.list(currentOrgId!, searchQuery ? { search: searchQuery } : undefined),
    enabled: !!currentOrgId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof decisionsApi.create>[1]) =>
      decisionsApi.create(currentOrgId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions', currentOrgId] });
      resetForm();
      setShowCreateModal(false);
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.error?.message || 'Failed to create decision');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (decisionId: string) => decisionsApi.delete(currentOrgId!, decisionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decisions', currentOrgId] });
    },
  });

  const decisions: Decision[] = decisionsData?.data?.data || [];

  const resetForm = () => {
    setSummary('');
    setRationale('');
    setOwner('');
    setDecidedAt(new Date().toISOString().split('T')[0]);
    setLinks([]);
    setTags('');
    setNewLinkTitle('');
    setNewLinkUrl('');
    setFormError('');
  };

  const handleAddLink = () => {
    if (newLinkTitle.trim() && newLinkUrl.trim()) {
      setLinks([...links, { title: newLinkTitle.trim(), url: newLinkUrl.trim() }]);
      setNewLinkTitle('');
      setNewLinkUrl('');
    }
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!summary.trim() || !rationale.trim()) {
      setFormError('Summary and rationale are required');
      return;
    }

    createMutation.mutate({
      summary: summary.trim(),
      rationale: rationale.trim(),
      owner: owner.trim() || undefined,
      decided_at: new Date(decidedAt).toISOString(),
      links: links.length > 0 ? links : undefined,
      tags: tags.trim() ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Decision Log</h1>
            <p className="text-gray-600">Track and reference past decisions</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          Log Decision
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search decisions..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {/* Decisions List */}
      {decisions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No decisions yet</h3>
          <p className="text-gray-500 mb-4">
            Start logging decisions to build your organizational knowledge base.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            Log First Decision
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map((decision) => (
            <div key={decision.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{decision.summary}</h3>
                      {expandedId === decision.id ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(decision.decided_at).toLocaleDateString()}
                      </span>
                      {decision.owner && (
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {decision.owner}
                        </span>
                      )}
                    </div>
                    {decision.tags && decision.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {decision.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full"
                          >
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this decision?')) {
                        deleteMutation.mutate(decision.id);
                      }
                    }}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {expandedId === decision.id && (
                <div className="px-4 pb-4 border-t bg-gray-50">
                  <div className="pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Rationale</h4>
                    <p className="text-gray-600 whitespace-pre-wrap">{decision.rationale}</p>
                  </div>

                  {decision.links && decision.links.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Related Links</h4>
                      <div className="space-y-1">
                        {decision.links.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {link.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h3 className="text-lg font-medium">Log Decision</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Summary *
                </label>
                <input
                  type="text"
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief summary of the decision"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rationale *
                </label>
                <textarea
                  required
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why was this decision made? What factors were considered?"
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Decision Owner
                  </label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="Who made this decision?"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Decision Date
                  </label>
                  <input
                    type="date"
                    value={decidedAt}
                    onChange={(e) => setDecidedAt(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Comma-separated tags (e.g., architecture, pricing, hiring)"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Related Links
                </label>
                {links.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {links.map((link, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded-md">
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                        <span className="flex-1 text-sm truncate">{link.title}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLink(i)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Link title"
                    className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    disabled={!newLinkTitle.trim() || !newLinkUrl.trim()}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving...' : 'Save Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
