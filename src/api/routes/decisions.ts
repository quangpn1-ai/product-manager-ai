import { Router } from 'express';
import { z } from 'zod';
import { decisionRepository } from '../../db/repositories/decision-repository.js';
import { authenticate, requireOrgMembership } from '../middleware/auth.js';
import { validateBody, validateQuery, paginationSchema, uuidSchema } from '../validators/index.js';
import { NotFoundError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const router = Router({ mergeParams: true });

// Schemas
const linkSchema = z.object({
  title: z.string().min(1).max(255),
  url: z.string().url(),
});

const createDecisionSchema = z.object({
  summary: z.string().min(1).max(500),
  rationale: z.string().min(1).max(5000),
  owner: z.string().max(255).optional(),
  decided_at: z.string().datetime().optional(),
  links: z.array(linkSchema).max(20).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

const updateDecisionSchema = z.object({
  summary: z.string().min(1).max(500).optional(),
  rationale: z.string().min(1).max(5000).optional(),
  owner: z.string().max(255).nullable().optional(),
  decided_at: z.string().datetime().optional(),
  links: z.array(linkSchema).max(20).optional(),
  tags: z.array(z.string().max(50)).max(10).nullable().optional(),
});

const decisionFiltersSchema = paginationSchema.extend({
  search: z.string().max(255).optional(),
  tags: z.string().optional(), // comma-separated tags
});

// GET /orgs/:org_id/decisions - List decisions
router.get(
  '/',
  authenticate,
  requireOrgMembership(),
  validateQuery(decisionFiltersSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;

      const { decisions, total } = await decisionRepository.findByOrg(orgId, {
        limit: parseInt(req.query['limit'] as string, 10) || 20,
        offset: parseInt(req.query['offset'] as string, 10) || 0,
        search: req.query['search'] as string | undefined,
        tags: req.query['tags'] ? (req.query['tags'] as string).split(',') : undefined,
      });

      res.json({
        data: decisions.map((d) => ({
          id: d.id,
          summary: d.summary,
          rationale: d.rationale,
          owner: d.owner,
          decided_at: d.decidedAt,
          links: d.linksJson,
          tags: d.tags,
          created_by: d.createdBy,
          created_at: d.createdAt,
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

// POST /orgs/:org_id/decisions - Create decision
router.post(
  '/',
  authenticate,
  requireOrgMembership(),
  validateBody(createDecisionSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const userId = req.context!.userId;

      const decision = await decisionRepository.create({
        orgId,
        summary: req.body.summary,
        rationale: req.body.rationale,
        owner: req.body.owner,
        decidedAt: req.body.decided_at ? new Date(req.body.decided_at) : undefined,
        linksJson: req.body.links,
        tags: req.body.tags,
        createdBy: userId,
      });

      logger.info({ decisionId: decision.id, orgId, actorId: userId }, 'Decision created');

      res.status(201).json({
        data: {
          id: decision.id,
          summary: decision.summary,
          rationale: decision.rationale,
          owner: decision.owner,
          decided_at: decision.decidedAt,
          links: decision.linksJson,
          tags: decision.tags,
          created_at: decision.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/decisions/:decision_id - Get decision
router.get('/:decision_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const decisionId = req.params['decision_id']!;

    const decision = await decisionRepository.findById(orgId, decisionId);
    if (!decision) {
      throw new NotFoundError('Decision');
    }

    res.json({
      data: {
        id: decision.id,
        summary: decision.summary,
        rationale: decision.rationale,
        owner: decision.owner,
        decided_at: decision.decidedAt,
        links: decision.linksJson,
        tags: decision.tags,
        created_by: decision.createdBy,
        created_at: decision.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /orgs/:org_id/decisions/:decision_id - Update decision
router.patch(
  '/:decision_id',
  authenticate,
  requireOrgMembership(),
  validateBody(updateDecisionSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const decisionId = req.params['decision_id']!;

      const existing = await decisionRepository.findById(orgId, decisionId);
      if (!existing) {
        throw new NotFoundError('Decision');
      }

      const decision = await decisionRepository.update(orgId, decisionId, {
        summary: req.body.summary,
        rationale: req.body.rationale,
        owner: req.body.owner,
        decidedAt: req.body.decided_at ? new Date(req.body.decided_at) : undefined,
        linksJson: req.body.links,
        tags: req.body.tags,
      });

      logger.info({ decisionId, orgId, actorId: req.context!.userId }, 'Decision updated');

      res.json({
        data: {
          id: decision!.id,
          summary: decision!.summary,
          rationale: decision!.rationale,
          owner: decision!.owner,
          decided_at: decision!.decidedAt,
          links: decision!.linksJson,
          tags: decision!.tags,
          created_at: decision!.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /orgs/:org_id/decisions/:decision_id - Delete decision
router.delete('/:decision_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const decisionId = req.params['decision_id']!;

    const decision = await decisionRepository.findById(orgId, decisionId);
    if (!decision) {
      throw new NotFoundError('Decision');
    }

    await decisionRepository.delete(orgId, decisionId);

    logger.info({ decisionId, orgId, actorId: req.context!.userId }, 'Decision deleted');

    res.json({
      data: null,
      meta: { message: 'Decision deleted' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
