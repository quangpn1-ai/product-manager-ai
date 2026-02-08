import fs from 'fs';
import { promisify } from 'util';
// @ts-ignore - pdf-parse doesn't have types
import pdfParse from 'pdf-parse';

const readFile = promisify(fs.readFile);

// Token estimation: ~4 characters per token for English text
const CHARS_PER_TOKEN = 4;
const MAX_CONTENT_TOKENS = 8000; // Max tokens to extract from a document
const MAX_CONTENT_CHARS = MAX_CONTENT_TOKENS * CHARS_PER_TOKEN;

export interface ParsedDocument {
  text: string;
  estimatedTokens: number;
  metadata: {
    title?: string;
    author?: string;
    pages?: number;
    createdAt?: Date;
  };
}

class DocumentParsingService {
  /**
   * Parse document and extract text content
   */
  async parseDocument(filePath: string, fileType: string): Promise<ParsedDocument> {
    switch (fileType.toLowerCase()) {
      case 'md':
      case 'txt':
        return this.parseTextFile(filePath);
      case 'pdf':
        return this.parsePdfFile(filePath);
      case 'docx':
        // TODO: Implement DOCX parsing in Phase 2
        throw new Error('DOCX parsing not yet implemented');
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Parse text-based files (MD, TXT)
   */
  private async parseTextFile(filePath: string): Promise<ParsedDocument> {
    const content = await readFile(filePath, 'utf-8');
    const text = this.truncateToMaxTokens(content);

    return {
      text,
      estimatedTokens: this.estimateTokens(text),
      metadata: {},
    };
  }

  /**
   * Parse PDF files
   */
  private async parsePdfFile(filePath: string): Promise<ParsedDocument> {
    const dataBuffer = await readFile(filePath);

    try {
      const data = await pdfParse(dataBuffer);
      const text = this.truncateToMaxTokens(data.text);

      return {
        text,
        estimatedTokens: this.estimateTokens(text),
        metadata: {
          title: data.info?.Title,
          author: data.info?.Author,
          pages: data.numpages,
          createdAt: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate token count from text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Truncate text to max tokens
   */
  private truncateToMaxTokens(text: string): string {
    if (text.length <= MAX_CONTENT_CHARS) {
      return text;
    }

    // Truncate at a word boundary
    const truncated = text.slice(0, MAX_CONTENT_CHARS);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > MAX_CONTENT_CHARS * 0.9) {
      return truncated.slice(0, lastSpace) + '\n\n[Content truncated due to length...]';
    }

    return truncated + '\n\n[Content truncated due to length...]';
  }

  /**
   * Summarize document content (placeholder for future AI summarization)
   */
  async summarizeDocument(text: string, maxTokens: number = 500): Promise<string> {
    // For Phase 1, just truncate
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    if (text.length <= maxChars) {
      return text;
    }

    // Smart truncation: try to keep complete sentences
    const truncated = text.slice(0, maxChars);
    const lastPeriod = truncated.lastIndexOf('.');

    if (lastPeriod > maxChars * 0.7) {
      return truncated.slice(0, lastPeriod + 1) + '\n\n[Summary truncated...]';
    }

    return truncated + '...';
  }

  /**
   * Extract key sections from document (for smarter context injection)
   */
  extractSections(text: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];

    // Simple section detection based on markdown headers
    const lines = text.split('\n');
    let currentSection: { title: string; content: string[] } | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.push({
            title: currentSection.title,
            content: currentSection.content.join('\n').trim(),
          });
        }

        // Start new section
        currentSection = {
          title: headerMatch[2],
          content: [],
        };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections.push({
        title: currentSection.title,
        content: currentSection.content.join('\n').trim(),
      });
    }

    return sections;
  }

  /**
   * Clean and normalize text for AI consumption
   */
  cleanText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Remove invisible characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Trim each line
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Final trim
      .trim();
  }
}

export const documentParsingService = new DocumentParsingService();
