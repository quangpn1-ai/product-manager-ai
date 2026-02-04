import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Save,
  AlertCircle,
  CheckCircle,
  Loader2,
  Calendar,
  BarChart3,
} from 'lucide-react';

interface Budget {
  id: string;
  daily_limit_cents: number;
  monthly_limit_cents: number;
  alert_threshold_percent: number;
  hard_limit_enabled: boolean;
  current_daily_usage_cents: number;
  current_monthly_usage_cents: number;
}

interface UsageRecord {
  date: string;
  provider: string;
  model: string;
  total_tokens: number;
  cost_cents: number;
}

export default function BudgetSettings() {
  const { currentOrgId } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [dailyLimit, setDailyLimit] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [hardLimitEnabled, setHardLimitEnabled] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { data: budgetData, isLoading: budgetLoading } = useQuery({
    queryKey: ['budget', currentOrgId],
    queryFn: () => api.get(`/orgs/${currentOrgId}/budgets`),
    enabled: !!currentOrgId,
  });

  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['usage', currentOrgId],
    queryFn: () => api.get(`/orgs/${currentOrgId}/usage?days=30`),
    enabled: !!currentOrgId,
  });

  const saveMutation = useMutation({
    mutationFn: (data: {
      daily_limit_cents: number;
      monthly_limit_cents: number;
      alert_threshold_percent: number;
      hard_limit_enabled: boolean;
    }) => api.put(`/orgs/${currentOrgId}/budgets`, data),
    onSuccess: () => {
      setSaveSuccess(true);
      setSaveError('');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['budget', currentOrgId] });
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err: any) => {
      setSaveError(err.response?.data?.error?.message || 'Failed to save budget settings');
    },
  });

  const budget: Budget | null = budgetData?.data?.data || null;
  const usageRecords: UsageRecord[] = usageData?.data?.data || [];

  const totalMonthlyUsage = usageRecords.reduce((sum, r) => sum + r.cost_cents, 0);
  const todayUsage = usageRecords
    .filter((r) => r.date === new Date().toISOString().split('T')[0])
    .reduce((sum, r) => sum + r.cost_cents, 0);

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleEdit = () => {
    if (budget) {
      setDailyLimit((budget.daily_limit_cents / 100).toString());
      setMonthlyLimit((budget.monthly_limit_cents / 100).toString());
      setAlertThreshold(budget.alert_threshold_percent.toString());
      setHardLimitEnabled(budget.hard_limit_enabled);
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    saveMutation.mutate({
      daily_limit_cents: Math.round(parseFloat(dailyLimit) * 100),
      monthly_limit_cents: Math.round(parseFloat(monthlyLimit) * 100),
      alert_threshold_percent: parseInt(alertThreshold),
      hard_limit_enabled: hardLimitEnabled,
    });
  };

  if (budgetLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const dailyPercent = budget ? (budget.current_daily_usage_cents / budget.daily_limit_cents) * 100 : 0;
  const monthlyPercent = budget ? (budget.current_monthly_usage_cents / budget.monthly_limit_cents) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget & Usage</h1>
          <p className="mt-1 text-gray-500">
            Monitor AI usage and set spending limits.
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Edit Limits
          </button>
        )}
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{saveError}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-green-700">Budget settings saved successfully!</span>
        </div>
      )}

      {/* Usage Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today's Usage</p>
              <p className="text-2xl font-bold text-gray-900">{formatCents(todayUsage)}</p>
            </div>
          </div>
          {budget && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Daily Limit</span>
                <span>{formatCents(budget.daily_limit_cents)}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${dailyPercent > 80 ? 'bg-red-500' : dailyPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(dailyPercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Monthly Usage</p>
              <p className="text-2xl font-bold text-gray-900">{formatCents(totalMonthlyUsage)}</p>
            </div>
          </div>
          {budget && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Monthly Limit</span>
                <span>{formatCents(budget.monthly_limit_cents)}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${monthlyPercent > 80 ? 'bg-red-500' : monthlyPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(monthlyPercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Alert Threshold</p>
              <p className="text-2xl font-bold text-gray-900">{budget?.alert_threshold_percent || 80}%</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            {budget?.hard_limit_enabled
              ? 'Hard limit enabled - API calls will be blocked when limit is reached'
              : 'Soft limit - Only alerts, no blocking'}
          </p>
        </div>
      </div>

      {/* Edit Form */}
      {isEditing && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Budget Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Daily Limit ($)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="block w-full pl-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="10.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Limit ($)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  className="block w-full pl-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="100.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alert Threshold (%)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="80"
              />
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hardLimitEnabled}
                  onChange={(e) => setHardLimitEnabled(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">
                  Enable hard limit (block API calls when limit is reached)
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Usage History */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-medium">Usage History (Last 30 Days)</h3>
        </div>
        {usageLoading ? (
          <div className="p-6 text-center">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
          </div>
        ) : usageRecords.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No usage records found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tokens</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {usageRecords.slice(0, 20).map((record, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{record.provider}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.model}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.total_tokens.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCents(record.cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
