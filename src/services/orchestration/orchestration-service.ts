import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { taskRepository, documentRepository, runRepository } from '../../db/repositories/task-repository.js';
import { providerRepository } from '../../db/repositories/provider-repository.js';
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

export class OrchestrationService {
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
            stageOutputs
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
    previousOutputs: Map<string, Record<string, unknown>>
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

    // Render prompt
    const renderedPrompt = this.renderPrompt(promptTemplate.template, task, previousOutputs);

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
   * Render a prompt template with task data and previous stage outputs
   */
  private renderPrompt(
    template: string,
    task: Task,
    previousOutputs: Map<string, Record<string, unknown>>
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

    return rendered;
  }
}

export const orchestrationService = new OrchestrationService();
