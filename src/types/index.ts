// ============================================
// Core Types for AI Product Manager MVP
// ============================================

// -------------------- Common --------------------
export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

// -------------------- Organization --------------------
export type OrgStatus = 'active' | 'suspended' | 'deleted';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  defaultLanguage: string;
  allowedEmailDomains: string[] | null;
  status: OrgStatus;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- User --------------------
export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerified: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface UserPublic {
  id: string;
  email: string;
  emailVerified: boolean;
  status: UserStatus;
  createdAt: Date;
}

// -------------------- Membership --------------------
export type OrgRole = 'org_admin' | 'org_member';
export type MembershipStatus = 'active' | 'invited' | 'suspended';

export interface OrgMembership {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Invitation --------------------
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface OrgInvitation {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  invitedBy: string;
  createdAt: Date;
}

// -------------------- Session --------------------
export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

// -------------------- AI Provider --------------------
export type AIProvider = 'openai' | 'anthropic' | 'google';
export type ProviderMode = 'byok' | 'managed';

export interface OrgAIProviderConfig {
  id: string;
  orgId: string;
  provider: AIProvider;
  mode: ProviderMode;
  apiKeyEncrypted: Buffer | null;
  apiKeyLast4: string | null;
  isEnabled: boolean;
  defaultModel: string;
  allowedModels: string[] | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Budget --------------------
export type BudgetPeriod = 'daily' | 'monthly';
export type BudgetAction = 'block' | 'degrade';

export interface OrgBudget {
  id: string;
  orgId: string;
  period: BudgetPeriod;
  currency: string;
  softLimitCents: number;
  hardLimitCents: number;
  actionOnHardLimit: BudgetAction;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Usage --------------------
export interface UsageLedgerEntry {
  id: string;
  orgId: string;
  userId: string | null;
  provider: AIProvider;
  model: string;
  runId: string | null;
  stageId: string | null;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  createdAt: Date;
}

// -------------------- Workflow --------------------
export interface WorkflowStageDefinition {
  id: string;
  role: 'generator' | 'critic' | 'cross_questioner' | 'synthesizer' | 'verifier';
  promptTemplateKey: string;
  provider: AIProvider;
  model: string;
  timeoutMs: number;
  retries: number;
  fallback?: { provider: AIProvider; model: string }[];
  outputSchemaId: string;
}

export interface WorkflowDefinition {
  key: string;
  name: string;
  inputs: Record<string, { required: boolean }>;
  stateMachine: Record<string, string[]>;
  stages: WorkflowStageDefinition[];
  finalOutputSchemaId: string;
}

export interface Workflow {
  id: string;
  orgId: string;
  key: string;
  name: string;
  description: string | null;
  definitionJson: WorkflowDefinition;
  isSystem: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Prompt Template --------------------
export type PromptRole = 'generator' | 'critic' | 'cross_questioner' | 'synthesizer' | 'verifier';

export interface PromptTemplate {
  id: string;
  orgId: string;
  key: string;
  name: string;
  role: PromptRole;
  template: string;
  outputSchemaId: string;
  version: number;
  isSystem: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Task --------------------
export type TaskStatus =
  | 'NEW'
  | 'CLARIFYING'
  | 'READY_FOR_GENERATION'
  | 'DRAFT_GENERATED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'EXPORTED'
  | 'PUBLISHED'
  | 'ON_HOLD'
  | 'FAILED';

export interface ContextItem {
  type: 'link' | 'text' | 'decision';
  title: string;
  url?: string;
  content?: string;
  notes?: string;
}

export interface Task {
  id: string;
  orgId: string;
  workflowId: string;
  createdBy: string;
  ownerId: string;
  title: string;
  status: TaskStatus;
  requestText: string;
  requesterName: string | null;
  dueDate: Date | null;
  urgency: string | null;
  tags: string[] | null;
  clarificationJson: Record<string, unknown> | null;
  contextItemsJson: ContextItem[] | null;
  selectedOption: string | null;
  documentCurrentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// -------------------- Document --------------------
export interface BriefDraft {
  contextRequest: string;
  problem: string;
  goals: string[];
  nonGoals: string[];
  users: string;
  useCases: string[];
  proposedSolution: string;
  scopeIn: string[];
  scopeOut: string[];
  risks: string[];
  successMetrics: string[];
  openQuestions: string[];
  nextSteps: string[];
}

export interface SourceItem {
  type: 'user_input' | 'link' | 'decision';
  title: string;
  url?: string;
  note?: string;
}

export interface CritiqueResolution {
  issue: string;
  decision: 'accepted' | 'rejected' | 'deferred';
  reason: string;
}

export interface ProductBriefContent {
  final: BriefDraft;
  critiqueResolution: CritiqueResolution[];
  openQuestions: string[];
  risks: string[];
  sources: SourceItem[];
  needsValidation: string[];
}

export interface Document {
  id: string;
  orgId: string;
  taskId: string;
  version: number;
  title: string;
  contentJson: ProductBriefContent;
  sourcesJson: SourceItem[];
  needsValidationJson: string[];
  approvedBy: string | null;
  approvedAt: Date | null;
  exportedFormat: string | null;
  exportedUrl: string | null;
  createdBy: string;
  createdAt: Date;
}

// -------------------- Run --------------------
export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PARTIAL';
export type StageStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface Run {
  id: string;
  orgId: string;
  taskId: string;
  workflowId: string;
  triggeredBy: string;
  status: RunStatus;
  idempotencyKey: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorJson: Record<string, unknown> | null;
  createdAt: Date;
}

export interface RunStage {
  id: string;
  orgId: string;
  runId: string;
  stageId: string;
  role: PromptRole;
  provider: AIProvider;
  model: string;
  status: StageStatus;
  promptRendered: string | null;
  outputJson: Record<string, unknown> | null;
  errorJson: Record<string, unknown> | null;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

// -------------------- Decision --------------------
export interface Decision {
  id: string;
  orgId: string;
  summary: string;
  rationale: string;
  owner: string | null;
  decidedAt: Date;
  linksJson: { title: string; url: string }[];
  tags: string[] | null;
  createdBy: string;
  createdAt: Date;
}

// -------------------- Audit --------------------
export interface AuditEvent {
  id: string;
  orgId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// -------------------- API Types --------------------
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RequestContext {
  userId: string;
  orgId?: string;
  role?: OrgRole;
  ipAddress: string;
  userAgent: string;
}
