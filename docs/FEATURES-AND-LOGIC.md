# Tài liệu Tính năng và Logic - AI Product Manager MVP

> Tài liệu này dành cho developer muốn phát triển thêm tính năng mới.

## Mục lục
1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [API Endpoints](#2-api-endpoints)
3. [Business Logic Services](#3-business-logic-services)
4. [Repositories (Data Access Layer)](#4-repositories-data-access-layer)
5. [Database Schema](#5-database-schema)
6. [Frontend Pages](#6-frontend-pages)
7. [Task State Machine](#7-task-state-machine)
8. [Hướng dẫn thêm tính năng mới](#8-hướng-dẫn-thêm-tính-năng-mới)

---

## 1. Tổng quan hệ thống

### Workflow chính
```
User nhập request → Clarify (wizard) → Context (sources) → AI Recommendation
    → Multi-AI Orchestration → Draft Brief → Human Review → Export/Publish
```

### Tech Stack
- **Backend:** Node.js 20+, Express.js, TypeScript
- **Database:** PostgreSQL 16 với UUID support
- **Queue:** Redis cho job queue và rate limiting
- **Auth:** JWT (access + refresh tokens)
- **Validation:** Zod (request/response), AJV (JSON schemas)
- **Frontend:** React + Vite + TypeScript + React Query

### Cấu trúc thư mục
```
src/
├── api/
│   ├── routes/          # API endpoints
│   ├── middleware/      # Auth, RBAC, error handling
│   └── validators/      # Request validation
├── services/            # Business logic
├── db/
│   ├── repositories/    # Data access layer
│   └── migrations/      # SQL migrations
├── config/              # Configuration
├── types/               # TypeScript interfaces
└── utils/               # Utilities

frontend/src/
├── pages/               # React pages
├── components/          # Shared components
├── lib/                 # API client, utilities
└── hooks/               # Custom React hooks
```

---

## 2. API Endpoints

### Authentication (`/v1/auth`)
| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| POST | `/signup` | Đăng ký user + org (optional) | No |
| POST | `/login` | Đăng nhập, trả về JWT | No |
| POST | `/refresh` | Làm mới access token | No |
| POST | `/logout` | Đăng xuất | No |
| POST | `/verify-email` | Xác thực email | No |
| POST | `/forgot-password` | Yêu cầu reset password | No |
| POST | `/reset-password` | Reset password | No |
| GET | `/me` | Lấy thông tin user hiện tại | Yes |

### Organizations (`/v1/orgs`)
| Method | Path | Mô tả | Role |
|--------|------|-------|------|
| GET | `/orgs` | Danh sách orgs của user | - |
| GET | `/orgs/:org_id` | Chi tiết org | member |
| PATCH | `/orgs/:org_id` | Cập nhật org | admin |
| GET | `/orgs/:org_id/stats` | Dashboard stats | member |
| GET | `/orgs/:org_id/members` | Danh sách thành viên | member |
| PATCH | `/orgs/:org_id/members/:user_id` | Cập nhật role | admin |
| DELETE | `/orgs/:org_id/members/:user_id` | Xóa thành viên | admin |
| POST | `/orgs/:org_id/invitations` | Mời thành viên | admin |
| GET | `/orgs/:org_id/invitations` | Danh sách lời mời | admin |
| DELETE | `/orgs/:org_id/invitations/:id` | Hủy lời mời | admin |
| POST | `/orgs/invitations/accept` | Chấp nhận lời mời | No |
| GET | `/orgs/:org_id/workflows` | Danh sách workflows | member |

### Tasks (`/v1/orgs/:org_id/tasks`)
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/tasks` | Danh sách tasks (filter, search, pagination) |
| POST | `/tasks` | Tạo task mới |
| GET | `/tasks/:task_id` | Chi tiết task |
| PATCH | `/tasks/:task_id` | Cập nhật task |
| DELETE | `/tasks/:task_id` | Xóa task |
| GET | `/tasks/:task_id/recommendations` | AI recommendations |
| POST | `/tasks/:task_id/runs` | Tạo orchestration run |
| GET | `/tasks/:task_id/runs` | Danh sách runs |
| GET | `/tasks/:task_id/documents` | Danh sách documents |
| GET | `/tasks/:task_id/documents/:doc_id` | Chi tiết document |
| POST | `/tasks/:task_id/documents/:doc_id/approve` | Approve/reject document |
| POST | `/tasks/:task_id/export` | Export (markdown/pdf/json) |
| POST | `/tasks/:task_id/publish` | Publish (webhook/confluence/notion) |

### AI Providers (`/v1/orgs/:org_id/ai/providers`)
| Method | Path | Mô tả | Role |
|--------|------|-------|------|
| GET | `/` | Danh sách providers | member |
| GET | `/:provider` | Chi tiết provider | member |
| PUT | `/:provider` | Tạo/cập nhật provider | admin |
| DELETE | `/:provider` | Xóa provider | admin |

### Budgets (`/v1/orgs/:org_id/budgets`)
| Method | Path | Mô tả | Role |
|--------|------|-------|------|
| GET | `/` | Danh sách budgets | member |
| PUT | `/:period` | Cập nhật budget (daily/monthly) | admin |
| GET | `/usage` | Thống kê usage | admin |

### Decisions (`/v1/orgs/:org_id/decisions`)
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/` | Danh sách decisions (search, filter by tag) |
| POST | `/` | Tạo decision |
| GET | `/:decision_id` | Chi tiết decision |
| PATCH | `/:decision_id` | Cập nhật decision |
| DELETE | `/:decision_id` | Xóa decision |

### Audit Log (`/v1/orgs/:org_id/audit`)
| Method | Path | Mô tả | Role |
|--------|------|-------|------|
| GET | `/` | Danh sách audit events | admin |
| GET | `/actions` | Danh sách action types | admin |

---

## 3. Business Logic Services

### AuthService (`src/services/auth/auth-service.ts`)
Quản lý authentication và sessions:
- `signup()` - Tạo user, optional org, gửi email verification
- `login()` - Xác thực, tạo JWT tokens
- `refreshTokens()` - Làm mới access token
- `logout()` - Hủy refresh token
- `verifyEmail()` - Xác thực email
- `forgotPassword()` / `resetPassword()` - Reset password flow

### RecommendationService (`src/services/recommendation-service.ts`)
AI-powered recommendations cho task readiness:
```typescript
interface RecommendationResult {
  recommendations: {
    type: 'clarification' | 'context' | 'action' | 'warning';
    priority: 'high' | 'medium' | 'low';
    message: string;
  }[];
  summary: string;
  readinessScore: number; // 0-100
}
```
- Thử providers theo thứ tự: Anthropic → OpenAI → Google
- Fallback về default recommendations nếu không có provider

### OrchestrationService (`src/services/orchestration/orchestration-service.ts`)
Multi-AI orchestration engine:

**Pipeline 4 stages:**
1. **Generator** (OpenAI GPT-4.1) → Draft brief JSON
2. **Critic** (Claude 3.5 Sonnet) → Issues/recommendations
3. **Cross-Questioner** (Gemini 1.5 Pro) → Questions
4. **Synthesizer** (OpenAI GPT-4.1) → Final brief

**Quy trình:**
1. Check budget trước khi chạy
2. Execute từng stage theo thứ tự
3. Validate output bằng JSON schema (AJV)
4. Fallback sang provider khác nếu fail
5. Ghi usage vào ledger
6. Tạo document khi thành công

### PublishService (`src/services/publish-service.ts`)
Publish documents ra external platforms:
- `publishToWebhook()` - POST JSON tới custom URL
- `publishToConfluence()` - Tạo/update Confluence page (stub)
- `publishToNotion()` - Tạo Notion entry (stub)

---

## 4. Repositories (Data Access Layer)

### Pattern chung
```typescript
class SomeRepository {
  // Luôn có org_id để đảm bảo multi-tenant isolation
  async findById(orgId: string, id: string): Promise<Entity | null>;
  async findByOrg(orgId: string, filters: Filters): Promise<{ items: Entity[]; total: number }>;
  async create(input: CreateInput): Promise<Entity>;
  async update(orgId: string, id: string, input: UpdateInput): Promise<Entity>;
  async delete(orgId: string, id: string): Promise<void>;
}
```

### Danh sách repositories

| Repository | File | Mô tả |
|------------|------|-------|
| UserRepository | `user-repository.ts` | CRUD users, password hashing |
| OrganizationRepository | `organization-repository.ts` | Orgs, memberships, invitations |
| TaskRepository | `task-repository.ts` | Tasks, documents, runs, stages |
| ProviderRepository | `provider-repository.ts` | AI configs, budgets, usage ledger |
| DecisionRepository | `decision-repository.ts` | Decision log entries |
| AuditRepository | `audit-repository.ts` | Audit events |

### Audit Actions
```typescript
const AuditActions = {
  // User actions
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Org actions
  ORG_CREATED: 'org.created',
  ORG_MEMBER_INVITED: 'org.member.invited',
  ORG_MEMBER_REMOVED: 'org.member.removed',

  // Task actions
  TASK_CREATED: 'task.created',
  TASK_STATUS_CHANGED: 'task.status_changed',

  // Document actions
  DOCUMENT_APPROVED: 'document.approved',
  DOCUMENT_EXPORTED: 'document.exported',

  // Run actions
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',

  // Provider actions
  PROVIDER_CONFIGURED: 'provider.configured',
  BUDGET_UPDATED: 'budget.updated',
} as const;
```

---

## 5. Database Schema

### Core Tables

```sql
-- Organizations (multi-tenant)
organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  slug VARCHAR(100) UNIQUE,
  timezone VARCHAR(50),
  default_language VARCHAR(10),
  allowed_email_domains TEXT[],
  status VARCHAR(20) -- active, suspended
)

-- Users
users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  email_verified BOOLEAN,
  status VARCHAR(20), -- active, suspended
  last_login_at TIMESTAMP
)

-- User-Org relationships
org_memberships (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  user_id UUID REFERENCES users,
  role VARCHAR(20), -- org_admin, org_member
  status VARCHAR(20) -- active, suspended
)
```

### AI & Orchestration Tables

```sql
-- Provider configs (BYOK hoặc managed)
org_ai_provider_configs (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  provider VARCHAR(20), -- openai, anthropic, google
  mode VARCHAR(20), -- byok, managed
  api_key_encrypted BYTEA, -- AES-256-GCM
  default_model VARCHAR(100),
  allowed_models TEXT[]
)

-- Budget limits
org_budgets (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  period VARCHAR(20), -- daily, monthly
  soft_limit_cents INTEGER,
  hard_limit_cents INTEGER
)

-- Usage tracking
usage_ledger (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  provider VARCHAR(20),
  model VARCHAR(100),
  run_id UUID REFERENCES runs,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_cents INTEGER
)
```

### Task & Document Tables

```sql
-- Tasks
tasks (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  workflow_id UUID REFERENCES workflows,
  title VARCHAR(500),
  status VARCHAR(30), -- State machine values
  request_text TEXT,
  clarification_json JSONB,
  context_items_json JSONB,
  document_current_id UUID REFERENCES documents
)

-- Documents (versioned)
documents (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  task_id UUID REFERENCES tasks,
  version INTEGER,
  content_json JSONB,
  approved_by UUID REFERENCES users,
  approved_at TIMESTAMP
)

-- Orchestration runs
runs (
  id UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations,
  task_id UUID REFERENCES tasks,
  status VARCHAR(20), -- QUEUED, RUNNING, SUCCEEDED, FAILED
  idempotency_key VARCHAR(255) UNIQUE
)

-- Run stages
run_stages (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES runs,
  stage_id VARCHAR(50),
  role VARCHAR(50), -- generator, critic, cross_questioner, synthesizer
  provider VARCHAR(20),
  model VARCHAR(100),
  output_json JSONB,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_cents INTEGER
)
```

---

## 6. Frontend Pages

| Page | Route | File | Mô tả |
|------|-------|------|-------|
| Login | `/login` | `Login.tsx` | Đăng nhập |
| Signup | `/signup` | `Signup.tsx` | Đăng ký |
| Dashboard | `/orgs/:org_id` | `Dashboard.tsx` | Tổng quan: tasks, usage, budget |
| Tasks | `/orgs/:org_id/tasks` | `Tasks.tsx` | Danh sách tasks |
| NewTask | `/orgs/:org_id/tasks/new` | `NewTask.tsx` | Tạo task |
| TaskDetail | `/orgs/:org_id/tasks/:task_id` | `TaskDetail.tsx` | Chi tiết + workflow |
| Decisions | `/orgs/:org_id/decisions` | `Decisions.tsx` | Decision log |
| AuditLog | `/orgs/:org_id/audit` | `AuditLog.tsx` | Audit trail (admin) |
| Organization | `/orgs/:org_id/settings/organization` | `Organization.tsx` | Cài đặt org |
| AISettings | `/orgs/:org_id/settings/ai` | `AISettings.tsx` | Cấu hình providers |
| BudgetSettings | `/orgs/:org_id/settings/budget` | `BudgetSettings.tsx` | Budget limits |

### API Client (`frontend/src/lib/api.ts`)
```typescript
// Pattern sử dụng
const api = {
  tasksApi: {
    list: (orgId, params) => apiClient.get(`/orgs/${orgId}/tasks`, { params }),
    create: (orgId, data) => apiClient.post(`/orgs/${orgId}/tasks`, data),
    // ...
  },
  // ...
};

// Sử dụng với React Query
const { data, isLoading } = useQuery({
  queryKey: ['tasks', orgId],
  queryFn: () => api.tasksApi.list(orgId, {}),
});
```

---

## 7. Task State Machine

```
NEW
  ├→ CLARIFYING (bắt đầu clarify)
  └→ ON_HOLD (tạm dừng)

CLARIFYING
  ├→ READY_FOR_GENERATION (đủ thông tin)
  └→ ON_HOLD

READY_FOR_GENERATION
  ├→ DRAFT_GENERATED (run thành công)
  ├→ FAILED (run thất bại)
  └→ ON_HOLD

DRAFT_GENERATED
  ├→ IN_REVIEW (bắt đầu review)
  └→ READY_FOR_GENERATION (regenerate)

IN_REVIEW
  ├→ APPROVED (approve)
  └→ READY_FOR_GENERATION (reject, quay lại generate)

APPROVED
  ├→ EXPORTED (đã export)
  └→ PUBLISHED (đã publish)

FAILED
  ├→ READY_FOR_GENERATION (retry)
  └→ ON_HOLD
```

### Validate transition
```typescript
// src/db/repositories/task-repository.ts
const STATE_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['CLARIFYING', 'ON_HOLD'],
  CLARIFYING: ['READY_FOR_GENERATION', 'ON_HOLD'],
  // ...
};

getAllowedTransitions(currentStatus: TaskStatus): TaskStatus[] {
  return STATE_TRANSITIONS[currentStatus] || [];
}
```

---

## 8. Hướng dẫn thêm tính năng mới

### Bước 1: Thêm database table (nếu cần)

1. Tạo migration file:
```bash
# Tạo file: src/db/migrations/YYYYMMDDHHMMSS_add_feature_table.sql
```

2. Viết SQL:
```sql
CREATE TABLE IF NOT EXISTS my_feature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  -- ... columns
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_my_feature_org ON my_feature(org_id);
```

3. Chạy migration:
```bash
npm run db:migrate
```

### Bước 2: Tạo Repository

```typescript
// src/db/repositories/my-feature-repository.ts
import { query } from '../index.js';

export interface MyFeature {
  id: string;
  org_id: string;
  // ...
}

export class MyFeatureRepository {
  async findByOrg(orgId: string): Promise<MyFeature[]> {
    const result = await query(
      'SELECT * FROM my_feature WHERE org_id = $1 ORDER BY created_at DESC',
      [orgId]
    );
    return result.rows;
  }

  async create(input: CreateMyFeatureInput): Promise<MyFeature> {
    const result = await query(
      `INSERT INTO my_feature (org_id, ...) VALUES ($1, ...) RETURNING *`,
      [input.orgId, ...]
    );
    return result.rows[0];
  }

  // update, delete, ...
}

export const myFeatureRepository = new MyFeatureRepository();
```

### Bước 3: Tạo API Route

```typescript
// src/api/routes/my-feature.ts
import { Router } from 'express';
import { authenticate, requireOrgMembership } from '../middleware/auth.js';
import { myFeatureRepository } from '../../db/repositories/my-feature-repository.js';

const router = Router({ mergeParams: true });

// List
router.get('/', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const { org_id } = req.params;
    const items = await myFeatureRepository.findByOrg(org_id);
    res.json({ data: items });
  } catch (error) {
    next(error);
  }
});

// Create
router.post('/', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const { org_id } = req.params;
    const item = await myFeatureRepository.create({
      orgId: org_id,
      ...req.body,
    });
    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### Bước 4: Đăng ký route trong index.ts

```typescript
// src/index.ts
import myFeatureRoutes from './api/routes/my-feature.js';

// Thêm vào v1Router
v1Router.use('/orgs/:org_id/my-feature', myFeatureRoutes);
```

### Bước 5: Thêm API client (frontend)

```typescript
// frontend/src/lib/api.ts
export const myFeatureApi = {
  list: (orgId: string) =>
    apiClient.get<{ data: MyFeature[] }>(`/orgs/${orgId}/my-feature`),

  create: (orgId: string, data: CreateMyFeatureInput) =>
    apiClient.post<{ data: MyFeature }>(`/orgs/${orgId}/my-feature`, data),
};
```

### Bước 6: Tạo Frontend Page

```typescript
// frontend/src/pages/MyFeature.tsx
import { useQuery, useMutation } from '@tanstack/react-query';
import { myFeatureApi } from '../lib/api';

export default function MyFeaturePage() {
  const { orgId } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ['my-feature', orgId],
    queryFn: () => myFeatureApi.list(orgId!),
  });

  const createMutation = useMutation({
    mutationFn: (data) => myFeatureApi.create(orgId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-feature', orgId]);
    },
  });

  // ... render UI
}
```

### Bước 7: Thêm route trong App.tsx

```typescript
// frontend/src/App.tsx
import MyFeaturePage from './pages/MyFeature';

// Trong routes
<Route path="my-feature" element={<MyFeaturePage />} />
```

### Bước 8: Thêm navigation (nếu cần)

```typescript
// frontend/src/components/Layout.tsx
<NavLink to={`/orgs/${orgId}/my-feature`}>
  My Feature
</NavLink>
```

---

## Tips quan trọng

### Multi-tenant isolation
- **LUÔN** filter theo `org_id` trong queries
- Dùng `requireOrgMembership()` middleware cho protected routes

### Error handling
```typescript
import { AppError } from '../../utils/errors.js';

// Throw lỗi với code chuẩn
throw new AppError('RESOURCE_NOT_FOUND', 'Item not found', 404);
throw new AppError('VALIDATION_ERROR', 'Invalid input', 422, { field: 'name' });
```

### Audit logging
```typescript
import { auditRepository, AuditActions } from '../../db/repositories/audit-repository.js';

await auditRepository.log({
  orgId,
  actorUserId: req.user!.id,
  action: AuditActions.MY_FEATURE_CREATED,
  targetType: 'my_feature',
  targetId: item.id,
  metadata: { ... },
  ipAddress: req.ip,
});
```

### Validation với Zod
```typescript
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

// Trong route
const validated = createSchema.parse(req.body);
```

---

*Cập nhật: 2026-02-07*
