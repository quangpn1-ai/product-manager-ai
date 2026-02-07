import { query, toCamelCase, toCamelCaseArray } from '../index.js';

export interface Decision {
  id: string;
  orgId: string;
  summary: string;
  rationale: string;
  owner: string | null;
  decidedAt: Date;
  linksJson: Array<{ title: string; url: string }>;
  tags: string[] | null;
  createdBy: string;
  createdAt: Date;
}

export interface CreateDecisionInput {
  orgId: string;
  summary: string;
  rationale: string;
  owner?: string;
  decidedAt?: Date;
  linksJson?: Array<{ title: string; url: string }>;
  tags?: string[];
  createdBy: string;
}

export interface UpdateDecisionInput {
  summary?: string;
  rationale?: string;
  owner?: string | null;
  decidedAt?: Date;
  linksJson?: Array<{ title: string; url: string }>;
  tags?: string[] | null;
}

class DecisionRepository {
  async findByOrg(
    orgId: string,
    options: { limit?: number; offset?: number; search?: string; tags?: string[] } = {}
  ): Promise<{ decisions: Decision[]; total: number }> {
    const { limit = 20, offset = 0, search, tags } = options;

    let whereClause = 'WHERE org_id = $1';
    const params: unknown[] = [orgId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND (summary ILIKE $${paramIndex} OR rationale ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (tags && tags.length > 0) {
      whereClause += ` AND tags && $${paramIndex}`;
      params.push(tags);
      paramIndex++;
    }

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM decisions ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get decisions
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM decisions ${whereClause}
       ORDER BY decided_at DESC, created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return {
      decisions: toCamelCaseArray<Decision>(result.rows),
      total,
    };
  }

  async findById(orgId: string, decisionId: string): Promise<Decision | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM decisions WHERE org_id = $1 AND id = $2',
      [orgId, decisionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<Decision>(result.rows[0]!);
  }

  async create(input: CreateDecisionInput): Promise<Decision> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO decisions (org_id, summary, rationale, owner, decided_at, links_json, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.orgId,
        input.summary,
        input.rationale,
        input.owner || null,
        input.decidedAt || new Date(),
        JSON.stringify(input.linksJson || []),
        input.tags || null,
        input.createdBy,
      ]
    );

    return toCamelCase<Decision>(result.rows[0]!);
  }

  async update(orgId: string, decisionId: string, input: UpdateDecisionInput): Promise<Decision | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.summary !== undefined) {
      updates.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }
    if (input.rationale !== undefined) {
      updates.push(`rationale = $${paramIndex++}`);
      values.push(input.rationale);
    }
    if (input.owner !== undefined) {
      updates.push(`owner = $${paramIndex++}`);
      values.push(input.owner);
    }
    if (input.decidedAt !== undefined) {
      updates.push(`decided_at = $${paramIndex++}`);
      values.push(input.decidedAt);
    }
    if (input.linksJson !== undefined) {
      updates.push(`links_json = $${paramIndex++}`);
      values.push(JSON.stringify(input.linksJson));
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }

    if (updates.length === 0) {
      return this.findById(orgId, decisionId);
    }

    values.push(orgId, decisionId);

    const result = await query<Record<string, unknown>>(
      `UPDATE decisions SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<Decision>(result.rows[0]!);
  }

  async delete(orgId: string, decisionId: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM decisions WHERE org_id = $1 AND id = $2',
      [orgId, decisionId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const decisionRepository = new DecisionRepository();
