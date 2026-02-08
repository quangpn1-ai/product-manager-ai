import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { taskRepository, documentRepository, runRepository } from '../../db/repositories/task-repository.js';
import { providerRepository } from '../../db/repositories/provider-repository.js';
import { projectRepository, type ProjectDocument, type ProjectContextRule } from '../../db/repositories/project-repository.js';
import { query, toCamelCase, toCamelCaseArray } from '../../db/index.js';
import { getProviderAdapter, getDefaultModel } from '../providers/index.js';
import { logger } from '../../utils/logger.js';
import { ProviderError, BudgetExceededError } from '../../utils/errors.js';
import type { Task, Workflow, WorkflowStageDefinition, Run, AIProvider } from '../../types/index.js';
import type { Message, GenerateResult } from '../providers/types.js';

// Initialize AJV for JSON schema validation
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Import JSON schemas
import { SCHEMAS } from '../../schemas/index.js';

interface StageOutput {
  stageId: string;
  output: Record<string, unknown>;
}

interface ProjectContext {
  projectId: string;
  projectName: string;
  documents: ProjectDocument[];
  rules: ProjectContextRule[];
  formattedContext: string;
}

export class OrchestrationService {
  /**
   * Load project context (documents + rules) for AI injection
   */
  private async loadProjectContext(projectId: string): Promise<ProjectContext | null> {
    try {
      // Get project details
      const projectResult = await query<Record<string, unknown>>(
        'SELECT id, name FROM projects WHERE id = $1',
        [projectId]
      );

      if (projectResult.rows.length === 0) {
        logger.warn({ projectId }, 'Project not found for context loading');
        return null;
      }

      const project = toCamelCase<{ id: string; name: string }>(projectResult.rows[0]!);

      // Load active documents and rules in parallel
      const [documents, rules] = await Promise.all([
        projectRepository.getActiveDocuments(projectId),
        projectRepository.getActiveRules(projectId),
      ]);

      // Format context for injection
      const formattedContext = this.formatProjectContext(project.name, documents, rules);

      logger.info(
        { projectId, documentCount: documents.length, ruleCount: rules.length },
        'Project context loaded'
      );

      return {
        projectId: project.id,
        projectName: project.name,
        documents,
        rules,
        formattedContext,
      };
    } catch (error) {
      logger.error({ projectId, error }, 'Failed to load project context');
      return null;
    }
  }

  /**
   * Format project context into a string for prompt injection
   */
  private formatProjectContext(
    projectName: string,
    documents: ProjectDocument[],
    rules: ProjectContextRule[]
  ): string {
    const sections: string[] = [];

    // Header
    sections.push(`=== PROJECT CONTEXT: ${projectName} ===\n`);

    // Context Rules Section
    if (rules.length > 0) {
      sections.push('## Project Rules and Guidelines\n');

      // Group rules by category
      const rulesByCategory = new Map<string, ProjectContextRule[]>();
      for (const rule of rules) {
        const existing = rulesByCategory.get(rule.category) || [];
        existing.push(rule);
        rulesByCategory.set(rule.category, existing);
      }

      // Format each category
      const categoryLabels: Record<string, string> = {
        constraint: 'Constraints (MUST follow)',
        standard: 'Standards and Conventions',
        tone: 'Tone and Communication Style',
        do_not: 'DO NOT (Prohibited Actions)',
      };

      for (const [category, categoryRules] of rulesByCategory) {
        sections.push(`### ${categoryLabels[category] || category}`);
        for (const rule of categoryRules) {
          sections.push(`- ${rule.ruleText}`);
        }
        sections.push('');
      }
    }

    // Documents Section
    if (documents.length > 0) {
      sections.push('## Project Knowledge Base\n');

      // Sort by priority (high first) and type
      const sortedDocs = [...documents].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
      });

      // Group by type
      const docsByType = new Map<string, ProjectDocument[]>();
      for (const doc of sortedDocs) {
        const existing = docsByType.get(doc.type) || [];
        existing.push(doc);
        docsByType.set(doc.type, existing);
      }

      const typeLabels: Record<string, string> = {
        functional_spec: 'Functional Specifications',
        technical_spec: 'Technical Specifications',
        api_doc: 'API Documentation',
        business_rules: 'Business Rules',
        glossary: 'Glossary and Terminology',
        other: 'Other Documents',
      };

      for (const [type, typeDocs] of docsByType) {
        sections.push(`### ${typeLabels[type] || type}`);

        for (const doc of typeDocs) {
          if (doc.contentText) {
            sections.push(`#### ${doc.title} (v${doc.version})`);

            // Truncate content if too long (max 2000 tokens ~ 8000 chars per doc)
            const maxChars = 8000;
            let content = doc.contentText;
            if (content.length > maxChars) {
              content = content.substring(0, maxChars) + '\n... [content truncated]';
            }
            sections.push(content);
            sections.push('');
          }
        }
      }
    }

    sections.push('=== END PROJECT CONTEXT ===\n');

    return sections.join('\n');
  }

  /**
   * Record which documents were used in a run
   */
  private async recordContextUsage(
    runId: string,
    documents: ProjectDocument[]
  ): Promise<void> {
    try {
      for (const doc of documents) {
        const tokensFromDoc = doc.contentText
          ? Math.ceil(doc.contentText.length / 4) // ~4 chars per token
          : undefined;

        await projectRepository.recordContextUsage(runId, doc.id, tokensFromDoc);
      }

      logger.info({ runId, documentCount: documents.length }, 'Context usage recorded');
    } catch (error) {
      logger.error({ runId, error }, 'Failed to record context usage');
      // Non-critical - don't fail the run
    }
  }

  /**
   * Execute a workflow run
   */
  async executeRun(runId: string, orgId: string): Promise<void> {
    const run = await runRepository.findById(orgId, runId);
    if (!run) {
      logger.error({ runId, orgId }, 'Run not found');
      return;
    }

    if (run.status !== 'QUEUED') {
      logger.warn({ runId, status: run.status }, 'Run is not in QUEUED status');
      return;
    }

    // Get task and workflow
    const task = await taskRepository.findById(orgId, run.taskId);
    if (!task) {
      await runRepository.updateStatus(orgId, runId, 'FAILED', { error: 'Task not found' });
      return;
    }

    const workflowResult = await query<Record<string, unknown>>(
      'SELECT * FROM workflows WHERE id = $1',
      [run.workflowId]
    );
    if (workflowResult.rows.length === 0) {
      await runRepository.updateStatus(orgId, runId, 'FAILED', { error: 'Workflow not found' });
      return;
    }
    const workflow = toCamelCase<Workflow>(workflowResult.rows[0]!);

    // Load project context if task is linked to a project
    let projectContext: ProjectContext | null = null;
    if (task.projectId) {
      projectContext = await this.loadProjectContext(task.projectId);
    }

    // Update run status to RUNNING
    await runRepository.updateStatus(orgId, runId, 'RUNNING');

    const stageOutputs: Map<string, Record<string, unknown>> = new Map();
    let hasGeneratorOutput = false;
    let hasCriticalFailure = false;

    try {
      // Check budget before starting
      const budgetCheck = await providerRepository.checkBudgetExceeded(orgId, 'daily');
      if (budgetCheck?.exceeded) {
        throw new BudgetExceededError('Daily budget limit exceeded');
      }

      // Execute each stage
      for (const stageDef of workflow.definitionJson.stages) {
        logger.info({ runId, stageId: stageDef.id, role: stageDef.role }, 'Executing stage');

        // Create stage record
        await runRepository.createStage({
          orgId,
          runId,
          stageId: stageDef.id,
          role: stageDef.role,
          provider: stageDef.provider,
          model: stageDef.model,
        });

        try {
          const result = await this.executeStage(
            orgId,
            run,
            task,
            workflow,
            stageDef,
            stageOutputs,
            projectContext
          );

          stageOutputs.set(stageDef.id, result.output);

          // Update stage with success
          await runRepository.updateStage(orgId, runId, stageDef.id, {
            status: 'SUCCEEDED',
            outputJson: result.output,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costCents: result.costCents,
          });

          // Record usage
          await providerRepository.createUsageEntry({
            orgId,
            userId: run.triggeredBy,
            provider: stageDef.provider,
            model: stageDef.model,
            runId,
            stageId: stageDef.id,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costCents: result.costCents,
          });

          if (stageDef.role === 'generator') {
            hasGeneratorOutput = true;
          }

          logger.info(
            { runId, stageId: stageDef.id, tokens: result.inputTokens + result.outputTokens },
            'Stage completed'
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          logger.error({ runId, stageId: stageDef.id, errorMessage, errorStack }, 'Stage failed');

          // Update stage with failure
          await runRepository.updateStage(orgId, runId, stageDef.id, {
            status: 'FAILED',
            errorJson: { message: errorMessage, stack: errorStack },
          });

          // Critical failure rules
          if (stageDef.role === 'generator' || stageDef.role === 'synthesizer') {
            hasCriticalFailure = true;
            break;
          }

          // Non-critical failure - continue with empty output for this stage
          stageOutputs.set(stageDef.id, { error: 'Stage failed', skipped: true });
        }
      }

      // Determine final status
      if (hasCriticalFailure) {
        await runRepository.updateStatus(orgId, runId, 'FAILED', {
          error: 'Critical stage failed',
        });
        await taskRepository.update(orgId, task.id, { status: 'FAILED' });
      } else if (stageOutputs.has('syn')) {
        // Synthesizer completed - create document
        const synthOutput = stageOutputs.get('syn')!;

        const doc = await documentRepository.create({
          orgId,
          taskId: task.id,
          title: task.title,
          contentJson: synthOutput,
          sourcesJson: (synthOutput['sources'] as unknown[]) ?? [],
          needsValidationJson: (synthOutput['needs_validation'] as string[]) ?? [],
          createdBy: run.triggeredBy,
        });

        // Update task
        await taskRepository.update(orgId, task.id, {
          status: 'DRAFT_GENERATED',
          documentCurrentId: doc.id,
        });

        // Record context usage if project context was used
        if (projectContext && projectContext.documents.length > 0) {
          await this.recordContextUsage(runId, projectContext.documents);
        }

        await runRepository.updateStatus(orgId, runId, 'SUCCEEDED');

        logger.info({ runId, docId: doc.id }, 'Run completed successfully');
      } else if (hasGeneratorOutput) {
        // Partial success - generator worked but synthesizer failed
        await runRepository.updateStatus(orgId, runId, 'PARTIAL', {
          warning: 'Some stages failed, but generator output is available',
        });
      } else {
        await runRepository.updateStatus(orgId, runId, 'FAILED', {
          error: 'No usable output generated',
        });
      }
    } catch (error) {
      logger.error({ runId, error }, 'Run execution failed');
      await runRepository.updateStatus(orgId, runId, 'FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
      await taskRepository.update(orgId, task.id, { status: 'FAILED' });
    }
  }

  /**
   * Execute a single stage
   */
  private async executeStage(
    orgId: string,
    run: Run,
    task: Task,
    workflow: Workflow,
    stageDef: WorkflowStageDefinition,
    previousOutputs: Map<string, Record<string, unknown>>,
    projectContext: ProjectContext | null
  ): Promise<{
    output: Record<string, unknown>;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  }> {
    // Update stage to running
    await runRepository.updateStage(orgId, run.id, stageDef.id, { status: 'RUNNING' });

    // Get provider adapter
    let adapter;
    let model = stageDef.model;

    try {
      adapter = await getProviderAdapter(orgId, stageDef.provider);
    } catch {
      // Try fallback providers
      if (stageDef.fallback && stageDef.fallback.length > 0) {
        for (const fallback of stageDef.fallback) {
          try {
            adapter = await getProviderAdapter(orgId, fallback.provider);
            model = fallback.model;
            logger.info({ stageId: stageDef.id, fallback: fallback.provider }, 'Using fallback provider');
            break;
          } catch {
            continue;
          }
        }
      }

      if (!adapter) {
        throw new ProviderError(stageDef.provider, 'Provider not available and no fallback succeeded');
      }
    }

    // Get prompt template
    const promptResult = await query<Record<string, unknown>>(
      `SELECT * FROM prompt_templates WHERE org_id = $1 AND key = $2
       ORDER BY version DESC LIMIT 1`,
      [orgId, stageDef.promptTemplateKey]
    );

    if (promptResult.rows.length === 0) {
      throw new Error(`Prompt template not found: ${stageDef.promptTemplateKey}`);
    }

    const promptTemplate = toCamelCase<{ template: string }>(promptResult.rows[0]!);

    // Render prompt with project context
    const renderedPrompt = this.renderPrompt(promptTemplate.template, task, previousOutputs, projectContext);

    // Update stage with rendered prompt
    await runRepository.updateStage(orgId, run.id, stageDef.id, {
      promptRendered: renderedPrompt,
    });

    // Build messages
    const messages: Message[] = [
      { role: 'system', content: renderedPrompt },
      { role: 'user', content: 'Please generate the output as specified.' },
    ];

    // Execute with retry
    let result: GenerateResult | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= stageDef.retries; attempt++) {
      try {
        result = await adapter.generate(model, messages, {
          responseFormat: 'json',
          maxTokens: 4096,
          temperature: 0.7,
        });
        break;
      } catch (error) {
        lastError = error as Error;
        logger.warn({ stageId: stageDef.id, attempt, error }, 'Generation attempt failed');

        if (attempt < stageDef.retries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    if (!result) {
      throw lastError ?? new Error('Generation failed');
    }

    // Parse and validate JSON output
    let output: Record<string, unknown>;

    if (result.json) {
      output = result.json;
    } else {
      // Try to extract JSON from text
      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          output = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch {
        throw new Error('Failed to parse JSON from response');
      }
    }

    // Validate against schema
    const schema = SCHEMAS[stageDef.outputSchemaId];
    if (schema) {
      const validate = ajv.compile(schema);
      const valid = validate(output);
      if (!valid) {
        logger.warn({ stageId: stageDef.id, errors: validate.errors }, 'Schema validation failed');
        // Don't fail - just log the warning
        // In production, you might want to be stricter
      }
    }

    // Calculate cost
    const costCents = adapter.estimateCost(result.inputTokens, result.outputTokens, model);

    return {
      output,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costCents,
    };
  }

  /**
   * Render a prompt template with task data, previous stage outputs, and project context
   */
  private renderPrompt(
    template: string,
    task: Task,
    previousOutputs: Map<string, Record<string, unknown>>,
    projectContext: ProjectContext | null
  ): string {
    let rendered = template;

    // Replace task variables
    rendered = rendered.replace(/\{\{task\.title\}\}/g, task.title);
    rendered = rendered.replace(/\{\{task\.request_text\}\}/g, task.requestText);
    rendered = rendered.replace(
      /\{\{task\.clarification_json\}\}/g,
      JSON.stringify(task.clarificationJson ?? {}, null, 2)
    );
    rendered = rendered.replace(
      /\{\{task\.context_items_json\}\}/g,
      JSON.stringify(task.contextItemsJson ?? [], null, 2)
    );

    // Replace stage output variables
    for (const [stageId, output] of previousOutputs) {
      rendered = rendered.replace(
        new RegExp(`\\{\\{stage_outputs\\.${stageId}\\}\\}`, 'g'),
        JSON.stringify(output, null, 2)
      );
    }

    // Replace org variables (placeholder for now)
    rendered = rendered.replace(/\{\{org\.default_language\}\}/g, 'en');

    // Replace decisions (placeholder for now)
    rendered = rendered.replace(/\{\{decisions\}\}/g, '[]');

    // Inject project context if available
    if (projectContext) {
      // Replace project context placeholder
      rendered = rendered.replace(
        /\{\{project_context\}\}/g,
        projectContext.formattedContext
      );

      // Replace project name
      rendered = rendered.replace(
        /\{\{project\.name\}\}/g,
        projectContext.projectName
      );

      // Replace project rules JSON
      rendered = rendered.replace(
        /\{\{project\.rules_json\}\}/g,
        JSON.stringify(
          projectContext.rules.map((r) => ({
            category: r.category,
            rule: r.ruleText,
            priority: r.priority,
          })),
          null,
          2
        )
      );

      // Replace project documents JSON (metadata only, not full content)
      rendered = rendered.replace(
        /\{\{project\.documents_json\}\}/g,
        JSON.stringify(
          projectContext.documents.map((d) => ({
            id: d.id,
            title: d.title,
            type: d.type,
            version: d.version,
            priority: d.priority,
          })),
          null,
          2
        )
      );
    } else {
      // Remove project context placeholders if no project context
      rendered = rendered.replace(/\{\{project_context\}\}/g, '');
      rendered = rendered.replace(/\{\{project\.name\}\}/g, '');
      rendered = rendered.replace(/\{\{project\.rules_json\}\}/g, '[]');
      rendered = rendered.replace(/\{\{project\.documents_json\}\}/g, '[]');
    }

    return rendered;
  }
}

export const orchestrationService = new OrchestrationService();
