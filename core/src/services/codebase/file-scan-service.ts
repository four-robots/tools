/**
 * File Scan Service
 * 
 * Handles comprehensive file scanning and processing for repository synchronization.
 * Manages file content analysis, language detection, and database persistence.
 */

import crypto from 'crypto';
import { DatabaseManager } from '../../utils/database.js';
import type { GitProvider } from './git-providers/index.js';
import { detectLanguageFromExtension, isBinaryFile } from './git-providers/index.js';
import type { 
  CodeFile,
  FileChange,
  ProcessedFilesResult
} from '../../shared/types/repository.js';

/**
 * File processing options
 */
export interface FileProcessingOptions {
  maxFileSize?: number; // Maximum file size in bytes
  skipBinary?: boolean;
  skipExtensions?: string[];
  processContent?: boolean;
  batchSize?: number;
}

/**
 * File content analysis result
 */
export interface FileAnalysis {
  language?: string;
  linesCount: number;
  sizeBytes: number;
  contentHash: string;
  isBinary: boolean;
  isDeleted: boolean;
}

/**
 * Repository tree file information
 */
export interface RepositoryTreeFile {
  path: string;
  sha: string;
  size: number;
  mode: string;
}

/**
 * Comprehensive file scanning and processing service
 */
export class FileScanService {
  private readonly db: DatabaseManager;
  private readonly defaultOptions: Required<FileProcessingOptions>;

  constructor(
    db: DatabaseManager,
    options: FileProcessingOptions = {}
  ) {
    this.db = db;
    this.defaultOptions = {
      maxFileSize: options.maxFileSize || 5 * 1024 * 1024, // 5MB
      skipBinary: options.skipBinary ?? true,
      skipExtensions: options.skipExtensions || ['.min.js', '.min.css'],
      processContent: options.processContent ?? true,
      batchSize: options.batchSize || 50
    };
  }

  /**
   * Process all files from a repository tree (full sync)
   */
  async processFiles(
    repositoryId: string,
    files: RepositoryTreeFile[],
    provider: GitProvider,
    options: FileProcessingOptions = {}
  ): Promise<ProcessedFilesResult> {
    const config = { ...this.defaultOptions, ...options };
    
    let processed = 0;
    let added = 0;
    let modified = 0;
    let deleted = 0;
    let errors = 0;

    // Get existing files for comparison
    const existingFiles = await this.getExistingFiles(repositoryId);
    const existingFilePaths = new Set(existingFiles.map(f => f.path));
    const processedPaths = new Set<string>();

    // Process files in batches
    for (let i = 0; i < files.length; i += config.batchSize) {
      const batch = files.slice(i, i + config.batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(file => this.processSingleFile(repositoryId, file, provider, config))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const file = batch[j];
        
        processed++;
        processedPaths.add(file.path);

        if (result.status === 'fulfilled') {
          const processResult = result.value;
          if (processResult.isNew) {
            added++;
          } else if (processResult.isModified) {
            modified++;
          }
        } else {
          console.error(`Failed to process file ${file.path}:`, result.reason);
          errors++;
        }
      }
    }

    // Mark deleted files
    const deletedFiles = existingFiles.filter(f => !processedPaths.has(f.path));
    if (deletedFiles.length > 0) {
      await this.markFilesAsDeleted(deletedFiles.map(f => f.id));
      deleted = deletedFiles.length;
    }

    return {
      total: processed,
      added,
      modified,
      deleted,
      errors
    };
  }

  /**
   * Process specific changed files (incremental/webhook sync)
   */
  async processChangedFiles(
    repositoryId: string,
    changes: FileChange[],
    provider: GitProvider,
    options: FileProcessingOptions = {}
  ): Promise<ProcessedFilesResult> {
    const config = { ...this.defaultOptions, ...options };
    
    let processed = 0;
    let added = 0;
    let modified = 0;
    let deleted = 0;
    let errors = 0;

    for (const change of changes) {
      try {
        processed++;

        if (change.changeType === 'deleted') {
          await this.markFileAsDeleted(repositoryId, change.path);
          deleted++;
        } else {
          // Convert FileChange to RepositoryTreeFile format
          const fileInfo: RepositoryTreeFile = {
            path: change.path,
            sha: change.sha || '',
            size: 0, // Will be determined during processing
            mode: '100644'
          };

          const result = await this.processSingleFile(repositoryId, fileInfo, provider, config);
          if (result.isNew) {
            added++;
          } else if (result.isModified) {
            modified++;
          }
        }
      } catch (error) {
        console.error(`Failed to process changed file ${change.path}:`, error);
        errors++;
      }
    }

    return {
      total: processed,
      added,
      modified,
      deleted,
      errors
    };
  }

  /**
   * Process specific files by path
   */
  async processSpecificFiles(
    repositoryId: string,
    filePaths: string[],
    provider: GitProvider,
    options: FileProcessingOptions = {}
  ): Promise<ProcessedFilesResult> {
    const config = { ...this.defaultOptions, ...options };
    
    let processed = 0;
    let added = 0;
    let modified = 0;
    let deleted = 0;
    let errors = 0;

    for (const filePath of filePaths) {
      try {
        processed++;

        // Create minimal file info (will be enriched during processing)
        const fileInfo: RepositoryTreeFile = {
          path: filePath,
          sha: '',
          size: 0,
          mode: '100644'
        };

        const result = await this.processSingleFile(repositoryId, fileInfo, provider, config);
        if (result.isNew) {
          added++;
        } else if (result.isModified) {
          modified++;
        }
      } catch (error) {
        console.error(`Failed to process specific file ${filePath}:`, error);
        errors++;
      }
    }

    return {
      total: processed,
      added,
      modified,
      deleted,
      errors
    };
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  /**
   * Process a single file
   */
  private async processSingleFile(
    repositoryId: string,
    file: RepositoryTreeFile,
    provider: GitProvider,
    config: Required<FileProcessingOptions>
  ): Promise<{ isNew: boolean; isModified: boolean }> {
    // Skip files based on configuration
    if (this.shouldSkipFile(file.path, config)) {
      return { isNew: false, isModified: false };
    }

    // Check if file exists
    const existingFile = await this.getFileByPath(repositoryId, file.path);
    const isNew = !existingFile;

    // Analyze file
    const analysis = await this.analyzeFile(file, provider, config);

    // Skip if content hasn't changed
    if (!isNew && existingFile.contentHash === analysis.contentHash) {
      return { isNew: false, isModified: false };
    }

    // Prepare file record
    const filename = file.path.split('/').pop() || '';
    const extension = filename.includes('.') ? filename.split('.').pop() : undefined;

    const codeFile: Omit<CodeFile, 'id' | 'createdAt' | 'updatedAt'> = {
      repositoryId,
      path: file.path,
      filename,
      extension,
      language: analysis.language,
      sizeBytes: analysis.sizeBytes,
      linesCount: analysis.linesCount,
      contentHash: analysis.contentHash,
      lastModified: new Date(),
      commitHash: file.sha,
      branch: 'main', // Default branch, can be customized
      isBinary: analysis.isBinary,
      isDeleted: false
    };

    if (isNew) {
      await this.insertFile(codeFile);
    } else {
      await this.updateFile(existingFile.id, codeFile);
    }

    return { isNew, isModified: !isNew };
  }

  /**
   * Analyze file content and metadata
   */
  private async analyzeFile(
    file: RepositoryTreeFile,
    provider: GitProvider,
    config: Required<FileProcessingOptions>
  ): Promise<FileAnalysis> {
    const isBinary = isBinaryFile(file.path);
    const language = detectLanguageFromExtension(file.path);
    
    let content = '';
    let sizeBytes = file.size;
    let linesCount = 0;
    let contentHash = '';

    try {
      if (!isBinary && config.processContent && sizeBytes <= config.maxFileSize) {
        // Get repository info from provider (simplified - would need actual repo URL)
        // For now, we'll use the file SHA as content identifier
        content = file.sha; // Placeholder - would fetch actual content
        sizeBytes = content.length;
        linesCount = content.split('\n').length;
      }
      
      // Generate content hash
      contentHash = crypto
        .createHash('sha256')
        .update(content || file.sha)
        .digest('hex');

    } catch (error) {
      console.warn(`Failed to analyze file content for ${file.path}:`, error);
      // Use file SHA as fallback
      contentHash = file.sha || crypto.randomUUID();
    }

    return {
      language,
      linesCount,
      sizeBytes,
      contentHash,
      isBinary,
      isDeleted: false
    };
  }

  /**
   * Check if file should be skipped based on configuration
   */
  private shouldSkipFile(path: string, config: Required<FileProcessingOptions>): boolean {
    // Skip binary files if configured
    if (config.skipBinary && isBinaryFile(path)) {
      return true;
    }

    // Skip specific extensions
    for (const ext of config.skipExtensions) {
      if (path.endsWith(ext)) {
        return true;
      }
    }

    // Skip common temporary and cache files
    const skipPatterns = [
      /node_modules\//,
      /\.git\//,
      /\.cache\//,
      /\.tmp$/,
      /\.temp$/,
      /~$/,
      /\.DS_Store$/,
      /Thumbs\.db$/
    ];

    return skipPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Get existing files for a repository
   */
  private async getExistingFiles(repositoryId: string): Promise<CodeFile[]> {
    const result = await this.db.kysely
      .selectFrom('code_files')
      .selectAll()
      .where('repository_id', '=', repositoryId)
      .where('is_deleted', '=', false)
      .execute();

    return result.map(row => ({
      id: row.id,
      repositoryId: row.repository_id,
      path: row.path,
      filename: row.filename,
      extension: row.extension,
      language: row.language,
      sizeBytes: row.size_bytes,
      linesCount: row.lines_count,
      contentHash: row.content_hash,
      lastModified: row.last_modified,
      commitHash: row.commit_hash,
      branch: row.branch,
      isBinary: row.is_binary,
      isDeleted: row.is_deleted,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Get file by path
   */
  private async getFileByPath(repositoryId: string, path: string): Promise<CodeFile | null> {
    const result = await this.db.kysely
      .selectFrom('code_files')
      .selectAll()
      .where('repository_id', '=', repositoryId)
      .where('path', '=', path)
      .where('is_deleted', '=', false)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      repositoryId: result.repository_id,
      path: result.path,
      filename: result.filename,
      extension: result.extension,
      language: result.language,
      sizeBytes: result.size_bytes,
      linesCount: result.lines_count,
      contentHash: result.content_hash,
      lastModified: result.last_modified,
      commitHash: result.commit_hash,
      branch: result.branch,
      isBinary: result.is_binary,
      isDeleted: result.is_deleted,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  /**
   * Insert new file record
   */
  private async insertFile(file: Omit<CodeFile, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.db.kysely
      .insertInto('code_files')
      .values({
        id: crypto.randomUUID(),
        repository_id: file.repositoryId,
        path: file.path,
        filename: file.filename,
        extension: file.extension,
        language: file.language,
        size_bytes: file.sizeBytes,
        lines_count: file.linesCount,
        content_hash: file.contentHash,
        last_modified: file.lastModified,
        commit_hash: file.commitHash,
        branch: file.branch,
        is_binary: file.isBinary,
        is_deleted: file.isDeleted,
        created_at: new Date(),
        updated_at: new Date()
      })
      .execute();
  }

  /**
   * Update existing file record
   */
  private async updateFile(
    fileId: string,
    updates: Omit<CodeFile, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    await this.db.kysely
      .updateTable('code_files')
      .set({
        filename: updates.filename,
        extension: updates.extension,
        language: updates.language,
        size_bytes: updates.sizeBytes,
        lines_count: updates.linesCount,
        content_hash: updates.contentHash,
        last_modified: updates.lastModified,
        commit_hash: updates.commitHash,
        branch: updates.branch,
        is_binary: updates.isBinary,
        is_deleted: updates.isDeleted,
        updated_at: new Date()
      })
      .where('id', '=', fileId)
      .execute();
  }

  /**
   * Mark multiple files as deleted
   */
  private async markFilesAsDeleted(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;

    await this.db.kysely
      .updateTable('code_files')
      .set({
        is_deleted: true,
        updated_at: new Date()
      })
      .where('id', 'in', fileIds)
      .execute();
  }

  /**
   * Mark single file as deleted by path
   */
  private async markFileAsDeleted(repositoryId: string, path: string): Promise<void> {
    await this.db.kysely
      .updateTable('code_files')
      .set({
        is_deleted: true,
        updated_at: new Date()
      })
      .where('repository_id', '=', repositoryId)
      .where('path', '=', path)
      .execute();
  }
}