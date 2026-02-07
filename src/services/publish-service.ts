import { documentRepository, taskRepository } from '../db/repositories/task-repository.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

export type PublishPlatform = 'confluence' | 'notion' | 'webhook';

export interface PublishConfig {
  platform: PublishPlatform;
  // For webhook
  webhookUrl?: string;
  // For Confluence
  confluenceBaseUrl?: string;
  confluenceSpaceKey?: string;
  confluenceParentPageId?: string;
  // For Notion
  notionDatabaseId?: string;
  // Auth (would be stored encrypted in real implementation)
  apiToken?: string;
}

export interface PublishResult {
  success: boolean;
  platform: PublishPlatform;
  url?: string;
  externalId?: string;
  error?: string;
}

class PublishService {
  /**
   * Publish a document to an external platform
   */
  async publish(
    orgId: string,
    taskId: string,
    docId: string,
    config: PublishConfig
  ): Promise<PublishResult> {
    const doc = await documentRepository.findById(orgId, docId);
    if (!doc) {
      throw new ValidationError('Document not found');
    }

    if (!doc.approvedAt) {
      throw new ValidationError('Document must be approved before publishing');
    }

    const task = await taskRepository.findById(orgId, taskId);
    if (!task) {
      throw new ValidationError('Task not found');
    }

    let result: PublishResult;

    switch (config.platform) {
      case 'confluence':
        result = await this.publishToConfluence(doc, task, config);
        break;
      case 'notion':
        result = await this.publishToNotion(doc, task, config);
        break;
      case 'webhook':
        result = await this.publishToWebhook(doc, task, config);
        break;
      default:
        throw new ValidationError(`Unsupported platform: ${config.platform}`);
    }

    if (result.success) {
      // Update task status to PUBLISHED
      await taskRepository.update(orgId, taskId, { status: 'PUBLISHED' });

      // Update document with publish info
      await documentRepository.setExported(orgId, docId, config.platform, result.url);

      logger.info(
        { orgId, taskId, docId, platform: config.platform, url: result.url },
        'Document published'
      );
    }

    return result;
  }

  /**
   * Publish to Confluence (stub implementation)
   */
  private async publishToConfluence(
    doc: { title: string; contentJson: Record<string, unknown> },
    task: { title: string },
    config: PublishConfig
  ): Promise<PublishResult> {
    // In a real implementation, this would:
    // 1. Use the Confluence REST API
    // 2. Create or update a page in the specified space
    // 3. Convert the document JSON to Confluence storage format

    if (!config.confluenceBaseUrl || !config.confluenceSpaceKey) {
      return {
        success: false,
        platform: 'confluence',
        error: 'Confluence base URL and space key are required',
      };
    }

    if (!config.apiToken) {
      return {
        success: false,
        platform: 'confluence',
        error: 'Confluence API token is required',
      };
    }

    // Stub: Simulate API call
    logger.info({ title: doc.title, space: config.confluenceSpaceKey }, 'Would publish to Confluence');

    // Return mock success
    const mockPageId = `mock-${Date.now()}`;
    return {
      success: true,
      platform: 'confluence',
      url: `${config.confluenceBaseUrl}/wiki/spaces/${config.confluenceSpaceKey}/pages/${mockPageId}`,
      externalId: mockPageId,
    };
  }

  /**
   * Publish to Notion (stub implementation)
   */
  private async publishToNotion(
    doc: { title: string; contentJson: Record<string, unknown> },
    task: { title: string },
    config: PublishConfig
  ): Promise<PublishResult> {
    // In a real implementation, this would:
    // 1. Use the Notion API
    // 2. Create a page in the specified database
    // 3. Convert the document JSON to Notion blocks

    if (!config.notionDatabaseId) {
      return {
        success: false,
        platform: 'notion',
        error: 'Notion database ID is required',
      };
    }

    if (!config.apiToken) {
      return {
        success: false,
        platform: 'notion',
        error: 'Notion API token is required',
      };
    }

    // Stub: Simulate API call
    logger.info({ title: doc.title, database: config.notionDatabaseId }, 'Would publish to Notion');

    // Return mock success
    const mockPageId = `mock-${Date.now()}`;
    return {
      success: true,
      platform: 'notion',
      url: `https://notion.so/${mockPageId.replace(/-/g, '')}`,
      externalId: mockPageId,
    };
  }

  /**
   * Publish to a custom webhook
   */
  private async publishToWebhook(
    doc: { title: string; contentJson: Record<string, unknown> },
    task: { id: string; title: string; requestText: string },
    config: PublishConfig
  ): Promise<PublishResult> {
    if (!config.webhookUrl) {
      return {
        success: false,
        platform: 'webhook',
        error: 'Webhook URL is required',
      };
    }

    try {
      const payload = {
        event: 'document.published',
        timestamp: new Date().toISOString(),
        task: {
          id: task.id,
          title: task.title,
          requestText: task.requestText,
        },
        document: {
          title: doc.title,
          content: doc.contentJson,
        },
      };

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiToken && { Authorization: `Bearer ${config.apiToken}` }),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return {
          success: false,
          platform: 'webhook',
          error: `Webhook returned ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        platform: 'webhook',
        url: config.webhookUrl,
      };
    } catch (error) {
      return {
        success: false,
        platform: 'webhook',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get content as markdown for publishing
   */
  getMarkdownContent(doc: { title: string; contentJson: Record<string, unknown> }): string {
    const content = (doc.contentJson as { final?: Record<string, unknown> }).final ?? doc.contentJson;
    let markdown = `# ${doc.title}\n\n`;

    if (content && typeof content === 'object') {
      for (const [key, value] of Object.entries(content)) {
        const title = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        markdown += `## ${title.charAt(0).toUpperCase() + title.slice(1)}\n\n`;

        if (Array.isArray(value)) {
          for (const item of value) {
            markdown += `- ${item}\n`;
          }
        } else if (typeof value === 'object' && value !== null) {
          markdown += `${JSON.stringify(value, null, 2)}\n`;
        } else {
          markdown += `${value}\n`;
        }
        markdown += '\n';
      }
    }

    return markdown;
  }
}

export const publishService = new PublishService();
