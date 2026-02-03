// JSON Schemas for AI Output Validation

export const SCHEMAS: Record<string, object> = {
  schema_gen_brief_v1: {
    type: 'object',
    required: ['draft', 'sources', 'needs_validation'],
    properties: {
      draft: { $ref: '#/definitions/briefDraft' },
      sources: { type: 'array', items: { $ref: '#/definitions/sourceItem' } },
      needs_validation: { type: 'array', items: { type: 'string' } },
    },
    definitions: {
      sourceItem: {
        type: 'object',
        required: ['type', 'title'],
        properties: {
          type: { type: 'string', enum: ['user_input', 'link', 'decision'] },
          title: { type: 'string' },
          url: { type: 'string' },
          note: { type: 'string' },
        },
      },
      briefDraft: {
        type: 'object',
        required: [
          'context_request',
          'problem',
          'goals',
          'non_goals',
          'users',
          'use_cases',
          'proposed_solution',
          'scope_in',
          'scope_out',
          'risks',
          'success_metrics',
          'open_questions',
          'next_steps',
        ],
        properties: {
          context_request: { type: 'string' },
          problem: { type: 'string' },
          goals: { type: 'array', items: { type: 'string' } },
          non_goals: { type: 'array', items: { type: 'string' } },
          users: { type: 'string' },
          use_cases: { type: 'array', items: { type: 'string' } },
          proposed_solution: { type: 'string' },
          scope_in: { type: 'array', items: { type: 'string' } },
          scope_out: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          success_metrics: { type: 'array', items: { type: 'string' } },
          open_questions: { type: 'array', items: { type: 'string' } },
          next_steps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },

  schema_critic_v1: {
    type: 'object',
    required: ['issues', 'suggested_edits'],
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['severity', 'category', 'description', 'recommendation'],
          properties: {
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            category: {
              type: 'string',
              enum: [
                'missing_info',
                'ambiguity',
                'scope',
                'metrics',
                'risk',
                'consistency',
                'feasibility',
              ],
            },
            description: { type: 'string' },
            recommendation: { type: 'string' },
          },
        },
      },
      suggested_edits: { type: 'array', items: { type: 'string' } },
    },
  },

  schema_xq_v1: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 5,
        maxItems: 12,
        items: {
          type: 'object',
          required: ['question', 'why_it_matters', 'target_section'],
          properties: {
            question: { type: 'string' },
            why_it_matters: { type: 'string' },
            target_section: { type: 'string' },
          },
        },
      },
    },
  },

  schema_product_brief_v1: {
    type: 'object',
    required: [
      'final',
      'critique_resolution',
      'open_questions',
      'risks',
      'sources',
      'needs_validation',
    ],
    properties: {
      final: {
        type: 'object',
        required: [
          'context_request',
          'problem',
          'goals',
          'non_goals',
          'users',
          'use_cases',
          'proposed_solution',
          'scope_in',
          'scope_out',
          'risks',
          'success_metrics',
          'open_questions',
          'next_steps',
        ],
        properties: {
          context_request: { type: 'string' },
          problem: { type: 'string' },
          goals: { type: 'array', items: { type: 'string' } },
          non_goals: { type: 'array', items: { type: 'string' } },
          users: { type: 'string' },
          use_cases: { type: 'array', items: { type: 'string' } },
          proposed_solution: { type: 'string' },
          scope_in: { type: 'array', items: { type: 'string' } },
          scope_out: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          success_metrics: { type: 'array', items: { type: 'string' } },
          open_questions: { type: 'array', items: { type: 'string' } },
          next_steps: { type: 'array', items: { type: 'string' } },
        },
      },
      critique_resolution: {
        type: 'array',
        items: {
          type: 'object',
          required: ['issue', 'decision', 'reason'],
          properties: {
            issue: { type: 'string' },
            decision: { type: 'string', enum: ['accepted', 'rejected', 'deferred'] },
            reason: { type: 'string' },
          },
        },
      },
      open_questions: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: { type: 'string', enum: ['user_input', 'link', 'decision'] },
            title: { type: 'string' },
            url: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      needs_validation: { type: 'array', items: { type: 'string' } },
    },
  },
};
