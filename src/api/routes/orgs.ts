import { Router } from 'express';
import { z } from 'zod';
import { organizationRepository } from '../../db/repositories/organization-repository.js';
import { userRepository } from '../../db/repositories/user-repository.js';
import { query, toCamelCase } from '../../db/index.js';
import { authenticate, requireOrgMembership, requireOrgAdmin } from '../middleware/auth.js';
import { validateBody, validateQuery, emailSchema, slugSchema, paginationSchema } from '../validators/index.js';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../../utils/errors.js';
import { generateSecureToken } from '../../utils/encryption.js';
import { logger } from '../../utils/logger.js';
import type { OrgRole } from '../../types/index.js';

const router = Router();

// Validation schemas
const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().optional(),
  default_language: z.string().min(2).max(10).optional(),
  allowed_email_domains: z.array(z.string()).nullable().optional(),
});

const inviteSchema = z.object({
  emails: z.array(emailSchema).min(1).max(50),
  role: z.enum(['org_admin', 'org_member']),
  expires_in_hours: z.number().min(1).max(168).default(72),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).optional(), // Required if user doesn't exist
});

const updateMemberSchema = z.object({
  role: z.enum(['org_admin', 'org_member']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

// GET /orgs - List user's organizations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const orgs = await organizationRepository.getOrgsForUser(req.context!.userId);

    res.json({
      data: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        default_language: org.defaultLanguage,
        status: org.status,
        created_at: org.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id - Get organization details
router.get('/:org_id', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const org = await organizationRepository.findById(req.params['org_id']!);
    if (!org) {
      throw new NotFoundError('Organization');
    }

    res.json({
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        default_language: org.defaultLanguage,
        allowed_email_domains: org.allowedEmailDomains,
        status: org.status,
        created_at: org.createdAt,
        updated_at: org.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /orgs/:org_id - Update organization
router.patch(
  '/:org_id',
  authenticate,
  requireOrgAdmin,
  validateBody(updateOrgSchema),
  async (req, res, next) => {
    try {
      const org = await organizationRepository.update(req.params['org_id']!, {
        name: req.body.name,
        timezone: req.body.timezone,
        defaultLanguage: req.body.default_language,
        allowedEmailDomains: req.body.allowed_email_domains,
      });

      if (!org) {
        throw new NotFoundError('Organization');
      }

      logger.info({ orgId: org.id, actorId: req.context!.userId }, 'Organization updated');

      res.json({
        data: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          timezone: org.timezone,
          default_language: org.defaultLanguage,
          allowed_email_domains: org.allowedEmailDomains,
          status: org.status,
          updated_at: org.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /orgs/:org_id/invitations - Create invitations
router.post(
  '/:org_id/invitations',
  authenticate,
  requireOrgAdmin,
  validateBody(inviteSchema),
  async (req, res, next) => {
    try {
      const orgId = req.params['org_id']!;
      const org = await organizationRepository.findById(orgId);
      if (!org) {
        throw new NotFoundError('Organization');
      }

      const invitations = [];
      const errors = [];

      for (const email of req.body.emails as string[]) {
        // Check email domain if restricted
        if (org.allowedEmailDomains && org.allowedEmailDomains.length > 0) {
          const domain = email.split('@')[1];
          if (!org.allowedEmailDomains.includes(domain!)) {
            errors.push({ email, error: 'Email domain not allowed' });
            continue;
          }
        }

        // Check if already a member
        const existingUser = await userRepository.findByEmail(email);
        if (existingUser) {
          const membership = await organizationRepository.findMembership(orgId, existingUser.id);
          if (membership && membership.status === 'active') {
            errors.push({ email, error: 'Already a member' });
            continue;
          }
        }

        // Check for pending invitation
        const existingInvite = await organizationRepository.findPendingInvitationByEmail(orgId, email);
        if (existingInvite) {
          errors.push({ email, error: 'Invitation already pending' });
          continue;
        }

        // Create invitation
        const token = generateSecureToken();
        const expiresAt = new Date(Date.now() + req.body.expires_in_hours * 60 * 60 * 1000);

        const invitation = await organizationRepository.createInvitation({
          orgId,
          email,
          role: req.body.role as OrgRole,
          token,
          expiresAt,
          invitedBy: req.context!.userId,
        });

        invitations.push({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expires_at: invitation.expiresAt,
          // In production, don't return token - send via email
          token: invitation.token,
        });
      }

      logger.info(
        { orgId, invitedCount: invitations.length, actorId: req.context!.userId },
        'Invitations created'
      );

      res.status(201).json({
        data: {
          invitations,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/invitations - List invitations
router.get('/:org_id/invitations', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const invitations = await organizationRepository.findInvitationsByOrg(req.params['org_id']!);

    res.json({
      data: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expires_at: inv.expiresAt,
        invited_by: inv.invitedBy,
        created_at: inv.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /orgs/:org_id/invitations/:invitation_id - Revoke invitation
router.delete(
  '/:org_id/invitations/:invitation_id',
  authenticate,
  requireOrgAdmin,
  async (req, res, next) => {
    try {
      const invitation = await organizationRepository.findInvitationById(req.params['invitation_id']!);
      if (!invitation || invitation.orgId !== req.params['org_id']) {
        throw new NotFoundError('Invitation');
      }

      if (invitation.status !== 'pending') {
        throw new ConflictError('Invitation is not pending');
      }

      await organizationRepository.updateInvitationStatus(invitation.id, 'revoked');

      logger.info({ invitationId: invitation.id, actorId: req.context!.userId }, 'Invitation revoked');

      res.json({
        data: null,
        meta: { message: 'Invitation revoked' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /orgs/invitations/accept - Accept invitation (public route)
router.post('/invitations/accept', validateBody(acceptInviteSchema), async (req, res, next) => {
  try {
    const invitation = await organizationRepository.findInvitationByToken(req.body.token);
    if (!invitation) {
      throw new NotFoundError('Invitation');
    }

    let user = await userRepository.findByEmail(invitation.email);

    if (!user) {
      // Create new user
      if (!req.body.password) {
        throw new ValidationError('Password is required for new users');
      }

      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(req.body.password, 12);

      user = await userRepository.create({
        email: invitation.email,
        passwordHash,
      });

      // Mark email as verified since they received the invite
      await userRepository.update(user.id, { emailVerified: true });
    }

    // Create membership
    await organizationRepository.createMembership({
      orgId: invitation.orgId,
      userId: user.id,
      role: invitation.role,
      status: 'active',
    });

    // Mark invitation as accepted
    await organizationRepository.updateInvitationStatus(invitation.id, 'accepted');

    const org = await organizationRepository.findById(invitation.orgId);

    logger.info({ userId: user.id, orgId: invitation.orgId }, 'Invitation accepted');

    res.json({
      data: {
        user: userRepository.toPublic(user),
        org: org
          ? {
              id: org.id,
              name: org.name,
              slug: org.slug,
            }
          : null,
      },
      meta: { message: 'Invitation accepted' },
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/members - List members
router.get('/:org_id/members', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const memberships = await organizationRepository.findMembershipsByOrg(req.params['org_id']!);

    // Get user details for each membership
    const members = await Promise.all(
      memberships.map(async (m) => {
        const user = await userRepository.findById(m.userId);
        return {
          user_id: m.userId,
          email: user?.email,
          role: m.role,
          status: m.status,
          created_at: m.createdAt,
        };
      })
    );

    res.json({
      data: members,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /orgs/:org_id/members/:user_id - Update member
router.patch(
  '/:org_id/members/:user_id',
  authenticate,
  requireOrgAdmin,
  validateBody(updateMemberSchema),
  async (req, res, next) => {
    try {
      const orgId = req.params['org_id']!;
      const userId = req.params['user_id']!;

      const membership = await organizationRepository.findMembership(orgId, userId);
      if (!membership) {
        throw new NotFoundError('Member');
      }

      // Prevent demoting last admin
      if (
        req.body.role === 'org_member' &&
        membership.role === 'org_admin'
      ) {
        const adminCount = await organizationRepository.countAdmins(orgId);
        if (adminCount <= 1) {
          throw new ConflictError('Cannot demote the last organization admin');
        }
      }

      const updated = await organizationRepository.updateMembership(orgId, userId, {
        role: req.body.role,
        status: req.body.status,
      });

      logger.info({ orgId, targetUserId: userId, actorId: req.context!.userId }, 'Member updated');

      res.json({
        data: {
          user_id: updated!.userId,
          role: updated!.role,
          status: updated!.status,
          updated_at: updated!.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /orgs/:org_id/members/:user_id - Remove member
router.delete('/:org_id/members/:user_id', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const orgId = req.params['org_id']!;
    const userId = req.params['user_id']!;

    const membership = await organizationRepository.findMembership(orgId, userId);
    if (!membership) {
      throw new NotFoundError('Member');
    }

    // Prevent removing last admin
    if (membership.role === 'org_admin') {
      const adminCount = await organizationRepository.countAdmins(orgId);
      if (adminCount <= 1) {
        throw new ConflictError('Cannot remove the last organization admin');
      }
    }

    // Prevent self-removal
    if (userId === req.context!.userId) {
      throw new ConflictError('Cannot remove yourself from the organization');
    }

    await organizationRepository.deleteMembership(orgId, userId);

    logger.info({ orgId, targetUserId: userId, actorId: req.context!.userId }, 'Member removed');

    res.json({
      data: null,
      meta: { message: 'Member removed' },
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/stats - Get dashboard stats
router.get('/:org_id/stats', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.params['org_id']!;

    // Get task counts by status
    const taskStatsResult = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count
       FROM tasks
       WHERE org_id = $1
       GROUP BY status`,
      [orgId]
    );

    const statusCounts: Record<string, number> = {};
    for (const row of taskStatsResult.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    // Get usage stats for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usageResult = await query<{
      total_input_tokens: string;
      total_output_tokens: string;
      total_cost_cents: string;
      provider: string;
    }>(
      `SELECT
         provider,
         SUM(input_tokens)::text as total_input_tokens,
         SUM(output_tokens)::text as total_output_tokens,
         SUM(cost_cents)::text as total_cost_cents
       FROM usage_ledger
       WHERE org_id = $1 AND created_at >= $2
       GROUP BY provider`,
      [orgId, startOfMonth]
    );

    const usageByProvider: Record<string, { inputTokens: number; outputTokens: number; costCents: number }> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostCents = 0;

    for (const row of usageResult.rows) {
      const inputTokens = parseInt(row.total_input_tokens || '0', 10);
      const outputTokens = parseInt(row.total_output_tokens || '0', 10);
      const costCents = parseInt(row.total_cost_cents || '0', 10);

      usageByProvider[row.provider] = { inputTokens, outputTokens, costCents };
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCostCents += costCents;
    }

    // Get recent runs
    const recentRunsResult = await query<Record<string, unknown>>(
      `SELECT r.id, r.task_id, r.status, r.started_at, r.finished_at, t.title as task_title
       FROM runs r
       LEFT JOIN tasks t ON r.task_id = t.id
       WHERE r.org_id = $1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [orgId]
    );

    const recentRuns = recentRunsResult.rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      taskTitle: row.task_title,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }));

    // Get budget info
    const budgetResult = await query<Record<string, unknown>>(
      `SELECT period, soft_limit_cents, hard_limit_cents
       FROM org_budgets
       WHERE org_id = $1`,
      [orgId]
    );

    const budgets: Record<string, { softLimit: number; hardLimit: number }> = {};
    for (const row of budgetResult.rows) {
      budgets[row.period as string] = {
        softLimit: parseInt(String(row.soft_limit_cents || '0'), 10),
        hardLimit: parseInt(String(row.hard_limit_cents || '0'), 10),
      };
    }

    res.json({
      data: {
        tasks: {
          byStatus: statusCounts,
          total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        },
        usage: {
          period: 'monthly',
          byProvider: usageByProvider,
          total: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costCents: totalCostCents,
          },
        },
        budgets,
        recentRuns,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/workflows - List workflows
router.get('/:org_id/workflows', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.params['org_id']!;

    const result = await query<Record<string, unknown>>(
      `SELECT id, key, name, description, is_system, is_active, created_at, updated_at
       FROM workflows
       WHERE org_id = $1 AND is_active = true
       ORDER BY is_system DESC, name ASC`,
      [orgId]
    );

    const workflows = result.rows.map((row) => toCamelCase<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      isSystem: boolean;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>(row));

    res.json({
      data: workflows.map((w) => ({
        id: w.id,
        key: w.key,
        name: w.name,
        description: w.description,
        is_system: w.isSystem,
        is_active: w.isActive,
        created_at: w.createdAt,
        updated_at: w.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
