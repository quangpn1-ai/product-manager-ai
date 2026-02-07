import { getProviderAdapter, getDefaultModel } from './providers/index.js';
import { logger } from '../utils/logger.js';
import type { Task } from '../types/index.js';
import type { Message } from './providers/types.js';

export interface Recommendation {
  type: 'clarification' | 'context' | 'action' | 'warning';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedAction?: string;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  summary: string;
  readinessScore: number; // 0-100, how ready the task is for generation
}

const RECOMMENDATION_PROMPT = `You are an AI Product Manager assistant. Analyze the following task and provide recommendations for what the user should do next before generating a Product Brief.

## Task Information
Title: {{title}}
Request: {{request_text}}
Current Status: {{status}}
Clarifications Provided: {{clarifications}}
Context Items: {{context_items}}

## Your Role
1. Analyze the completeness of the information provided
2. Identify any missing critical information
3. Suggest clarifying questions that should be answered
4. Recommend additional context or sources that might be helpful
5. Assess how ready the task is for brief generation (0-100 score)

## Response Format
Return a JSON object with this exact structure:
{
  "recommendations": [
    {
      "type": "clarification|context|action|warning",
      "priority": "high|medium|low",
      "title": "Short title for the recommendation",
      "description": "Detailed explanation of why this is important",
      "suggestedAction": "Specific action the user should take"
    }
  ],
  "summary": "One paragraph summary of the overall readiness and key actions needed",
  "readinessScore": 75
}

## Guidelines
- For NEW status: Focus on initial information gathering
- For CLARIFYING status: Focus on gaps in clarifications and context
- Only recommend what's truly necessary - don't over-engineer
- Be specific and actionable in your suggestions
- The readinessScore should reflect how complete the information is:
  - 0-30: Missing critical information, not ready
  - 31-60: Basic information present, but gaps remain
  - 61-80: Good information, minor improvements possible
  - 81-100: Well-prepared, ready for generation

Return ONLY valid JSON, no markdown formatting.`;

export class RecommendationService {
  /**
   * Generate recommendations for a task
   */
  async generateRecommendations(
    orgId: string,
    task: Task
  ): Promise<RecommendationResult> {
    // Try providers in order: anthropic, openai, google
    const providerOrder: Array<'anthropic' | 'openai' | 'google'> = ['anthropic', 'openai', 'google'];

    let adapter;
    let model: string = '';
    let lastError: Error | null = null;

    for (const provider of providerOrder) {
      try {
        adapter = await getProviderAdapter(orgId, provider);
        model = await getDefaultModel(orgId, provider);
        break;
      } catch (error) {
        lastError = error as Error;
        continue;
      }
    }

    if (!adapter) {
      logger.warn({ orgId, error: lastError?.message }, 'No AI provider available for recommendations');
      // Return default recommendations if no provider is available
      return this.getDefaultRecommendations(task);
    }

    // Render prompt
    const prompt = this.renderPrompt(task);

    const messages: Message[] = [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Please analyze this task and provide recommendations.' },
    ];

    try {
      const result = await adapter.generate(model, messages, {
        responseFormat: 'json',
        maxTokens: 2048,
        temperature: 0.5,
      });

      // Parse response
      let parsed: RecommendationResult;

      if (result.json) {
        parsed = result.json as RecommendationResult;
      } else {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      }

      // Validate and sanitize
      return {
        recommendations: (parsed.recommendations || []).slice(0, 10).map(rec => ({
          type: rec.type || 'action',
          priority: rec.priority || 'medium',
          title: rec.title || 'Recommendation',
          description: rec.description || '',
          suggestedAction: rec.suggestedAction,
        })),
        summary: parsed.summary || 'Analysis complete.',
        readinessScore: Math.min(100, Math.max(0, parsed.readinessScore || 50)),
      };
    } catch (error) {
      logger.error({ orgId, taskId: task.id, error }, 'Failed to generate recommendations');
      return this.getDefaultRecommendations(task);
    }
  }

  private renderPrompt(task: Task): string {
    let prompt = RECOMMENDATION_PROMPT;

    prompt = prompt.replace('{{title}}', task.title);
    prompt = prompt.replace('{{request_text}}', task.requestText);
    prompt = prompt.replace('{{status}}', task.status);
    prompt = prompt.replace(
      '{{clarifications}}',
      JSON.stringify(task.clarificationJson || {}, null, 2)
    );
    prompt = prompt.replace(
      '{{context_items}}',
      JSON.stringify(task.contextItemsJson || [], null, 2)
    );

    return prompt;
  }

  private getDefaultRecommendations(task: Task): RecommendationResult {
    const recommendations: Recommendation[] = [];
    let readinessScore = 30;

    // Check if we have clarifications
    const hasClarifications = task.clarificationJson &&
      Object.keys(task.clarificationJson).length > 0;

    // Check if we have context items
    const hasContextItems = task.contextItemsJson &&
      task.contextItemsJson.length > 0;

    if (task.status === 'NEW') {
      recommendations.push({
        type: 'action',
        priority: 'high',
        title: 'Start Clarification Phase',
        description: 'Begin the clarification process to gather more details about this request.',
        suggestedAction: 'Click "Start Clarification" to begin adding clarifying details.',
      });
      readinessScore = 20;
    }

    if (!hasClarifications) {
      recommendations.push({
        type: 'clarification',
        priority: 'high',
        title: 'Add Clarifying Information',
        description: 'No clarifications have been provided yet. Adding details like target audience, timeline, and success metrics will improve the brief quality.',
        suggestedAction: 'Add key-value pairs to clarify the request details.',
      });
    } else {
      readinessScore += 25;
    }

    if (!hasContextItems) {
      recommendations.push({
        type: 'context',
        priority: 'medium',
        title: 'Add Reference Materials',
        description: 'Consider adding links to related documents, previous decisions, or reference materials.',
        suggestedAction: 'Click "Add Context" to attach relevant sources.',
      });
    } else {
      readinessScore += 20;
    }

    if (task.requestText.length < 100) {
      recommendations.push({
        type: 'warning',
        priority: 'medium',
        title: 'Request Seems Brief',
        description: 'The initial request is quite short. More detail in clarifications may help generate a better brief.',
        suggestedAction: 'Expand on the request through clarifications.',
      });
    } else {
      readinessScore += 15;
    }

    if (hasClarifications && hasContextItems) {
      readinessScore = Math.min(readinessScore + 20, 85);
    }

    const summary = readinessScore >= 70
      ? 'This task is well-prepared and ready for brief generation.'
      : readinessScore >= 50
        ? 'This task has basic information but could benefit from additional clarifications or context.'
        : 'This task needs more information before generating a quality brief.';

    return {
      recommendations,
      summary,
      readinessScore,
    };
  }
}

export const recommendationService = new RecommendationService();
