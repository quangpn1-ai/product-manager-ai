import { query, toCamelCase, toCamelCaseArray, transaction } from '../index.js';
import type { Organization, OrgMembership, OrgInvitation, OrgRole } from '../../types/index.js';

interface CreateOrgInput {
  name: string;
  slug: string;
  timezone?: string;
  defaultLanguage?: string;
  allowedEmailDomains?: string[];
}

interface UpdateOrgInput {
  name?: string;
  timezone?: string;
  defaultLanguage?: string;
  allowedEmailDomains?: string[] | null;
  status?: string;
}

interface CreateMembershipInput {
  orgId: string;
  userId: string;
  role: OrgRole;
  status?: string;
}

interface CreateInvitationInput {
  orgId: string;
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: Date;
  invitedBy: string;
}

export class OrganizationRepository {
  // Organization CRUD
  async findById(id: string): Promise<Organization | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM organizations WHERE id = $1',
      [id]
    );
    return result.rows[0] ? toCamelCase<Organization>(result.rows[0]) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM organizations WHERE slug = $1',
      [slug.toLowerCase()]
    );
    return result.rows[0] ? toCamelCase<Organization>(result.rows[0]) : null;
  }

  async create(input: CreateOrgInput): Promise<Organization> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO organizations (name, slug, timezone, default_language, allowed_email_domains)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.name,
        input.slug.toLowerCase(),
        input.timezone ?? 'UTC',
        input.defaultLanguage ?? 'en',
        input.allowedEmailDomains ?? null,
      ]
    );
    return toCamelCase<Organization>(result.rows[0]!);
  }

  async update(id: string, input: UpdateOrgInput): Promise<Organization | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(input.timezone);
    }
    if (input.defaultLanguage !== undefined) {
      updates.push(`default_language = $${paramIndex++}`);
      values.push(input.defaultLanguage);
    }
    if (input.allowedEmailDomains !== undefined) {
      updates.push(`allowed_email_domains = $${paramIndex++}`);
      values.push(input.allowedEmailDomains);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = await query<Record<string, unknown>>(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0] ? toCamelCase<Organization>(result.rows[0]) : null;
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1) as exists',
      [slug.toLowerCase()]
    );
    return result.rows[0]?.exists ?? false;
  }

  // Membership operations
  async findMembership(orgId: string, userId: string): Promise<OrgMembership | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_memberships WHERE org_id = $1 AND user_id = $2',
      [orgId, userId]
    );
    return result.rows[0] ? toCamelCase<OrgMembership>(result.rows[0]) : null;
  }

  async findMembershipsByUser(userId: string): Promise<OrgMembership[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM org_memberships WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    return toCamelCaseArray<OrgMembership>(result.rows);
  }

  async findMembershipsByOrg(orgId: string): Promise<OrgMembership[]> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_memberships WHERE org_id = $1 ORDER BY created_at',
      [orgId]
    );
    return toCamelCaseArray<OrgMembership>(result.rows);
  }

  async createMembership(input: CreateMembershipInput): Promise<OrgMembership> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO org_memberships (org_id, user_id, role, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.orgId, input.userId, input.role, input.status ?? 'active']
    );
    return toCamelCase<OrgMembership>(result.rows[0]!);
  }

  async updateMembership(
    orgId: string,
    userId: string,
    update: { role?: OrgRole; status?: string }
  ): Promise<OrgMembership | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (update.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(update.role);
    }
    if (update.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(update.status);
    }

    if (updates.length === 0) {
      return this.findMembership(orgId, userId);
    }

    values.push(orgId, userId);
    const result = await query<Record<string, unknown>>(
      `UPDATE org_memberships SET ${updates.join(', ')}
       WHERE org_id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values
    );
    return result.rows[0] ? toCamelCase<OrgMembership>(result.rows[0]) : null;
  }

  async deleteMembership(orgId: string, userId: string): Promise<void> {
    await query(
      'DELETE FROM org_memberships WHERE org_id = $1 AND user_id = $2',
      [orgId, userId]
    );
  }

  async countAdmins(orgId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM org_memberships
       WHERE org_id = $1 AND role = 'org_admin' AND status = 'active'`,
      [orgId]
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async getOrgsForUser(userId: string): Promise<Organization[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT o.* FROM organizations o
       INNER JOIN org_memberships m ON o.id = m.org_id
       WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
       ORDER BY o.name`,
      [userId]
    );
    return toCamelCaseArray<Organization>(result.rows);
  }

  // Invitation operations
  async findInvitationById(id: string): Promise<OrgInvitation | null> {
    const result = await query<Record<string, unknown>>(
      'SELECT * FROM org_invitations WHERE id = $1',
      [id]
    );
    return result.rows[0] ? toCamelCase<OrgInvitation>(result.rows[0]) : null;
  }

  async findInvitationByToken(token: string): Promise<OrgInvitation | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM org_invitations WHERE token = $1 AND status = 'pending' AND expires_at > now()`,
      [token]
    );
    return result.rows[0] ? toCamelCase<OrgInvitation>(result.rows[0]) : null;
  }

  async findInvitationsByOrg(orgId: string): Promise<OrgInvitation[]> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM org_invitations WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    return toCamelCaseArray<OrgInvitation>(result.rows);
  }

  async findPendingInvitationByEmail(orgId: string, email: string): Promise<OrgInvitation | null> {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM org_invitations
       WHERE org_id = $1 AND email = $2 AND status = 'pending' AND expires_at > now()`,
      [orgId, email.toLowerCase()]
    );
    return result.rows[0] ? toCamelCase<OrgInvitation>(result.rows[0]) : null;
  }

  async createInvitation(input: CreateInvitationInput): Promise<OrgInvitation> {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO org_invitations (org_id, email, role, token, expires_at, invited_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.orgId, input.email.toLowerCase(), input.role, input.token, input.expiresAt, input.invitedBy]
    );
    return toCamelCase<OrgInvitation>(result.rows[0]!);
  }

  async updateInvitationStatus(id: string, status: string): Promise<void> {
    await query(
      'UPDATE org_invitations SET status = $1 WHERE id = $2',
      [status, id]
    );
  }

  async expireOldInvitations(): Promise<number> {
    const result = await query(
      `UPDATE org_invitations SET status = 'expired'
       WHERE status = 'pending' AND expires_at <= now()`,
      []
    );
    return result.rowCount ?? 0;
  }

  // Create org with admin (transaction)
  async createWithAdmin(
    orgInput: CreateOrgInput,
    userId: string
  ): Promise<{ org: Organization; membership: OrgMembership }> {
    return transaction(async (client) => {
      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, timezone, default_language, allowed_email_domains)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          orgInput.name,
          orgInput.slug.toLowerCase(),
          orgInput.timezone ?? 'UTC',
          orgInput.defaultLanguage ?? 'en',
          orgInput.allowedEmailDomains ?? null,
        ]
      );
      const org = toCamelCase<Organization>(orgResult.rows[0]);

      const membershipResult = await client.query(
        `INSERT INTO org_memberships (org_id, user_id, role, status)
         VALUES ($1, $2, 'org_admin', 'active')
         RETURNING *`,
        [org.id, userId]
      );
      const membership = toCamelCase<OrgMembership>(membershipResult.rows[0]);

      // Create default workflow for the organization
      const defaultWorkflow = getDefaultWorkflow();
      await client.query(
        `INSERT INTO workflows (org_id, key, name, description, definition_json, is_system, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, true, true, $6)`,
        [
          org.id,
          defaultWorkflow.key,
          defaultWorkflow.name,
          'Default MVP workflow for generating product briefs',
          JSON.stringify(defaultWorkflow),
          userId,
        ]
      );

      // Create default prompt templates
      const promptTemplates = getDefaultPromptTemplates();
      for (const template of promptTemplates) {
        await client.query(
          `INSERT INTO prompt_templates (org_id, key, name, role, template, output_schema_id, version, is_system, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 1, true, $7)`,
          [
            org.id,
            template.key,
            template.name,
            template.role,
            template.template,
            template.output_schema_id,
            userId,
          ]
        );
      }

      return { org, membership };
    });
  }
}

export const organizationRepository = new OrganizationRepository();

// Default workflow definition
function getDefaultWorkflow() {
  return {
    key: 'wf_product_brief_v1',
    name: 'Request → Brief (MVP)',
    inputs: {
      request_text: { required: true },
      clarification_json: { required: true },
      context_items_json: { required: false },
    },
    state_machine: {
      NEW: ['CLARIFYING', 'ON_HOLD'],
      CLARIFYING: ['READY_FOR_GENERATION', 'ON_HOLD'],
      READY_FOR_GENERATION: ['DRAFT_GENERATED', 'FAILED', 'ON_HOLD'],
      DRAFT_GENERATED: ['IN_REVIEW', 'READY_FOR_GENERATION'],
      IN_REVIEW: ['APPROVED', 'READY_FOR_GENERATION'],
      APPROVED: ['EXPORTED', 'PUBLISHED'],
      EXPORTED: [],
      PUBLISHED: [],
      FAILED: ['READY_FOR_GENERATION', 'ON_HOLD'],
      ON_HOLD: ['CLARIFYING', 'READY_FOR_GENERATION'],
    },
    stages: [
      {
        id: 'gen',
        role: 'generator',
        prompt_template_key: 'pt_gen_brief_v1',
        provider: 'openai',
        model: 'gpt-4o',
        timeout_ms: 45000,
        retries: 1,
        fallback: [{ provider: 'google', model: 'gemini-1.5-pro' }],
        output_schema_id: 'schema_gen_brief_v1',
      },
      {
        id: 'critic',
        role: 'critic',
        prompt_template_key: 'pt_critic_v1',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        timeout_ms: 45000,
        retries: 1,
        output_schema_id: 'schema_critic_v1',
      },
      {
        id: 'xq',
        role: 'cross_questioner',
        prompt_template_key: 'pt_xq_v1',
        provider: 'google',
        model: 'gemini-1.5-pro',
        timeout_ms: 45000,
        retries: 1,
        output_schema_id: 'schema_xq_v1',
      },
      {
        id: 'syn',
        role: 'synthesizer',
        prompt_template_key: 'pt_synth_v1',
        provider: 'openai',
        model: 'gpt-4o',
        timeout_ms: 60000,
        retries: 1,
        fallback: [{ provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }],
        output_schema_id: 'schema_product_brief_v1',
      },
    ],
    final_output_schema_id: 'schema_product_brief_v1',
  };
}

// Default prompt templates
function getDefaultPromptTemplates() {
  return [
    {
      key: 'pt_gen_brief_v1',
      name: 'Generator - Product Brief v1',
      role: 'generator',
      output_schema_id: 'schema_gen_brief_v1',
      template: `You are AI-PM Generator. Create a Product Brief draft in strict JSON format.

INPUT:
- Title: {{task.title}}
- Request: {{task.request_text}}
- Clarifications (JSON): {{task.clarification_json}}
- Context items (JSON array): {{task.context_items_json}}
- Relevant decisions (JSON array): {{decisions}}

REQUIREMENTS:
- Output JSON matching schema_gen_brief_v1.
- Do NOT invent facts. If information is missing, add it to needs_validation and keep the section conservative.
- Keep proposed_solution high-level and reversible for MVP.
- Write in {{org.default_language}}.

Return JSON only.`,
    },
    {
      key: 'pt_critic_v1',
      name: 'Critic v1',
      role: 'critic',
      output_schema_id: 'schema_critic_v1',
      template: `You are AI-PM Critic. Critique the draft objectively.

INPUT:
- Draft JSON: {{stage_outputs.gen}}

REQUIREMENTS:
- Output JSON matching schema_critic_v1.
- Do NOT rewrite the whole doc. Identify issues and recommendations only.
- Focus on missing info, ambiguity, metrics, scope, risks, and consistency.
- Be concise but specific.

Return JSON only.`,
    },
    {
      key: 'pt_xq_v1',
      name: 'Cross-Questioner v1',
      role: 'cross_questioner',
      output_schema_id: 'schema_xq_v1',
      template: `You are AI-PM Cross-Questioner. Produce cross-check questions that reveal hidden assumptions.

INPUT:
- Draft JSON: {{stage_outputs.gen}}
- Critique JSON: {{stage_outputs.critic}}

REQUIREMENTS:
- Output JSON matching schema_xq_v1.
- Ask 5-12 questions.
- Each question must include why it matters and which section it targets.

Return JSON only.`,
    },
    {
      key: 'pt_synth_v1',
      name: 'Synthesizer v1',
      role: 'synthesizer',
      output_schema_id: 'schema_product_brief_v1',
      template: `You are AI-PM Synthesizer. Produce the final Product Brief by incorporating critique and cross-questions.

INPUT:
- Draft JSON: {{stage_outputs.gen}}
- Critique JSON: {{stage_outputs.critic}}
- Cross-questions JSON: {{stage_outputs.xq}}

REQUIREMENTS:
- Output JSON matching schema_product_brief_v1.
- For each critique issue, record accepted/rejected/deferred with reason.
- If a critique cannot be resolved without new info, add to open_questions and needs_validation.
- Do NOT invent facts.

Return JSON only.`,
    },
  ];
}
