# CLAUDE.md - AI Assistant Guidelines for AI Product Manager MVP

## Project Overview

**AI Product Manager (AI-PM)** is a multi-tenant web application that transforms stakeholder requests into structured, source-aware Product Briefs through a controlled workflow with multi-AI orchestration (OpenAI + Claude + Gemini).

### Core Workflow
1. User inputs request
2. Clarify (wizard)
3. Context (user-provided sources + optional retrieval)
4. Next-step recommendation
5. Multi-AI orchestration to draft brief (JSON)
6. Human review/approve
7. Export/Publish

### Design Principles
- **Evidence-first:** Do not invent facts; missing info must be flagged
- **Approve-to-publish:** Outputs require explicit user approval
- **Traceability:** Store run traces (prompts, stage outputs, costs)
- **Multi-tenant isolation:** `org_id` on core entities; enforce at API level
- **JSON output contracts:** Orchestration returns JSON validated by schema

## Repository Structure

```
product-manager-ai/
├── CLAUDE.md                 # AI assistant guidelines (this file)
├── README.md                 # Project documentation
├── docker-compose.yml        # Docker deployment
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .env.example              # Environment variables template
├── src/
│   ├── index.ts              # API application entry point
│   ├── worker.ts             # Worker entry point
│   ├── config/               # Configuration management
│   │   └── index.ts
│   ├── db/                   # Database layer
│   │   ├── index.ts          # Database connection
│   │   ├── migrations/       # SQL migrations
│   │   └── repositories/     # Data access layer
│   ├── api/                  # REST API
│   │   ├── routes/           # Route definitions
│   │   ├── middleware/       # Auth, RBAC, rate limiting
│   │   └── validators/       # Request validation
│   ├── services/             # Business logic
│   │   ├── auth/             # Authentication service
│   │   ├── org/              # Organization management
│   │   ├── task/             # Task management
│   │   ├── orchestration/    # AI orchestration engine
│   │   └── providers/        # AI provider adapters
│   ├── types/                # TypeScript interfaces
│   ├── schemas/              # JSON schemas for validation
│   └── utils/                # Utility functions
├── tests/                    # Test files
├── docs/                     # Documentation
└── scripts/                  # Build and deployment scripts
```

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express.js for REST API
- **Database:** PostgreSQL 16 with UUID support
- **Queue:** Redis for job queue and rate limiting
- **Auth:** JWT (access + refresh tokens)
- **Validation:** Zod for request/response validation, AJV for JSON schemas

## Development Commands

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npm run db:migrate

# Seed system data (workflows, prompts)
npm run db:seed

# Run in development mode (API)
npm run dev

# Run worker in development mode
npm run dev:worker

# Run tests
npm test

# Build for production
npm run build

# Start production (API)
npm start

# Start production (worker)
npm run start:worker

# Lint and format
npm run lint
npm run format
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | API server port | No (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | Secret for JWT signing | Yes |
| `JWT_ACCESS_EXPIRES_IN` | Access token expiry | No (default: 15m) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | No (default: 30d) |
| `APP_KMS_MASTER_KEY` | 32-byte key for encrypting BYOK secrets | Yes |
| `MANAGED_OPENAI_KEY` | Platform OpenAI key (optional) | No |
| `MANAGED_ANTHROPIC_KEY` | Platform Anthropic key (optional) | No |
| `MANAGED_GOOGLE_KEY` | Platform Google AI key (optional) | No |
| `BASE_URL` | Application base URL | Yes |
| `LOG_LEVEL` | Logging verbosity | No (default: info) |

## Database Schema

### Core Entities
- **organizations**: Multi-tenant orgs with settings
- **users**: User accounts with email verification
- **org_memberships**: User-org relationships with roles (org_admin/org_member)
- **org_invitations**: Pending invitations
- **sessions**: Refresh token storage

### AI & Orchestration
- **org_ai_provider_configs**: Per-org AI provider settings (BYOK/managed)
- **org_budgets**: Daily/monthly spending limits
- **usage_ledger**: Token usage and cost tracking
- **workflows**: Workflow definitions (DSL in JSONB)
- **prompt_templates**: Prompt templates by role

### Tasks & Documents
- **tasks**: Workflow instances with user data
- **documents**: Generated brief versions
- **runs**: Orchestration executions
- **run_stages**: Per-stage outputs and metrics

### Other
- **decisions**: Decision log entries
- **audit_events**: Audit trail

## API Conventions

### Base Path
`/v1`

### Authentication
`Authorization: Bearer <access_token>`

### Response Format
```json
{ "data": { }, "meta": { } }
```

### Error Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { "field": "request_text" }
  }
}
```

### Error Codes
- `AUTH_INVALID_CREDENTIALS` (401)
- `AUTH_EMAIL_NOT_VERIFIED` (403)
- `AUTH_TOKEN_EXPIRED` (401)
- `ORG_FORBIDDEN` (403)
- `VALIDATION_ERROR` (422)
- `RESOURCE_NOT_FOUND` (404)
- `PROVIDER_NOT_CONFIGURED` (400)
- `BUDGET_HARD_LIMIT_EXCEEDED` (402)
- `RATE_LIMITED` (429)
- `RUN_IN_PROGRESS` (409)

## Multi-AI Orchestration

### Stage Pipeline
1. **Generator** (OpenAI GPT-4.1) → Draft brief JSON
2. **Critic** (Claude 3.5 Sonnet) → Issues/recommendations JSON
3. **Cross-Questioner** (Gemini 1.5 Pro) → Questions JSON
4. **Synthesizer** (OpenAI GPT-4.1) → Final brief JSON

### Rules
- All outputs must be **JSON only** validated against schemas
- No-source → no-assertion; missing info goes to `needs_validation`
- Critic must not rewrite whole doc; only critique
- Fallback to alternative providers on failure

### Provider Adapter Interface
```typescript
interface ProviderAdapter {
  generate(model: string, messages: Message[], options: GenerateOptions): Promise<GenerateResult>;
  healthCheck(): Promise<boolean>;
  estimateCost(tokensIn: number, tokensOut: number, model: string): number;
}
```

## Task State Machine

```
NEW → CLARIFYING → READY_FOR_GENERATION → DRAFT_GENERATED → IN_REVIEW → APPROVED → EXPORTED/PUBLISHED
      ↓                    ↓                    ↓               ↓
   ON_HOLD              FAILED              ON_HOLD          ON_HOLD
```

## Code Conventions

### TypeScript Standards
- Use TypeScript strict mode
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for public functions
- Avoid `any` type; use `unknown` when type is truly unknown

### Naming Conventions
- **Files**: kebab-case (`user-service.ts`)
- **Classes/Interfaces**: PascalCase (`UserService`, `UserProfile`)
- **Functions/Variables**: camelCase (`getUserById`, `currentUser`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRY_COUNT`)
- **Database columns**: snake_case (`created_at`, `org_id`)

### Error Handling
```typescript
class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

### Repository Pattern
```typescript
// All DB operations go through repositories
class TaskRepository {
  async findById(orgId: string, taskId: string): Promise<Task | null>;
  async create(orgId: string, data: CreateTaskInput): Promise<Task>;
  async update(orgId: string, taskId: string, data: UpdateTaskInput): Promise<Task>;
}
```

## Security Requirements

### Authentication
- Password hashing with bcrypt (cost factor 12)
- Access JWT: 15 minutes expiry
- Refresh token: 30 days, stored hashed, rotation on use
- Rate limiting on auth endpoints

### BYOK Key Encryption
- AES-256-GCM with `APP_KMS_MASTER_KEY`
- Store encrypted bytes + last 4 chars only
- Never return plaintext keys in API responses

### Multi-Tenant Isolation
- All queries must include `org_id` filter
- RBAC middleware validates membership and role
- Audit all sensitive operations

## AI Assistant Instructions

### When Working on This Codebase

1. **Read Before Modifying**: Always read existing files before making changes
2. **Follow Existing Patterns**: Match the style and patterns already in the codebase
3. **Minimal Changes**: Only make changes directly related to the task
4. **Multi-Tenant Awareness**: Always include `org_id` in database operations
5. **Security First**: Never expose secrets, validate all inputs

### Key Implementation Notes

- All orchestration outputs must validate against JSON schemas
- Tasks follow a strict state machine - validate transitions
- Usage must be tracked in `usage_ledger` for every AI call
- Audit events must be logged for sensitive operations
- Idempotency keys are required for run creation

### Testing Requirements
- Unit tests for business logic
- Integration tests for API endpoints
- Mock AI providers in tests
- Test multi-tenant isolation

---

*Last updated: 2026-02-03*
*Version: MVP v1.0*
