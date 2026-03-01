/**
 * Attachment Storage Service
 * Handles file upload, storage, thumbnails, and security
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import {
  AttachmentConfig,
  WikiAttachment,
  AttachmentTooLargeError,
  InvalidFileTypeError,
  StorageQuotaExceededError,
  AttachmentStorageInfo
} from '@mcp-tools/core';

export interface FileUpload {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface StoredFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  thumbnailPath?: string;
}

export class AttachmentStorageService {
  private config: AttachmentConfig;
  private uploadsDir: string;
  private thumbnailsDir: string;

  constructor(config: AttachmentConfig, baseUploadDir: string = './uploads') {
    this.config = config;
    this.uploadsDir = path.join(baseUploadDir, 'wiki', 'attachments');
    this.thumbnailsDir = path.join(baseUploadDir, 'wiki', 'thumbnails');
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.uploadsDir);
    await this.ensureDirectoryExists(this.thumbnailsDir);
  }

  /**
   * Store an uploaded file
   */
  async storeFile(
    upload: FileUpload,
    pageId: number,
    existingAttachments: WikiAttachment[] = []
  ): Promise<StoredFile> {
    // Validate file
    this.validateFile(upload);
    await this.validateStorageQuota(upload.size, pageId, existingAttachments);

    // Generate unique filename
    const fileId = uuidv4();
    const ext = this.getFileExtension(upload.originalName);
    const filename = `${fileId}${ext}`;
    
    // Create date-based directory structure
    const now = new Date();
    const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fileDir = path.join(this.uploadsDir, yearMonth);
    const thumbnailDir = path.join(this.thumbnailsDir, yearMonth);
    
    await this.ensureDirectoryExists(fileDir);
    
    // Store file
    const filePath = path.join(fileDir, filename);
    const relativePath = path.join('wiki', 'attachments', yearMonth, filename);
    
    await fs.writeFile(filePath, upload.buffer);

    // Generate thumbnail for images
    let thumbnailPath: string | undefined;
    if (this.config.generateThumbnails && this.isImageMimeType(upload.mimeType)) {
      thumbnailPath = await this.generateThumbnail(
        upload.buffer,
        thumbnailDir,
        `${fileId}_thumb.jpg`,
        yearMonth
      );
    }

    return {
      id: fileId,
      filename,
      originalName: upload.originalName,
      mimeType: upload.mimeType,
      size: upload.size,
      storagePath: relativePath,
      thumbnailPath
    };
  }

  /**
   * Delete a file and its thumbnail
   */
  private resolveUploadPath(relativePath: string): string {
    const uploadsBase = path.resolve(process.cwd(), 'uploads');
    const resolved = path.resolve(uploadsBase, relativePath);
    if (!resolved.startsWith(uploadsBase + path.sep) && resolved !== uploadsBase) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async deleteFile(attachment: WikiAttachment): Promise<void> {
    const fullPath = this.resolveUploadPath(attachment.storage_path);

    try {
      await fs.unlink(fullPath);
    } catch (error) {
      console.warn(`Failed to delete file: ${fullPath}`, error);
    }

    if (attachment.thumbnail_path) {
      const thumbnailFullPath = this.resolveUploadPath(attachment.thumbnail_path);
      try {
        await fs.unlink(thumbnailFullPath);
      } catch (error) {
        console.warn(`Failed to delete thumbnail: ${thumbnailFullPath}`, error);
      }
    }
  }

  /**
   * Get file stream for download
   */
  async getFileStream(attachment: WikiAttachment): Promise<NodeJS.ReadableStream> {
    const fullPath = this.resolveUploadPath(attachment.storage_path);
    return (await import('fs')).createReadStream(fullPath);
  }

  /**
   * Get thumbnail stream
   */
  async getThumbnailStream(attachment: WikiAttachment): Promise<NodeJS.ReadableStream | null> {
    if (!attachment.thumbnail_path) {
      return null;
    }
    
    const fullPath = this.resolveUploadPath(attachment.thumbnail_path);
    try {
      return (await import('fs')).createReadStream(fullPath);
    } catch {
      return null;
    }
  }

  /**
   * Calculate storage info for a page
   */
  async getStorageInfo(pageAttachments: WikiAttachment[]): Promise<AttachmentStorageInfo> {
    const totalSize = pageAttachments.reduce((sum, att) => sum + att.size_bytes, 0);
    const totalFiles = pageAttachments.length;
    const quotaUsed = (totalSize / this.config.storageQuotaPerPage) * 100;

    return {
      totalSize,
      totalFiles,
      quotaUsed,
      quotaLimit: this.config.storageQuotaPerPage
    };
  }

  /**
   * Clean up unused attachments (utility method)
   */
  async cleanupUnusedAttachments(validAttachments: WikiAttachment[]): Promise<void> {
    // Implementation would scan the upload directories and remove files
    // that don't have corresponding database entries
    // This is a maintenance operation that could be run periodically
    console.log('Cleanup not implemented yet - placeholder for future enhancement');
  }

  // Private helper methods

  private validateFile(upload: FileUpload): void {
    // Check file size
    if (upload.size > this.config.maxFileSize) {
      throw new AttachmentTooLargeError(upload.size, this.config.maxFileSize);
    }

    // Check file type
    if (!this.config.allowedMimeTypes.includes(upload.mimeType)) {
      throw new InvalidFileTypeError(upload.mimeType, this.config.allowedMimeTypes);
    }

    // Additional security checks
    this.validateFileName(upload.originalName);
  }

  private validateFileName(filename: string): void {
    // Prevent path traversal attacks
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new InvalidFileTypeError(filename, ['Safe filenames only']);
    }

    // Check for executable extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.scr'];
    const ext = this.getFileExtension(filename).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      throw new InvalidFileTypeError(ext, ['Non-executable files only']);
    }
  }

  private async validateStorageQuota(
    fileSize: number,
    pageId: number,
    existingAttachments: WikiAttachment[]
  ): Promise<void> {
    const currentUsage = existingAttachments.reduce((sum, att) => sum + att.size_bytes, 0);
    const newTotal = currentUsage + fileSize;

    if (newTotal > this.config.storageQuotaPerPage) {
      throw new StorageQuotaExceededError(newTotal, this.config.storageQuotaPerPage);
    }

    if (existingAttachments.length >= this.config.maxFilesPerPage) {
      throw new StorageQuotaExceededError(
        existingAttachments.length + 1,
        this.config.maxFilesPerPage
      );
    }
  }

  private async generateThumbnail(
    imageBuffer: Buffer,
    thumbnailDir: string,
    thumbnailFilename: string,
    yearMonth: string
  ): Promise<string> {
    await this.ensureDirectoryExists(thumbnailDir);
    
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    const relativeThumbnailPath = path.join('wiki', 'thumbnails', yearMonth, thumbnailFilename);

    try {
      await sharp(imageBuffer)
        .resize(this.config.thumbnailSize, this.config.thumbnailSize, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toFile(thumbnailPath);

      return relativeThumbnailPath;
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
      return '';
    }
  }

  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.substring(lastDot);
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
}