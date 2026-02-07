import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { orgsApi, api } from '../lib/api';
import {
  Building2,
  Users,
  UserPlus,
  Mail,
  Shield,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react';

interface Member {
  user_id: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export default function Organization() {
  const { currentOrgId } = useAuth();
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('org_member');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const { data: orgData, isLoading: orgLoading } = useQuery({
    queryKey: ['org', currentOrgId],
    queryFn: () => orgsApi.get(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['org-members', currentOrgId],
    queryFn: () => orgsApi.getMembers(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const { data: invitationsData } = useQuery({
    queryKey: ['org-invitations', currentOrgId],
    queryFn: () => orgsApi.getInvitations(currentOrgId!),
    enabled: !!currentOrgId,
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) =>
      orgsApi.createInvitations(currentOrgId!, { emails: [data.email], role: data.role }),
    onSuccess: () => {
      setInviteSuccess(true);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['org-invitations', currentOrgId] });
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteSuccess(false);
      }, 2000);
    },
    onError: (err: any) => {
      setInviteError(err.response?.data?.error?.message || 'Failed to send invitation');
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: string) =>
      orgsApi.deleteInvitation(currentOrgId!, invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations', currentOrgId] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/orgs/${currentOrgId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', currentOrgId] });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const org = orgData?.data?.data;
  const members: Member[] = membersData?.data?.data || [];
  const invitations: Invitation[] = invitationsData?.data?.data || [];

  if (orgLoading || membersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Organization</h1>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" />
          Invite Member
        </button>
      </div>

      {/* Organization Info */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{org?.name}</h2>
            <p className="text-gray-500">Slug: {org?.slug}</p>
            <p className="text-sm text-gray-400">Created: {new Date(org?.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-medium">Members ({members.length})</h3>
        </div>
        <div className="divide-y">
          {members.map((member) => (
            <div key={member.user_id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 font-medium">
                    {member.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{member.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      member.role === 'org_admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      <Shield className="h-3 w-3" />
                      {member.role === 'org_admin' ? 'Admin' : 'Member'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {member.status}
                    </span>
                  </div>
                </div>
              </div>
              {member.role !== 'org_admin' && (
                <button
                  onClick={() => removeMemberMutation.mutate(member.user_id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                  title="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500" />
            <h3 className="text-lg font-medium">Pending Invitations ({invitations.length})</h3>
          </div>
          <div className="divide-y">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{invitation.email}</p>
                  <p className="text-sm text-gray-500">
                    Invited as {invitation.role === 'org_admin' ? 'Admin' : 'Member'} •
                    Expires {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => cancelInvitationMutation.mutate(invitation.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                  title="Cancel invitation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-medium">Invite Member</h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteError('');
                  setInviteSuccess(false);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              {inviteError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-700">{inviteError}</span>
                </div>
              )}
              {inviteSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-700">Invitation sent successfully!</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="colleague@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="org_member">Member</option>
                  <option value="org_admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
