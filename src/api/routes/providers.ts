import { Router } from 'express';
import { z } from 'zod';
import { providerRepository } from '../../db/repositories/provider-repository.js';
import { authenticate, requireOrgAdmin, requireOrgMembership } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../validators/index.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { AIProvider, ProviderMode } from '../../types/index.js';

const router = Router();

// Provider schemas
const providerSchema = z.enum(['openai', 'anthropic', 'google']);

const updateProviderSchema = z.object({
  mode: z.enum(['byok', 'managed']).optional(),
  api_key: z.string().min(1).optional(),
  is_enabled: z.boolean().optional(),
  default_model: z.string().min(1).optional(),
  allowed_models: z.array(z.string()).optional(),
});

const budgetSchema = z.object({
  soft_limit_cents: z.number().min(0),
  hard_limit_cents: z.number().min(0),
  action_on_hard_limit: z.enum(['block', 'degrade']).default('block'),
});

const usageQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// GET /orgs/:org_id/ai/providers - List provider configs
router.get('/', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const configs = await providerRepository.findProviderConfigsByOrg(orgId);

    res.json({
      data: configs.map((config) => ({
        provider: config.provider,
        mode: config.mode,
        is_enabled: config.isEnabled,
        default_model: config.defaultModel,
        allowed_models: config.allowedModels,
        api_key_last4: config.apiKeyLast4,
        created_at: config.createdAt,
        updated_at: config.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /orgs/:org_id/ai/providers/:provider - Get provider config
router.get('/:provider', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const provider = req.params['provider'] as AIProvider;

    const config = await providerRepository.findProviderConfig(orgId, provider);
    if (!config) {
      throw new NotFoundError('Provider configuration');
    }

    res.json({
      data: {
        provider: config.provider,
        mode: config.mode,
        is_enabled: config.isEnabled,
        default_model: config.defaultModel,
        allowed_models: config.allowedModels,
        api_key_last4: config.apiKeyLast4,
        created_at: config.createdAt,
        updated_at: config.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /orgs/:org_id/ai/providers/:provider - Create or update provider config
router.put(
  '/:provider',
  authenticate,
  requireOrgAdmin,
  validateBody(updateProviderSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const provider = req.params['provider'] as AIProvider;

      // Validate provider
      const validProviders = ['openai', 'anthropic', 'google'];
      if (!validProviders.includes(provider)) {
        throw new ValidationError('Invalid provider', { provider });
      }

      const existingConfig = await providerRepository.findProviderConfig(orgId, provider);

      let config;
      if (existingConfig) {
        // Update existing
        config = await providerRepository.updateProviderConfig(orgId, provider, {
          mode: req.body.mode as ProviderMode | undefined,
          apiKey: req.body.api_key,
          isEnabled: req.body.is_enabled,
          defaultModel: req.body.default_model,
          allowedModels: req.body.allowed_models,
        });
      } else {
        // Create new
        if (!req.body.default_model) {
          throw new ValidationError('default_model is required when creating a provider config');
        }

        config = await providerRepository.createProviderConfig({
          orgId,
          provider,
          mode: req.body.mode ?? 'byok',
          apiKey: req.body.api_key,
          isEnabled: req.body.is_enabled ?? true,
          defaultModel: req.body.default_model,
          allowedModels: req.body.allowed_models,
          createdBy: req.context!.userId,
        });
      }

      logger.info({ orgId, provider, actorId: req.context!.userId }, 'Provider config updated');

      res.json({
        data: {
          provider: config!.provider,
          mode: config!.mode,
          is_enabled: config!.isEnabled,
          default_model: config!.defaultModel,
          allowed_models: config!.allowedModels,
          api_key_last4: config!.apiKeyLast4,
          updated_at: config!.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /orgs/:org_id/ai/providers/:provider - Delete provider config
router.delete('/:provider', authenticate, requireOrgAdmin, async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const provider = req.params['provider'] as AIProvider;

    await providerRepository.deleteProviderConfig(orgId, provider);

    logger.info({ orgId, provider, actorId: req.context!.userId }, 'Provider config deleted');

    res.json({
      data: null,
      meta: { message: 'Provider configuration deleted' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

// Budget routes - separate router
export const budgetRouter = Router();

// GET /orgs/:org_id/budgets - List budgets
budgetRouter.get('/', authenticate, requireOrgMembership(), async (req, res, next) => {
  try {
    const orgId = req.context!.orgId!;
    const budgets = await providerRepository.findBudgetsByOrg(orgId);

    res.json({
      data: budgets.map((budget) => ({
        period: budget.period,
        currency: budget.currency,
        soft_limit_cents: budget.softLimitCents,
        hard_limit_cents: budget.hardLimitCents,
        action_on_hard_limit: budget.actionOnHardLimit,
        created_at: budget.createdAt,
        updated_at: budget.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// PUT /orgs/:org_id/budgets/:period - Create or update budget
budgetRouter.put(
  '/:period',
  authenticate,
  requireOrgAdmin,
  validateBody(budgetSchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;
      const period = req.params['period'] as 'daily' | 'monthly';

      if (!['daily', 'monthly'].includes(period)) {
        throw new ValidationError('Invalid period', { period });
      }

      const budget = await providerRepository.upsertBudget({
        orgId,
        period,
        softLimitCents: req.body.soft_limit_cents,
        hardLimitCents: req.body.hard_limit_cents,
        actionOnHardLimit: req.body.action_on_hard_limit,
      });

      logger.info({ orgId, period, actorId: req.context!.userId }, 'Budget updated');

      res.json({
        data: {
          period: budget.period,
          currency: budget.currency,
          soft_limit_cents: budget.softLimitCents,
          hard_limit_cents: budget.hardLimitCents,
          action_on_hard_limit: budget.actionOnHardLimit,
          updated_at: budget.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /orgs/:org_id/usage - Get usage stats
budgetRouter.get(
  '/usage',
  authenticate,
  requireOrgAdmin,
  validateQuery(usageQuerySchema),
  async (req, res, next) => {
    try {
      const orgId = req.context!.orgId!;

      const now = new Date();
      const from = req.query['from']
        ? new Date(req.query['from'] as string)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = req.query['to']
        ? new Date(req.query['to'] as string)
        : now;

      const [totalUsage, byProvider] = await Promise.all([
        providerRepository.getUsageForPeriod(orgId, from, to),
        providerRepository.getUsageByProvider(orgId, from, to),
      ]);

      res.json({
        data: {
          period: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
          total: {
            cost_cents: totalUsage.totalCostCents,
            input_tokens: totalUsage.totalInputTokens,
            output_tokens: totalUsage.totalOutputTokens,
          },
          by_provider: byProvider.map((item) => ({
            provider: item.provider,
            model: item.model,
            cost_cents: item.totalCostCents,
            total_tokens: item.totalTokens,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
