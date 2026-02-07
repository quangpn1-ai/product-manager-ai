import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { auditApi } from '../lib/api';
import {
  Shield,
  Calendar,
  User,
  Target,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Filter,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface AuditEvent {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  'user.login': 'User Login',
  'user.logout': 'User Logout',
  'user.signup': 'User Signup',
  'task.created': 'Task Created',
  'task.updated': 'Task Updated',
  'task.deleted': 'Task Deleted',
  'task.status_changed': 'Task Status Changed',
  'document.generated': 'Document Generated',
  'document.approved': 'Document Approved',
  'document.rejected': 'Document Rejected',
  'document.exported': 'Document Exported',
  'run.started': 'Run Started',
  'run.completed': 'Run Completed',
  'run.failed': 'Run Failed',
  'decision.created': 'Decision Created',
  'decision.updated': 'Decision Updated',
  'decision.deleted': 'Decision Deleted',
  'org.member_invited': 'Member Invited',
  'org.member_removed': 'Member Removed',
};

export default function AuditLog() {
  const { currentOrgId } = useAuth();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const limit = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', currentOrgId, page, actionFilter],
    queryFn: () =>
      auditApi.list(currentOrgId!, {
        limit: String(limit),
        offset: String(page * limit),
        ...(actionFilter && { action: actionFilter }),
      }),
    enabled: !!currentOrgId,
  });

  const events: AuditEvent[] = data?.data?.data || [];
  const total = data?.data?.meta?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const getActionIcon = (action: string) => {
    if (action.startsWith('user.')) return <User className="h-4 w-4" />;
    if (action.startsWith('task.') || action.startsWith('document.')) return <Target className="h-4 w-4" />;
    return <Shield className="h-4 w-4" />;
  };

  const getActionColor = (action: string) => {
    if (action.includes('created') || action.includes('approved')) return 'bg-green-100 text-green-700';
    if (action.includes('deleted') || action.includes('failed') || action.includes('rejected')) return 'bg-red-100 text-red-700';
    if (action.includes('updated') || action.includes('changed')) return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-700';
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Failed to load audit log. You may not have permission to view this page.</p>
        <Link to="/settings" className="text-blue-600 hover:text-blue-700 mt-2 inline-block">
          Back to Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-gray-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-gray-600">Activity history for your organization</p>
          </div>
        </div>
        <Link
          to="/settings"
          className="text-gray-600 hover:text-gray-800"
        >
          Back to Settings
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-600">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Filter:</span>
          </div>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            {Object.entries(actionLabels).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No audit events found</p>
          </div>
        ) : (
          <div className="divide-y">
            {events.map((event) => (
              <div key={event.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${getActionColor(event.action)}`}>
                      {getActionIcon(event.action)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {actionLabels[event.action] || event.action}
                        </span>
                        {event.target_type && event.target_id && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {event.target_type}: {event.target_id.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        {event.actor_email && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {event.actor_email}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                        {event.ip_address && (
                          <span className="text-gray-400">
                            IP: {event.ip_address}
                          </span>
                        )}
                      </div>
                      {Object.keys(event.metadata).length > 0 && (
                        <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          {JSON.stringify(event.metadata)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-2 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 hover:bg-gray-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
