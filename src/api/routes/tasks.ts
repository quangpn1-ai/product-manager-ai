import { Router } from 'express';
import { z } from 'zod';
import { taskRepository, documentRepository, runRepository } from '../../db/repositories/task-repository.js';
import { query, toCamelCase } from '../../db/index.js';
import { authenticate, requireOrgMembership } from '../middleware/auth.js';
import { validateBody, validateQuery, paginationSchema, uuidSchema } from '../validators/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { enqueueRun } from '../../services/queue.js';
import type { TaskStatus, ContextItem } from '../../types/index.js';

const router = Router({ mergeParams: true });

// Schemas
const createTaskSchema = z.object({
  workflow_id: uuidSchema,
  title: z.string().min(1).max(255),
  request_text: z.string().min(1).max(10000),
  requester_name: z.string().max(255).optional(),
  due_date: z.string().datetime().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  request_text: z.string().min(1).max(10000).optional(),
  requester_name: z.string().max(255).nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).nullable().optional(),
  clarification_json: z.record(z.unknown()).optional(),
  context_items_json: z.array(z.object({
    type: z.enum(['link', 'text', 'decision']),
    title: z.string(),
    url: z.string().optional(),
    content: z.string().optional(),
    notes: z.string().optional(),
  })).optional(),
  selected_option: z.string().optional(),
  status: z.enum([
    'NEW', 'CLARIFYING', 'READY_FOR_GENERATION', 'DRAFT_GENERATED',
    'IN_REVIEW', 'APPROVED', 'EXPORTED', 'PUBLISHED', 'ON_HOLD', 'FAILED'
  ]).optional(),
});

const taskFiltersSchema = paginationSchema.extend({
  status: z.string().optional(),
  owner_id: uuidSchema.optional(),
  workflow_id: uuidSchema.optional(),
  search: z.string().max(255).optional(),
});

const createRunSchema = z.object({
  mode: z.enum(['full', 'regenerate']).default('full'),
  override: z.object({
    stages: z.record(z.object({
      provider: z.enum(['openai', 'anthropic', 'google']).optional(),
      model: z.string().optional(),
    })).optional(),
  }).optional(),
});

const approveDocSchema = z.object({
  approved: z.boolean(),
});

const exportDocSchema = z.object({
  format: z.enum(['markdown', 'pdf', 'json']),
});

// GET /orgs/:org_id/tasks - List tasks
router.get(
  '/',
  authenticate,
  requireOrgMembership(),
  validateQuery(taskFiltersSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;

      const filters: {
        status?: TaskStatus | TaskStatus[];
        ownerId?: string;
        workflowId?: string;
        search?: string;
      } = {};

      if (req.query['status']) {
        const statuses = (req.query['status'] as string).split(',') as TaskStatus[];
        filters.status = statuses.length === 1 ? statuses[0] : statuses;
      }
      if (req.query['owner_id']) {
        filters.ownerId = req.query['owner_id'] as string;
      }
      if (req.query['workflow_id']) {
        filters.workflowId = req.query['workflow_id'] as string;
      }
      if (req.query['search']) {
        filters.search = req.query['search'] as string;
      }

      const { tasks, total } = await taskRepository.findByOrg(orgId, filters, {
        limit: parseInt(req.query['limit'] as string, 10) || 20,
        offset: parseInt(req.query['offset'] as string, 10) || 0,
      });

      res.json({
        data: tasks.map((task) => ({
          id: task.id,
          workflow_id: task.workflowId,
          title: task.title,
          status: task.status,
          request_text: task.requestText,
          requester_name: task.requesterName,
          due_date: task.dueDate,
          urgency: task.urgency,
          tags: task.tags,
          owner_id: task.ownerId,
          created_by: task.createdBy,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
        })),
        meta: {
          total,
          limit: parseInt(req.query['limit'] as string, 10) || 20,
          offset: parseInt(req.query['offset'] as string, 10) || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /orgs/:org_id/tasks - Create task
router.post(
  '/',
  authenticate,
  requireOrgMembership(),
  validateBody(createTaskSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const userId = req.context!.userId;

      // Verify workflow exists
      const workflowResult = await query<Record<string, unknown>>(
        'SELECT * FROM workflows WHERE org_id = $1 AND id = $2 AND is_active = true',
        [orgId, req.body.workflow_id]
      );
      if (workflowResult.rows.length === 0) {
        throw new NotFoundError('Workflow');
      }

      const task = await taskRepository.create({
        orgId,
        workflowId: req.body.workflow_id,
        createdBy: userId,
        ownerId: userId,
        title: req.body.title,
        requestText: req.body.request_text,
        requesterName: req.body.requester_name,
        dueDate: req.body.due_date ? new Date(req.body.due_date) : undefined,
        urgency: req.body.urgency,
        tags: req.body.tags,
      });

      logger.info({ taskId: task.id, orgId, actorId: userId }, 'Task created');

      res.status(201).json({
        data: {
          id: task.id,
          workflow_id: task.workflowId,
          title: task.title,
          status: task.status,
          request_text: task.requestText,
          requester_name: task.requesterName,
          due_date: task.dueDate,
          urgency: task.urgency,
          tags: task.tags,
          owner_id: task.ownerId,
          created_at: task.createdAt,
          allowed_transitions: taskRepository.getAllowedTransitions(task.status),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/tasks/:task_id - Get task
router.get('/:task_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const taskId = req.params['task_id']!;

    const task = await taskRepository.findById(orgId, taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }

    res.json({
      data: {
        id: task.id,
        workflow_id: task.workflowId,
        title: task.title,
        status: task.status,
        request_text: task.requestText,
        requester_name: task.requesterName,
        due_date: task.dueDate,
        urgency: task.urgency,
        tags: task.tags,
        clarification_json: task.clarificationJson,
        context_items_json: task.contextItemsJson,
        selected_option: task.selectedOption,
        document_current_id: task.documentCurrentId,
        owner_id: task.ownerId,
        created_by: task.createdBy,
        created_at: task.createdAt,
        updated_at: task.updatedAt,
        allowed_transitions: taskRepository.getAllowedTransitions(task.status),
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /orgs/:org_id/tasks/:task_id - Update task
router.patch(
  '/:task_id',
  authenticate,
  requireOrgMembership(),
  validateBody(updateTaskSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const taskId = req.params['task_id']!;

      const existingTask = await taskRepository.findById(orgId, taskId);
      if (!existingTask) {
        throw new NotFoundError('Task');
      }

      const task = await taskRepository.update(orgId, taskId, {
        title: req.body.title,
        requestText: req.body.request_text,
        requesterName: req.body.requester_name,
        dueDate: req.body.due_date ? new Date(req.body.due_date) : req.body.due_date,
        urgency: req.body.urgency,
        tags: req.body.tags,
        clarificationJson: req.body.clarification_json,
        contextItemsJson: req.body.context_items_json as ContextItem[] | undefined,
        selectedOption: req.body.selected_option,
        status: req.body.status as TaskStatus | undefined,
      });

      logger.info({ taskId, orgId, actorId: req.context!.userId, statusChange: req.body.status }, 'Task updated');

      res.json({
        data: {
          id: task!.id,
          workflow_id: task!.workflowId,
          title: task!.title,
          status: task!.status,
          request_text: task!.requestText,
          requester_name: task!.requesterName,
          due_date: task!.dueDate,
          urgency: task!.urgency,
          tags: task!.tags,
          clarification_json: task!.clarificationJson,
          context_items_json: task!.contextItemsJson,
          selected_option: task!.selectedOption,
          document_current_id: task!.documentCurrentId,
          updated_at: task!.updatedAt,
          allowed_transitions: taskRepository.getAllowedTransitions(task!.status),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /orgs/:org_id/tasks/:task_id - Delete task
router.delete('/:task_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const taskId = req.params['task_id']!;

    const task = await taskRepository.findById(orgId, taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }

    await taskRepository.delete(orgId, taskId);

    logger.info({ taskId, orgId, actorId: req.context!.userId }, 'Task deleted');

    res.json({
      data: null,
      meta: { message: 'Task deleted' },
    });
  } catch (error) {
    next(error);
  }
});

// POST /orgs/:org_id/tasks/:task_id/runs - Create run
router.post(
  '/:task_id/runs',
  authenticate,
  requireOrgMembership(),
  validateBody(createRunSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const taskId = req.params['task_id']!;
      const userId = req.context!.userId;

      const idempotencyKey = req.get('Idempotency-Key');
      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header is required');
      }

      const task = await taskRepository.findById(orgId, taskId);
      if (!task) {
        throw new NotFoundError('Task');
      }

      // Check for existing run with same idempotency key
      const existingRun = await runRepository.findByIdempotencyKey(taskId, idempotencyKey);
      if (existingRun) {
        // Return existing run (idempotent)
        res.json({
          data: {
            id: existingRun.id,
            status: existingRun.status,
            idempotency_key: existingRun.idempotencyKey,
            created_at: existingRun.createdAt,
          },
          meta: { idempotent: true },
        });
        return;
      }

      // Check for active run
      const activeRun = await runRepository.findActiveByTaskId(orgId, taskId);
      if (activeRun) {
        throw new ConflictError('A run is already in progress for this task');
      }

      // Create run
      const run = await runRepository.create({
        orgId,
        taskId,
        workflowId: task.workflowId,
        triggeredBy: userId,
        idempotencyKey,
      });

      // Enqueue job to worker
      await enqueueRun(run.id, orgId);

      logger.info({ runId: run.id, taskId, orgId, actorId: userId }, 'Run created and enqueued');

      res.status(201).json({
        data: {
          id: run.id,
          task_id: run.taskId,
          workflow_id: run.workflowId,
          status: run.status,
          idempotency_key: run.idempotencyKey,
          created_at: run.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/tasks/:task_id/runs - List runs
router.get('/:task_id/runs', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const taskId = req.params['task_id']!;

    const task = await taskRepository.findById(orgId, taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }

    const runs = await runRepository.findByTaskId(orgId, taskId);

    res.json({
      data: runs.map((run) => ({
        id: run.id,
        status: run.status,
        idempotency_key: run.idempotencyKey,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        error_json: run.errorJson,
        created_at: run.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/tasks/:task_id/documents - List documents
router.get('/:task_id/documents', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const taskId = req.params['task_id']!;

    const task = await taskRepository.findById(orgId, taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }

    const documents = await documentRepository.findByTaskId(orgId, taskId);

    res.json({
      data: documents.map((doc) => ({
        id: doc.id,
        version: doc.version,
        title: doc.title,
        approved_by: doc.approvedBy,
        approved_at: doc.approvedAt,
        exported_format: doc.exportedFormat,
        created_by: doc.createdBy,
        created_at: doc.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/tasks/:task_id/documents/:doc_id - Get document
router.get('/:task_id/documents/:doc_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const docId = req.params['doc_id']!;

    const doc = await documentRepository.findById(orgId, docId);
    if (!doc) {
      throw new NotFoundError('Document');
    }

    res.json({
      data: {
        id: doc.id,
        task_id: doc.taskId,
        version: doc.version,
        title: doc.title,
        content_json: doc.contentJson,
        sources_json: doc.sourcesJson,
        needs_validation_json: doc.needsValidationJson,
        approved_by: doc.approvedBy,
        approved_at: doc.approvedAt,
        exported_format: doc.exportedFormat,
        exported_url: doc.exportedUrl,
        created_by: doc.createdBy,
        created_at: doc.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /orgs/:org_id/tasks/:task_id/documents/:doc_id/approve - Approve document
router.post(
  '/:task_id/documents/:doc_id/approve',
  authenticate,
  requireOrgMembership(),
  validateBody(approveDocSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const taskId = req.params['task_id']!;
      const docId = req.params['doc_id']!;
      const userId = req.context!.userId;

      const task = await taskRepository.findById(orgId, taskId);
      if (!task) {
        throw new NotFoundError('Task');
      }

      const doc = await documentRepository.findById(orgId, docId);
      if (!doc || doc.taskId !== taskId) {
        throw new NotFoundError('Document');
      }

      if (req.body.approved) {
        const approved = await documentRepository.approve(orgId, docId, userId);

        // Update task status to APPROVED
        await taskRepository.update(orgId, taskId, {
          status: 'APPROVED',
          documentCurrentId: docId,
        });

        logger.info({ docId, taskId, orgId, actorId: userId }, 'Document approved');

        res.json({
          data: {
            id: approved!.id,
            approved_by: approved!.approvedBy,
            approved_at: approved!.approvedAt,
          },
        });
      } else {
        // Return to review
        await taskRepository.update(orgId, taskId, { status: 'READY_FOR_GENERATION' });

        res.json({
          data: {
            id: doc.id,
            status: 'rejected',
          },
          meta: { message: 'Document rejected, task returned to generation' },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /orgs/:org_id/tasks/:task_id/export - Export document
router.post(
  '/:task_id/export',
  authenticate,
  requireOrgMembership(),
  validateBody(exportDocSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const taskId = req.params['task_id']!;

      const task = await taskRepository.findById(orgId, taskId);
      if (!task) {
        throw new NotFoundError('Task');
      }

      if (!task.documentCurrentId) {
        throw new ValidationError('No approved document to export');
      }

      const doc = await documentRepository.findById(orgId, task.documentCurrentId);
      if (!doc) {
        throw new NotFoundError('Document');
      }

      // Generate export based on format
      let exportContent: string;
      const format = req.body.format;

      if (format === 'json') {
        exportContent = JSON.stringify(doc.contentJson, null, 2);
      } else if (format === 'markdown') {
        // Simple markdown generation
        const content = doc.contentJson as { final?: Record<string, unknown> };
        const brief = content.final ?? content;
        exportContent = `# ${doc.title}\n\n`;

        if (brief && typeof brief === 'object') {
          for (const [key, value] of Object.entries(brief)) {
            const title = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            exportContent += `## ${title.charAt(0).toUpperCase() + title.slice(1)}\n\n`;
            if (Array.isArray(value)) {
              for (const item of value) {
                exportContent += `- ${item}\n`;
              }
            } else {
              exportContent += `${value}\n`;
            }
            exportContent += '\n';
          }
        }
      } else {
        // PDF would require additional library - for MVP, return error
        throw new ValidationError('PDF export not yet implemented');
      }

      // Update document and task
      await documentRepository.setExported(orgId, doc.id, format);
      await taskRepository.update(orgId, taskId, { status: 'EXPORTED' });

      logger.info({ docId: doc.id, taskId, orgId, format }, 'Document exported');

      res.json({
        data: {
          format,
          content: exportContent,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
