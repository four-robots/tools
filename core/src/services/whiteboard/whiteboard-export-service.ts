import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { JSDOM } from 'jsdom';

/**
 * Export format types with comprehensive options
 */
export const ExportFormat = z.enum(['pdf', 'png', 'jpeg', 'svg', 'json', 'markdown', 'zip']);
export type ExportFormat = z.infer<typeof ExportFormat>;

export const ExportQuality = z.enum(['low', 'medium', 'high', 'ultra']);
export type ExportQuality = z.infer<typeof ExportQuality>;

export const PaperSize = z.enum(['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid', 'Custom']);
export type PaperSize = z.infer<typeof PaperSize>;

export const ExportOrientation = z.enum(['portrait', 'landscape']);
export type ExportOrientation = z.infer<typeof ExportOrientation>;

/**
 * Export options for different formats
 */
export const PdfExportOptions = z.object({
  format: z.literal('pdf'),
  paperSize: PaperSize.default('A4'),
  orientation: ExportOrientation.default('portrait'),
  customSize: z.object({
    width: z.number().min(100),
    height: z.number().min(100),
  }).optional(),
  margins: z.object({
    top: z.number().min(0).default(20),
    right: z.number().min(0).default(20),
    bottom: z.number().min(0).default(20),
    left: z.number().min(0).default(20),
  }).default({}),
  includeMetadata: z.boolean().default(true),
  embedFonts: z.boolean().default(true),
  vectorGraphics: z.boolean().default(true),
  backgroundTransparent: z.boolean().default(false),
});
export type PdfExportOptions = z.infer<typeof PdfExportOptions>;

export const PngExportOptions = z.object({
  format: z.literal('png'),
  quality: ExportQuality.default('high'),
  scale: z.number().min(0.5).max(4).default(1),
  width: z.number().min(100).optional(),
  height: z.number().min(100).optional(),
  dpi: z.number().min(72).max(600).default(300),
  backgroundTransparent: z.boolean().default(true),
});
export type PngExportOptions = z.infer<typeof PngExportOptions>;

export const JpegExportOptions = z.object({
  format: z.literal('jpeg'),
  quality: ExportQuality.default('high'),
  scale: z.number().min(0.5).max(4).default(1),
  width: z.number().min(100).optional(),
  height: z.number().min(100).optional(),
  dpi: z.number().min(72).max(600).default(300),
  compression: z.number().min(0).max(100).default(90),
  backgroundTransparent: z.boolean().default(false), // JPEG doesn't support transparency
});
export type JpegExportOptions = z.infer<typeof JpegExportOptions>;

// Legacy type for backward compatibility
export type ImageExportOptions = PngExportOptions | JpegExportOptions;

export const SvgExportOptions = z.object({
  format: z.literal('svg'),
  embedStyles: z.boolean().default(true),
  embedFonts: z.boolean().default(true),
  minifyOutput: z.boolean().default(false),
  includeViewbox: z.boolean().default(true),
  preserveAspectRatio: z.boolean().default(true),
  backgroundTransparent: z.boolean().default(true),
});
export type SvgExportOptions = z.infer<typeof SvgExportOptions>;

export const JsonExportOptions = z.object({
  format: z.literal('json'),
  includeMetadata: z.boolean().default(true),
  includeHistory: z.boolean().default(false),
  includeComments: z.boolean().default(true),
  includePermissions: z.boolean().default(false),
  prettyPrint: z.boolean().default(true),
  compress: z.boolean().default(false),
});
export type JsonExportOptions = z.infer<typeof JsonExportOptions>;

export const MarkdownExportOptions = z.object({
  format: z.literal('markdown'),
  includeImages: z.boolean().default(true),
  includeMetadata: z.boolean().default(true),
  includeComments: z.boolean().default(true),
  exportImageFormat: z.enum(['png', 'svg']).default('png'),
  imageQuality: ExportQuality.default('medium'),
});
export type MarkdownExportOptions = z.infer<typeof MarkdownExportOptions>;

export const ZipExportOptions = z.object({
  format: z.literal('zip'),
  includeFormats: z.array(ExportFormat).min(1).default(['json', 'png']),
  compressionLevel: z.number().min(0).max(9).default(6),
  includeDirectory: z.boolean().default(true),
});
export type ZipExportOptions = z.infer<typeof ZipExportOptions>;

export const ExportOptions = z.discriminatedUnion('format', [
  PdfExportOptions,
  PngExportOptions,
  JpegExportOptions,
  SvgExportOptions,
  JsonExportOptions,
  MarkdownExportOptions,
  ZipExportOptions,
]);
export type ExportOptions = z.infer<typeof ExportOptions>;

/**
 * Export job status and result types
 */
export const ExportJobStatus = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);
export type ExportJobStatus = z.infer<typeof ExportJobStatus>;

export const ExportJob = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  operationType: ExportFormat,
  status: ExportJobStatus,
  progress: z.number().min(0).max(100).default(0),
  fileSize: z.number().optional(),
  filePath: z.string().optional(),
  downloadUrl: z.string().optional(),
  fileMetadata: z.record(z.string(), z.any()).default({}),
  jobOptions: z.record(z.string(), z.any()).default({}),
  errorMessage: z.string().optional(),
  errorDetails: z.record(z.string(), z.any()).optional(),
  processingTimeMs: z.number().optional(),
  expiresAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ExportJob = z.infer<typeof ExportJob>;

export const ExportResult = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),
  filePath: z.string().optional(),
  downloadUrl: z.string().optional(),
  fileSize: z.number().optional(),
  metadata: z.record(z.string(), z.any()).default({}),
  processingTimeMs: z.number(),
  errorMessage: z.string().optional(),
});
export type ExportResult = z.infer<typeof ExportResult>;

/**
 * Export request types
 */
export const CreateExportJobRequest = z.object({
  whiteboardId: z.string().uuid(),
  format: ExportFormat,
  options: ExportOptions.optional(),
  filename: z.string().optional(),
  expiresInHours: z.number().min(1).max(168).default(24), // 1-168 hours (1 week)
});
export type CreateExportJobRequest = z.infer<typeof CreateExportJobRequest>;

/**
 * Whiteboard Export Service
 * 
 * Provides comprehensive export functionality for whiteboards in multiple formats:
 * - PDF: Vector-based with proper scaling and fonts
 * - Images: PNG/JPEG with configurable quality and resolution
 * - SVG: Standards-compliant vector format
 * - JSON: Complete data preservation
 * - Markdown: Documentation-friendly format
 * - ZIP: Batch export with multiple formats
 */
export class WhiteboardExportService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardExportService');
  }

  /**
   * Create a new export job
   */
  async createExportJob(
    userId: string,
    request: CreateExportJobRequest
  ): Promise<ExportJob> {
    try {
      // Validate user has access to the whiteboard
      await this.validateWhiteboardAccess(request.whiteboardId, userId);

      const jobId = randomUUID();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (request.expiresInHours * 60 * 60 * 1000)).toISOString();

      const query = `
        INSERT INTO whiteboard_export_import_jobs (
          id, whiteboard_id, user_id, job_type, operation_type, status,
          file_metadata, job_options, expires_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        jobId,
        request.whiteboardId,
        userId,
        'export',
        request.format,
        'pending',
        JSON.stringify({
          filename: request.filename,
          originalRequest: request,
        }),
        JSON.stringify(request.options || {}),
        expiresAt,
        now,
        now,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create export job');
      }

      const job = this.mapDatabaseRowToJob(result.rows[0]);
      
      this.logger.info('Export job created', { 
        jobId, 
        whiteboardId: request.whiteboardId, 
        format: request.format,
        userId 
      });

      // Start processing asynchronously
      this.processExportJob(job).catch(error => {
        this.logger.error('Export job processing failed', { error, jobId });
        this.updateJobStatus(jobId, 'failed', 0, error instanceof Error ? error.message : String(error));
      });

      return job;
    } catch (error) {
      this.logger.error('Failed to create export job', { error, request, userId });
      throw error;
    }
  }

  /**
   * Get export job by ID
   */
  async getExportJob(jobId: string, userId: string): Promise<ExportJob | null> {
    try {
      const query = `
        SELECT * FROM whiteboard_export_import_jobs
        WHERE id = $1 AND user_id = $2 AND job_type = 'export'
      `;

      const result = await this.db.query(query, [jobId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToJob(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get export job', { error, jobId, userId });
      throw error;
    }
  }

  /**
   * Get all export jobs for a user
   */
  async getUserExportJobs(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ jobs: ExportJob[]; total: number }> {
    try {
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_export_import_jobs
        WHERE user_id = $1 AND job_type = 'export'
      `;

      const dataQuery = `
        SELECT * FROM whiteboard_export_import_jobs
        WHERE user_id = $1 AND job_type = 'export'
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const [countResult, dataResult] = await Promise.all([
        this.db.query(countQuery, [userId]),
        this.db.query(dataQuery, [userId, limit, offset])
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const jobs = dataResult.rows.map(row => this.mapDatabaseRowToJob(row));

      return { jobs, total };
    } catch (error) {
      this.logger.error('Failed to get user export jobs', { error, userId });
      throw error;
    }
  }

  /**
   * Cancel an export job
   */
  async cancelExportJob(jobId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE whiteboard_export_import_jobs
        SET status = 'cancelled', updated_at = $1
        WHERE id = $2 AND user_id = $3 AND job_type = 'export' 
        AND status IN ('pending', 'processing')
      `;

      const result = await this.db.query(query, [new Date().toISOString(), jobId, userId]);
      
      const cancelled = result.rowCount > 0;
      if (cancelled) {
        this.logger.info('Export job cancelled', { jobId, userId });
      }

      return cancelled;
    } catch (error) {
      this.logger.error('Failed to cancel export job', { error, jobId, userId });
      throw error;
    }
  }

  /**
   * Clean up expired export jobs and files
   */
  async cleanupExpiredJobs(): Promise<{ deletedJobs: number; deletedFiles: number }> {
    try {
      const now = new Date().toISOString();
      
      // Get expired jobs with file paths
      const expiredQuery = `
        SELECT id, file_path FROM whiteboard_export_import_jobs
        WHERE job_type = 'export' AND expires_at < $1
      `;

      const expiredResult = await this.db.query(expiredQuery, [now]);
      const expiredJobs = expiredResult.rows;

      if (expiredJobs.length === 0) {
        return { deletedJobs: 0, deletedFiles: 0 };
      }

      // Delete files from filesystem
      let deletedFiles = 0;
      for (const job of expiredJobs) {
        if (job.file_path) {
          try {
            await this.deleteFile(job.file_path);
            deletedFiles++;
          } catch (error) {
            this.logger.warn('Failed to delete expired export file', { 
              error, 
              jobId: job.id, 
              filePath: job.file_path 
            });
          }
        }
      }

      // Delete job records
      const deleteQuery = `
        DELETE FROM whiteboard_export_import_jobs
        WHERE job_type = 'export' AND expires_at < $1
      `;

      const deleteResult = await this.db.query(deleteQuery, [now]);
      const deletedJobs = deleteResult.rowCount || 0;

      this.logger.info('Cleaned up expired export jobs', { deletedJobs, deletedFiles });

      return { deletedJobs, deletedFiles };
    } catch (error) {
      this.logger.error('Failed to cleanup expired jobs', { error });
      throw error;
    }
  }

  // Private methods

  /**
   * Process an export job asynchronously
   */
  private async processExportJob(job: ExportJob): Promise<void> {
    const startTime = Date.now();
    const jobId = job.id;

    try {
      // Update job status to processing
      await this.updateJobStatus(jobId, 'processing', 0);

      // Get whiteboard data
      const whiteboard = await this.getWhiteboardForExport(job.whiteboardId, job.userId);
      if (!whiteboard) {
        throw new Error('Whiteboard not found or access denied');
      }

      await this.updateJobProgress(jobId, 20, 'Loading whiteboard data...');

      // Process based on format
      let result: ExportResult;
      switch (job.operationType) {
        case 'pdf':
          result = await this.exportToPdf(whiteboard, job);
          break;
        case 'png':
        case 'jpeg':
          result = await this.exportToImage(whiteboard, job);
          break;
        case 'svg':
          result = await this.exportToSvg(whiteboard, job);
          break;
        case 'json':
          result = await this.exportToJson(whiteboard, job);
          break;
        case 'markdown':
          result = await this.exportToMarkdown(whiteboard, job);
          break;
        case 'zip':
          result = await this.exportToZip(whiteboard, job);
          break;
        default:
          throw new Error(`Unsupported export format: ${job.operationType}`);
      }

      await this.updateJobProgress(jobId, 90, 'Finalizing export...');

      // Generate download URL
      const downloadUrl = await this.generateDownloadUrl(result.filePath!, job.id);

      // Update job with completion
      const processingTimeMs = Date.now() - startTime;
      await this.completeExportJob(jobId, {
        filePath: result.filePath!,
        downloadUrl,
        fileSize: result.fileSize!,
        metadata: result.metadata,
        processingTimeMs,
      });

      this.logger.info('Export job completed successfully', { 
        jobId, 
        format: job.operationType,
        processingTimeMs,
        fileSize: result.fileSize 
      });

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      await this.updateJobStatus(jobId, 'failed', 0, error instanceof Error ? error.message : String(error), { processingTimeMs });
      
      this.logger.error('Export job failed', { 
        error, 
        jobId, 
        format: job.operationType,
        processingTimeMs 
      });
      throw error;
    }
  }

  /**
   * Export whiteboard to PDF format
   */
  private async exportToPdf(whiteboard: any, job: ExportJob): Promise<ExportResult> {
    await this.updateJobProgress(job.id, 30, 'Generating PDF...');
    
    const options = job.jobOptions as PdfExportOptions | undefined;
    const startTime = Date.now();

    try {
      // Generate unique filename
      const filename = this.generateFilename(whiteboard.name, 'pdf');
      const filePath = await this.getExportFilePath(job.id, filename);

      // Mock PDF generation (in real implementation, use puppeteer, jsPDF, or similar)
      const pdfContent = await this.generatePdfContent(whiteboard, options);
      await this.writeFile(filePath, pdfContent);

      await this.updateJobProgress(job.id, 80, 'PDF generation complete');

      const fileSize = await this.getFileSize(filePath);
      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        filePath,
        fileSize,
        metadata: {
          format: 'pdf',
          pages: 1,
          vectorGraphics: options?.vectorGraphics || true,
          paperSize: options?.paperSize || 'A4',
          orientation: options?.orientation || 'portrait',
        },
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('PDF export failed', { error, jobId: job.id });
      throw new Error(`PDF export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export whiteboard to image format (PNG/JPEG)
   */
  private async exportToImage(whiteboard: any, job: ExportJob): Promise<ExportResult> {
    await this.updateJobProgress(job.id, 30, 'Generating image...');
    
    const options = job.jobOptions as ImageExportOptions | undefined;
    const format = job.operationType as 'png' | 'jpeg';
    const startTime = Date.now();

    try {
      const filename = this.generateFilename(whiteboard.name, format);
      const filePath = await this.getExportFilePath(job.id, filename);

      // Mock image generation (in real implementation, use sharp, canvas, or puppeteer)
      const imageBuffer = await this.generateImageContent(whiteboard, options, format);
      await this.writeFile(filePath, imageBuffer);

      await this.updateJobProgress(job.id, 80, 'Image generation complete');

      const fileSize = await this.getFileSize(filePath);
      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        filePath,
        fileSize,
        metadata: {
          format,
          quality: options?.quality || 'high',
          scale: options?.scale || 1,
          dpi: options?.dpi || 300,
          transparent: format === 'png' && (options?.backgroundTransparent ?? true),
        },
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('Image export failed', { error, jobId: job.id });
      throw new Error(`Image export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export whiteboard to SVG format
   */
  private async exportToSvg(whiteboard: any, job: ExportJob): Promise<ExportResult> {
    await this.updateJobProgress(job.id, 30, 'Generating SVG...');
    
    const options = job.jobOptions as SvgExportOptions | undefined;
    const startTime = Date.now();

    try {
      const filename = this.generateFilename(whiteboard.name, 'svg');
      const filePath = await this.getExportFilePath(job.id, filename);

      const svgContent = await this.generateSvgContent(whiteboard, options);
      await this.writeFile(filePath, svgContent);

      await this.updateJobProgress(job.id, 80, 'SVG generation complete');

      const fileSize = await this.getFileSize(filePath);
      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        filePath,
        fileSize,
        metadata: {
          format: 'svg',
          vectorFormat: true,
          embedStyles: options?.embedStyles || true,
          embedFonts: options?.embedFonts || true,
        },
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('SVG export failed', { error, jobId: job.id });
      throw new Error(`SVG export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export whiteboard to JSON format
   */
  private async exportToJson(whiteboard: any, job: ExportJob): Promise<ExportResult> {
    await this.updateJobProgress(job.id, 30, 'Generating JSON...');
    
    const options = job.jobOptions as JsonExportOptions | undefined;
    const startTime = Date.now();

    try {
      const filename = this.generateFilename(whiteboard.name, 'json');
      const filePath = await this.getExportFilePath(job.id, filename);

      const jsonData = await this.generateJsonContent(whiteboard, options);
      const jsonContent = options?.prettyPrint 
        ? JSON.stringify(jsonData, null, 2)
        : JSON.stringify(jsonData);

      await this.writeFile(filePath, jsonContent);

      await this.updateJobProgress(job.id, 80, 'JSON export complete');

      const fileSize = await this.getFileSize(filePath);
      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        filePath,
        fileSize,
        metadata: {
          format: 'json',
          includeMetadata: options?.includeMetadata || true,
          includeComments: options?.includeComments || true,
          includeHistory: options?.includeHistory || false,
          compressed: options?.compress || false,
        },
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('JSON export failed', { error, jobId: job.id });
      throw new Error(`JSON export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export whiteboard to Markdown format
   */
  private async exportToMarkdown(whiteboard: any, job: ExportJob): Promise<ExportResult> {
    await this.updateJobProgress(job.id, 30, 'Generating Markdown...');
    
    const options = job.jobOptions as MarkdownExportOptions | undefined;
    const startTime = Date.now();

    try {
      const filename = this.generateFilename(whiteboard.name, 'md');
      const filePath = await this.getExportFilePath(job.id, filename);

      const markdownContent = await this.generateMarkdownContent(whiteboard, options);
      await this.writeFile(filePath, markdownContent);

      await this.updateJobProgress(job.id, 80, 'Markdown export complete');

      const fileSize = await this.getFileSize(filePath);
      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        filePath,
        fileSize,
        metadata: {
          format: 'markdown',
          includeImages: options?.includeImages || true,
          includeComments: options?.includeComments || true,
          imageFormat: options?.exportImageFormat || 'png',
        },
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('Markdown export failed', { error, jobId: job.id });
      throw new Error(`Markdown export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export whiteboard to ZIP archive
   */
  private async exportToZip(whiteboard: any, job: ExportJob): Promise<ExportResult> {
    await this.updateJobProgress(job.id, 30, 'Creating ZIP archive...');
    
    const options = job.jobOptions as ZipExportOptions | undefined;
    const startTime = Date.now();

    try {
      const filename = this.generateFilename(whiteboard.name, 'zip');
      const filePath = await this.getExportFilePath(job.id, filename);

      // Generate multiple formats and create ZIP
      const archiveContent = await this.generateZipArchive(whiteboard, options);
      await this.writeFile(filePath, archiveContent);

      await this.updateJobProgress(job.id, 80, 'ZIP archive complete');

      const fileSize = await this.getFileSize(filePath);
      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        filePath,
        fileSize,
        metadata: {
          format: 'zip',
          includedFormats: options?.includeFormats || ['json', 'png'],
          compressionLevel: options?.compressionLevel || 6,
        },
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('ZIP export failed', { error, jobId: job.id });
      throw new Error(`ZIP export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Utility methods (mock implementations - replace with actual file operations)

  private async validateWhiteboardAccess(whiteboardId: string, userId: string): Promise<void> {
    const query = `
      SELECT 1 FROM whiteboards w
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id AND wp.user_id = $2
      WHERE w.id = $1 AND w.deleted_at IS NULL
      AND (w.created_by = $2 OR w.visibility = 'public' OR wp.id IS NOT NULL)
    `;

    const result = await this.db.query(query, [whiteboardId, userId]);
    if (result.rows.length === 0) {
      throw new Error('Whiteboard not found or access denied');
    }
  }

  private async getWhiteboardForExport(whiteboardId: string, userId: string): Promise<any> {
    const query = `
      SELECT w.*, 
             COALESCE(json_agg(
               json_build_object(
                 'id', we.id,
                 'elementType', we.element_type,
                 'elementData', we.element_data,
                 'layerIndex', we.layer_index,
                 'styleData', we.style_data,
                 'metadata', we.metadata
               ) ORDER BY we.layer_index, we.created_at
             ) FILTER (WHERE we.id IS NOT NULL), '[]'::json) as elements
      FROM whiteboards w
      LEFT JOIN whiteboard_elements we ON w.id = we.whiteboard_id AND we.deleted_at IS NULL
      WHERE w.id = $1 AND w.deleted_at IS NULL
      GROUP BY w.id
    `;

    const result = await this.db.query(query, [whiteboardId]);
    if (result.rows.length === 0) {
      throw new Error('Whiteboard not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name || 'Untitled Whiteboard',
      description: row.description,
      elements: row.elements || [],
      canvasData: typeof row.canvas_data === 'string' ? JSON.parse(row.canvas_data) : (row.canvas_data || {}),
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private generateFilename(whiteboardName: string, extension: string): string {
    const sanitized = whiteboardName.replace(/[^a-zA-Z0-9-_\s]/g, '').replace(/\s+/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];
    return `${sanitized}_${timestamp}.${extension}`;
  }

  private async getExportFilePath(jobId: string, filename: string): Promise<string> {
    const exportDir = process.env.EXPORT_DIR || '/tmp/exports';
    const jobDir = path.join(exportDir, jobId);
    
    // Ensure directory exists
    await fs.mkdir(jobDir, { recursive: true });
    
    return path.join(jobDir, filename);
  }

  private async generateDownloadUrl(filePath: string, jobId: string): Promise<string> {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    const filename = path.basename(filePath);
    return `${baseUrl}/api/v1/exports/${jobId}/download/${filename}`;
  }

  /**
   * Generate PDF content using Puppeteer for rendering whiteboard
   */
  private async generatePdfContent(whiteboard: any, options?: PdfExportOptions): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Set viewport size
      const paperSize = options?.paperSize || 'A4';
      const orientation = options?.orientation || 'portrait';
      
      const dimensions = this.getPaperDimensions(paperSize, orientation);
      await page.setViewport({ width: dimensions.width, height: dimensions.height });

      // Generate HTML content for the whiteboard
      const htmlContent = this.generateWhiteboardHtml(whiteboard, options);
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfOptions: any = {
        format: paperSize !== 'Custom' ? paperSize : undefined,
        landscape: orientation === 'landscape',
        printBackground: !options?.backgroundTransparent,
        margin: {
          top: `${options?.margins?.top || 20}px`,
          right: `${options?.margins?.right || 20}px`,
          bottom: `${options?.margins?.bottom || 20}px`,
          left: `${options?.margins?.left || 20}px`,
        },
      };

      if (paperSize === 'Custom' && options?.customSize) {
        pdfOptions.width = `${options.customSize.width}px`;
        pdfOptions.height = `${options.customSize.height}px`;
      }

      const pdfBuffer = await page.pdf(pdfOptions);
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate image content using Puppeteer + Sharp for high-quality rendering
   */
  private async generateImageContent(whiteboard: any, options?: ImageExportOptions, format: 'png' | 'jpeg' = 'png'): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Calculate dimensions
      const scale = options?.scale || 1;
      const baseWidth = options?.width || 1920;
      const baseHeight = options?.height || 1080;
      const width = Math.floor(baseWidth * scale);
      const height = Math.floor(baseHeight * scale);
      
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      // Generate HTML content
      const htmlContent = this.generateWhiteboardHtml(whiteboard, { backgroundTransparent: options?.backgroundTransparent });
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Take screenshot
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: true,
        omitBackground: options?.backgroundTransparent || false,
      });

      // Process with Sharp for optimal quality and format conversion
      let imageProcessor = sharp(screenshotBuffer);

      if (options?.dpi && options.dpi !== 72) {
        const scaleFactor = options.dpi / 72;
        imageProcessor = imageProcessor.resize({
          width: Math.floor(width * scaleFactor),
          height: Math.floor(height * scaleFactor),
          kernel: sharp.kernel.lanczos3
        });
      }

      if (format === 'jpeg') {
        const quality = this.getQualityValue(options?.quality || 'high');
        const compression = (options as any)?.compression || 90;
        imageProcessor = imageProcessor.jpeg({ 
          quality: Math.floor(compression),
          progressive: true,
          mozjpeg: true
        });
      } else {
        const quality = this.getQualityValue(options?.quality || 'high');
        imageProcessor = imageProcessor.png({ 
          compressionLevel: Math.floor(9 - (quality / 100) * 9),
          progressive: true
        });
      }

      return await imageProcessor.toBuffer();
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate SVG content with proper whiteboard element rendering
   */
  private async generateSvgContent(whiteboard: any, options?: SvgExportOptions): Promise<string> {
    const { elements = [], canvasData = {} } = whiteboard;
    const dimensions = canvasData.dimensions || { width: 1920, height: 1080 };
    
    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
`;
    
    if (options?.includeViewbox) {
      svgContent += `<svg width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}" xmlns="http://www.w3.org/2000/svg"`;
    } else {
      svgContent += `<svg width="${dimensions.width}" height="${dimensions.height}" xmlns="http://www.w3.org/2000/svg"`;
    }
    
    if (options?.preserveAspectRatio) {
      svgContent += ` preserveAspectRatio="xMidYMid meet"`;
    }
    
    svgContent += `>\n`;

    // Add styles if embedding
    if (options?.embedStyles) {
      svgContent += `  <defs>\n    <style type="text/css">\n`;
      svgContent += `      .whiteboard-element { stroke-width: 2; }\n`;
      svgContent += `      .text-element { font-family: Arial, sans-serif; font-size: 14px; }\n`;
      svgContent += `      .shape-element { stroke: #333; fill: transparent; }\n`;
      svgContent += `    </style>\n  </defs>\n`;
    }

    // Add background if not transparent
    if (!options?.backgroundTransparent) {
      const bgColor = canvasData.backgroundColor || '#ffffff';
      svgContent += `  <rect width="100%" height="100%" fill="${bgColor}"/>\n`;
    }

    // Sort elements by layer index
    const sortedElements = [...elements].sort((a, b) => (a.layerIndex || 0) - (b.layerIndex || 0));

    // Render each element
    for (const element of sortedElements) {
      try {
        const elementSvg = this.generateElementSvg(element, options);
        if (elementSvg) {
          svgContent += `  ${elementSvg}\n`;
        }
      } catch (error) {
        this.logger.warn('Failed to render element in SVG', { elementId: element.id, error });
      }
    }

    svgContent += `</svg>`;

    // Sanitize SVG content
    return this.sanitizeSvgContent(svgContent);
  }

  private async generateJsonContent(whiteboard: any, options?: JsonExportOptions): Promise<any> {
    return {
      whiteboard,
      exportedAt: new Date().toISOString(),
      format: 'json',
    };
  }

  private async generateMarkdownContent(whiteboard: any, options?: MarkdownExportOptions): Promise<string> {
    let markdown = `# ${whiteboard.name}\n\n`;
    
    if (whiteboard.description) {
      markdown += `${whiteboard.description}\n\n`;
    }
    
    if (options?.includeMetadata) {
      markdown += `## Metadata\n\n`;
      markdown += `- **Created:** ${new Date(whiteboard.createdAt).toLocaleDateString()}\n`;
      markdown += `- **Last Modified:** ${new Date(whiteboard.updatedAt).toLocaleDateString()}\n`;
      markdown += `- **Elements:** ${whiteboard.elements?.length || 0}\n\n`;
    }
    
    if (whiteboard.elements && whiteboard.elements.length > 0) {
      markdown += `## Elements\n\n`;
      
      for (const element of whiteboard.elements) {
        try {
          const elementMd = this.generateElementMarkdown(element);
          if (elementMd) {
            markdown += elementMd + '\n\n';
          }
        } catch (error) {
          this.logger.warn('Failed to generate markdown for element', { elementId: element.id, error });
        }
      }
    }
    
    if (options?.includeComments) {
      const comments = await this.getWhiteboardComments(whiteboard.id);
      if (comments.length > 0) {
        markdown += `## Comments\n\n`;
        for (const comment of comments) {
          markdown += `- **${comment.author}** (${new Date(comment.createdAt).toLocaleDateString()}): ${comment.content}\n`;
        }
        markdown += '\n';
      }
    }
    
    markdown += `\n---\n*Exported from MCP Tools on ${new Date().toLocaleDateString()}*\n`;
    
    return markdown;
  }

  /**
   * Generate ZIP archive containing multiple export formats
   */
  private async generateZipArchive(whiteboard: any, options?: ZipExportOptions): Promise<Buffer> {
    const includeFormats = options?.includeFormats || ['json', 'png'];
    const compressionLevel = options?.compressionLevel || 6;
    
    return new Promise(async (resolve, reject) => {
      const archive = archiver('zip', {
        zlib: { level: compressionLevel }
      });
      
      const chunks: Buffer[] = [];
      
      archive.on('data', chunk => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      try {
        // Generate each format and add to archive
        for (const format of includeFormats) {
          let content: Buffer | string;
          let filename: string;
          
          switch (format) {
            case 'pdf':
              content = await this.generatePdfContent(whiteboard);
              filename = `${this.sanitizeFilename(whiteboard.name)}.pdf`;
              break;
            case 'png':
              content = await this.generateImageContent(whiteboard, { quality: 'high' }, 'png');
              filename = `${this.sanitizeFilename(whiteboard.name)}.png`;
              break;
            case 'jpeg':
              content = await this.generateImageContent(whiteboard, { quality: 'high' }, 'jpeg');
              filename = `${this.sanitizeFilename(whiteboard.name)}.jpg`;
              break;
            case 'svg':
              content = await this.generateSvgContent(whiteboard, { embedStyles: true });
              filename = `${this.sanitizeFilename(whiteboard.name)}.svg`;
              break;
            case 'json':
              const jsonData = await this.generateJsonContent(whiteboard);
              content = JSON.stringify(jsonData, null, 2);
              filename = `${this.sanitizeFilename(whiteboard.name)}.json`;
              break;
            case 'markdown':
              content = await this.generateMarkdownContent(whiteboard);
              filename = `${this.sanitizeFilename(whiteboard.name)}.md`;
              break;
            default:
              continue;
          }
          
          if (options?.includeDirectory) {
            filename = `${this.sanitizeFilename(whiteboard.name)}/${filename}`;
          }
          
          archive.append(content, { name: filename });
        }
        
        // Add metadata file
        const metadata = {
          exportedAt: new Date().toISOString(),
          whiteboardId: whiteboard.id,
          whiteboardName: whiteboard.name,
          formats: includeFormats,
          elementCount: whiteboard.elements?.length || 0,
          version: '1.0.0'
        };
        
        const metadataFile = options?.includeDirectory 
          ? `${this.sanitizeFilename(whiteboard.name)}/metadata.json`
          : 'metadata.json';
          
        archive.append(JSON.stringify(metadata, null, 2), { name: metadataFile });
        
        await archive.finalize();
      } catch (error) {
        reject(error);
      }
    });
  }

  // Real file system operations
  private async writeFile(filePath: string, content: string | Buffer): Promise<void> {
    await fs.writeFile(filePath, content);
  }

  private async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Generate secure file hash for integrity verification
   */
  private generateFileHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Sanitize filename for safe file system operations
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9-_\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100); // Limit length
  }

  /**
   * Get paper dimensions for PDF generation
   */
  private getPaperDimensions(paperSize: string, orientation: string): { width: number; height: number } {
    const sizes: Record<string, { width: number; height: number }> = {
      'A4': { width: 595, height: 842 },
      'A3': { width: 842, height: 1191 },
      'A5': { width: 420, height: 595 },
      'Letter': { width: 612, height: 792 },
      'Legal': { width: 612, height: 1008 },
      'Tabloid': { width: 792, height: 1224 },
    };
    
    const size = sizes[paperSize] || sizes['A4'];
    
    if (orientation === 'landscape') {
      return { width: size.height, height: size.width };
    }
    
    return size;
  }

  /**
   * Convert quality enum to numeric value
   */
  private getQualityValue(quality: string): number {
    switch (quality) {
      case 'low': return 25;
      case 'medium': return 50;
      case 'high': return 80;
      case 'ultra': return 95;
      default: return 80;
    }
  }

  // Database operations

  private async updateJobStatus(
    jobId: string, 
    status: ExportJobStatus, 
    progress: number = 0,
    errorMessage?: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const updates: string[] = ['status = $2', 'progress = $3', 'updated_at = $4'];
    const values: any[] = [jobId, status, progress, new Date().toISOString()];
    let valueIndex = 5;

    if (errorMessage) {
      updates.push(`error_message = $${valueIndex++}`);
      values.push(errorMessage);
    }

    if (status === 'processing' && !additionalData?.startedAt) {
      updates.push(`started_at = $${valueIndex++}`);
      values.push(new Date().toISOString());
    }

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        updates.push(`${key} = $${valueIndex++}`);
        values.push(value);
      });
    }

    const query = `
      UPDATE whiteboard_export_import_jobs
      SET ${updates.join(', ')}
      WHERE id = $1
    `;

    await this.db.query(query, values);
  }

  private async updateJobProgress(jobId: string, progress: number, message?: string): Promise<void> {
    await this.updateJobStatus(jobId, 'processing', progress);
    if (message) {
      this.logger.debug(`Export progress: ${message}`, { jobId, progress });
    }
  }

  private async completeExportJob(jobId: string, result: {
    filePath: string;
    downloadUrl: string;
    fileSize: number;
    metadata: Record<string, any>;
    processingTimeMs: number;
  }): Promise<void> {
    const query = `
      UPDATE whiteboard_export_import_jobs
      SET status = 'completed', progress = 100, file_path = $2, download_url = $3,
          file_size = $4, file_metadata = $5, processing_time_ms = $6,
          completed_at = $7, updated_at = $7
      WHERE id = $1
    `;

    await this.db.query(query, [
      jobId,
      result.filePath,
      result.downloadUrl,
      result.fileSize,
      JSON.stringify(result.metadata),
      result.processingTimeMs,
      new Date().toISOString(),
    ]);
  }

  private mapDatabaseRowToJob(row: any): ExportJob {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      operationType: row.operation_type,
      status: row.status,
      progress: row.progress || 0,
      fileSize: row.file_size,
      filePath: row.file_path,
      downloadUrl: row.download_url,
      fileMetadata: this.parseJsonField(row.file_metadata),
      jobOptions: this.parseJsonField(row.job_options),
      errorMessage: row.error_message,
      errorDetails: this.parseJsonField(row.error_details),
      processingTimeMs: row.processing_time_ms,
      expiresAt: row.expires_at?.toISOString(),
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    };
  }

  private parseJsonField(field: any): any {
    if (!field) return {};
    try {
      return typeof field === 'string' ? JSON.parse(field) : field;
    } catch {
      return {};
    }
  }

  /**
   * Generate HTML content for whiteboard rendering
   */
  private generateWhiteboardHtml(whiteboard: any, options?: any): string {
    const { elements = [], canvasData = {} } = whiteboard;
    const dimensions = canvasData.dimensions || { width: 1920, height: 1080 };
    const backgroundColor = canvasData.backgroundColor || (options?.backgroundTransparent ? 'transparent' : '#ffffff');
    
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${whiteboard.name}</title>
      <style>
        body {
          margin: 0;
          padding: 20px;
          background: ${backgroundColor};
          font-family: Arial, sans-serif;
        }
        .whiteboard-container {
          width: ${dimensions.width}px;
          height: ${dimensions.height}px;
          position: relative;
          background: ${backgroundColor};
        }
        .element {
          position: absolute;
        }
        .text-element {
          font-size: 14px;
          line-height: 1.4;
        }
        .shape-element {
          border: 2px solid #333;
        }
      </style>
    </head>
    <body>
      <div class="whiteboard-container">
    `;
    
    // Sort elements by layer index
    const sortedElements = [...elements].sort((a, b) => (a.layerIndex || 0) - (b.layerIndex || 0));
    
    for (const element of sortedElements) {
      try {
        const elementHtml = this.generateElementHtml(element);
        if (elementHtml) {
          html += elementHtml;
        }
      } catch (error) {
        this.logger.warn('Failed to render element in HTML', { elementId: element.id, error });
      }
    }
    
    html += `
      </div>
    </body>
    </html>
    `;
    
    return html;
  }

  /**
   * Generate HTML for individual whiteboard elements
   */
  private generateElementHtml(element: any): string {
    const { elementType, elementData, styleData = {} } = element;
    const position = elementData.position || { x: 0, y: 0 };
    const bounds = elementData.bounds || { width: 100, height: 100 };
    
    let html = '';
    
    switch (elementType) {
      case 'text':
        html = `<div class="element text-element" style="left: ${position.x}px; top: ${position.y}px; width: ${bounds.width}px; height: ${bounds.height}px; color: ${styleData.color || '#000'}; font-size: ${styleData.fontSize || 14}px;">${this.escapeHtml(elementData.text || '')}</div>`;
        break;
      case 'rectangle':
        html = `<div class="element shape-element" style="left: ${position.x}px; top: ${position.y}px; width: ${bounds.width}px; height: ${bounds.height}px; background: ${styleData.fillColor || 'transparent'}; border-color: ${styleData.strokeColor || '#333'};"></div>`;
        break;
      case 'circle':
        html = `<div class="element shape-element" style="left: ${position.x}px; top: ${position.y}px; width: ${bounds.width}px; height: ${bounds.height}px; background: ${styleData.fillColor || 'transparent'}; border-color: ${styleData.strokeColor || '#333'}; border-radius: 50%;"></div>`;
        break;
      default:
        // Generic element rendering
        html = `<div class="element" style="left: ${position.x}px; top: ${position.y}px; width: ${bounds.width}px; height: ${bounds.height}px;"></div>`;
    }
    
    return html;
  }

  /**
   * Generate SVG for individual whiteboard elements
   */
  private generateElementSvg(element: any, options?: SvgExportOptions): string {
    const { elementType, elementData, styleData = {} } = element;
    const position = elementData.position || { x: 0, y: 0 };
    const bounds = elementData.bounds || { width: 100, height: 100 };
    
    let svg = '';
    
    switch (elementType) {
      case 'text':
        svg = `<text x="${position.x}" y="${position.y + (styleData.fontSize || 14)}" fill="${styleData.color || '#000'}" font-size="${styleData.fontSize || 14}" class="text-element">${this.escapeXml(elementData.text || '')}</text>`;
        break;
      case 'rectangle':
        svg = `<rect x="${position.x}" y="${position.y}" width="${bounds.width}" height="${bounds.height}" fill="${styleData.fillColor || 'none'}" stroke="${styleData.strokeColor || '#333'}" class="shape-element" />`;
        break;
      case 'circle':
        const cx = position.x + bounds.width / 2;
        const cy = position.y + bounds.height / 2;
        const r = Math.min(bounds.width, bounds.height) / 2;
        svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${styleData.fillColor || 'none'}" stroke="${styleData.strokeColor || '#333'}" class="shape-element" />`;
        break;
      case 'line':
        const start = elementData.start || position;
        const end = elementData.end || { x: position.x + bounds.width, y: position.y + bounds.height };
        svg = `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${styleData.strokeColor || '#333'}" stroke-width="${styleData.strokeWidth || 2}" />`;
        break;
    }
    
    return svg;
  }

  /**
   * Generate markdown for individual whiteboard elements
   */
  private generateElementMarkdown(element: any): string {
    const { elementType, elementData } = element;
    
    switch (elementType) {
      case 'text':
        return `**Text Element:** ${elementData.text || 'Empty text'}`;
      case 'rectangle':
        return `**Rectangle:** ${elementData.bounds?.width || 0}x${elementData.bounds?.height || 0}px`;
      case 'circle':
        return `**Circle:** Radius ${Math.min(elementData.bounds?.width || 0, elementData.bounds?.height || 0) / 2}px`;
      case 'line':
        return `**Line:** From (${elementData.start?.x || 0}, ${elementData.start?.y || 0}) to (${elementData.end?.x || 0}, ${elementData.end?.y || 0})`;
      default:
        return `**${elementType}:** Element`;
    }
  }

  /**
   * Sanitize SVG content to prevent XSS
   */
  private sanitizeSvgContent(svgContent: string): string {
    // Remove script tags and dangerous attributes
    return svgContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Escape XML to prevent XSS
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get whiteboard comments for export
   */
  private async getWhiteboardComments(whiteboardId: string): Promise<any[]> {
    try {
      const query = `
        SELECT wc.*, u.username as author
        FROM whiteboard_comments wc
        LEFT JOIN users u ON wc.user_id = u.id
        WHERE wc.whiteboard_id = $1 AND wc.deleted_at IS NULL
        ORDER BY wc.created_at ASC
      `;
      
      const result = await this.db.query(query, [whiteboardId]);
      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        author: row.author || 'Unknown',
        createdAt: row.created_at,
      }));
    } catch (error) {
      this.logger.warn('Failed to fetch comments', { error, whiteboardId });
      return [];
    }
  }

  /**
   * Get whiteboard version history for export
   */
  private async getWhiteboardHistory(whiteboardId: string): Promise<any[]> {
    try {
      const query = `
        SELECT wv.*, u.username as author
        FROM whiteboard_versions wv
        LEFT JOIN users u ON wv.created_by = u.id
        WHERE wv.whiteboard_id = $1
        ORDER BY wv.created_at DESC
        LIMIT 10
      `;
      
      const result = await this.db.query(query, [whiteboardId]);
      return result.rows.map(row => ({
        id: row.id,
        versionNumber: row.version_number,
        changeType: row.change_type,
        commitMessage: row.commit_message,
        author: row.author || 'Unknown',
        createdAt: row.created_at,
      }));
    } catch (error) {
      this.logger.warn('Failed to fetch history', { error, whiteboardId });
      return [];
    }
  }

  /**
   * Validate file content and scan for security issues
   */
  private async validateAndScanFile(content: Buffer, filename: string): Promise<{
    isClean: boolean;
    hash: string;
    size: number;
    mimeType?: string;
    issues?: string[];
  }> {
    const issues: string[] = [];
    
    // Generate secure hash
    const hash = this.generateFileHash(content);
    const size = content.length;
    
    // Basic file size validation
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (size > maxSize) {
      issues.push(`File size exceeds maximum allowed size (${maxSize} bytes)`);
    }
    
    // Validate file extension vs content
    const extension = path.extname(filename).toLowerCase();
    const mimeType = this.detectMimeType(content, extension);
    
    if (!this.isValidFileType(extension, mimeType)) {
      issues.push(`File type mismatch: extension ${extension} does not match content type`);
    }
    
    // Scan for malicious patterns
    const contentStr = content.toString('utf8', 0, Math.min(content.length, 1024 * 1024)); // First 1MB
    
    if (this.containsMaliciousPatterns(contentStr)) {
      issues.push('Content contains potentially malicious patterns');
    }
    
    return {
      isClean: issues.length === 0,
      hash,
      size,
      mimeType,
      issues: issues.length > 0 ? issues : undefined,
    };
  }
  
  /**
   * Detect MIME type from file content
   */
  private detectMimeType(content: Buffer, extension: string): string {
    const firstBytes = content.slice(0, 16);
    
    // PDF
    if (firstBytes.toString('ascii', 0, 4) === '%PDF') {
      return 'application/pdf';
    }
    
    // PNG
    if (firstBytes[0] === 0x89 && firstBytes.toString('ascii', 1, 4) === 'PNG') {
      return 'image/png';
    }
    
    // JPEG
    if (firstBytes[0] === 0xFF && firstBytes[1] === 0xD8) {
      return 'image/jpeg';
    }
    
    // SVG
    if (content.toString('utf8', 0, 100).includes('<svg')) {
      return 'image/svg+xml';
    }
    
    // JSON
    if (extension === '.json') {
      return 'application/json';
    }
    
    // ZIP
    if (firstBytes[0] === 0x50 && firstBytes[1] === 0x4B) {
      return 'application/zip';
    }
    
    // Text files
    if (extension === '.txt' || extension === '.md') {
      return 'text/plain';
    }
    
    return 'application/octet-stream';
  }
  
  /**
   * Validate file type against allowed types
   */
  private isValidFileType(extension: string, mimeType: string): boolean {
    const allowedTypes: Record<string, string[]> = {
      '.pdf': ['application/pdf'],
      '.png': ['image/png'],
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.svg': ['image/svg+xml'],
      '.json': ['application/json'],
      '.zip': ['application/zip'],
      '.md': ['text/plain', 'text/markdown'],
      '.txt': ['text/plain', 'application/octet-stream'], // Allow txt files
    };
    
    const allowed = allowedTypes[extension];
    return allowed ? allowed.includes(mimeType) : false;
  }
  
  /**
   * Scan content for malicious patterns
   */
  private containsMaliciousPatterns(content: string): boolean {
    const maliciousPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i,
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i,
      /eval\s*\(/i,
      /Function\s*\(/i,
    ];
    
    return maliciousPatterns.some(pattern => pattern.test(content));
  }
}