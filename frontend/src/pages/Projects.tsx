import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { projectsApi } from '../lib/api';
import {
  Plus,
  Folder,
  FileText,
  BookOpen,
  Archive,
  ArchiveRestore,
  Search,
  X,
} from 'lucide-react';

export default function Projects() {
  const { currentOrgId } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | ''>('active');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', currentOrgId, statusFilter, searchQuery],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      return projectsApi.list(currentOrgId!, params);
    },
    enabled: !!currentOrgId,
  });

  const archiveMutation = useMutation({
    mutationFn: (projectId: string) => projectsApi.archive(currentOrgId!, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (projectId: string) => projectsApi.unarchive(currentOrgId!, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const projects = data?.data?.data || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | '')}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <Folder className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-4">
            Create a project to organize your knowledge base and provide context to AI.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: any) => (
            <div
              key={project.id}
              className={`bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow ${
                project.status === 'archived' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <Link to={`/projects/${project.id}`} className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                    {project.name}
                  </h3>
                  {project.domain && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                      {project.domain}
                    </span>
                  )}
                </Link>
                <StatusBadge status={project.status} />
              </div>

              {project.description && (
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span>{project.document_count || 0} docs</span>
                </div>
                <div className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4" />
                  <span>{project.rule_count || 0} rules</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Link
                  to={`/projects/${project.id}`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  View Details
                </Link>
                {project.status === 'active' ? (
                  <button
                    onClick={() => archiveMutation.mutate(project.id)}
                    disabled={archiveMutation.isPending}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-orange-600"
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </button>
                ) : (
                  <button
                    onClick={() => unarchiveMutation.mutate(project.id)}
                    disabled={unarchiveMutation.isPending}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          orgId={currentOrgId!}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
}

function CreateProjectModal({
  orgId,
  onClose,
  onSuccess,
}: {
  orgId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    domain: '' as '' | 'FinTech' | 'HealthTech' | 'E-commerce' | 'SaaS' | 'Other',
  });
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; domain?: string }) =>
      projectsApi.create(orgId, data as any),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to create project');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }
    const data: any = { name: formData.name };
    if (formData.description) data.description = formData.description;
    if (formData.domain) data.domain = formData.domain;
    createMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Create New Project</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Project"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Brief description of the project..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain
            </label>
            <select
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select domain...</option>
              <option value="FinTech">FinTech</option>
              <option value="HealthTech">HealthTech</option>
              <option value="E-commerce">E-commerce</option>
              <option value="SaaS">SaaS</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
