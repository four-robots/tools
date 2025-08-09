/**
 * Repository Service
 * 
 * Central service for managing code repositories across multiple Git providers.
 * Handles repository CRUD operations, synchronization, and coordination between
 * Git providers, webhook management, and file scanning services.
 */

import crypto from 'crypto';
import { DatabaseManager } from '../../utils/database.js';
import { GitProviderFactory } from './git-providers/index.js';
import { WebhookManager } from './webhook-manager.js';
import { FileScanService } from './file-scan-service.js';
import type { GitProvider } from './git-providers/index.js';
import type { 
  Repository, 
  RepositoryConfig, 
  SyncOptions, 
  SyncResult, 
  Branch,
  SyncLog,
  RepositoryStats,
  CreateRepositoryRequest,
  UpdateRepositoryRequest,
  RepositoryListResponse,
  GitProvider as GitProviderEnum,
  SyncStatus,
  SyncType,
  SyncOperationStatus
} from '../../shared/types/repository.js';

/**
 * Repository search filters
 */
export interface RepositorySearchOptions {
  provider?: GitProviderEnum;
  syncStatus?: SyncStatus;
  language?: string;
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Comprehensive repository management service
 */
export class RepositoryService {
  private readonly db: DatabaseManager;
  private readonly gitProviderFactory: GitProviderFactory;
  private readonly webhookManager: WebhookManager;
  private readonly fileScanService: FileScanService;
  private readonly encryptionSecret: string;

  constructor(
    db: DatabaseManager,
    encryptionSecret: string = process.env.ENCRYPTION_SECRET || 'default-secret'
  ) {
    this.db = db;
    this.encryptionSecret = encryptionSecret;
    this.gitProviderFactory = GitProviderFactory.getInstance();
    this.webhookManager = new WebhookManager(db);
    this.fileScanService = new FileScanService(db);
  }

  // ===================
  // REPOSITORY MANAGEMENT
  // ===================

  /**
   * Add a new repository to the system
   */
  async addRepository(config: CreateRepositoryRequest): Promise<Repository> {
    try {
      // Validate repository access
      const provider = this.gitProviderFactory.createProvider(config.provider, config.accessToken);
      const repoInfo = await provider.getRepositoryInfo(config.url);

      // Create repository record
      const repository: Repository = {
        id: crypto.randomUUID(),
        name: config.name || repoInfo.name,
        url: config.url,
        provider: config.provider,
        accessTokenEncrypted: config.accessToken ? this.encryptToken(config.accessToken) : undefined,
        defaultBranch: repoInfo.defaultBranch || 'main',
        description: repoInfo.description,
        language: repoInfo.language,
        starsCount: repoInfo.starsCount || 0,
        forksCount: repoInfo.forksCount || 0,
        sizeKb: repoInfo.sizeKb || 0,
        syncStatus: SyncStatus.PENDING,
        settings: config.settings || {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert repository into database
      await this.insertRepository(repository);

      // Setup webhook if requested
      if (config.setupWebhook && provider.supportsWebhooks()) {
        try {
          await this.webhookManager.setupWebhook(repository.id, provider);
        } catch (webhookError) {
          console.warn(`Failed to setup webhook for repository ${repository.id}:`, webhookError);
          // Don't fail the entire operation for webhook setup failure
        }
      }

      // Start initial sync if requested
      if (config.initialSync !== false) {
        // Run sync in background
        this.syncRepository(repository.id, { syncType: SyncType.FULL }).catch(error => {
          console.error(`Initial sync failed for repository ${repository.id}:`, error);
        });
      }

      return repository;
    } catch (error) {
      throw new Error(`Failed to add repository: ${error.message}`);
    }
  }

  /**
   * Get repository by ID
   */
  async getRepository(repositoryId: string): Promise<Repository | null> {
    try {
      const result = await this.db.kysely
        .selectFrom('code_repositories')
        .selectAll()
        .where('id', '=', repositoryId)
        .where('is_active', '=', true)
        .executeTakeFirst();

      return result ? this.mapDbRowToRepository(result) : null;
    } catch (error) {
      throw new Error(`Failed to get repository: ${error.message}`);
    }
  }

  /**
   * List repositories with filtering and pagination
   */
  async listRepositories(options: RepositorySearchOptions = {}): Promise<RepositoryListResponse> {
    try {
      const {
        provider,
        syncStatus,
        language,
        isActive = true,
        search,
        page = 1,
        pageSize = 20
      } = options;

      let query = this.db.kysely
        .selectFrom('code_repositories')
        .selectAll()
        .where('is_active', '=', isActive);

      // Apply filters
      if (provider) {
        query = query.where('provider', '=', provider);
      }

      if (syncStatus) {
        query = query.where('sync_status', '=', syncStatus);
      }

      if (language) {
        query = query.where('language', '=', language);
      }

      if (search) {
        query = query.where(eb => 
          eb.or([
            eb('name', 'ilike', `%${search}%`),
            eb('description', 'ilike', `%${search}%`),
            eb('url', 'ilike', `%${search}%`)
          ])
        );
      }

      // Get total count
      const countResult = await query
        .select(({ fn }) => fn.count<number>('id').as('total'))
        .executeTakeFirst();

      const total = countResult?.total || 0;

      // Get paginated results
      const results = await query
        .orderBy('created_at', 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute();

      return {
        repositories: results.map(row => this.mapDbRowToRepository(row)),
        total,
        page,
        pageSize
      };
    } catch (error) {
      throw new Error(`Failed to list repositories: ${error.message}`);
    }
  }

  /**
   * Update repository configuration
   */
  async updateRepository(
    repositoryId: string,
    updates: UpdateRepositoryRequest
  ): Promise<Repository> {
    try {
      const existing = await this.getRepository(repositoryId);
      if (!existing) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      const updateData: any = {
        updated_at: new Date()
      };

      if (updates.name !== undefined) {
        updateData.name = updates.name;
      }

      if (updates.accessToken !== undefined) {
        updateData.access_token_encrypted = updates.accessToken ? this.encryptToken(updates.accessToken) : null;
      }

      if (updates.settings !== undefined) {
        updateData.settings = updates.settings;
      }

      if (updates.setupWebhook !== undefined) {
        // Handle webhook setup/removal
        const provider = this.gitProviderFactory.createProvider(
          existing.provider,
          existing.accessTokenEncrypted ? this.decryptToken(existing.accessTokenEncrypted) : undefined
        );

        if (updates.setupWebhook && provider.supportsWebhooks()) {
          await this.webhookManager.setupWebhook(repositoryId, provider);
        }
      }

      await this.db.kysely
        .updateTable('code_repositories')
        .set(updateData)
        .where('id', '=', repositoryId)
        .execute();

      return (await this.getRepository(repositoryId))!;
    } catch (error) {
      throw new Error(`Failed to update repository: ${error.message}`);
    }
  }

  /**
   * Delete repository (soft delete)
   */
  async deleteRepository(repositoryId: string): Promise<void> {
    try {
      const repository = await this.getRepository(repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      // Remove webhooks first
      const webhooks = await this.webhookManager.getRepositoryWebhooks(repositoryId);
      const provider = this.gitProviderFactory.createProvider(
        repository.provider,
        repository.accessTokenEncrypted ? this.decryptToken(repository.accessTokenEncrypted) : undefined
      );

      for (const webhook of webhooks) {
        try {
          await this.webhookManager.removeWebhook(repositoryId, webhook.id, provider);
        } catch (webhookError) {
          console.warn(`Failed to remove webhook ${webhook.id}:`, webhookError);
        }
      }

      // Soft delete repository
      await this.db.kysely
        .updateTable('code_repositories')
        .set({
          is_active: false,
          updated_at: new Date()
        })
        .where('id', '=', repositoryId)
        .execute();
    } catch (error) {
      throw new Error(`Failed to delete repository: ${error.message}`);
    }
  }

  // ===================
  // SYNCHRONIZATION
  // ===================

  /**
   * Synchronize repository with remote
   */
  async syncRepository(
    repositoryId: string, 
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Update sync status
    await this.updateSyncStatus(repositoryId, SyncStatus.SYNCING);
    
    const syncLog = await this.createSyncLog(repositoryId, options);
    
    try {
      const provider = this.gitProviderFactory.createProvider(
        repository.provider,
        repository.accessTokenEncrypted ? this.decryptToken(repository.accessTokenEncrypted) : undefined
      );

      let syncResult: SyncResult;
      
      switch (options.syncType || SyncType.INCREMENTAL) {
        case SyncType.FULL:
          syncResult = await this.performFullSync(repository, provider, syncLog.id);
          break;
        case SyncType.INCREMENTAL:
          syncResult = await this.performIncrementalSync(repository, provider, syncLog.id);
          break;
        case SyncType.WEBHOOK:
          syncResult = await this.performWebhookSync(repository, provider, options.webhookData, syncLog.id);
          break;
        default:
          throw new Error(`Unknown sync type: ${options.syncType}`);
      }

      // Update repository metadata
      await this.updateRepositoryMetadata(repositoryId, syncResult);
      
      // Update sync status
      await this.updateSyncStatus(repositoryId, SyncStatus.COMPLETED);
      await this.completeSyncLog(syncLog.id, syncResult);

      return syncResult;
    } catch (error) {
      await this.updateSyncStatus(repositoryId, SyncStatus.FAILED, error.message);
      await this.failSyncLog(syncLog.id, error);
      throw error;
    }
  }

  /**
   * Get repository branches
   */
  async getBranches(repositoryId: string): Promise<Branch[]> {
    try {
      const result = await this.db.kysely
        .selectFrom('repository_branches')
        .selectAll()
        .where('repository_id', '=', repositoryId)
        .orderBy('is_default', 'desc')
        .orderBy('name', 'asc')
        .execute();

      return result.map(row => ({
        id: row.id,
        repositoryId: row.repository_id,
        name: row.name,
        commitHash: row.commit_hash,
        commitMessage: row.commit_message,
        authorName: row.author_name,
        authorEmail: row.author_email,
        lastCommitAt: row.last_commit_at,
        isDefault: row.is_default,
        isProtected: row.is_protected,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      throw new Error(`Failed to get repository branches: ${error.message}`);
    }
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats(): Promise<RepositoryStats> {
    try {
      // Get basic repository counts
      const repoStats = await this.db.kysely
        .selectFrom('code_repositories')
        .select(({ fn, case: caseWhen }) => [
          fn.count<number>('id').as('total_repositories'),
          fn.sum<number>(
            caseWhen().when('is_active', '=', true).then(1).else(0).end()
          ).as('active_repositories'),
          fn.sum<number>('size_kb').as('total_size_kb')
        ])
        .executeTakeFirst();

      // Get file count
      const fileStats = await this.db.kysely
        .selectFrom('code_files')
        .select(({ fn }) => fn.count<number>('id').as('total_files'))
        .where('is_deleted', '=', false)
        .executeTakeFirst();

      // Get sync status distribution
      const syncStatusStats = await this.db.kysely
        .selectFrom('code_repositories')
        .select(['sync_status'])
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .where('is_active', '=', true)
        .groupBy('sync_status')
        .execute();

      const syncStatus: Record<string, number> = {};
      syncStatusStats.forEach(row => {
        syncStatus[row.sync_status] = row.count;
      });

      // Get last sync time
      const lastSyncResult = await this.db.kysely
        .selectFrom('code_repositories')
        .select('last_sync_at')
        .where('is_active', '=', true)
        .where('last_sync_at', 'is not', null)
        .orderBy('last_sync_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      return {
        totalRepositories: repoStats?.total_repositories || 0,
        activeRepositories: repoStats?.active_repositories || 0,
        totalFiles: fileStats?.total_files || 0,
        totalSizeKb: repoStats?.total_size_kb || 0,
        lastSyncAt: lastSyncResult?.last_sync_at || undefined,
        syncStatus
      };
    } catch (error) {
      throw new Error(`Failed to get repository stats: ${error.message}`);
    }
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  /**
   * Insert repository into database
   */
  private async insertRepository(repository: Repository): Promise<void> {
    await this.db.kysely
      .insertInto('code_repositories')
      .values({
        id: repository.id,
        name: repository.name,
        url: repository.url,
        provider: repository.provider,
        access_token_encrypted: repository.accessTokenEncrypted,
        default_branch: repository.defaultBranch,
        description: repository.description,
        language: repository.language,
        stars_count: repository.starsCount,
        forks_count: repository.forksCount,
        size_kb: repository.sizeKb,
        sync_status: repository.syncStatus,
        settings: repository.settings,
        is_active: repository.isActive,
        created_at: repository.createdAt,
        updated_at: repository.updatedAt
      })
      .execute();
  }

  /**
   * Map database row to Repository object
   */
  private mapDbRowToRepository(row: any): Repository {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      provider: row.provider,
      accessTokenEncrypted: row.access_token_encrypted,
      defaultBranch: row.default_branch,
      description: row.description,
      language: row.language,
      starsCount: row.stars_count,
      forksCount: row.forks_count,
      sizeKb: row.size_kb,
      lastSyncAt: row.last_sync_at,
      syncStatus: row.sync_status,
      syncError: row.sync_error,
      settings: row.settings || {},
      webhookSecret: row.webhook_secret,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Perform full repository synchronization
   */
  private async performFullSync(
    repository: Repository,
    provider: GitProvider,
    syncLogId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    
    // Get repository tree
    const tree = await provider.getRepositoryTree(repository.url, repository.defaultBranch);
    
    // Process all files
    const processedFiles = await this.fileScanService.processFiles(
      repository.id,
      tree.files,
      provider
    );

    // Update branches
    const branches = await provider.getBranches(repository.url);
    await this.updateRepositoryBranches(repository.id, branches);

    const duration = Date.now() - startTime;
    
    return {
      syncType: SyncType.FULL,
      filesProcessed: processedFiles.total,
      filesAdded: processedFiles.added,
      filesModified: processedFiles.modified,
      filesDeleted: processedFiles.deleted,
      errorsEncountered: processedFiles.errors,
      duration,
      commitHash: tree.commitHash
    };
  }

  /**
   * Perform incremental synchronization
   */
  private async performIncrementalSync(
    repository: Repository,
    provider: GitProvider,
    syncLogId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    
    // Get last sync commit
    const lastSyncCommit = await this.getLastSyncCommit(repository.id);
    
    if (!lastSyncCommit) {
      // No previous sync, perform full sync instead
      return this.performFullSync(repository, provider, syncLogId);
    }

    // Get changes since last sync
    const changes = await provider.getChangesSince(
      repository.url,
      repository.defaultBranch,
      lastSyncCommit
    );

    // Process changed files
    const processedFiles = await this.fileScanService.processChangedFiles(
      repository.id,
      changes.files,
      provider
    );

    const duration = Date.now() - startTime;
    
    return {
      syncType: SyncType.INCREMENTAL,
      filesProcessed: changes.files.length,
      filesAdded: processedFiles.added,
      filesModified: processedFiles.modified,
      filesDeleted: processedFiles.deleted,
      errorsEncountered: processedFiles.errors,
      duration,
      commitHash: changes.latestCommit
    };
  }

  /**
   * Perform webhook-triggered synchronization
   */
  private async performWebhookSync(
    repository: Repository,
    provider: GitProvider,
    webhookData: any,
    syncLogId: string
  ): Promise<SyncResult> {
    const startTime = Date.now();
    
    // Parse webhook data to get affected files
    const affectedFiles = provider.parseWebhookData(webhookData);
    
    if (affectedFiles.length === 0) {
      // No files changed, return empty result
      return {
        syncType: SyncType.WEBHOOK,
        filesProcessed: 0,
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        errorsEncountered: 0,
        duration: Date.now() - startTime,
        commitHash: webhookData.after || webhookData.commits?.[0]?.id
      };
    }

    // Process only affected files
    const processedFiles = await this.fileScanService.processChangedFiles(
      repository.id,
      affectedFiles,
      provider
    );

    const duration = Date.now() - startTime;
    
    return {
      syncType: SyncType.WEBHOOK,
      filesProcessed: affectedFiles.length,
      filesAdded: processedFiles.added,
      filesModified: processedFiles.modified,
      filesDeleted: processedFiles.deleted,
      errorsEncountered: processedFiles.errors,
      duration,
      commitHash: webhookData.after || webhookData.commits?.[0]?.id
    };
  }

  /**
   * Update repository sync status
   */
  private async updateSyncStatus(
    repositoryId: string,
    status: SyncStatus,
    error?: string
  ): Promise<void> {
    const updates: any = {
      sync_status: status,
      updated_at: new Date()
    };

    if (status === SyncStatus.COMPLETED) {
      updates.last_sync_at = new Date();
      updates.sync_error = null;
    } else if (status === SyncStatus.FAILED && error) {
      updates.sync_error = error;
    }

    await this.db.kysely
      .updateTable('code_repositories')
      .set(updates)
      .where('id', '=', repositoryId)
      .execute();
  }

  /**
   * Create sync log entry
   */
  private async createSyncLog(
    repositoryId: string,
    options: SyncOptions
  ): Promise<SyncLog> {
    const syncLog: SyncLog = {
      id: crypto.randomUUID(),
      repositoryId,
      branchName: options.branch,
      syncType: options.syncType || SyncType.INCREMENTAL,
      status: SyncOperationStatus.STARTED,
      filesProcessed: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      errorsEncountered: 0,
      startedAt: new Date()
    };

    await this.db.kysely
      .insertInto('repository_sync_logs')
      .values({
        id: syncLog.id,
        repository_id: syncLog.repositoryId,
        branch_name: syncLog.branchName,
        sync_type: syncLog.syncType,
        status: syncLog.status,
        files_processed: syncLog.filesProcessed,
        files_added: syncLog.filesAdded,
        files_modified: syncLog.filesModified,
        files_deleted: syncLog.filesDeleted,
        errors_encountered: syncLog.errorsEncountered,
        started_at: syncLog.startedAt
      })
      .execute();

    return syncLog;
  }

  /**
   * Complete sync log
   */
  private async completeSyncLog(syncLogId: string, result: SyncResult): Promise<void> {
    await this.db.kysely
      .updateTable('repository_sync_logs')
      .set({
        status: SyncOperationStatus.COMPLETED,
        files_processed: result.filesProcessed,
        files_added: result.filesAdded,
        files_modified: result.filesModified,
        files_deleted: result.filesDeleted,
        errors_encountered: result.errorsEncountered,
        duration_ms: result.duration,
        commit_hash: result.commitHash,
        completed_at: new Date()
      })
      .where('id', '=', syncLogId)
      .execute();
  }

  /**
   * Mark sync log as failed
   */
  private async failSyncLog(syncLogId: string, error: Error): Promise<void> {
    await this.db.kysely
      .updateTable('repository_sync_logs')
      .set({
        status: SyncOperationStatus.FAILED,
        error_details: { error: error.message, stack: error.stack },
        completed_at: new Date()
      })
      .where('id', '=', syncLogId)
      .execute();
  }

  /**
   * Get last sync commit hash
   */
  private async getLastSyncCommit(repositoryId: string): Promise<string | null> {
    const result = await this.db.kysely
      .selectFrom('repository_sync_logs')
      .select('commit_hash')
      .where('repository_id', '=', repositoryId)
      .where('status', '=', SyncOperationStatus.COMPLETED)
      .orderBy('completed_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    return result?.commit_hash || null;
  }

  /**
   * Update repository metadata after sync
   */
  private async updateRepositoryMetadata(
    repositoryId: string,
    result: SyncResult
  ): Promise<void> {
    const updates: any = {
      updated_at: new Date()
    };

    if (result.commitHash) {
      // Update size from file counts
      const fileStats = await this.db.kysely
        .selectFrom('code_files')
        .select(({ fn }) => [
          fn.sum<number>('size_bytes').as('total_size')
        ])
        .where('repository_id', '=', repositoryId)
        .where('is_deleted', '=', false)
        .executeTakeFirst();

      if (fileStats?.total_size) {
        updates.size_kb = Math.round(fileStats.total_size / 1024);
      }
    }

    await this.db.kysely
      .updateTable('code_repositories')
      .set(updates)
      .where('id', '=', repositoryId)
      .execute();
  }

  /**
   * Update repository branches
   */
  private async updateRepositoryBranches(
    repositoryId: string,
    branches: any[]
  ): Promise<void> {
    // Clear existing branches
    await this.db.kysely
      .deleteFrom('repository_branches')
      .where('repository_id', '=', repositoryId)
      .execute();

    // Insert new branches
    for (const branch of branches) {
      await this.db.kysely
        .insertInto('repository_branches')
        .values({
          id: crypto.randomUUID(),
          repository_id: repositoryId,
          name: branch.name,
          commit_hash: branch.commitHash,
          commit_message: branch.commitMessage,
          author_name: branch.authorName,
          author_email: branch.authorEmail,
          last_commit_at: branch.lastCommitAt,
          is_default: false, // Would need repo info to determine
          is_protected: branch.isProtected || false,
          created_at: new Date(),
          updated_at: new Date()
        })
        .execute();
    }
  }

  /**
   * Encrypt access token
   */
  private encryptToken(token: string): string {
    // For production, use proper encryption (AES-256-GCM)
    // For now, using base64 encoding (NOT SECURE)
    return Buffer.from(token).toString('base64');
  }

  /**
   * Decrypt access token
   */
  private decryptToken(encryptedToken: string): string {
    // For production, use proper decryption
    // For now, using base64 decoding (NOT SECURE)
    return Buffer.from(encryptedToken, 'base64').toString();
  }
}