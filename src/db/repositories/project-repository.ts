import { query, toCamelCase, toCamelCaseArray } from '../index.js';

// ============================================
// Types
// ============================================

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  domain: string | null;
  status: 'active' | 'archived';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  orgId: string;
  title: string;
  type: 'functional_spec' | 'technical_spec' | 'api_doc' | 'business_rules' | 'glossary' | 'other';
  filePath: string;
  fileType: string;
  fileSize: number;
  contentText: string | null;
  version: string;
  priority: 'high' | 'medium' | 'low';
  isActive: boolean;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectContextRule {
  id: string;
  projectId: string;
  orgId: string;
  category: 'constraint' | 'standard' | 'tone' | 'do_not';
  ruleText: string;
  priority: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunContextUsage {
  id: string;
  runId: string;
  documentId: string;
  tokensFromDoc: number | null;
  createdAt: Date;
}

// ============================================
// Input Types
// ============================================

export interface CreateProjectInput {
  orgId: string;
  name: string;
  slug: string;
  description?: string;
  domain?: string;
  createdBy: string;
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  domain?: string | null;
  status?: 'active' | 'archived';
}

export interface CreateDocumentInput {
  projectId: string;
  orgId: string;
  title: string;
  type: ProjectDocument['type'];
  filePath: string;
  fileType: string;
  fileSize: number;
  contentText?: string;
  version?: string;
  priority?: 'high' | 'medium' | 'low';
  isActive?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  uploadedBy: string;
}

export interface UpdateDocumentInput {
  title?: string;
  type?: ProjectDocument['type'];
  version?: string;
  priority?: 'high' | 'medium' | 'low';
  isActive?: boolean;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  contentText?: string;
}

export interface CreateRuleInput {
  projectId: string;
  orgId: string;
  category: ProjectContextRule['category'];
  ruleText: string;
  priority?: number;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateRuleInput {
  category?: ProjectContextRule['category'];
  ruleText?: string;
  priority?: number;
  isActive?: boolean;
}

// ============================================
// Project Repository
// ============================================

class ProjectRepository {
  // ========== Project CRUD ==========

  async findByOrg(
    orgId: string,
    options: { status?: string; domain?: string; search?: string; limit?: number; offset?: number } = {}
  ): Promise<{ projects: Project[]; total: number }> {
    const { limit = 20, offset = 0, status, domain, search } = options;

    let whereClause = 'WHERE org_id = $1';
    const params: unknown[] = [orgId];
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (domain) {
      whereClause += ` AND domain = $${paramIndex++}`;
      params.push(domain);
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM projects ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get projects with stats
    const result = await query<Record<string, unknown>>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM project_documents WHERE project_id = p.id AND is_active = true) as document_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_context_rules WHERE project_id = p.id AND is_active = true) as rule_count
       FROM projects p
       ${whereClause}
       ORDER BY p.updated_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      projects: toCamelCaseArray<Project & { documentCount: number; taskCount: number; ruleCount: number }>(result.rows),
      total,
    };
  }

  async findById(orgId: string, projectId: string): Promise<Project | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM project_documents WHERE project_id = p.id AND is_active = true) as document_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_context_rules WHERE project_id = p.id AND is_active = true) as rule_count
       FROM projects p
       WHERE p.org_id = $1 AND p.id = $2`,
      [orgId, projectId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<Project>(result.rows[0]!);
  }

  async findBySlug(orgId: string, slug: string): Promise<Project | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM project_documents WHERE project_id = p.id AND is_active = true) as document_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_context_rules WHERE project_id = p.id AND is_active = true) as rule_count
       FROM projects p
       WHERE p.org_id = $1 AND p.slug = $2`,
      [orgId, slug]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<Project>(result.rows[0]!);
  }

  async slugExists(orgId: string, slug: string, excludeId?: string): Promise<boolean> {
    let sql = 'SELECT 1 FROM projects WHERE org_id = $1 AND slug = $2';
    const params: unknown[] = [orgId, slug];

    if (excludeId) {
      sql += ' AND id != $3';
      params.push(excludeId);
    }

    const result = await query(sql, params);
    return result.rows.length > 0;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO projects (org_id, name, slug, description, domain, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.orgId, input.name, input.slug, input.description || null, input.domain || null, input.createdBy]
    );

    return toCamelCase<Project>(result.rows[0]!);
  }

  async update(orgId: string, projectId: string, input: UpdateProjectInput): Promise<Project | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.slug !== undefined) {
      updates.push(`slug = $${paramIndex++}`);
      values.push(input.slug);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.domain !== undefined) {
      updates.push(`domain = $${paramIndex++}`);
      values.push(input.domain);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (updates.length === 0) {
      return this.findById(orgId, projectId);
    }

    values.push(orgId, projectId);

    const result = await query<Record<string, unknown>>(
      `UPDATE projects SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<Project>(result.rows[0]!);
  }

  async archive(orgId: string, projectId: string): Promise<Project | null> {
    return this.update(orgId, projectId, { status: 'archived' });
  }

  async unarchive(orgId: string, projectId: string): Promise<Project | null> {
    return this.update(orgId, projectId, { status: 'active' });
  }

  async delete(orgId: string, projectId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM projects WHERE org_id = $1 AND id = $2',
      [orgId, projectId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ========== Document CRUD ==========

  async findDocumentsByProject(
    projectId: string,
    options: { type?: string; priority?: string; isActive?: boolean; search?: string; limit?: number; offset?: number } = {}
  ): Promise<{ documents: ProjectDocument[]; total: number }> {
    const { limit = 50, offset = 0, type, priority, isActive, search } = options;

    let whereClause = 'WHERE project_id = $1';
    const params: unknown[] = [projectId];
    let paramIndex = 2;

    if (type) {
      whereClause += ` AND type = $${paramIndex++}`;
      params.push(type);
    }

    if (priority) {
      whereClause += ` AND priority = $${paramIndex++}`;
      params.push(priority);
    }

    if (isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      params.push(isActive);
    }

    if (search) {
      whereClause += ` AND title ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM project_documents ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get documents
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM project_documents ${whereClause}
       ORDER BY
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
         created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      documents: toCamelCaseArray<ProjectDocument>(result.rows),
      total,
    };
  }

  async findDocumentById(orgId: string, documentId: string): Promise<ProjectDocument | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM project_documents WHERE org_id = $1 AND id = $2',
      [orgId, documentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<ProjectDocument>(result.rows[0]!);
  }

  async createDocument(input: CreateDocumentInput): Promise<ProjectDocument> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO project_documents
       (project_id, org_id, title, type, file_path, file_type, file_size, content_text, version, priority, is_active, tags, metadata, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        input.projectId,
        input.orgId,
        input.title,
        input.type,
        input.filePath,
        input.fileType,
        input.fileSize,
        input.contentText || null,
        input.version || '1.0',
        input.priority || 'medium',
        input.isActive !== false,
        input.tags ? JSON.stringify(input.tags) : null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.uploadedBy,
      ]
    );

    return toCamelCase<ProjectDocument>(result.rows[0]!);
  }

  async updateDocument(orgId: string, documentId: string, input: UpdateDocumentInput): Promise<ProjectDocument | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(input.type);
    }
    if (input.version !== undefined) {
      updates.push(`version = $${paramIndex++}`);
      values.push(input.version);
    }
    if (input.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(input.priority);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags ? JSON.stringify(input.tags) : null);
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(input.metadata ? JSON.stringify(input.metadata) : null);
    }
    if (input.contentText !== undefined) {
      updates.push(`content_text = $${paramIndex++}`);
      values.push(input.contentText);
    }

    if (updates.length === 0) {
      return this.findDocumentById(orgId, documentId);
    }

    values.push(orgId, documentId);

    const result = await query<Record<string, unknown>>(
      `UPDATE project_documents SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<ProjectDocument>(result.rows[0]!);
  }

  async deleteDocument(orgId: string, documentId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM project_documents WHERE org_id = $1 AND id = $2',
      [orgId, documentId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Get active documents for AI context injection
  async getActiveDocuments(projectId: string): Promise<ProjectDocument[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM project_documents
       WHERE project_id = $1 AND is_active = true
       ORDER BY
         CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
         created_at DESC`,
      [projectId]
    );

    return toCamelCaseArray<ProjectDocument>(result.rows);
  }

  // ========== Context Rules CRUD ==========

  async findRulesByProject(
    projectId: string,
    options: { category?: string; isActive?: boolean } = {}
  ): Promise<ProjectContextRule[]> {
    const { category, isActive } = options;

    let whereClause = 'WHERE project_id = $1';
    const params: unknown[] = [projectId];
    let paramIndex = 2;

    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      params.push(isActive);
    }

    const result = await query<Record<string, unknown>>(
      `SELECT * FROM project_context_rules ${whereClause}
       ORDER BY category, priority ASC, created_at ASC`,
      params
    );

    return toCamelCaseArray<ProjectContextRule>(result.rows);
  }

  async findRuleById(orgId: string, ruleId: string): Promise<ProjectContextRule | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM project_context_rules WHERE org_id = $1 AND id = $2',
      [orgId, ruleId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<ProjectContextRule>(result.rows[0]!);
  }

  async createRule(input: CreateRuleInput): Promise<ProjectContextRule> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO project_context_rules (project_id, org_id, category, rule_text, priority, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.projectId,
        input.orgId,
        input.category,
        input.ruleText,
        input.priority ?? 0,
        input.isActive !== false,
        input.createdBy,
      ]
    );

    return toCamelCase<ProjectContextRule>(result.rows[0]!);
  }

  async updateRule(orgId: string, ruleId: string, input: UpdateRuleInput): Promise<ProjectContextRule | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(input.category);
    }
    if (input.ruleText !== undefined) {
      updates.push(`rule_text = $${paramIndex++}`);
      values.push(input.ruleText);
    }
    if (input.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(input.priority);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.isActive);
    }

    if (updates.length === 0) {
      return this.findRuleById(orgId, ruleId);
    }

    values.push(orgId, ruleId);

    const result = await query<Record<string, unknown>>(
      `UPDATE project_context_rules SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<ProjectContextRule>(result.rows[0]!);
  }

  async deleteRule(orgId: string, ruleId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM project_context_rules WHERE org_id = $1 AND id = $2',
      [orgId, ruleId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Get active rules for AI context injection
  async getActiveRules(projectId: string): Promise<ProjectContextRule[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM project_context_rules
       WHERE project_id = $1 AND is_active = true
       ORDER BY category, priority ASC`,
      [projectId]
    );

    return toCamelCaseArray<ProjectContextRule>(result.rows);
  }

  // ========== Context Usage Tracking ==========

  async recordContextUsage(runId: string, documentId: string, tokensFromDoc?: number): Promise<RunContextUsage> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO run_context_usage (run_id, document_id, tokens_from_doc)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [runId, documentId, tokensFromDoc || null]
    );

    return toCamelCase<RunContextUsage>(result.rows[0]!);
  }

  async getContextUsageByRun(runId: string): Promise<Array<RunContextUsage & { document: ProjectDocument }>> {
    const result = await query<Record<string, unknown>>(
      `SELECT rcu.*,
        pd.title as doc_title, pd.type as doc_type, pd.priority as doc_priority,
        pd.version as doc_version
       FROM run_context_usage rcu
       JOIN project_documents pd ON rcu.document_id = pd.id
       WHERE rcu.run_id = $1
       ORDER BY rcu.created_at`,
      [runId]
    );

    return toCamelCaseArray<RunContextUsage & { document: ProjectDocument }>(result.rows);
  }

  // ========== Utility ==========

  // Generate unique slug
  async generateUniqueSlug(orgId: string, baseName: string): Promise<string> {
    // Convert name to slug
    let slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if exists
    let counter = 1;
    let finalSlug = slug;
    while (await this.slugExists(orgId, finalSlug)) {
      finalSlug = `${slug}-${++counter}`;
    }

    return finalSlug;
  }
}

export const projectRepository = new ProjectRepository();
