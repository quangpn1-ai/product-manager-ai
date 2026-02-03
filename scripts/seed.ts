import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Default workflow definition
const DEFAULT_WORKFLOW = {
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
      model: 'gpt-4.1',
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
      model: 'claude-3.5-sonnet',
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
      model: 'gpt-4.1',
      timeout_ms: 60000,
      retries: 1,
      fallback: [{ provider: 'anthropic', model: 'claude-3.5-sonnet' }],
      output_schema_id: 'schema_product_brief_v1',
    },
  ],
  final_output_schema_id: 'schema_product_brief_v1',
};

// Default prompt templates
const PROMPT_TEMPLATES = [
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

async function seed() {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
  });

  try {
    console.log('Starting seed...');

    // Check if we have any organizations (seed data should only be created once per org)
    const orgsResult = await pool.query('SELECT COUNT(*) as count FROM organizations');
    const orgCount = parseInt(orgsResult.rows[0].count, 10);

    if (orgCount === 0) {
      console.log('No organizations found. Creating a demo organization...');

      // Create demo organization
      const orgResult = await pool.query(`
        INSERT INTO organizations (name, slug, timezone, default_language)
        VALUES ('Demo Organization', 'demo', 'UTC', 'en')
        RETURNING id
      `);
      const orgId = orgResult.rows[0].id;

      // Create demo admin user (password: demo1234)
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash('demo1234', 12);

      const userResult = await pool.query(`
        INSERT INTO users (email, password_hash, email_verified, status)
        VALUES ('admin@demo.local', $1, true, 'active')
        RETURNING id
      `, [passwordHash]);
      const userId = userResult.rows[0].id;

      // Create membership
      await pool.query(`
        INSERT INTO org_memberships (org_id, user_id, role, status)
        VALUES ($1, $2, 'org_admin', 'active')
      `, [orgId, userId]);

      // Create workflow
      await pool.query(`
        INSERT INTO workflows (org_id, key, name, description, definition_json, is_system, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, true, true, $6)
      `, [
        orgId,
        DEFAULT_WORKFLOW.key,
        DEFAULT_WORKFLOW.name,
        'Default MVP workflow for generating product briefs',
        JSON.stringify(DEFAULT_WORKFLOW),
        userId,
      ]);

      // Create prompt templates
      for (const template of PROMPT_TEMPLATES) {
        await pool.query(`
          INSERT INTO prompt_templates (org_id, key, name, role, template, output_schema_id, version, is_system, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, 1, true, $7)
        `, [
          orgId,
          template.key,
          template.name,
          template.role,
          template.template,
          template.output_schema_id,
          userId,
        ]);
      }

      console.log('Demo organization created:');
      console.log('  Email: admin@demo.local');
      console.log('  Password: demo1234');
      console.log('  Org ID:', orgId);
    } else {
      console.log('Organizations already exist. Skipping demo org creation.');

      // Still ensure all orgs have the system workflow and prompts
      const allOrgs = await pool.query('SELECT id FROM organizations');

      for (const org of allOrgs.rows) {
        const orgId = org.id;

        // Get a user to be the creator
        const userResult = await pool.query(`
          SELECT user_id FROM org_memberships WHERE org_id = $1 LIMIT 1
        `, [orgId]);

        if (userResult.rows.length === 0) continue;
        const userId = userResult.rows[0].user_id;

        // Check if workflow exists
        const wfResult = await pool.query(`
          SELECT id FROM workflows WHERE org_id = $1 AND key = $2
        `, [orgId, DEFAULT_WORKFLOW.key]);

        if (wfResult.rows.length === 0) {
          console.log(`Creating system workflow for org ${orgId}...`);
          await pool.query(`
            INSERT INTO workflows (org_id, key, name, description, definition_json, is_system, is_active, created_by)
            VALUES ($1, $2, $3, $4, $5, true, true, $6)
          `, [
            orgId,
            DEFAULT_WORKFLOW.key,
            DEFAULT_WORKFLOW.name,
            'Default MVP workflow for generating product briefs',
            JSON.stringify(DEFAULT_WORKFLOW),
            userId,
          ]);
        }

        // Check and create prompt templates
        for (const template of PROMPT_TEMPLATES) {
          const ptResult = await pool.query(`
            SELECT id FROM prompt_templates WHERE org_id = $1 AND key = $2
          `, [orgId, template.key]);

          if (ptResult.rows.length === 0) {
            console.log(`Creating prompt template ${template.key} for org ${orgId}...`);
            await pool.query(`
              INSERT INTO prompt_templates (org_id, key, name, role, template, output_schema_id, version, is_system, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, 1, true, $7)
            `, [
              orgId,
              template.key,
              template.name,
              template.role,
              template.template,
              template.output_schema_id,
              userId,
            ]);
          }
        }
      }
    }

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
