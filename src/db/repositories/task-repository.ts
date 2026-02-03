import { query, toCamelCase, toCamelCaseArray, transaction } from '../index.js';
import { InvalidStateTransitionError } from '../../utils/errors.js';
import type { Task, TaskStatus, Document, Run, RunStage, ContextItem } from '../../types/index.js';

// Valid state transitions based on the state machine
const STATE_MACHINE: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['CLARIFYING', 'ON_HOLD'],
  CLARIFYING: ['READY_FOR_GENERATION', 'ON_HOLD'],
  READY_FOR_GENERATION: ['DRAFT_GENERATED', 'FAILED', 'ON_HOLD'],
  DRAFT_GENERATED: ['IN_REVIEW', 'READY_FOR_GENERATION'],
  IN_REVIEW: ['APPROVED', 'READY_FOR_GENERATION'],
  APPROVED: ['EXPORTED', 'PUBLISHED'],
  EXPORTED: [],
  PUBLISHED: [],
  FAILED: ['READY_FOR_GENERATION', 'ON_HOLD'],
  ON_HOLD: ['CLARIFYING', 'READY_FOR_GENERATION'],
};

interface CreateTaskInput {
  orgId: string;
  workflowId: string;
  createdBy: string;
  ownerId: string;
  title: string;
  requestText: string;
  requesterName?: string;
  dueDate?: Date;
  urgency?: string;
  tags?: string[];
}

interface UpdateTaskInput {
  title?: string;
  requestText?: string;
  requesterName?: string;
  dueDate?: Date | null;
  urgency?: string | null;
  tags?: string[] | null;
  clarificationJson?: Record<string, unknown>;
  contextItemsJson?: ContextItem[];
  selectedOption?: string;
  documentCurrentId?: string;
  status?: TaskStatus;
}

interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  ownerId?: string;
  workflowId?: string;
  search?: string;
}

interface PaginationOptions {
  limit: number;
  offset: number;
}

export class TaskRepository {
  // Task CRUD
  async findById(orgId: string, taskId: string): Promise<Task | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM tasks WHERE org_id = $1 AND id = $2',
      [orgId, taskId]
    );
    return result.rows[0] ? toCamelCase<Task>(result.rows[0]) : null;
  }

  async findByOrg(
    orgId: string,
    filters: TaskFilters = {},
    pagination: PaginationOptions = { limit: 20, offset: 0 }
  ): Promise<{ tasks: Task[]; total: number }> {
    const conditions: string[] = ['org_id = $1'];
    const values: unknown[] = [orgId];
    let paramIndex = 2;

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status = ANY($${paramIndex++})`);
        values.push(filters.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }
    }

    if (filters.ownerId) {
      conditions.push(`owner_id = $${paramIndex++}`);
      values.push(filters.ownerId);
    }

    if (filters.workflowId) {
      conditions.push(`workflow_id = $${paramIndex++}`);
      values.push(filters.workflowId);
    }

    if (filters.search) {
      conditions.push(`(title ILIKE $${paramIndex} OR request_text ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM tasks WHERE ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Get paginated results
    values.push(pagination.limit, pagination.offset);
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM tasks WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return {
      tasks: toCamelCaseArray<Task>(result.rows),
      total,
    };
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO tasks
       (org_id, workflow_id, created_by, owner_id, title, status, request_text, requester_name, due_date, urgency, tags)
       VALUES ($1, $2, $3, $4, $5, 'NEW', $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.orgId,
        input.workflowId,
        input.createdBy,
        input.ownerId,
        input.title,
        input.requestText,
        input.requesterName ?? null,
        input.dueDate ?? null,
        input.urgency ?? null,
        input.tags ?? null,
      ]
    );
    return toCamelCase<Task>(result.rows[0]!);
  }

  async update(orgId: string, taskId: string, input: UpdateTaskInput): Promise<Task | null> {
    const task = await this.findById(orgId, taskId);
    if (!task) {
      return null;
    }

    // Validate state transition if status is being updated
    if (input.status && input.status !== task.status) {
      this.validateStateTransition(task.status, input.status);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.requestText !== undefined) {
      updates.push(`request_text = $${paramIndex++}`);
      values.push(input.requestText);
    }
    if (input.requesterName !== undefined) {
      updates.push(`requester_name = $${paramIndex++}`);
      values.push(input.requesterName);
    }
    if (input.dueDate !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(input.dueDate);
    }
    if (input.urgency !== undefined) {
      updates.push(`urgency = $${paramIndex++}`);
      values.push(input.urgency);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.clarificationJson !== undefined) {
      updates.push(`clarification_json = $${paramIndex++}`);
      values.push(JSON.stringify(input.clarificationJson));
    }
    if (input.contextItemsJson !== undefined) {
      updates.push(`context_items_json = $${paramIndex++}`);
      values.push(JSON.stringify(input.contextItemsJson));
    }
    if (input.selectedOption !== undefined) {
      updates.push(`selected_option = $${paramIndex++}`);
      values.push(input.selectedOption);
    }
    if (input.documentCurrentId !== undefined) {
      updates.push(`document_current_id = $${paramIndex++}`);
      values.push(input.documentCurrentId);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (updates.length === 0) {
      return task;
    }

    values.push(orgId, taskId);
    const result = await query<Record<string, unknown>>(
      `UPDATE tasks SET ${updates.join(', ')} WHERE org_id = $${paramIndex++} AND id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? toCamelCase<Task>(result.rows[0]) : null;
  }

  async delete(orgId: string, taskId: string): Promise<void> {
    await query('DELETE FROM tasks WHERE org_id = $1 AND id = $2', [orgId, taskId]);
  }

  validateStateTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): void {
    const allowedTransitions = STATE_MACHINE[currentStatus] ?? [];
    if (!allowedTransitions.includes(targetStatus)) {
      throw new InvalidStateTransitionError(currentStatus, targetStatus);
    }
  }

  canTransition(currentStatus: TaskStatus, targetStatus: TaskStatus): boolean {
    const allowedTransitions = STATE_MACHINE[currentStatus] ?? [];
    return allowedTransitions.includes(targetStatus);
  }

  getAllowedTransitions(currentStatus: TaskStatus): TaskStatus[] {
    return STATE_MACHINE[currentStatus] ?? [];
  }
}

// Document Repository
export class DocumentRepository {
  async findById(orgId: string, docId: string): Promise<Document | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM documents WHERE org_id = $1 AND id = $2',
      [orgId, docId]
    );
    return result.rows[0] ? toCamelCase<Document>(result.rows[0]) : null;
  }

  async findByTaskId(orgId: string, taskId: string): Promise<Document[]> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM documents WHERE org_id = $1 AND task_id = $2 ORDER BY version DESC',
      [orgId, taskId]
    );
    return toCamelCaseArray<Document>(result.rows);
  }

  async findLatestByTaskId(orgId: string, taskId: string): Promise<Document | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM documents WHERE org_id = $1 AND task_id = $2 ORDER BY version DESC LIMIT 1',
      [orgId, taskId]
    );
    return result.rows[0] ? toCamelCase<Document>(result.rows[0]) : null;
  }

  async create(input: {
    orgId: string;
    taskId: string;
    title: string;
    contentJson: Record<string, unknown>;
    sourcesJson: unknown[];
    needsValidationJson: string[];
    createdBy: string;
  }): Promise<Document> {
    // Get the next version number
    const versionResult = await query<{ max_version: number | null }>(
      'SELECT MAX(version) as max_version FROM documents WHERE task_id = $1',
      [input.taskId]
    );
    const nextVersion = (versionResult.rows[0]?.max_version ?? 0) + 1;

    const result = await query<Record<string, unknown>>(
      `INSERT INTO documents
       (org_id, task_id, version, title, content_json, sources_json, needs_validation_json, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.orgId,
        input.taskId,
        nextVersion,
        input.title,
        JSON.stringify(input.contentJson),
        JSON.stringify(input.sourcesJson),
        JSON.stringify(input.needsValidationJson),
        input.createdBy,
      ]
    );
    return toCamelCase<Document>(result.rows[0]!);
  }

  async approve(orgId: string, docId: string, approvedBy: string): Promise<Document | null> {
    const result = await query<Record<string, unknown>>(
      `UPDATE documents SET approved_by = $1, approved_at = now()
       WHERE org_id = $2 AND id = $3
       RETURNING *`,
      [approvedBy, orgId, docId]
    );
    return result.rows[0] ? toCamelCase<Document>(result.rows[0]) : null;
  }

  async setExported(orgId: string, docId: string, format: string, url?: string): Promise<Document | null> {
    const result = await query<Record<string, unknown>>(
      `UPDATE documents SET exported_format = $1, exported_url = $2
       WHERE org_id = $3 AND id = $4
       RETURNING *`,
      [format, url ?? null, orgId, docId]
    );
    return result.rows[0] ? toCamelCase<Document>(result.rows[0]) : null;
  }
}

// Run Repository
export class RunRepository {
  async findById(orgId: string, runId: string): Promise<Run | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM runs WHERE org_id = $1 AND id = $2',
      [orgId, runId]
    );
    return result.rows[0] ? toCamelCase<Run>(result.rows[0]) : null;
  }

  async findByTaskId(orgId: string, taskId: string): Promise<Run[]> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM runs WHERE org_id = $1 AND task_id = $2 ORDER BY created_at DESC',
      [orgId, taskId]
    );
    return toCamelCaseArray<Run>(result.rows);
  }

  async findByIdempotencyKey(taskId: string, idempotencyKey: string): Promise<Run | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM runs WHERE task_id = $1 AND idempotency_key = $2',
      [taskId, idempotencyKey]
    );
    return result.rows[0] ? toCamelCase<Run>(result.rows[0]) : null;
  }

  async findActiveByTaskId(orgId: string, taskId: string): Promise<Run | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM runs
       WHERE org_id = $1 AND task_id = $2 AND status IN ('QUEUED', 'RUNNING')
       ORDER BY created_at DESC LIMIT 1`,
      [orgId, taskId]
    );
    return result.rows[0] ? toCamelCase<Run>(result.rows[0]) : null;
  }

  async create(input: {
    orgId: string;
    taskId: string;
    workflowId: string;
    triggeredBy: string;
    idempotencyKey: string;
  }): Promise<Run> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO runs (org_id, task_id, workflow_id, triggered_by, status, idempotency_key)
       VALUES ($1, $2, $3, $4, 'QUEUED', $5)
       RETURNING *`,
      [input.orgId, input.taskId, input.workflowId, input.triggeredBy, input.idempotencyKey]
    );
    return toCamelCase<Run>(result.rows[0]!);
  }

  async updateStatus(
    orgId: string,
    runId: string,
    status: string,
    errorJson?: Record<string, unknown>
  ): Promise<Run | null> {
    let sql: string;
    let params: unknown[];

    if (status === 'RUNNING') {
      sql = `UPDATE runs SET status = $1, started_at = now() WHERE org_id = $2 AND id = $3 RETURNING *`;
      params = [status, orgId, runId];
    } else if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIAL'].includes(status)) {
      sql = `UPDATE runs SET status = $1, finished_at = now(), error_json = $2 WHERE org_id = $3 AND id = $4 RETURNING *`;
      params = [status, errorJson ? JSON.stringify(errorJson) : null, orgId, runId];
    } else {
      sql = `UPDATE runs SET status = $1 WHERE org_id = $2 AND id = $3 RETURNING *`;
      params = [status, orgId, runId];
    }

    const result = await query<Record<string, unknown>>(sql, params);
    return result.rows[0] ? toCamelCase<Run>(result.rows[0]) : null;
  }

  // Run Stages
  async createStage(input: {
    orgId: string;
    runId: string;
    stageId: string;
    role: string;
    provider: string;
    model: string;
  }): Promise<RunStage> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO run_stages (org_id, run_id, stage_id, role, provider, model, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED')
       RETURNING *`,
      [input.orgId, input.runId, input.stageId, input.role, input.provider, input.model]
    );
    return toCamelCase<RunStage>(result.rows[0]!);
  }

  async updateStage(
    orgId: string,
    runId: string,
    stageId: string,
    update: {
      status?: string;
      promptRendered?: string;
      outputJson?: Record<string, unknown>;
      errorJson?: Record<string, unknown>;
      inputTokens?: number;
      outputTokens?: number;
      costCents?: number;
    }
  ): Promise<RunStage | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (update.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(update.status);

      if (update.status === 'RUNNING') {
        updates.push(`started_at = now()`);
      } else if (['SUCCEEDED', 'FAILED', 'SKIPPED'].includes(update.status)) {
        updates.push(`finished_at = now()`);
      }
    }
    if (update.promptRendered !== undefined) {
      updates.push(`prompt_rendered = $${paramIndex++}`);
      values.push(update.promptRendered);
    }
    if (update.outputJson !== undefined) {
      updates.push(`output_json = $${paramIndex++}`);
      values.push(JSON.stringify(update.outputJson));
    }
    if (update.errorJson !== undefined) {
      updates.push(`error_json = $${paramIndex++}`);
      values.push(JSON.stringify(update.errorJson));
    }
    if (update.inputTokens !== undefined) {
      updates.push(`input_tokens = $${paramIndex++}`);
      values.push(update.inputTokens);
    }
    if (update.outputTokens !== undefined) {
      updates.push(`output_tokens = $${paramIndex++}`);
      values.push(update.outputTokens);
    }
    if (update.costCents !== undefined) {
      updates.push(`cost_cents = $${paramIndex++}`);
      values.push(update.costCents);
    }

    if (updates.length === 0) {
      return null;
    }

    values.push(orgId, runId, stageId);
    const result = await query<Record<string, unknown>>(
      `UPDATE run_stages SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND run_id = $${paramIndex++} AND stage_id = $${paramIndex}
       RETURNING *`,
      values
    );
    return result.rows[0] ? toCamelCase<RunStage>(result.rows[0]) : null;
  }

  async findStagesByRunId(orgId: string, runId: string): Promise<RunStage[]> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM run_stages WHERE org_id = $1 AND run_id = $2 ORDER BY created_at',
      [orgId, runId]
    );
    return toCamelCaseArray<RunStage>(result.rows);
  }
}

export const taskRepository = new TaskRepository();
export const documentRepository = new DocumentRepository();
export const runRepository = new RunRepository();
