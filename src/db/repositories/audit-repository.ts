import { query, toCamelCase, toCamelCaseArray } from '../index.js';

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

export interface CreateAuditEventInput {
  orgId?: string;
  actorUserId?: string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// Audit action types
export const AuditActions = {
  // Auth
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_SIGNUP: 'user.signup',
  USER_PASSWORD_RESET: 'user.password_reset',

  // Org
  ORG_CREATED: 'org.created',
  ORG_UPDATED: 'org.updated',
  ORG_MEMBER_INVITED: 'org.member_invited',
  ORG_MEMBER_REMOVED: 'org.member_removed',
  ORG_MEMBER_ROLE_CHANGED: 'org.member_role_changed',

  // Tasks
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
  TASK_STATUS_CHANGED: 'task.status_changed',

  // Documents
  DOCUMENT_GENERATED: 'document.generated',
  DOCUMENT_APPROVED: 'document.approved',
  DOCUMENT_REJECTED: 'document.rejected',
  DOCUMENT_EXPORTED: 'document.exported',

  // AI
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_CANCELLED: 'run.cancelled',

  // Provider
  PROVIDER_CONFIGURED: 'provider.configured',
  PROVIDER_KEY_UPDATED: 'provider.key_updated',
  BUDGET_UPDATED: 'budget.updated',

  // Decisions
  DECISION_CREATED: 'decision.created',
  DECISION_UPDATED: 'decision.updated',
  DECISION_DELETED: 'decision.deleted',
} as const;

class AuditRepository {
  async log(input: CreateAuditEventInput): Promise<AuditEvent> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO audit_events (org_id, actor_user_id, actor_role, action, target_type, target_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.orgId || null,
        input.actorUserId || null,
        input.actorRole || null,
        input.action,
        input.targetType || null,
        input.targetId || null,
        JSON.stringify(input.metadata || {}),
        input.ipAddress || null,
        input.userAgent || null,
      ]
    );

    return toCamelCase<AuditEvent>(result.rows[0]!);
  }

  async findByOrg(
    orgId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: string;
      actorUserId?: string;
      targetType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ events: AuditEvent[]; total: number }> {
    const { limit = 50, offset = 0, action, actorUserId, targetType, startDate, endDate } = options;

    let whereClause = 'WHERE org_id = $1';
    const params: unknown[] = [orgId];
    let paramIndex = 2;

    if (action) {
      whereClause += ` AND action = $${paramIndex++}`;
      params.push(action);
    }
    if (actorUserId) {
      whereClause += ` AND actor_user_id = $${paramIndex++}`;
      params.push(actorUserId);
    }
    if (targetType) {
      whereClause += ` AND target_type = $${paramIndex++}`;
      params.push(targetType);
    }
    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM audit_events ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get events
    const result = await query<Record<string, unknown>>(
      `SELECT ae.*, u.email as actor_email
       FROM audit_events ae
       LEFT JOIN users u ON ae.actor_user_id = u.id
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    );

    return {
      events: toCamelCaseArray<AuditEvent & { actorEmail?: string }>(result.rows),
      total,
    };
  }

  async findById(id: string): Promise<AuditEvent | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM audit_events WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return toCamelCase<AuditEvent>(result.rows[0]!);
  }
}

export const auditRepository = new AuditRepository();

// Helper function to create audit event from request context
export function createAuditContext(req: { context?: { userId: string; orgId?: string; role?: string }; ip?: string; headers?: Record<string, string | string[] | undefined> }) {
  return {
    actorUserId: req.context?.userId,
    actorRole: req.context?.role,
    orgId: req.context?.orgId,
    ipAddress: req.ip || (req.headers?.['x-forwarded-for'] as string)?.split(',')[0] || undefined,
    userAgent: req.headers?.['user-agent'] as string | undefined,
  };
}
