import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { projectRepository } from '../../db/repositories/project-repository.js';
import { fileUploadService } from '../../services/file-upload-service.js';
import { documentParsingService } from '../../services/document-parsing-service.js';
import { authenticate, requireOrgMembership, requireOrgAdmin } from '../middleware/auth.js';
import { validateBody, validateQuery, paginationSchema } from '../validators/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const router = Router({ mergeParams: true });

// Multer config for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['text/markdown', 'text/plain', 'application/pdf', 'text/x-markdown'];
    const allowedExtensions = ['.md', '.txt', '.pdf'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Allowed: MD, TXT, PDF'));
    }
  },
});

// ============================================
// Schemas
// ============================================

const createProjectSchema = z.object({
  name: z.string().min(3).max(200),
  slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  description: z.string().max(1000).optional(),
  domain: z.enum(['FinTech', 'HealthTech', 'E-commerce', 'SaaS', 'Other']).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  slug: z.string().min(3).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(1000).nullable().optional(),
  domain: z.enum(['FinTech', 'HealthTech', 'E-commerce', 'SaaS', 'Other']).nullable().optional(),
});

const projectFiltersSchema = paginationSchema.extend({
  status: z.enum(['active', 'archived']).optional(),
  domain: z.string().optional(),
  search: z.string().max(255).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  type: z.enum(['functional_spec', 'technical_spec', 'api_doc', 'business_rules', 'glossary', 'other']).optional(),
  version: z.string().max(50).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_active: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).nullable().optional(),
});

const createRuleSchema = z.object({
  category: z.enum(['constraint', 'standard', 'tone', 'do_not']),
  rule_text: z.string().min(1).max(500),
  priority: z.number().int().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

const updateRuleSchema = z.object({
  category: z.enum(['constraint', 'standard', 'tone', 'do_not']).optional(),
  rule_text: z.string().min(1).max(500).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
});

// ============================================
// PROJECT ROUTES
// ============================================

// GET /orgs/:org_id/projects - List projects
router.get(
  '/',
  authenticate,
  requireOrgMembership(),
  validateQuery(projectFiltersSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;

      const options: {
        limit: number;
        offset: number;
        status?: string;
        domain?: string;
        search?: string;
      } = {
        limit: parseInt(req.query['limit'] as string, 10) || 20,
        offset: parseInt(req.query['offset'] as string, 10) || 0,
      };

      if (req.query['status']) options.status = req.query['status'] as string;
      if (req.query['domain']) options.domain = req.query['domain'] as string;
      if (req.query['search']) options.search = req.query['search'] as string;

      const { projects, total } = await projectRepository.findByOrg(orgId, options);

      res.json({
        data: projects.map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          domain: p.domain,
          status: p.status,
          document_count: p.documentCount || 0,
          task_count: p.taskCount || 0,
          rule_count: p.ruleCount || 0,
          created_by: p.createdBy,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
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

// POST /orgs/:org_id/projects - Create project
router.post(
  '/',
  authenticate,
  requireOrgMembership(),
  validateBody(createProjectSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const userId = req.context!.userId;

      // Generate slug if not provided
      let slug = req.body.slug;
      if (!slug) {
        slug = await projectRepository.generateUniqueSlug(orgId, req.body.name);
      } else {
        // Check if slug exists
        if (await projectRepository.slugExists(orgId, slug)) {
          throw new ConflictError('Project slug already exists');
        }
      }

      const project = await projectRepository.create({
        orgId,
        name: req.body.name,
        slug,
        description: req.body.description,
        domain: req.body.domain,
        createdBy: userId,
      });

      logger.info({ projectId: project.id, orgId, actorId: userId }, 'Project created');

      res.status(201).json({
        data: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          domain: project.domain,
          status: project.status,
          created_by: project.createdBy,
          created_at: project.createdAt,
          updated_at: project.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/projects/:project_id - Get project
router.get('/:project_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    const project = await projectRepository.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    res.json({
      data: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        domain: project.domain,
        status: project.status,
        document_count: (project as any).documentCount || 0,
        task_count: (project as any).taskCount || 0,
        rule_count: (project as any).ruleCount || 0,
        created_by: project.createdBy,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /orgs/:org_id/projects/:project_id - Update project
router.patch(
  '/:project_id',
  authenticate,
  requireOrgMembership(),
  validateBody(updateProjectSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const projectId = req.params['project_id'] as string;

      const existing = await projectRepository.findById(orgId, projectId);
      if (!existing) {
        throw new NotFoundError('Project');
      }

      // Check slug uniqueness if changing
      if (req.body.slug && req.body.slug !== existing.slug) {
        if (await projectRepository.slugExists(orgId, req.body.slug, projectId)) {
          throw new ConflictError('Project slug already exists');
        }
      }

      const project = await projectRepository.update(orgId, projectId, {
        name: req.body.name,
        slug: req.body.slug,
        description: req.body.description,
        domain: req.body.domain,
      });

      logger.info({ projectId, orgId, actorId: req.context!.userId }, 'Project updated');

      res.json({
        data: {
          id: project!.id,
          name: project!.name,
          slug: project!.slug,
          description: project!.description,
          domain: project!.domain,
          status: project!.status,
          created_by: project!.createdBy,
          created_at: project!.createdAt,
          updated_at: project!.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /orgs/:org_id/projects/:project_id/archive - Archive project
router.post('/:project_id/archive', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    const project = await projectRepository.archive(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    logger.info({ projectId, orgId, actorId: req.context!.userId }, 'Project archived');

    res.json({
      data: { id: project.id, status: project.status },
      meta: { message: 'Project archived' },
    });
  } catch (error) {
    next(error);
  }
});

// POST /orgs/:org_id/projects/:project_id/unarchive - Unarchive project
router.post('/:project_id/unarchive', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    const project = await projectRepository.unarchive(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    logger.info({ projectId, orgId, actorId: req.context!.userId }, 'Project unarchived');

    res.json({
      data: { id: project.id, status: project.status },
      meta: { message: 'Project unarchived' },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /orgs/:org_id/projects/:project_id - Delete project
router.delete('/:project_id', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    const project = await projectRepository.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    await projectRepository.delete(orgId, projectId);

    logger.info({ projectId, orgId, actorId: req.context!.userId }, 'Project deleted');

    res.json({
      data: null,
      meta: { message: 'Project deleted' },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// DOCUMENT ROUTES
// ============================================

// GET /orgs/:org_id/projects/:project_id/documents - List documents
router.get('/:project_id/documents', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    // Verify project exists
    const project = await projectRepository.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const docOptions: {
      limit: number;
      offset: number;
      type?: string;
      priority?: string;
      isActive?: boolean;
      search?: string;
    } = {
      limit: parseInt(req.query['limit'] as string, 10) || 50,
      offset: parseInt(req.query['offset'] as string, 10) || 0,
    };

    if (req.query['type']) docOptions.type = req.query['type'] as string;
    if (req.query['priority']) docOptions.priority = req.query['priority'] as string;
    if (req.query['is_active'] === 'true') docOptions.isActive = true;
    if (req.query['is_active'] === 'false') docOptions.isActive = false;
    if (req.query['search']) docOptions.search = req.query['search'] as string;

    const { documents, total } = await projectRepository.findDocumentsByProject(projectId, docOptions);

    res.json({
      data: documents.map((d) => ({
        id: d.id,
        project_id: d.projectId,
        title: d.title,
        type: d.type,
        file_type: d.fileType,
        file_size: d.fileSize,
        version: d.version,
        priority: d.priority,
        is_active: d.isActive,
        tags: d.tags,
        uploaded_by: d.uploadedBy,
        created_at: d.createdAt,
        updated_at: d.updatedAt,
      })),
      meta: {
        total,
        limit: parseInt(req.query['limit'] as string, 10) || 50,
        offset: parseInt(req.query['offset'] as string, 10) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /orgs/:org_id/projects/:project_id/documents - Upload document
router.post(
  '/:project_id/documents',
  authenticate,
  requireOrgMembership(),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const projectId = req.params['project_id'] as string;
      const userId = req.context!.userId;

      // Verify project exists
      const project = await projectRepository.findById(orgId, projectId);
      if (!project) {
        throw new NotFoundError('Project');
      }

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      // Save file
      const uploadResult = await fileUploadService.saveFile(
        req.file.buffer,
        req.file.originalname,
        orgId,
        projectId
      );

      // Parse document content
      let contentText: string | undefined;
      try {
        const parsed = await documentParsingService.parseDocument(
          uploadResult.filePath,
          uploadResult.fileType
        );
        contentText = documentParsingService.cleanText(parsed.text);
      } catch (parseError) {
        logger.warn({ error: parseError, filePath: uploadResult.filePath }, 'Failed to parse document');
        // Continue without content - document still useful for manual reference
      }

      // Create document record
      const createDocInput: Parameters<typeof projectRepository.createDocument>[0] = {
        projectId,
        orgId,
        title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ''),
        type: req.body.type || 'other',
        filePath: uploadResult.filePath,
        fileType: uploadResult.fileType,
        fileSize: uploadResult.fileSize,
        version: req.body.version || '1.0',
        priority: req.body.priority || 'medium',
        isActive: req.body.is_active !== 'false',
        uploadedBy: userId,
      };
      if (contentText) createDocInput.contentText = contentText;
      if (req.body.tags) createDocInput.tags = JSON.parse(req.body.tags);

      const document = await projectRepository.createDocument(createDocInput);

      logger.info({ documentId: document.id, projectId, orgId, actorId: userId }, 'Document uploaded');

      res.status(201).json({
        data: {
          id: document.id,
          project_id: document.projectId,
          title: document.title,
          type: document.type,
          file_type: document.fileType,
          file_size: document.fileSize,
          version: document.version,
          priority: document.priority,
          is_active: document.isActive,
          tags: document.tags,
          has_content: !!document.contentText,
          uploaded_by: document.uploadedBy,
          created_at: document.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/projects/:project_id/documents/:document_id - Get document
router.get('/:project_id/documents/:document_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const documentId = req.params['document_id'] as string;

    const document = await projectRepository.findDocumentById(orgId, documentId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    res.json({
      data: {
        id: document.id,
        project_id: document.projectId,
        title: document.title,
        type: document.type,
        file_type: document.fileType,
        file_size: document.fileSize,
        version: document.version,
        priority: document.priority,
        is_active: document.isActive,
        tags: document.tags,
        metadata: document.metadata,
        has_content: !!document.contentText,
        estimated_tokens: document.contentText ? documentParsingService.estimateTokens(document.contentText) : 0,
        uploaded_by: document.uploadedBy,
        created_at: document.createdAt,
        updated_at: document.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/projects/:project_id/documents/:document_id/download - Download document
router.get('/:project_id/documents/:document_id/download', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const documentId = req.params['document_id'] as string;

    const document = await projectRepository.findDocumentById(orgId, documentId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    const fileExists = await fileUploadService.fileExists(document.filePath);
    if (!fileExists) {
      throw new NotFoundError('File not found on storage');
    }

    const fileBuffer = await fileUploadService.readFile(document.filePath);
    const mimeType = fileUploadService.getMimeType(document.fileType);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.title}.${document.fileType}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/projects/:project_id/documents/:document_id/content - Get parsed content
router.get('/:project_id/documents/:document_id/content', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const documentId = req.params['document_id'] as string;

    const document = await projectRepository.findDocumentById(orgId, documentId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    res.json({
      data: {
        id: document.id,
        title: document.title,
        content: document.contentText || '',
        estimated_tokens: document.contentText ? documentParsingService.estimateTokens(document.contentText) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /orgs/:org_id/projects/:project_id/documents/:document_id - Update document metadata
router.patch(
  '/:project_id/documents/:document_id',
  authenticate,
  requireOrgMembership(),
  validateBody(updateDocumentSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const documentId = req.params['document_id'] as string;

      const existing = await projectRepository.findDocumentById(orgId, documentId);
      if (!existing) {
        throw new NotFoundError('Document');
      }

      const document = await projectRepository.updateDocument(orgId, documentId, {
        title: req.body.title,
        type: req.body.type,
        version: req.body.version,
        priority: req.body.priority,
        isActive: req.body.is_active,
        tags: req.body.tags,
      });

      logger.info({ documentId, orgId, actorId: req.context!.userId }, 'Document updated');

      res.json({
        data: {
          id: document!.id,
          project_id: document!.projectId,
          title: document!.title,
          type: document!.type,
          file_type: document!.fileType,
          version: document!.version,
          priority: document!.priority,
          is_active: document!.isActive,
          tags: document!.tags,
          updated_at: document!.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /orgs/:org_id/projects/:project_id/documents/:document_id - Delete document
router.delete('/:project_id/documents/:document_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const documentId = req.params['document_id'] as string;

    const document = await projectRepository.findDocumentById(orgId, documentId);
    if (!document) {
      throw new NotFoundError('Document');
    }

    // Delete file from storage
    await fileUploadService.deleteFile(document.filePath);

    // Delete from database
    await projectRepository.deleteDocument(orgId, documentId);

    logger.info({ documentId, orgId, actorId: req.context!.userId }, 'Document deleted');

    res.json({
      data: null,
      meta: { message: 'Document deleted' },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CONTEXT RULES ROUTES
// ============================================

// GET /orgs/:org_id/projects/:project_id/rules - List rules
router.get('/:project_id/rules', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    // Verify project exists
    const project = await projectRepository.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const ruleOptions: { category?: string; isActive?: boolean } = {};
    if (req.query['category']) ruleOptions.category = req.query['category'] as string;
    if (req.query['is_active'] === 'true') ruleOptions.isActive = true;
    if (req.query['is_active'] === 'false') ruleOptions.isActive = false;

    const rules = await projectRepository.findRulesByProject(projectId, ruleOptions);

    // Group by category
    const grouped: Record<string, any[]> = {};
    for (const rule of rules) {
      const arr = grouped[rule.category] ?? [];
      arr.push({
        id: rule.id,
        rule_text: rule.ruleText,
        priority: rule.priority,
        is_active: rule.isActive,
        created_by: rule.createdBy,
        created_at: rule.createdAt,
      });
      grouped[rule.category] = arr;
    }

    res.json({
      data: {
        rules: rules.map((r) => ({
          id: r.id,
          category: r.category,
          rule_text: r.ruleText,
          priority: r.priority,
          is_active: r.isActive,
          created_by: r.createdBy,
          created_at: r.createdAt,
        })),
        grouped,
      },
      meta: { total: rules.length },
    });
  } catch (error) {
    next(error);
  }
});

// POST /orgs/:org_id/projects/:project_id/rules - Create rule
router.post(
  '/:project_id/rules',
  authenticate,
  requireOrgAdmin,
  validateBody(createRuleSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const projectId = req.params['project_id'] as string;
      const userId = req.context!.userId;

      // Verify project exists
      const project = await projectRepository.findById(orgId, projectId);
      if (!project) {
        throw new NotFoundError('Project');
      }

      const rule = await projectRepository.createRule({
        projectId,
        orgId,
        category: req.body.category,
        ruleText: req.body.rule_text,
        priority: req.body.priority,
        isActive: req.body.is_active,
        createdBy: userId,
      });

      logger.info({ ruleId: rule.id, projectId, orgId, actorId: userId }, 'Context rule created');

      res.status(201).json({
        data: {
          id: rule.id,
          category: rule.category,
          rule_text: rule.ruleText,
          priority: rule.priority,
          is_active: rule.isActive,
          created_by: rule.createdBy,
          created_at: rule.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /orgs/:org_id/projects/:project_id/rules/:rule_id - Update rule
router.patch(
  '/:project_id/rules/:rule_id',
  authenticate,
  requireOrgAdmin,
  validateBody(updateRuleSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const ruleId = req.params['rule_id'] as string;

      const existing = await projectRepository.findRuleById(orgId, ruleId);
      if (!existing) {
        throw new NotFoundError('Context rule');
      }

      const rule = await projectRepository.updateRule(orgId, ruleId, {
        category: req.body.category,
        ruleText: req.body.rule_text,
        priority: req.body.priority,
        isActive: req.body.is_active,
      });

      logger.info({ ruleId, orgId, actorId: req.context!.userId }, 'Context rule updated');

      res.json({
        data: {
          id: rule!.id,
          category: rule!.category,
          rule_text: rule!.ruleText,
          priority: rule!.priority,
          is_active: rule!.isActive,
          updated_at: rule!.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /orgs/:org_id/projects/:project_id/rules/:rule_id - Delete rule
router.delete('/:project_id/rules/:rule_id', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const ruleId = req.params['rule_id'] as string;

    const rule = await projectRepository.findRuleById(orgId, ruleId);
    if (!rule) {
      throw new NotFoundError('Context rule');
    }

    await projectRepository.deleteRule(orgId, ruleId);

    logger.info({ ruleId, orgId, actorId: req.context!.userId }, 'Context rule deleted');

    res.json({
      data: null,
      meta: { message: 'Context rule deleted' },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CONTEXT FOR AI (Internal use)
// ============================================

// GET /orgs/:org_id/projects/:project_id/context - Get full context for AI injection
router.get('/:project_id/context', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const projectId = req.params['project_id'] as string;

    const project = await projectRepository.findById(orgId, projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    if (project.status === 'archived') {
      res.json({
        data: {
          project: { id: project.id, name: project.name, status: 'archived' },
          documents: [],
          rules: { constraints: [], standards: [], tone: [], do_not: [] },
          warning: 'Project is archived. Context not injected.',
        },
      });
      return;
    }

    const documents = await projectRepository.getActiveDocuments(projectId);
    const rules = await projectRepository.getActiveRules(projectId);

    // Calculate estimated tokens
    let totalTokens = 0;
    const documentContext = documents.map((d) => {
      const tokens = d.contentText ? documentParsingService.estimateTokens(d.contentText) : 0;
      totalTokens += tokens;
      return {
        id: d.id,
        title: d.title,
        type: d.type,
        priority: d.priority,
        version: d.version,
        content: d.contentText || '',
        estimated_tokens: tokens,
      };
    });

    // Group rules by category
    const groupedRules: Record<string, string[]> = {};
    for (const rule of rules) {
      const arr = groupedRules[rule.category] ?? [];
      arr.push(rule.ruleText);
      groupedRules[rule.category] = arr;
    }

    res.json({
      data: {
        project: {
          id: project.id,
          name: project.name,
          domain: project.domain,
        },
        documents: documentContext,
        rules: {
          constraints: groupedRules['constraint'] || [],
          standards: groupedRules['standard'] || [],
          tone: groupedRules['tone'] || [],
          do_not: groupedRules['do_not'] || [],
        },
        meta: {
          total_documents: documents.length,
          total_rules: rules.length,
          estimated_tokens: totalTokens,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
