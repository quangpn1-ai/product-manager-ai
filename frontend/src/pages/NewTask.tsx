import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { tasksApi, orgsApi } from '../lib/api';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';

export default function NewTask() {
  const { currentOrgId } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [requestText, setRequestText] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [urgency, setUrgency] = useState('medium');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');

  const { data: workflowsData } = useQuery({
    queryKey: ['workflows', currentOrgId],
    queryFn: () => orgsApi.getWorkflows(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const workflows = workflowsData?.data?.data || [];
  const defaultWorkflow = workflows.find((w: any) => w.key === 'wf_product_brief_v1') || workflows[0];

  const createMutation = useMutation({
    mutationFn: (data: any) => tasksApi.create(currentOrgId!, data),
    onSuccess: (response) => {
      navigate(`/tasks/${response.data.data.id}`);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to create task');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!defaultWorkflow) {
      setError('No workflow available');
      return;
    }

    createMutation.mutate({
      workflow_id: defaultWorkflow.id,
      title,
      request_text: requestText,
      requester_name: requesterName || undefined,
      urgency,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Create New Task</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="E.g., New user onboarding flow"
          />
        </div>

        <div>
          <label htmlFor="requestText" className="block text-sm font-medium text-gray-700 mb-1">
            Request Description *
          </label>
          <textarea
            id="requestText"
            required
            rows={6}
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Describe what you need. Be as specific as possible about the problem, goals, and any constraints..."
          />
          <p className="mt-1 text-sm text-gray-500">
            The AI will use this to generate a structured product brief.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="requesterName" className="block text-sm font-medium text-gray-700 mb-1">
              Requester Name
            </label>
            <input
              id="requesterName"
              type="text"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="E.g., VP of Product"
            />
          </div>

          <div>
            <label htmlFor="urgency" className="block text-sm font-medium text-gray-700 mb-1">
              Urgency
            </label>
            <select
              id="urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
            Tags
          </label>
          <input
            id="tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter tags separated by commas"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}
