import { query, toCamelCase, toCamelCaseArray } from '../index.js';
import { encrypt, decrypt, getLast4 } from '../../utils/encryption.js';
import type { OrgAIProviderConfig, OrgBudget, UsageLedgerEntry, AIProvider, ProviderMode, BudgetPeriod } from '../../types/index.js';

interface CreateProviderConfigInput {
  orgId: string;
  provider: AIProvider;
  mode: ProviderMode;
  apiKey?: string;
  isEnabled: boolean;
  defaultModel: string;
  allowedModels?: string[];
  createdBy: string;
}

interface UpdateProviderConfigInput {
  mode?: ProviderMode;
  apiKey?: string | null;
  isEnabled?: boolean;
  defaultModel?: string;
  allowedModels?: string[] | null;
}

interface CreateBudgetInput {
  orgId: string;
  period: BudgetPeriod;
  currency?: string;
  softLimitCents: number;
  hardLimitCents: number;
  actionOnHardLimit?: 'block' | 'degrade';
}

interface UpdateBudgetInput {
  softLimitCents?: number;
  hardLimitCents?: number;
  actionOnHardLimit?: 'block' | 'degrade';
}

interface CreateUsageInput {
  orgId: string;
  userId?: string;
  provider: AIProvider;
  model: string;
  runId?: string;
  stageId?: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}

export class ProviderRepository {
  // Provider Config operations
  async findProviderConfig(orgId: string, provider: AIProvider): Promise<OrgAIProviderConfig | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_ai_provider_configs WHERE org_id = $1 AND provider = $2',
      [orgId, provider]
    );
    return result.rows[0] ? toCamelCase<OrgAIProviderConfig>(result.rows[0]) : null;
  }

  async findProviderConfigsByOrg(orgId: string): Promise<OrgAIProviderConfig[]> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_ai_provider_configs WHERE org_id = $1 ORDER BY provider',
      [orgId]
    );
    return toCamelCaseArray<OrgAIProviderConfig>(result.rows);
  }

  async createProviderConfig(input: CreateProviderConfigInput): Promise<OrgAIProviderConfig> {
    const apiKeyEncrypted = input.apiKey ? encrypt(input.apiKey) : null;
    const apiKeyLast4 = input.apiKey ? getLast4(input.apiKey) : null;

    const result = await query<Record<string, unknown>>(
      `INSERT INTO org_ai_provider_configs
       (org_id, provider, mode, api_key_encrypted, api_key_last4, is_enabled, default_model, allowed_models, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.orgId,
        input.provider,
        input.mode,
        apiKeyEncrypted,
        apiKeyLast4,
        input.isEnabled,
        input.defaultModel,
        input.allowedModels ?? null,
        input.createdBy,
      ]
    );
    return toCamelCase<OrgAIProviderConfig>(result.rows[0]!);
  }

  async updateProviderConfig(
    orgId: string,
    provider: AIProvider,
    input: UpdateProviderConfigInput
  ): Promise<OrgAIProviderConfig | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.mode !== undefined) {
      updates.push(`mode = $${paramIndex++}`);
      values.push(input.mode);
    }
    if (input.apiKey !== undefined) {
      if (input.apiKey === null) {
        updates.push(`api_key_encrypted = $${paramIndex++}`);
        values.push(null);
        updates.push(`api_key_last4 = $${paramIndex++}`);
        values.push(null);
      } else {
        updates.push(`api_key_encrypted = $${paramIndex++}`);
        values.push(encrypt(input.apiKey));
        updates.push(`api_key_last4 = $${paramIndex++}`);
        values.push(getLast4(input.apiKey));
      }
    }
    if (input.isEnabled !== undefined) {
      updates.push(`is_enabled = $${paramIndex++}`);
      values.push(input.isEnabled);
    }
    if (input.defaultModel !== undefined) {
      updates.push(`default_model = $${paramIndex++}`);
      values.push(input.defaultModel);
    }
    if (input.allowedModels !== undefined) {
      updates.push(`allowed_models = $${paramIndex++}`);
      values.push(input.allowedModels);
    }

    if (updates.length === 0) {
      return this.findProviderConfig(orgId, provider);
    }

    values.push(orgId, provider);
    const result = await query<Record<string, unknown>>(
      `UPDATE org_ai_provider_configs SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND provider = $${paramIndex}
       RETURNING *`,
      values
    );
    return result.rows[0] ? toCamelCase<OrgAIProviderConfig>(result.rows[0]) : null;
  }

  async deleteProviderConfig(orgId: string, provider: AIProvider): Promise<void> {
    await query(
      'DELETE FROM org_ai_provider_configs WHERE org_id = $1 AND provider = $2',
      [orgId, provider]
    );
  }

  getDecryptedApiKey(config: OrgAIProviderConfig): string | null {
    if (!config.apiKeyEncrypted) {
      return null;
    }
    return decrypt(config.apiKeyEncrypted);
  }

  // Budget operations
  async findBudget(orgId: string, period: BudgetPeriod): Promise<OrgBudget | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_budgets WHERE org_id = $1 AND period = $2',
      [orgId, period]
    );
    return result.rows[0] ? toCamelCase<OrgBudget>(result.rows[0]) : null;
  }

  async findBudgetsByOrg(orgId: string): Promise<OrgBudget[]> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_budgets WHERE org_id = $1 ORDER BY period',
      [orgId]
    );
    return toCamelCaseArray<OrgBudget>(result.rows);
  }

  async upsertBudget(input: CreateBudgetInput): Promise<OrgBudget> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO org_budgets (org_id, period, currency, soft_limit_cents, hard_limit_cents, action_on_hard_limit)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (org_id, period)
       DO UPDATE SET
         soft_limit_cents = EXCLUDED.soft_limit_cents,
         hard_limit_cents = EXCLUDED.hard_limit_cents,
         action_on_hard_limit = EXCLUDED.action_on_hard_limit
       RETURNING *`,
      [
        input.orgId,
        input.period,
        input.currency ?? 'USD',
        input.softLimitCents,
        input.hardLimitCents,
        input.actionOnHardLimit ?? 'block',
      ]
    );
    return toCamelCase<OrgBudget>(result.rows[0]!);
  }

  // Usage operations
  async createUsageEntry(input: CreateUsageInput): Promise<UsageLedgerEntry> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO usage_ledger
       (org_id, user_id, provider, model, run_id, stage_id, input_tokens, output_tokens, cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        input.orgId,
        input.userId ?? null,
        input.provider,
        input.model,
        input.runId ?? null,
        input.stageId ?? null,
        input.inputTokens,
        input.outputTokens,
        input.costCents,
      ]
    );
    return toCamelCase<UsageLedgerEntry>(result.rows[0]!);
  }

  async getUsageForPeriod(
    orgId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ totalCostCents: number; totalInputTokens: number; totalOutputTokens: number }> {
    const result = await query<{
      total_cost_cents: string;
      total_input_tokens: string;
      total_output_tokens: string;
    }>(
      `SELECT
         COALESCE(SUM(cost_cents), 0) as total_cost_cents,
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens
       FROM usage_ledger
       WHERE org_id = $1 AND created_at >= $2 AND created_at < $3`,
      [orgId, startDate, endDate]
    );

    const row = result.rows[0]!;
    return {
      totalCostCents: parseInt(row.total_cost_cents, 10),
      totalInputTokens: parseInt(row.total_input_tokens, 10),
      totalOutputTokens: parseInt(row.total_output_tokens, 10),
    };
  }

  async getUsageByProvider(
    orgId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ provider: string; model: string; totalCostCents: number; totalTokens: number }>> {
    const result = await query<{
      provider: string;
      model: string;
      total_cost_cents: string;
      total_tokens: string;
    }>(
      `SELECT
         provider,
         model,
         COALESCE(SUM(cost_cents), 0) as total_cost_cents,
         COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
       FROM usage_ledger
       WHERE org_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY provider, model
       ORDER BY total_cost_cents DESC`,
      [orgId, startDate, endDate]
    );

    return result.rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      totalCostCents: parseInt(row.total_cost_cents, 10),
      totalTokens: parseInt(row.total_tokens, 10),
    }));
  }

  async checkBudgetExceeded(orgId: string, period: BudgetPeriod): Promise<{
    exceeded: boolean;
    softLimitExceeded: boolean;
    currentUsageCents: number;
    limitCents: number;
  } | null> {
    const budget = await this.findBudget(orgId, period);
    if (!budget || budget.hardLimitCents === 0) {
      return null;
    }

    const now = new Date();
    let startDate: Date;

    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const usage = await this.getUsageForPeriod(orgId, startDate, now);

    return {
      exceeded: usage.totalCostCents >= budget.hardLimitCents,
      softLimitExceeded: usage.totalCostCents >= budget.softLimitCents,
      currentUsageCents: usage.totalCostCents,
      limitCents: budget.hardLimitCents,
    };
  }
}

export const providerRepository = new ProviderRepository();
