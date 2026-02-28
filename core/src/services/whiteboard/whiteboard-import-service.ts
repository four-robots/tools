import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

/**
 * Import format types with validation
 */
export const ImportFormat = z.enum(['json', 'svg', 'png', 'jpeg', 'gif', 'pdf', 'zip', 'template']);
export type ImportFormat = z.infer<typeof ImportFormat>;

export const ImportJobStatus = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']);
export type ImportJobStatus = z.infer<typeof ImportJobStatus>;

/**
 * File upload and validation schemas
 */
export const FileUploadMetadata = z.object({
  originalFilename: z.string().min(1).max(255),
  fileType: z.string(), // MIME type
  fileSize: z.number().min(1),
  fileHash: z.string().optional(), // SHA-256 hash
  uploadedAt: z.string().datetime(),
  scanStatus: z.enum(['pending', 'scanning', 'clean', 'infected', 'failed']).default('pending'),
  metadata: z.record(z.string(), z.any()).default({}), // Format-specific metadata
});
export type FileUploadMetadata = z.infer<typeof FileUploadMetadata>;

/**
 * Import options for different formats
 */
export const JsonImportOptions = z.object({
  format: z.literal('json'),
  validateSchema: z.boolean().default(true),
  mergeWithExisting: z.boolean().default(false),
  preserveIds: z.boolean().default(false),
  importComments: z.boolean().default(true),
  importPermissions: z.boolean().default(false),
  conflictResolution: z.enum(['skip', 'replace', 'rename', 'merge']).default('rename'),
});
export type JsonImportOptions = z.infer<typeof JsonImportOptions>;

export const ImageImportOptions = z.object({
  format: z.union([z.literal('png'), z.literal('jpeg'), z.literal('gif')]),
  autoPosition: z.boolean().default(true),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  maxWidth: z.number().min(100).max(5000).optional(),
  maxHeight: z.number().min(100).max(5000).optional(),
  preserveAspectRatio: z.boolean().default(true),
  generateThumbnail: z.boolean().default(true),
});
export type ImageImportOptions = z.infer<typeof ImageImportOptions>;

export const SvgImportOptions = z.object({
  format: z.literal('svg'),
  parseAsElements: z.boolean().default(true),
  preserveStyles: z.boolean().default(true),
  autoPosition: z.boolean().default(true),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  maxSize: z.object({
    width: z.number().min(100).max(5000),
    height: z.number().min(100).max(5000),
  }).optional(),
});
export type SvgImportOptions = z.infer<typeof SvgImportOptions>;

export const PdfImportOptions = z.object({
  format: z.literal('pdf'),
  convertToImages: z.boolean().default(true),
  imageFormat: z.enum(['png', 'jpeg']).default('png'),
  imageQuality: z.number().min(0.1).max(1).default(0.9),
  extractText: z.boolean().default(true),
  pagesRange: z.object({
    start: z.number().min(1).default(1),
    end: z.number().min(1).optional(), // If not specified, all pages
  }).optional(),
});
export type PdfImportOptions = z.infer<typeof PdfImportOptions>;

export const ZipImportOptions = z.object({
  format: z.literal('zip'),
  extractAll: z.boolean().default(true),
  supportedFormats: z.array(ImportFormat).default(['json', 'svg', 'png', 'jpeg']),
  createSeparateWhiteboards: z.boolean().default(false),
  preserveDirectory: z.boolean().default(true),
});
export type ZipImportOptions = z.infer<typeof ZipImportOptions>;

export const TemplateImportOptions = z.object({
  format: z.literal('template'),
  applyToExistingWhiteboard: z.boolean().default(true),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  scale: z.number().min(0.1).max(5).default(1),
  replaceContent: z.boolean().default(false),
});
export type TemplateImportOptions = z.infer<typeof TemplateImportOptions>;

export const ImportOptions = z.discriminatedUnion('format', [
  JsonImportOptions,
  ImageImportOptions,
  SvgImportOptions,
  PdfImportOptions,
  ZipImportOptions,
  TemplateImportOptions,
]);
export type ImportOptions = z.infer<typeof ImportOptions>;

/**
 * Import job and result types
 */
export const ImportJob = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  operationType: ImportFormat,
  status: ImportJobStatus,
  progress: z.number().min(0).max(100).default(0),
  sourceFilePath: z.string(),
  fileMetadata: FileUploadMetadata,
  jobOptions: z.record(z.string(), z.any()).default({}),
  elementsCreated: z.array(z.string().uuid()).default([]),
  whiteboardsCreated: z.array(z.string().uuid()).default([]),
  errorMessage: z.string().optional(),
  errorDetails: z.record(z.string(), z.any()).optional(),
  processingTimeMs: z.number().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ImportJob = z.infer<typeof ImportJob>;

export const ImportResult = z.object({
  jobId: z.string().uuid(),
  success: z.boolean(),
  whiteboardId: z.string().uuid().optional(),
  elementsCreated: z.array(z.string().uuid()).default([]),
  whiteboardsCreated: z.array(z.string().uuid()).default([]),
  warnings: z.array(z.string()).default([]),
  processingTimeMs: z.number(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type ImportResult = z.infer<typeof ImportResult>;

/**
 * Import request types
 */
export const CreateImportJobRequest = z.object({
  whiteboardId: z.string().uuid(),
  uploadId: z.string().uuid(), // Reference to uploaded file
  options: ImportOptions.optional(),
  filename: z.string().optional(),
});
export type CreateImportJobRequest = z.infer<typeof CreateImportJobRequest>;

export const FileUploadRequest = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.string(),
  fileSize: z.number().min(1).max(50 * 1024 * 1024), // 50MB max
  fileContent: z.string(), // Base64 encoded or file path
});
export type FileUploadRequest = z.infer<typeof FileUploadRequest>;

/**
 * Validation and conflict resolution types
 */
export const ValidationError = z.object({
  field: z.string(),
  message: z.string(),
  value: z.any().optional(),
  severity: z.enum(['error', 'warning', 'info']).default('error'),
});
export type ValidationError = z.infer<typeof ValidationError>;

export const ConflictResolution = z.object({
  elementId: z.string().uuid(),
  conflictType: z.enum(['duplicate_id', 'invalid_data', 'missing_dependency', 'permission_denied']),
  resolution: z.enum(['skip', 'replace', 'rename', 'merge', 'fix']),
  originalData: z.any(),
  resolvedData: z.any().optional(),
  message: z.string(),
});
export type ConflictResolution = z.infer<typeof ConflictResolution>;

/**
 * Whiteboard Import Service
 * 
 * Provides comprehensive import functionality for whiteboards from multiple formats:
 * - JSON: Native whiteboard format with validation
 * - Images: PNG, JPEG, GIF with automatic element creation
 * - SVG: Vector graphics with element parsing
 * - PDF: Multi-page document conversion
 * - ZIP: Batch import from archives
 * - Templates: Import from whiteboard templates
 */
export class WhiteboardImportService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardImportService');
  }

  /**
   * Upload and validate a file for import
   */
  async uploadFile(
    userId: string,
    request: FileUploadRequest
  ): Promise<{ uploadId: string; metadata: FileUploadMetadata }> {
    try {
      const uploadId = randomUUID();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(); // 24 hours

      // Validate file type and size
      await this.validateFileUpload(request);

      // Generate file hash for deduplication
      const fileHash = await this.generateFileHash(request.fileContent);

      // Check for existing file with same hash
      const existingFile = await this.findExistingFile(fileHash, userId);
      if (existingFile) {
        this.logger.info('File already uploaded, reusing existing', { 
          uploadId: existingFile.id, 
          hash: fileHash,
          userId 
        });
        return {
          uploadId: existingFile.id,
          metadata: this.parseFileMetadata(existingFile),
        };
      }

      // Store file
      const filePath = await this.storeUploadedFile(uploadId, request);

      // Extract metadata
      const metadata = await this.extractFileMetadata(request, filePath);

      // Save to database
      const query = `
        INSERT INTO whiteboard_file_uploads (
          id, user_id, original_filename, file_type, file_size,
          file_path, file_hash, scan_status, metadata, expires_at,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        uploadId,
        userId,
        request.filename,
        request.fileType,
        request.fileSize,
        filePath,
        fileHash,
        'pending',
        JSON.stringify(metadata.metadata),
        expiresAt,
        now,
        now,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to save file upload');
      }

      // Start security scan asynchronously
      this.scanUploadedFile(uploadId).catch(error => {
        this.logger.error('File scan failed', { error, uploadId });
      });

      this.logger.info('File uploaded successfully', { 
        uploadId, 
        filename: request.filename,
        fileType: request.fileType,
        fileSize: request.fileSize,
        userId 
      });

      return {
        uploadId,
        metadata: {
          ...metadata,
          uploadedAt: now,
          scanStatus: 'pending' as const,
        },
      };
    } catch (error) {
      this.logger.error('File upload failed', { error, request: { ...request, fileContent: '[redacted]' }, userId });
      throw error;
    }
  }

  /**
   * Create a new import job
   */
  async createImportJob(
    userId: string,
    request: CreateImportJobRequest
  ): Promise<ImportJob> {
    try {
      // Validate user has access to the whiteboard
      await this.validateWhiteboardAccess(request.whiteboardId, userId);

      // Get uploaded file info
      const uploadedFile = await this.getUploadedFile(request.uploadId, userId);
      if (!uploadedFile) {
        throw new Error('Uploaded file not found or access denied');
      }

      // Verify file passed security scan
      if (uploadedFile.scan_status === 'infected') {
        throw new Error('File failed security scan - contains malicious content');
      }

      if (uploadedFile.scan_status === 'failed') {
        throw new Error('File security scan failed - please try uploading again');
      }

      const jobId = randomUUID();
      const now = new Date().toISOString();

      // Detect format from file metadata
      const detectedFormat = this.detectImportFormat(uploadedFile);

      const query = `
        INSERT INTO whiteboard_export_import_jobs (
          id, whiteboard_id, user_id, job_type, operation_type, status,
          file_path, file_metadata, job_options, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        jobId,
        request.whiteboardId,
        userId,
        'import',
        detectedFormat,
        'pending',
        uploadedFile.file_path,
        JSON.stringify({
          originalFilename: uploadedFile.original_filename,
          fileType: uploadedFile.file_type,
          fileSize: uploadedFile.file_size,
          fileHash: uploadedFile.file_hash,
          uploadedAt: uploadedFile.created_at?.toISOString(),
          scanStatus: uploadedFile.scan_status,
          metadata: this.parseJsonField(uploadedFile.metadata),
        }),
        JSON.stringify(request.options || {}),
        now,
        now,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create import job');
      }

      const job = this.mapDatabaseRowToJob(result.rows[0]);
      
      this.logger.info('Import job created', { 
        jobId, 
        whiteboardId: request.whiteboardId, 
        format: detectedFormat,
        uploadId: request.uploadId,
        userId 
      });

      // Start processing asynchronously
      this.processImportJob(job).catch(error => {
        this.logger.error('Import job processing failed', { error, jobId });
        this.updateJobStatus(jobId, 'failed', 0, error instanceof Error ? error.message : String(error));
      });

      return job;
    } catch (error) {
      this.logger.error('Failed to create import job', { error, request, userId });
      throw error;
    }
  }

  /**
   * Get import job by ID
   */
  async getImportJob(jobId: string, userId: string): Promise<ImportJob | null> {
    try {
      const query = `
        SELECT * FROM whiteboard_export_import_jobs
        WHERE id = $1 AND user_id = $2 AND job_type = 'import'
      `;

      const result = await this.db.query(query, [jobId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToJob(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get import job', { error, jobId, userId });
      throw error;
    }
  }

  /**
   * Get all import jobs for a user
   */
  async getUserImportJobs(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ jobs: ImportJob[]; total: number }> {
    try {
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_export_import_jobs
        WHERE user_id = $1 AND job_type = 'import'
      `;

      const dataQuery = `
        SELECT * FROM whiteboard_export_import_jobs
        WHERE user_id = $1 AND job_type = 'import'
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
      this.logger.error('Failed to get user import jobs', { error, userId });
      throw error;
    }
  }

  /**
   * Cancel an import job
   */
  async cancelImportJob(jobId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        UPDATE whiteboard_export_import_jobs
        SET status = 'cancelled', updated_at = $1
        WHERE id = $2 AND user_id = $3 AND job_type = 'import' 
        AND status IN ('pending', 'processing')
      `;

      const result = await this.db.query(query, [new Date().toISOString(), jobId, userId]);
      
      const cancelled = result.rowCount > 0;
      if (cancelled) {
        this.logger.info('Import job cancelled', { jobId, userId });
      }

      return cancelled;
    } catch (error) {
      this.logger.error('Failed to cancel import job', { error, jobId, userId });
      throw error;
    }
  }

  /**
   * Clean up expired uploads and files
   */
  async cleanupExpiredUploads(): Promise<{ deletedUploads: number; deletedFiles: number }> {
    try {
      const now = new Date().toISOString();
      
      // Get expired uploads with file paths
      const expiredQuery = `
        SELECT id, file_path FROM whiteboard_file_uploads
        WHERE expires_at < $1
      `;

      const expiredResult = await this.db.query(expiredQuery, [now]);
      const expiredUploads = expiredResult.rows;

      if (expiredUploads.length === 0) {
        return { deletedUploads: 0, deletedFiles: 0 };
      }

      // Delete files from filesystem
      let deletedFiles = 0;
      for (const upload of expiredUploads) {
        if (upload.file_path) {
          try {
            await this.deleteFile(upload.file_path);
            deletedFiles++;
          } catch (error) {
            this.logger.warn('Failed to delete expired upload file', { 
              error, 
              uploadId: upload.id, 
              filePath: upload.file_path 
            });
          }
        }
      }

      // Delete upload records
      const deleteQuery = `DELETE FROM whiteboard_file_uploads WHERE expires_at < $1`;
      const deleteResult = await this.db.query(deleteQuery, [now]);
      const deletedUploads = deleteResult.rowCount || 0;

      this.logger.info('Cleaned up expired uploads', { deletedUploads, deletedFiles });

      return { deletedUploads, deletedFiles };
    } catch (error) {
      this.logger.error('Failed to cleanup expired uploads', { error });
      throw error;
    }
  }

  // Private methods

  /**
   * Process an import job asynchronously
   */
  private async processImportJob(job: ImportJob): Promise<void> {
    const startTime = Date.now();
    const jobId = job.id;

    try {
      // Update job status to processing
      await this.updateJobStatus(jobId, 'processing', 0);

      // Validate file exists and is accessible
      const fileExists = await this.verifyFileExists(job.sourceFilePath);
      if (!fileExists) {
        throw new Error('Source file not found or inaccessible');
      }

      await this.updateJobProgress(jobId, 10, 'Validating file...');

      // Process based on format
      let result: ImportResult;
      switch (job.operationType) {
        case 'json':
          result = await this.importFromJson(job);
          break;
        case 'png':
        case 'jpeg':
        case 'gif':
          result = await this.importFromImage(job);
          break;
        case 'svg':
          result = await this.importFromSvg(job);
          break;
        case 'pdf':
          result = await this.importFromPdf(job);
          break;
        case 'zip':
          result = await this.importFromZip(job);
          break;
        case 'template':
          result = await this.importFromTemplate(job);
          break;
        default:
          throw new Error(`Unsupported import format: ${job.operationType}`);
      }

      await this.updateJobProgress(jobId, 90, 'Finalizing import...');

      // Update job with completion
      const processingTimeMs = Date.now() - startTime;
      await this.completeImportJob(jobId, {
        ...result,
        processingTimeMs,
      });

      this.logger.info('Import job completed successfully', { 
        jobId, 
        format: job.operationType,
        elementsCreated: result.elementsCreated.length,
        processingTimeMs 
      });

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      await this.updateJobStatus(jobId, 'failed', 0, error instanceof Error ? error.message : String(error), { processingTimeMs });
      
      this.logger.error('Import job failed', { 
        error, 
        jobId, 
        format: job.operationType,
        processingTimeMs 
      });
      throw error;
    }
  }

  /**
   * Import from JSON format
   */
  private async importFromJson(job: ImportJob): Promise<ImportResult> {
    await this.updateJobProgress(job.id, 20, 'Parsing JSON file...');
    
    const options = job.jobOptions as JsonImportOptions | undefined;
    const startTime = Date.now();

    try {
      // Read and parse JSON file
      const jsonContent = await this.readFile(job.sourceFilePath);
      const importData = JSON.parse(jsonContent);

      await this.updateJobProgress(job.id, 40, 'Validating whiteboard data...');

      // Validate JSON structure
      const validationErrors = await this.validateJsonImport(importData, options);
      if (validationErrors.length > 0 && options?.validateSchema !== false) {
        const criticalErrors = validationErrors.filter(e => e.severity === 'error');
        if (criticalErrors.length > 0) {
          throw new Error(`Validation failed: ${criticalErrors[0].message}`);
        }
      }

      await this.updateJobProgress(job.id, 60, 'Creating whiteboard elements...');

      // Import elements with conflict resolution
      const elementsCreated = await this.createElementsFromJson(
        job.whiteboardId, 
        job.userId, 
        importData,
        options
      );

      await this.updateJobProgress(job.id, 80, 'Import complete');

      const processingTimeMs = Date.now() - startTime;
      const warnings = validationErrors
        .filter(e => e.severity === 'warning')
        .map(e => e.message);

      return {
        jobId: job.id,
        success: true,
        whiteboardId: job.whiteboardId,
        elementsCreated,
        whiteboardsCreated: [],
        warnings,
        processingTimeMs,
        metadata: {
          format: 'json',
          elementsImported: elementsCreated.length,
          validationWarnings: warnings.length,
        },
      };
    } catch (error) {
      this.logger.error('JSON import failed', { error, jobId: job.id });
      throw new Error(`JSON import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import from image format
   */
  private async importFromImage(job: ImportJob): Promise<ImportResult> {
    await this.updateJobProgress(job.id, 20, 'Processing image...');
    
    const options = job.jobOptions as ImageImportOptions | undefined;
    const startTime = Date.now();

    try {
      // Read image file and extract metadata
      const imageData = await this.readImageFile(job.sourceFilePath);
      const metadata = await this.extractImageMetadata(imageData);

      await this.updateJobProgress(job.id, 40, 'Creating image element...');

      // Create image element
      const elementId = await this.createImageElement(
        job.whiteboardId,
        job.userId,
        imageData,
        metadata,
        options
      );

      await this.updateJobProgress(job.id, 80, 'Image import complete');

      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        whiteboardId: job.whiteboardId,
        elementsCreated: [elementId],
        whiteboardsCreated: [],
        warnings: [],
        processingTimeMs,
        metadata: {
          format: job.operationType,
          imageWidth: metadata.width,
          imageHeight: metadata.height,
        },
      };
    } catch (error) {
      this.logger.error('Image import failed', { error, jobId: job.id });
      throw new Error(`Image import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import from SVG format
   */
  private async importFromSvg(job: ImportJob): Promise<ImportResult> {
    await this.updateJobProgress(job.id, 20, 'Parsing SVG file...');
    
    const options = job.jobOptions as SvgImportOptions | undefined;
    const startTime = Date.now();

    try {
      // Parse SVG content
      const svgContent = await this.readFile(job.sourceFilePath);
      const svgElements = await this.parseSvgContent(svgContent);

      await this.updateJobProgress(job.id, 40, 'Converting SVG elements...');

      // Convert SVG elements to whiteboard elements
      const elementsCreated = await this.createElementsFromSvg(
        job.whiteboardId,
        job.userId,
        svgElements,
        options
      );

      await this.updateJobProgress(job.id, 80, 'SVG import complete');

      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        whiteboardId: job.whiteboardId,
        elementsCreated,
        whiteboardsCreated: [],
        warnings: [],
        processingTimeMs,
        metadata: {
          format: 'svg',
          elementsImported: elementsCreated.length,
          svgElementCount: svgElements.length,
        },
      };
    } catch (error) {
      this.logger.error('SVG import failed', { error, jobId: job.id });
      throw new Error(`SVG import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import from PDF format
   */
  private async importFromPdf(job: ImportJob): Promise<ImportResult> {
    await this.updateJobProgress(job.id, 20, 'Processing PDF...');
    
    const options = job.jobOptions as PdfImportOptions | undefined;
    const startTime = Date.now();

    try {
      // Extract pages from PDF
      const pdfPages = await this.extractPdfPages(job.sourceFilePath, options);

      await this.updateJobProgress(job.id, 40, 'Converting pages to elements...');

      // Create elements for each page
      const elementsCreated: string[] = [];
      for (let i = 0; i < pdfPages.length; i++) {
        const page = pdfPages[i];
        
        if (options?.convertToImages) {
          const elementId = await this.createImageElement(
            job.whiteboardId,
            job.userId,
            page.imageData,
            page.metadata,
            {
              format: options.imageFormat,
              autoPosition: true,
              position: { x: i * 100, y: i * 100 },
              preserveAspectRatio: true,
            }
          );
          elementsCreated.push(elementId);
        }

        if (options?.extractText && page.textContent) {
          const textElementId = await this.createTextElement(
            job.whiteboardId,
            job.userId,
            page.textContent,
            { x: i * 100, y: i * 100 + 200 }
          );
          elementsCreated.push(textElementId);
        }

        await this.updateJobProgress(job.id, 40 + (40 * (i + 1) / pdfPages.length));
      }

      await this.updateJobProgress(job.id, 80, 'PDF import complete');

      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        whiteboardId: job.whiteboardId,
        elementsCreated,
        whiteboardsCreated: [],
        warnings: [],
        processingTimeMs,
        metadata: {
          format: 'pdf',
          pagesProcessed: pdfPages.length,
          elementsImported: elementsCreated.length,
        },
      };
    } catch (error) {
      this.logger.error('PDF import failed', { error, jobId: job.id });
      throw new Error(`PDF import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import from ZIP archive
   */
  private async importFromZip(job: ImportJob): Promise<ImportResult> {
    await this.updateJobProgress(job.id, 20, 'Extracting ZIP archive...');
    
    const options = job.jobOptions as ZipImportOptions | undefined;
    const startTime = Date.now();

    try {
      // Extract ZIP contents
      const extractedFiles = await this.extractZipArchive(job.sourceFilePath);

      await this.updateJobProgress(job.id, 40, 'Processing extracted files...');

      const elementsCreated: string[] = [];
      const whiteboardsCreated: string[] = [];
      const warnings: string[] = [];

      // Process each extracted file
      for (let i = 0; i < extractedFiles.length; i++) {
        const file = extractedFiles[i];
        
        try {
          const format = this.detectFileFormat(file.filename, file.mimeType);
          
          if (options?.supportedFormats && !options.supportedFormats.includes(format)) {
            warnings.push(`Skipped unsupported file: ${file.filename}`);
            continue;
          }

          // Create individual import job for each file
          const fileResult = await this.importSingleFile(
            job.whiteboardId,
            job.userId,
            file,
            format,
            options
          );

          elementsCreated.push(...fileResult.elementsCreated);
          if (fileResult.whiteboardId && fileResult.whiteboardId !== job.whiteboardId) {
            whiteboardsCreated.push(fileResult.whiteboardId);
          }

        } catch (error) {
          warnings.push(`Failed to import ${file.filename}: ${error instanceof Error ? error.message : String(error)}`);
        }

        await this.updateJobProgress(job.id, 40 + (40 * (i + 1) / extractedFiles.length));
      }

      await this.updateJobProgress(job.id, 80, 'ZIP import complete');

      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        whiteboardId: job.whiteboardId,
        elementsCreated,
        whiteboardsCreated,
        warnings,
        processingTimeMs,
        metadata: {
          format: 'zip',
          filesProcessed: extractedFiles.length,
          elementsImported: elementsCreated.length,
          whiteboardsCreated: whiteboardsCreated.length,
        },
      };
    } catch (error) {
      this.logger.error('ZIP import failed', { error, jobId: job.id });
      throw new Error(`ZIP import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Import from template
   */
  private async importFromTemplate(job: ImportJob): Promise<ImportResult> {
    await this.updateJobProgress(job.id, 20, 'Loading template...');
    
    const options = job.jobOptions as TemplateImportOptions | undefined;
    const startTime = Date.now();

    try {
      // Load template data
      const templateData = await this.loadTemplateData(job.sourceFilePath);

      await this.updateJobProgress(job.id, 40, 'Applying template...');

      // Apply template to whiteboard (using existing template service logic)
      const elementsCreated = await this.applyTemplateData(
        job.whiteboardId,
        job.userId,
        templateData,
        options
      );

      await this.updateJobProgress(job.id, 80, 'Template import complete');

      const processingTimeMs = Date.now() - startTime;

      return {
        jobId: job.id,
        success: true,
        whiteboardId: job.whiteboardId,
        elementsCreated,
        whiteboardsCreated: [],
        warnings: [],
        processingTimeMs,
        metadata: {
          format: 'template',
          elementsImported: elementsCreated.length,
          templateName: templateData.name,
        },
      };
    } catch (error) {
      this.logger.error('Template import failed', { error, jobId: job.id });
      throw new Error(`Template import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Utility methods (mock implementations - replace with actual implementations)

  private async validateFileUpload(request: FileUploadRequest): Promise<void> {
    // Validate file size
    if (request.fileSize > 50 * 1024 * 1024) { // 50MB
      throw new Error('File size exceeds maximum limit (50MB)');
    }

    // Validate file type
    const allowedTypes = [
      'application/json',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
    ];

    if (!allowedTypes.includes(request.fileType)) {
      throw new Error(`Unsupported file type: ${request.fileType}`);
    }
  }

  private async generateFileHash(content: string): Promise<string> {
    // Mock implementation - use crypto.createHash in real code
    return 'mock-hash-' + Date.now();
  }

  private async findExistingFile(hash: string, userId: string): Promise<any> {
    const query = `
      SELECT * FROM whiteboard_file_uploads
      WHERE file_hash = $1 AND user_id = $2 AND expires_at > $3
      ORDER BY created_at DESC LIMIT 1
    `;

    const result = await this.db.query(query, [hash, userId, new Date().toISOString()]);
    return result.rows[0] || null;
  }

  private async storeUploadedFile(uploadId: string, request: FileUploadRequest): Promise<string> {
    // Mock implementation - store file and return path
    return `/tmp/uploads/${uploadId}/${request.filename}`;
  }

  private async extractFileMetadata(request: FileUploadRequest, filePath: string): Promise<FileUploadMetadata> {
    return {
      originalFilename: request.filename,
      fileType: request.fileType,
      fileSize: request.fileSize,
      uploadedAt: new Date().toISOString(),
      scanStatus: 'pending' as const,
      metadata: {},
    };
  }

  private parseFileMetadata(file: any): FileUploadMetadata {
    return {
      originalFilename: file.original_filename,
      fileType: file.file_type,
      fileSize: file.file_size,
      fileHash: file.file_hash,
      uploadedAt: file.created_at?.toISOString() || new Date().toISOString(),
      scanStatus: file.scan_status,
      metadata: this.parseJsonField(file.metadata),
    };
  }

  private async scanUploadedFile(uploadId: string): Promise<void> {
    // Mock security scan implementation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await this.db.query(
      `UPDATE whiteboard_file_uploads SET scan_status = 'clean', updated_at = $1 WHERE id = $2`,
      [new Date().toISOString(), uploadId]
    );
  }

  private detectImportFormat(file: any): ImportFormat {
    const mimeType = file.file_type.toLowerCase();
    const filename = file.original_filename.toLowerCase();

    if (mimeType.includes('json') || filename.endsWith('.json')) return 'json';
    if (mimeType.includes('svg') || filename.endsWith('.svg')) return 'svg';
    if (mimeType.includes('png') || filename.endsWith('.png')) return 'png';
    if (mimeType.includes('jpeg') || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'jpeg';
    if (mimeType.includes('gif') || filename.endsWith('.gif')) return 'gif';
    if (mimeType.includes('pdf') || filename.endsWith('.pdf')) return 'pdf';
    if (mimeType.includes('zip') || filename.endsWith('.zip')) return 'zip';

    throw new Error(`Unable to detect format for file: ${filename}`);
  }

  // Mock implementations for content processing
  private async validateJsonImport(data: any, options?: JsonImportOptions): Promise<ValidationError[]> {
    return []; // Mock validation
  }

  private async createElementsFromJson(whiteboardId: string, userId: string, data: any, options?: JsonImportOptions): Promise<string[]> {
    return ['element-1', 'element-2']; // Mock element creation
  }

  private async readImageFile(filePath: string): Promise<Buffer> {
    return Buffer.from('mock image data');
  }

  private async extractImageMetadata(data: Buffer): Promise<{ width: number; height: number; format: string }> {
    return { width: 800, height: 600, format: 'png' };
  }

  private async createImageElement(whiteboardId: string, userId: string, data: Buffer, metadata: any, options?: ImageImportOptions): Promise<string> {
    return randomUUID();
  }

  private async createTextElement(whiteboardId: string, userId: string, text: string, position: { x: number; y: number }): Promise<string> {
    return randomUUID();
  }

  // Additional mock methods...
  private async parseSvgContent(content: string): Promise<any[]> { return []; }
  private async createElementsFromSvg(whiteboardId: string, userId: string, elements: any[], options?: SvgImportOptions): Promise<string[]> { return []; }
  private async extractPdfPages(filePath: string, options?: PdfImportOptions): Promise<any[]> { return []; }
  private async extractZipArchive(filePath: string): Promise<any[]> { return []; }
  private async importSingleFile(whiteboardId: string, userId: string, file: any, format: ImportFormat, options?: any): Promise<ImportResult> { 
    return { jobId: '', success: true, elementsCreated: [], whiteboardsCreated: [], warnings: [], processingTimeMs: 0, metadata: {} };
  }
  private async loadTemplateData(filePath: string): Promise<any> { return {}; }
  private async applyTemplateData(whiteboardId: string, userId: string, data: any, options?: TemplateImportOptions): Promise<string[]> { return []; }

  // File system operations
  private async validateWhiteboardAccess(whiteboardId: string, userId: string): Promise<void> {
    const query = `
      SELECT 1 FROM whiteboards w
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id AND wp.user_id = $2
      WHERE w.id = $1 AND w.deleted_at IS NULL
      AND (w.created_by = $2 OR w.visibility = 'public' OR wp.can_edit = true)
    `;

    const result = await this.db.query(query, [whiteboardId, userId]);
    if (result.rows.length === 0) {
      throw new Error('Whiteboard not found or access denied');
    }
  }

  private async getUploadedFile(uploadId: string, userId: string): Promise<any> {
    const query = `SELECT * FROM whiteboard_file_uploads WHERE id = $1 AND user_id = $2`;
    const result = await this.db.query(query, [uploadId, userId]);
    return result.rows[0] || null;
  }

  private async verifyFileExists(filePath: string): Promise<boolean> {
    return true; // Mock implementation
  }

  private async readFile(filePath: string): Promise<string> {
    return 'mock file content'; // Mock implementation
  }

  private async deleteFile(filePath: string): Promise<void> {
    // Mock implementation
  }

  private detectFileFormat(filename: string, mimeType: string): ImportFormat {
    // Mock implementation
    return 'json';
  }

  // Database operations
  private async updateJobStatus(
    jobId: string, 
    status: ImportJobStatus, 
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
      this.logger.debug(`Import progress: ${message}`, { jobId, progress });
    }
  }

  private async completeImportJob(jobId: string, result: ImportResult): Promise<void> {
    const query = `
      UPDATE whiteboard_export_import_jobs
      SET status = 'completed', progress = 100, processing_time_ms = $2,
          completed_at = $3, updated_at = $3
      WHERE id = $1
    `;

    await this.db.query(query, [
      jobId,
      result.processingTimeMs,
      new Date().toISOString(),
    ]);
  }

  private mapDatabaseRowToJob(row: any): ImportJob {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      operationType: row.operation_type,
      status: row.status,
      progress: row.progress || 0,
      sourceFilePath: row.file_path,
      fileMetadata: this.parseJsonField(row.file_metadata),
      jobOptions: this.parseJsonField(row.job_options),
      elementsCreated: [], // Would be stored separately or computed
      whiteboardsCreated: [],
      errorMessage: row.error_message,
      errorDetails: this.parseJsonField(row.error_details),
      processingTimeMs: row.processing_time_ms,
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
}