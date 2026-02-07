import { Router } from 'express';
import { z } from 'zod';
import { auditRepository, AuditActions } from '../../db/repositories/audit-repository.js';
import { authenticate, requireOrgAdmin } from '../middleware/auth.js';
import { validateQuery, paginationSchema } from '../validators/index.js';

const router = Router({ mergeParams: true });

const auditFiltersSchema = paginationSchema.extend({
  action: z.string().optional(),
  target_type: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

// GET /orgs/:org_id/audit - List audit events (admin only)
router.get(
  '/',
  authenticate,
  requireOrgAdmin,
  validateQuery(auditFiltersSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;

      const { events, total } = await auditRepository.findByOrg(orgId, {
        limit: parseInt(req.query['limit'] as string, 10) || 50,
        offset: parseInt(req.query['offset'] as string, 10) || 0,
        action: req.query['action'] as string | undefined,
        targetType: req.query['target_type'] as string | undefined,
        actorUserId: req.query['actor_id'] as string | undefined,
        startDate: req.query['start_date'] ? new Date(req.query['start_date'] as string) : undefined,
        endDate: req.query['end_date'] ? new Date(req.query['end_date'] as string) : undefined,
      });

      res.json({
        data: events.map((e) => ({
          id: e.id,
          action: e.action,
          actor_user_id: e.actorUserId,
          actor_email: (e as any).actorEmail,
          actor_role: e.actorRole,
          target_type: e.targetType,
          target_id: e.targetId,
          metadata: e.metadata,
          ip_address: e.ipAddress,
          created_at: e.createdAt,
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
  }
);

// GET /orgs/:org_id/audit/actions - List available audit action types
router.get('/actions', authenticate, requireOrgAdmin, async (_req, res) => {
  res.json({
    data: Object.entries(AuditActions).map(([key, value]) => ({
      key,
      action: value,
    })),
  });
});

export default router;
