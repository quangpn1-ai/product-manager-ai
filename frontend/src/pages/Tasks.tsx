import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi } from '../lib/api';
import { Plus, FileText, Calendar, Tag } from 'lucide-react';

export default function Tasks() {
  const { currentOrgId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', currentOrgId],
    queryFn: () => tasksApi.list(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const tasks = data?.data?.data || [];

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
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <Link
          to="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Task
        </Link>
      </div>

      {/* Tasks List */}
      {tasks.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks yet</h3>
          <p className="text-gray-500 mb-4">
            Create your first task to get started with AI-powered product briefs.
          </p>
          <Link
            to="/tasks/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Task
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Urgency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.map((task: any) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/tasks/${task.id}`} className="block">
                      <div className="font-medium text-gray-900 hover:text-blue-600">
                        {task.title}
                      </div>
                      <div className="text-sm text-gray-500 line-clamp-1">
                        {task.request_text}
                      </div>
                      {task.tags && task.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Tag className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-400">
                            {task.tags.join(', ')}
                          </span>
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-6 py-4">
                    <UrgencyBadge urgency={task.urgency} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(task.created_at).toLocaleDateString()}
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

function UrgencyBadge({ urgency }: { urgency: string | null }) {
  if (!urgency) return <span className="text-gray-400">-</span>;

  const styles: Record<string, string> = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-orange-600',
    critical: 'text-red-600',
  };

  return (
    <span className={`text-sm font-medium capitalize ${styles[urgency] || ''}`}>
      {urgency}
    </span>
  );
}
