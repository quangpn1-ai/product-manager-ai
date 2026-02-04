import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi, orgsApi } from '../lib/api';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  ArrowRight,
} from 'lucide-react';

export default function Dashboard() {
  const { currentOrgId } = useAuth();

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', currentOrgId],
    queryFn: () => tasksApi.list(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const { data: orgData } = useQuery({
    queryKey: ['org', currentOrgId],
    queryFn: () => orgsApi.get(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const tasks = tasksData?.data?.data || [];
  const org = orgData?.data?.data;

  const stats = {
    total: tasks.length,
    inProgress: tasks.filter((t: any) =>
      ['NEW', 'CLARIFYING', 'READY_FOR_GENERATION', 'DRAFT_GENERATED', 'IN_REVIEW'].includes(t.status)
    ).length,
    completed: tasks.filter((t: any) =>
      ['APPROVED', 'EXPORTED', 'PUBLISHED'].includes(t.status)
    ).length,
    failed: tasks.filter((t: any) => t.status === 'FAILED').length,
  };

  const recentTasks = tasks.slice(0, 5);

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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">{org?.name || 'Organization'}</p>
        </div>
        <Link
          to="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Task
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Tasks</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">In Progress</p>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-full">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-2xl font-bold">{stats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Recent Tasks</h2>
          <Link to="/tasks" className="text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {recentTasks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No tasks yet</p>
            <Link to="/tasks/new" className="text-blue-600 hover:text-blue-700">
              Create your first task
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {recentTasks.map((task: any) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="block p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">{task.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {task.request_text}
                    </p>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
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
