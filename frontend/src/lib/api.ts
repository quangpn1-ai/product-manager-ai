import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token } = response.data.data.tokens;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
          error.config.headers.Authorization = `Bearer ${access_token}`;
          return api.request(error.config);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  signup: (email: string, password: string, org?: { name: string; slug: string }) =>
    api.post('/auth/signup', { email, password, org }),

  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refresh_token: refreshToken }),

  me: () => api.get('/auth/me'),
};

// Orgs API
export const orgsApi = {
  list: () => api.get('/orgs'),
  get: (orgId: string) => api.get(`/orgs/${orgId}`),
  getWorkflows: (orgId: string) => api.get(`/orgs/${orgId}/workflows`),
  getMembers: (orgId: string) => api.get(`/orgs/${orgId}/members`),
  getStats: (orgId: string) => api.get(`/orgs/${orgId}/stats`),
  getInvitations: (orgId: string) => api.get(`/orgs/${orgId}/invitations`),
  createInvitations: (orgId: string, data: { emails: string[]; role: string; expires_in_hours?: number }) =>
    api.post(`/orgs/${orgId}/invitations`, data),
  deleteInvitation: (orgId: string, invitationId: string) =>
    api.delete(`/orgs/${orgId}/invitations/${invitationId}`),
};

// Tasks API
export const tasksApi = {
  list: (orgId: string, params?: Record<string, string>) =>
    api.get(`/orgs/${orgId}/tasks`, { params }),

  get: (orgId: string, taskId: string) =>
    api.get(`/orgs/${orgId}/tasks/${taskId}`),

  create: (orgId: string, data: {
    workflow_id: string;
    title: string;
    request_text: string;
    requester_name?: string;
    urgency?: string;
    tags?: string[];
  }) => api.post(`/orgs/${orgId}/tasks`, data),

  update: (orgId: string, taskId: string, data: Record<string, unknown>) =>
    api.patch(`/orgs/${orgId}/tasks/${taskId}`, data),

  delete: (orgId: string, taskId: string) =>
    api.delete(`/orgs/${orgId}/tasks/${taskId}`),

  getRuns: (orgId: string, taskId: string) =>
    api.get(`/orgs/${orgId}/tasks/${taskId}/runs`),

  createRun: (orgId: string, taskId: string, idempotencyKey: string) =>
    api.post(`/orgs/${orgId}/tasks/${taskId}/runs`, { mode: 'full' }, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  getDocuments: (orgId: string, taskId: string) =>
    api.get(`/orgs/${orgId}/tasks/${taskId}/documents`),

  getDocument: (orgId: string, taskId: string, docId: string) =>
    api.get(`/orgs/${orgId}/tasks/${taskId}/documents/${docId}`),

  approveDocument: (orgId: string, taskId: string, docId: string, approved: boolean) =>
    api.post(`/orgs/${orgId}/tasks/${taskId}/documents/${docId}/approve`, { approved }),

  exportDocument: (orgId: string, taskId: string, format: string) =>
    api.post(`/orgs/${orgId}/tasks/${taskId}/export`, { format }),

  publishDocument: (orgId: string, taskId: string, config: {
    platform: 'confluence' | 'notion' | 'webhook';
    webhook_url?: string;
    confluence_base_url?: string;
    confluence_space_key?: string;
    notion_database_id?: string;
    api_token?: string;
  }) => api.post(`/orgs/${orgId}/tasks/${taskId}/publish`, config),

  getRecommendations: (orgId: string, taskId: string) =>
    api.get(`/orgs/${orgId}/tasks/${taskId}/recommendations`),
};

// Runs API
export const runsApi = {
  get: (orgId: string, runId: string) =>
    api.get(`/orgs/${orgId}/runs/${runId}`),

  cancel: (orgId: string, runId: string) =>
    api.post(`/orgs/${orgId}/runs/${runId}/cancel`),
};

// Audit API
export const auditApi = {
  list: (orgId: string, params?: Record<string, string>) =>
    api.get(`/orgs/${orgId}/audit`, { params }),

  getActions: (orgId: string) =>
    api.get(`/orgs/${orgId}/audit/actions`),
};

// Decisions API
export const decisionsApi = {
  list: (orgId: string, params?: Record<string, string>) =>
    api.get(`/orgs/${orgId}/decisions`, { params }),

  get: (orgId: string, decisionId: string) =>
    api.get(`/orgs/${orgId}/decisions/${decisionId}`),

  create: (orgId: string, data: {
    summary: string;
    rationale: string;
    owner?: string;
    decided_at?: string;
    links?: Array<{ title: string; url: string }>;
    tags?: string[];
  }) => api.post(`/orgs/${orgId}/decisions`, data),

  update: (orgId: string, decisionId: string, data: Record<string, unknown>) =>
    api.patch(`/orgs/${orgId}/decisions/${decisionId}`, data),

  delete: (orgId: string, decisionId: string) =>
    api.delete(`/orgs/${orgId}/decisions/${decisionId}`),
};

// Projects API
export const projectsApi = {
  list: (orgId: string, params?: Record<string, string>) =>
    api.get(`/orgs/${orgId}/projects`, { params }),

  get: (orgId: string, projectId: string) =>
    api.get(`/orgs/${orgId}/projects/${projectId}`),

  create: (orgId: string, data: {
    name: string;
    slug?: string;
    description?: string;
    domain?: 'FinTech' | 'HealthTech' | 'E-commerce' | 'SaaS' | 'Other';
  }) => api.post(`/orgs/${orgId}/projects`, data),

  update: (orgId: string, projectId: string, data: Record<string, unknown>) =>
    api.patch(`/orgs/${orgId}/projects/${projectId}`, data),

  delete: (orgId: string, projectId: string) =>
    api.delete(`/orgs/${orgId}/projects/${projectId}`),

  archive: (orgId: string, projectId: string) =>
    api.post(`/orgs/${orgId}/projects/${projectId}/archive`),

  unarchive: (orgId: string, projectId: string) =>
    api.post(`/orgs/${orgId}/projects/${projectId}/unarchive`),

  // Documents
  listDocuments: (orgId: string, projectId: string, params?: Record<string, string>) =>
    api.get(`/orgs/${orgId}/projects/${projectId}/documents`, { params }),

  getDocument: (orgId: string, projectId: string, documentId: string) =>
    api.get(`/orgs/${orgId}/projects/${projectId}/documents/${documentId}`),

  uploadDocument: (orgId: string, projectId: string, formData: FormData) =>
    api.post(`/orgs/${orgId}/projects/${projectId}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  updateDocument: (orgId: string, projectId: string, documentId: string, data: Record<string, unknown>) =>
    api.patch(`/orgs/${orgId}/projects/${projectId}/documents/${documentId}`, data),

  deleteDocument: (orgId: string, projectId: string, documentId: string) =>
    api.delete(`/orgs/${orgId}/projects/${projectId}/documents/${documentId}`),

  getDocumentContent: (orgId: string, projectId: string, documentId: string) =>
    api.get(`/orgs/${orgId}/projects/${projectId}/documents/${documentId}/content`),

  // Context Rules
  listRules: (orgId: string, projectId: string, params?: Record<string, string>) =>
    api.get(`/orgs/${orgId}/projects/${projectId}/rules`, { params }),

  createRule: (orgId: string, projectId: string, data: {
    category: 'constraint' | 'standard' | 'tone' | 'do_not';
    rule_text: string;
    priority?: number;
    is_active?: boolean;
  }) => api.post(`/orgs/${orgId}/projects/${projectId}/rules`, data),

  updateRule: (orgId: string, projectId: string, ruleId: string, data: Record<string, unknown>) =>
    api.patch(`/orgs/${orgId}/projects/${projectId}/rules/${ruleId}`, data),

  deleteRule: (orgId: string, projectId: string, ruleId: string) =>
    api.delete(`/orgs/${orgId}/projects/${projectId}/rules/${ruleId}`),

  // Context for AI
  getContext: (orgId: string, projectId: string) =>
    api.get(`/orgs/${orgId}/projects/${projectId}/context`),
};
