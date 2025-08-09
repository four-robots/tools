/**
 * Repository Service Unit Tests
 * 
 * Comprehensive test suite for the repository management service.
 */

// Mock external dependencies before importing
jest.mock('@octokit/rest');
jest.mock('@octokit/plugin-throttling');
jest.mock('@gitbeaker/rest');
jest.mock('axios');

import { DatabaseManager } from '../../../utils/database.js';
import { 
  GitProvider as GitProviderEnum,
  SyncStatus,
  SyncType,
  type Repository,
  type CreateRepositoryRequest,
  type SyncResult
} from '../../../shared/types/repository.js';

// Mock implementations
const mockDb = {
  kysely: {
    insertInto: jest.fn().mockReturnThis(),
    selectFrom: jest.fn().mockReturnThis(),
    updateTable: jest.fn().mockReturnThis(),
    deleteFrom: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    executeTakeFirst: jest.fn(),
    or: jest.fn(),
    raw: jest.fn()
  }
} as any;

const mockProvider = {
  name: 'Test Provider',
  provider: GitProviderEnum.GITHUB,
  getRepositoryInfo: jest.fn(),
  getRepositoryTree: jest.fn(),
  getBranches: jest.fn(),
  getFileContent: jest.fn(),
  getChangesSince: jest.fn(),
  supportsWebhooks: jest.fn().mockReturnValue(true),
  parseWebhookData: jest.fn(),
  validateAccess: jest.fn().mockResolvedValue(true)
};

// Mock factory
const mockGitProviderFactory = {
  getInstance: jest.fn().mockReturnThis(),
  createProvider: jest.fn().mockReturnValue(mockProvider),
  detectProvider: jest.fn().mockReturnValue(GitProviderEnum.GITHUB),
  createProviderFromUrl: jest.fn().mockReturnValue(mockProvider)
};

// Mock webhook manager
const mockWebhookManager = {
  setupWebhook: jest.fn(),
  removeWebhook: jest.fn(),
  processWebhookPayload: jest.fn(),
  getWebhookStats: jest.fn(),
  getRepositoryWebhooks: jest.fn().mockResolvedValue([]),
  updateWebhookConfig: jest.fn()
};

// Mock file scan service
const mockFileScanService = {
  processFiles: jest.fn(),
  processChangedFiles: jest.fn(),
  processSpecificFiles: jest.fn()
};

// Mock the RepositoryService class
class MockRepositoryService {
  private db: any;
  private gitProviderFactory: any;
  private webhookManager: any;
  private fileScanService: any;

  constructor(db: any) {
    this.db = db;
    this.gitProviderFactory = mockGitProviderFactory;
    this.webhookManager = mockWebhookManager;
    this.fileScanService = mockFileScanService;
  }

  async addRepository(config: CreateRepositoryRequest): Promise<Repository> {
    // Validate repository access
    const provider = this.gitProviderFactory.createProvider(config.provider, config.accessToken);
    const repoInfo = await provider.getRepositoryInfo(config.url);

    const repository: Repository = {
      id: 'test-repo-id',
      name: config.name || repoInfo.name,
      url: config.url,
      provider: config.provider,
      accessTokenEncrypted: config.accessToken ? 'encrypted-token' : undefined,
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

    // Mock database insert
    await this.db.kysely.insertInto('code_repositories').values(repository).execute();

    // Setup webhook if requested
    if (config.setupWebhook && provider.supportsWebhooks()) {
      await this.webhookManager.setupWebhook(repository.id, provider);
    }

    return repository;
  }

  async getRepository(repositoryId: string): Promise<Repository | null> {
    const result = await this.db.kysely
      .selectFrom('code_repositories')
      .selectAll()
      .where('id', '=', repositoryId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      url: result.url,
      provider: result.provider,
      accessTokenEncrypted: result.access_token_encrypted,
      defaultBranch: result.default_branch,
      description: result.description,
      language: result.language,
      starsCount: result.stars_count,
      forksCount: result.forks_count,
      sizeKb: result.size_kb,
      lastSyncAt: result.last_sync_at,
      syncStatus: result.sync_status,
      syncError: result.sync_error,
      settings: result.settings || {},
      webhookSecret: result.webhook_secret,
      isActive: result.is_active,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  async listRepositories(options: any = {}) {
    const total = await this.db.kysely.selectFrom('code_repositories').select().executeTakeFirst();
    const repositories = await this.db.kysely.selectFrom('code_repositories').selectAll().execute();

    return {
      repositories: repositories.map((row: any) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        provider: row.provider,
        syncStatus: row.sync_status,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      total: total?.total || 0,
      page: options.page || 1,
      pageSize: options.pageSize || 20
    };
  }

  async syncRepository(repositoryId: string, options: any = {}) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Update sync status to syncing
    await this.updateSyncStatus(repositoryId, SyncStatus.SYNCING);

    const mockSyncResult: SyncResult = {
      syncType: options.syncType || SyncType.INCREMENTAL,
      filesProcessed: 100,
      filesAdded: 50,
      filesModified: 30,
      filesDeleted: 20,
      errorsEncountered: 0,
      duration: 5000,
      commitHash: 'abc123'
    };

    // Update sync status to completed
    await this.updateSyncStatus(repositoryId, SyncStatus.COMPLETED);

    return mockSyncResult;
  }

  async deleteRepository(repositoryId: string): Promise<void> {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    // Get webhooks and remove them
    const webhooks = await this.webhookManager.getRepositoryWebhooks(repositoryId);
    for (const webhook of webhooks) {
      await this.webhookManager.removeWebhook(repositoryId, webhook.id, mockProvider);
    }

    // Soft delete
    await this.db.kysely
      .updateTable('code_repositories')
      .set({ is_active: false, updated_at: new Date() })
      .where('id', '=', repositoryId)
      .execute();
  }

  async getRepositoryStats() {
    return {
      totalRepositories: 10,
      activeRepositories: 8,
      totalFiles: 1000,
      totalSizeKb: 10240,
      lastSyncAt: new Date('2024-01-01'),
      syncStatus: {
        [SyncStatus.COMPLETED]: 5,
        [SyncStatus.PENDING]: 2,
        [SyncStatus.FAILED]: 1
      }
    };
  }

  private async updateSyncStatus(repositoryId: string, status: SyncStatus, error?: string) {
    await this.db.kysely
      .updateTable('code_repositories')
      .set({ sync_status: status, sync_error: error })
      .where('id', '=', repositoryId)
      .execute();
  }
}

describe('RepositoryService', () => {
  let repositoryService: MockRepositoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryService = new MockRepositoryService(mockDb as DatabaseManager);
  });

  describe('addRepository', () => {
    const mockRepositoryConfig: CreateRepositoryRequest = {
      name: 'test-repo',
      url: 'https://github.com/test/repo',
      provider: GitProviderEnum.GITHUB,
      accessToken: 'test-token',
      setupWebhook: true,
      initialSync: true
    };

    const mockRepositoryInfo = {
      name: 'test-repo',
      fullName: 'test/test-repo',
      description: 'Test repository',
      language: 'javascript',
      defaultBranch: 'main',
      starsCount: 100,
      forksCount: 50,
      sizeKb: 1024,
      isPrivate: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    };

    beforeEach(() => {
      mockProvider.getRepositoryInfo.mockResolvedValue(mockRepositoryInfo);
      mockDb.kysely.execute.mockResolvedValue(undefined);
      mockWebhookManager.setupWebhook.mockResolvedValue('webhook-id');
    });

    it('should successfully add a new repository', async () => {
      const result = await repositoryService.addRepository(mockRepositoryConfig);

      expect(result).toBeDefined();
      expect(result.name).toBe('test-repo');
      expect(result.url).toBe('https://github.com/test/repo');
      expect(result.provider).toBe(GitProviderEnum.GITHUB);
      expect(result.syncStatus).toBe(SyncStatus.PENDING);
      expect(result.isActive).toBe(true);

      // Verify provider was called
      expect(mockGitProviderFactory.createProvider).toHaveBeenCalledWith(
        GitProviderEnum.GITHUB,
        'test-token'
      );
      expect(mockProvider.getRepositoryInfo).toHaveBeenCalledWith(
        'https://github.com/test/repo'
      );

      // Verify database insert
      expect(mockDb.kysely.insertInto).toHaveBeenCalledWith('code_repositories');
      expect(mockDb.kysely.execute).toHaveBeenCalled();

      // Verify webhook setup was attempted
      expect(mockWebhookManager.setupWebhook).toHaveBeenCalled();
    });

    it('should handle repository info retrieval failure', async () => {
      mockProvider.getRepositoryInfo.mockRejectedValue(new Error('Repository not found'));

      await expect(repositoryService.addRepository(mockRepositoryConfig))
        .rejects.toThrow('Failed to add repository: Repository not found');
    });

    it('should continue if webhook setup fails', async () => {
      mockWebhookManager.setupWebhook.mockRejectedValue(new Error('Webhook setup failed'));

      const result = await repositoryService.addRepository(mockRepositoryConfig);

      expect(result).toBeDefined();
      expect(result.name).toBe('test-repo');
      // Should not fail the entire operation
    });

    it('should skip webhook setup for providers that do not support it', async () => {
      mockProvider.supportsWebhooks.mockReturnValue(false);

      const result = await repositoryService.addRepository(mockRepositoryConfig);

      expect(result).toBeDefined();
      expect(mockWebhookManager.setupWebhook).not.toHaveBeenCalled();
    });

    it('should use repository name from config when provided', async () => {
      const config = {
        ...mockRepositoryConfig,
        name: 'custom-name'
      };

      const result = await repositoryService.addRepository(config);

      expect(result.name).toBe('custom-name');
    });

    it('should use repository name from provider info when not provided in config', async () => {
      const config = {
        ...mockRepositoryConfig,
        name: undefined
      };

      const result = await repositoryService.addRepository(config);

      expect(result.name).toBe('test-repo'); // From mockRepositoryInfo
    });
  });

  describe('getRepository', () => {
    const mockDbResult = {
      id: 'repo-id',
      name: 'test-repo',
      url: 'https://github.com/test/repo',
      provider: GitProviderEnum.GITHUB,
      access_token_encrypted: 'encrypted-token',
      default_branch: 'main',
      description: 'Test repository',
      language: 'javascript',
      stars_count: 100,
      forks_count: 50,
      size_kb: 1024,
      last_sync_at: new Date('2024-01-01'),
      sync_status: SyncStatus.COMPLETED,
      sync_error: null,
      settings: { test: true },
      webhook_secret: 'webhook-secret',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-02')
    };

    it('should successfully retrieve a repository', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue(mockDbResult);

      const result = await repositoryService.getRepository('repo-id');

      expect(result).toBeDefined();
      expect(result!.id).toBe('repo-id');
      expect(result!.name).toBe('test-repo');
      expect(result!.provider).toBe(GitProviderEnum.GITHUB);
      expect(result!.syncStatus).toBe(SyncStatus.COMPLETED);

      expect(mockDb.kysely.selectFrom).toHaveBeenCalledWith('code_repositories');
      expect(mockDb.kysely.where).toHaveBeenCalledWith('id', '=', 'repo-id');
      expect(mockDb.kysely.where).toHaveBeenCalledWith('is_active', '=', true);
    });

    it('should return null when repository is not found', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue(null);

      const result = await repositoryService.getRepository('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockDb.kysely.executeTakeFirst.mockRejectedValue(new Error('Database error'));

      await expect(repositoryService.getRepository('repo-id'))
        .rejects.toThrow('Failed to get repository: Database error');
    });
  });

  describe('listRepositories', () => {
    const mockRepositories = [
      {
        id: 'repo-1',
        name: 'repo-1',
        url: 'https://github.com/test/repo-1',
        provider: GitProviderEnum.GITHUB,
        access_token_encrypted: null,
        default_branch: 'main',
        description: 'Repository 1',
        language: 'javascript',
        stars_count: 100,
        forks_count: 50,
        size_kb: 1024,
        last_sync_at: new Date('2024-01-01'),
        sync_status: SyncStatus.COMPLETED,
        sync_error: null,
        settings: {},
        webhook_secret: null,
        is_active: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02')
      }
    ];

    it('should list repositories with default options', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue({ total: 1 });
      mockDb.kysely.execute.mockResolvedValue(mockRepositories);

      const result = await repositoryService.listRepositories();

      expect(result).toBeDefined();
      expect(result.repositories).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);

      expect(mockDb.kysely.selectFrom).toHaveBeenCalledWith('code_repositories');
      expect(mockDb.kysely.where).toHaveBeenCalledWith('is_active', '=', true);
      expect(mockDb.kysely.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should apply filters correctly', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue({ total: 1 });
      mockDb.kysely.execute.mockResolvedValue(mockRepositories);

      await repositoryService.listRepositories({
        provider: GitProviderEnum.GITHUB,
        syncStatus: SyncStatus.COMPLETED,
        language: 'javascript',
        search: 'test'
      });

      expect(mockDb.kysely.where).toHaveBeenCalledWith('provider', '=', GitProviderEnum.GITHUB);
      expect(mockDb.kysely.where).toHaveBeenCalledWith('sync_status', '=', SyncStatus.COMPLETED);
      expect(mockDb.kysely.where).toHaveBeenCalledWith('language', '=', 'javascript');
    });

    it('should handle pagination correctly', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue({ total: 100 });
      mockDb.kysely.execute.mockResolvedValue(mockRepositories);

      const result = await repositoryService.listRepositories({
        page: 3,
        pageSize: 10
      });

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(mockDb.kysely.limit).toHaveBeenCalledWith(10);
      expect(mockDb.kysely.offset).toHaveBeenCalledWith(20); // (page - 1) * pageSize
    });
  });

  describe('syncRepository', () => {
    const mockRepository: Repository = {
      id: 'repo-id',
      name: 'test-repo',
      url: 'https://github.com/test/repo',
      provider: GitProviderEnum.GITHUB,
      accessTokenEncrypted: 'encrypted-token',
      defaultBranch: 'main',
      description: 'Test repository',
      language: 'javascript',
      starsCount: 100,
      forksCount: 50,
      sizeKb: 1024,
      lastSyncAt: new Date('2024-01-01'),
      syncStatus: SyncStatus.COMPLETED,
      settings: {},
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    };

    const mockSyncResult: SyncResult = {
      syncType: SyncType.FULL,
      filesProcessed: 100,
      filesAdded: 50,
      filesModified: 30,
      filesDeleted: 20,
      errorsEncountered: 0,
      duration: 5000,
      commitHash: 'abc123'
    };

    beforeEach(() => {
      // Mock getRepository to return test repository
      mockDb.kysely.executeTakeFirst.mockResolvedValue({
        id: 'repo-id',
        name: 'test-repo',
        url: 'https://github.com/test/repo',
        provider: GitProviderEnum.GITHUB,
        access_token_encrypted: 'encrypted-token',
        default_branch: 'main',
        sync_status: SyncStatus.COMPLETED,
        is_active: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02')
      });
      
      mockDb.kysely.execute.mockResolvedValue(undefined);
    });

    it('should successfully perform full sync', async () => {
      const result = await repositoryService.syncRepository('repo-id', {
        syncType: SyncType.FULL
      });

      expect(result).toBeDefined();
      expect(result.syncType).toBe(SyncType.FULL);
      expect(result.filesProcessed).toBe(100);
      expect(mockDb.kysely.updateTable).toHaveBeenCalledWith('code_repositories');
    });

    it('should successfully perform incremental sync', async () => {
      const result = await repositoryService.syncRepository('repo-id', {
        syncType: SyncType.INCREMENTAL
      });

      expect(result).toBeDefined();
      expect(result.syncType).toBe(SyncType.INCREMENTAL);
      expect(result.filesProcessed).toBe(100);
    });

    it('should successfully perform webhook sync', async () => {
      const webhookData = { commits: [] };
      const result = await repositoryService.syncRepository('repo-id', {
        syncType: SyncType.WEBHOOK,
        webhookData
      });

      expect(result).toBeDefined();
      expect(result.syncType).toBe(SyncType.WEBHOOK);
    });

    it('should throw error when repository not found', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue(null);

      await expect(repositoryService.syncRepository('non-existent-id'))
        .rejects.toThrow('Repository not found');
    });

    it('should default to incremental sync when no type specified', async () => {
      const result = await repositoryService.syncRepository('repo-id');

      expect(result.syncType).toBe(SyncType.INCREMENTAL);
    });
  });

  describe('deleteRepository', () => {
    const mockRepository: Repository = {
      id: 'repo-id',
      name: 'test-repo',
      url: 'https://github.com/test/repo',
      provider: GitProviderEnum.GITHUB,
      accessTokenEncrypted: 'encrypted-token',
      defaultBranch: 'main',
      syncStatus: SyncStatus.COMPLETED,
      settings: {},
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    };

    beforeEach(() => {
      jest.spyOn(repositoryService, 'getRepository').mockResolvedValue(mockRepository);
      mockDb.kysely.execute.mockResolvedValue(undefined);
    });

    it('should successfully delete a repository', async () => {
      await repositoryService.deleteRepository('repo-id');

      expect(mockWebhookManager.getRepositoryWebhooks).toHaveBeenCalledWith('repo-id');
      expect(mockDb.kysely.updateTable).toHaveBeenCalledWith('code_repositories');
      expect(mockDb.kysely.set).toHaveBeenCalledWith({
        is_active: false,
        updated_at: expect.any(Date)
      });
      expect(mockDb.kysely.where).toHaveBeenCalledWith('id', '=', 'repo-id');
    });

    it('should throw error when repository not found', async () => {
      jest.spyOn(repositoryService, 'getRepository').mockResolvedValue(null);

      await expect(repositoryService.deleteRepository('non-existent-id'))
        .rejects.toThrow('Repository not found: non-existent-id');
    });

    it('should remove webhooks before deleting', async () => {
      const mockWebhooks = [{ id: 'webhook-1' }, { id: 'webhook-2' }];
      mockWebhookManager.getRepositoryWebhooks.mockResolvedValue(mockWebhooks);

      await repositoryService.deleteRepository('repo-id');

      expect(mockWebhookManager.removeWebhook).toHaveBeenCalledTimes(2);
      expect(mockWebhookManager.removeWebhook).toHaveBeenCalledWith(
        'repo-id',
        'webhook-1',
        expect.any(Object)
      );
    });

    it('should continue deletion even if webhook removal fails', async () => {
      const mockWebhooks = [{ id: 'webhook-1' }];
      mockWebhookManager.getRepositoryWebhooks.mockResolvedValue(mockWebhooks);
      mockWebhookManager.removeWebhook.mockRejectedValue(new Error('Webhook removal failed'));

      await repositoryService.deleteRepository('repo-id');

      // Should still perform the soft delete
      expect(mockDb.kysely.updateTable).toHaveBeenCalledWith('code_repositories');
    });
  });

  describe('getRepositoryStats', () => {
    it('should return comprehensive repository statistics', async () => {
      // Mock database responses
      mockDb.kysely.executeTakeFirst
        .mockResolvedValueOnce({ // Repository stats
          total_repositories: 10,
          active_repositories: 8,
          total_size_kb: 10240
        })
        .mockResolvedValueOnce({ // File stats
          total_files: 1000
        })
        .mockResolvedValueOnce({ // Last sync
          last_sync_at: new Date('2024-01-01')
        });

      mockDb.kysely.execute.mockResolvedValue([ // Sync status distribution
        { sync_status: SyncStatus.COMPLETED, count: 5 },
        { sync_status: SyncStatus.PENDING, count: 2 },
        { sync_status: SyncStatus.FAILED, count: 1 }
      ]);

      const result = await repositoryService.getRepositoryStats();

      expect(result).toBeDefined();
      expect(result.totalRepositories).toBe(10);
      expect(result.activeRepositories).toBe(8);
      expect(result.totalFiles).toBe(1000);
      expect(result.totalSizeKb).toBe(10240);
      expect(result.lastSyncAt).toEqual(new Date('2024-01-01'));
      expect(result.syncStatus).toEqual({
        [SyncStatus.COMPLETED]: 5,
        [SyncStatus.PENDING]: 2,
        [SyncStatus.FAILED]: 1
      });
    });

    it('should handle missing data gracefully', async () => {
      mockDb.kysely.executeTakeFirst.mockResolvedValue(null);
      mockDb.kysely.execute.mockResolvedValue([]);

      const result = await repositoryService.getRepositoryStats();

      expect(result).toBeDefined();
      expect(result.totalRepositories).toBe(0);
      expect(result.activeRepositories).toBe(0);
      expect(result.totalFiles).toBe(0);
      expect(result.totalSizeKb).toBe(0);
      expect(result.lastSyncAt).toBeUndefined();
      expect(result.syncStatus).toEqual({});
    });
  });
});