import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { config } from '../config/index.js';

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

// Base upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

// Allowed file types
const ALLOWED_TYPES = ['md', 'pdf', 'txt', 'docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface UploadResult {
  filePath: string;
  fileType: string;
  fileSize: number;
  originalName: string;
}

class FileUploadService {
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await access(dirPath);
    } catch {
      await mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Get the storage path for a project's documents
   */
  getProjectPath(orgId: string, projectId: string): string {
    return path.join(UPLOAD_DIR, orgId, projectId);
  }

  /**
   * Save uploaded file to disk
   */
  async saveFile(
    buffer: Buffer,
    originalName: string,
    orgId: string,
    projectId: string
  ): Promise<UploadResult> {
    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    // Get file extension
    const ext = path.extname(originalName).toLowerCase().slice(1);
    if (!ALLOWED_TYPES.includes(ext)) {
      throw new Error(`File type .${ext} is not supported. Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    }

    // Create directory
    const projectPath = this.getProjectPath(orgId, projectId);
    await this.ensureDirectory(projectPath);

    // Generate unique filename
    const timestamp = Date.now();
    const safeBaseName = path
      .basename(originalName, path.extname(originalName))
      .replace(/[^a-z0-9_-]/gi, '_')
      .slice(0, 100);
    const fileName = `${safeBaseName}_${timestamp}.${ext}`;
    const filePath = path.join(projectPath, fileName);

    // Write file
    await fs.promises.writeFile(filePath, buffer);

    // Get file stats
    const stats = await stat(filePath);

    return {
      filePath: filePath,
      fileType: ext,
      fileSize: stats.size,
      originalName,
    };
  }

  /**
   * Read file content
   */
  async readFile(filePath: string): Promise<Buffer> {
    return readFile(filePath);
  }

  /**
   * Delete file from disk
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(filePath: string): Promise<{ size: number; createdAt: Date; modifiedAt: Date } | null> {
    try {
      const stats = await stat(filePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get relative storage path (for database storage)
   */
  getRelativePath(filePath: string): string {
    return path.relative(UPLOAD_DIR, filePath);
  }

  /**
   * Get absolute path from relative path
   */
  getAbsolutePath(relativePath: string): string {
    return path.join(UPLOAD_DIR, relativePath);
  }

  /**
   * Get MIME type for file extension
   */
  getMimeType(fileType: string): string {
    const mimeTypes: Record<string, string> = {
      md: 'text/markdown',
      pdf: 'application/pdf',
      txt: 'text/plain',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[fileType] || 'application/octet-stream';
  }
}

export const fileUploadService = new FileUploadService();
