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
  DollarSign,
  Zap,
  BarChart3,
  TrendingUp,
  Activity,
} from 'lucide-react';

interface DashboardStats {
  tasks: {
    byStatus: Record<string, number>;
    total: number;
  };
  usage: {
    period: string;
    byProvider: Record<string, { inputTokens: number; outputTokens: number; costCents: number }>;
    total: { inputTokens: number; outputTokens: number; costCents: number };
  };
  budgets: Record<string, { softLimit: number; hardLimit: number }>;
  recentRuns: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
}

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

  const { data: statsData } = useQuery({
    queryKey: ['stats', currentOrgId],
    queryFn: () => orgsApi.getStats(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const tasks = tasksData?.data?.data || [];
  const org = orgData?.data?.data;
  const stats: DashboardStats | null = statsData?.data?.data || null;

  const taskStats = {
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

  const formatCost = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

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

      {/* Task Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Tasks</p>
              <p className="text-2xl font-bold">{taskStats.total}</p>
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
              <p className="text-2xl font-bold">{taskStats.inProgress}</p>
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
              <p className="text-2xl font-bold">{taskStats.completed}</p>
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
              <p className="text-2xl font-bold">{taskStats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      {stats && stats.usage.total.costCents > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Monthly Usage</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-medium">Total Cost</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCost(stats.usage.total.costCents)}
              </p>
              {stats.budgets.monthly && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Budget</span>
                    <span>{formatCost(stats.budgets.monthly.softLimit)}</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        stats.usage.total.costCents > stats.budgets.monthly.softLimit
                          ? 'bg-red-500'
                          : 'bg-purple-500'
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (stats.usage.total.costCents / stats.budgets.monthly.softLimit) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium">Input Tokens</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatTokens(stats.usage.total.inputTokens)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">Output Tokens</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatTokens(stats.usage.total.outputTokens)}
              </p>
            </div>
          </div>

          {/* Usage by Provider */}
          {Object.keys(stats.usage.byProvider).length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-500 mb-3">By Provider</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(stats.usage.byProvider).map(([provider, usage]) => (
                  <div key={provider} className="bg-gray-50 p-3 rounded-md">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700 capitalize">{provider}</span>
                      <span className="text-sm text-gray-600">{formatCost(usage.costCents)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTokens(usage.inputTokens + usage.outputTokens)} tokens
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Breakdown */}
      {stats && Object.keys(stats.tasks.byStatus).length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Tasks by Status</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(stats.tasks.byStatus).map(([status, count]) => (
              <div key={status} className="text-center p-3 bg-gray-50 rounded-md">
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 mt-1">{status.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Recent Runs */}
        {stats && stats.recentRuns.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Recent AI Runs</h2>
            </div>
            <div className="divide-y">
              {stats.recentRuns.map((run) => (
                <Link
                  key={run.id}
                  to={`/tasks/${run.taskId}`}
                  className="block p-4 hover:bg-gray-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">{run.taskTitle || 'Untitled Task'}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {run.startedAt
                          ? new Date(run.startedAt).toLocaleString()
                          : 'Pending'}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>
                </Link>
              ))}
            </div>
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

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    QUEUED: 'bg-gray-100 text-gray-800',
    RUNNING: 'bg-blue-100 text-blue-800',
    SUCCEEDED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    PARTIAL: 'bg-yellow-100 text-yellow-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
}
