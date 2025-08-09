/**
 * Repository Management Types
 * 
 * Comprehensive TypeScript types for the code repository management system.
 * Supports multiple Git providers with robust type safety and validation.
 */

import { z } from 'zod';

// ===================
// CORE REPOSITORY TYPES
// ===================

/**
 * Supported Git providers
 */
export enum GitProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  LOCAL = 'local'
}

/**
 * Repository synchronization status
 */
export enum SyncStatus {
  PENDING = 'pending',
  SYNCING = 'syncing', 
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Synchronization types
 */
export enum SyncType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  WEBHOOK = 'webhook'
}

/**
 * Sync operation status
 */
export enum SyncOperationStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// ===================
// REPOSITORY SCHEMAS
// ===================

/**
 * Repository configuration schema for creating/updating repositories
 */
export const repositoryConfigSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url(),
  provider: z.nativeEnum(GitProvider),
  accessToken: z.string().optional(),
  setupWebhook: z.boolean().default(false),
  initialSync: z.boolean().default(true),
  settings: z.record(z.any()).default({})
});

/**
 * Repository schema
 */
export const repositorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  url: z.string(),
  provider: z.nativeEnum(GitProvider),
  accessTokenEncrypted: z.string().optional(),
  defaultBranch: z.string(),
  description: z.string().optional(),
  language: z.string().optional(),
  starsCount: z.number().int().default(0),
  forksCount: z.number().int().default(0),
  sizeKb: z.number().int().default(0),
  lastSyncAt: z.date().optional(),
  syncStatus: z.nativeEnum(SyncStatus),
  syncError: z.string().optional(),
  settings: z.record(z.any()).default({}),
  webhookSecret: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Branch information schema
 */
export const branchSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  name: z.string(),
  commitHash: z.string().length(40),
  commitMessage: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().email().optional(),
  lastCommitAt: z.date().optional(),
  isDefault: z.boolean().default(false),
  isProtected: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Code file schema
 */
export const codeFileSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  path: z.string(),
  filename: z.string(),
  extension: z.string().optional(),
  language: z.string().optional(),
  sizeBytes: z.number().int().default(0),
  linesCount: z.number().int().default(0),
  contentHash: z.string().optional(),
  lastModified: z.date().optional(),
  commitHash: z.string().optional(),
  branch: z.string().optional(),
  isBinary: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Repository sync log schema
 */
export const syncLogSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  branchName: z.string().optional(),
  syncType: z.nativeEnum(SyncType),
  status: z.nativeEnum(SyncOperationStatus),
  filesProcessed: z.number().int().default(0),
  filesAdded: z.number().int().default(0),
  filesModified: z.number().int().default(0),
  filesDeleted: z.number().int().default(0),
  errorsEncountered: z.number().int().default(0),
  durationMs: z.number().int().optional(),
  errorDetails: z.record(z.any()).optional(),
  commitHash: z.string().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional()
});

/**
 * Repository webhook schema
 */
export const webhookSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  webhookId: z.string().optional(),
  webhookUrl: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  lastDeliveryAt: z.date().optional(),
  deliveryCount: z.number().int().default(0),
  errorCount: z.number().int().default(0),
  createdAt: z.date(),
  updatedAt: z.date()
});

// ===================
// SYNC OPERATION TYPES
// ===================

/**
 * Sync options schema
 */
export const syncOptionsSchema = z.object({
  syncType: z.nativeEnum(SyncType).optional(),
  branch: z.string().optional(),
  webhookData: z.record(z.any()).optional(),
  force: z.boolean().default(false)
});

/**
 * Sync result schema
 */
export const syncResultSchema = z.object({
  syncType: z.nativeEnum(SyncType),
  filesProcessed: z.number().int(),
  filesAdded: z.number().int(),
  filesModified: z.number().int(),
  filesDeleted: z.number().int(),
  errorsEncountered: z.number().int(),
  duration: z.number().int(),
  commitHash: z.string().optional()
});

// ===================
// GIT PROVIDER TYPES
// ===================

/**
 * Repository information from provider
 */
export const repositoryInfoSchema = z.object({
  name: z.string(),
  fullName: z.string(),
  description: z.string().optional(),
  language: z.string().optional(),
  defaultBranch: z.string(),
  starsCount: z.number().int().optional(),
  forksCount: z.number().int().optional(),
  sizeKb: z.number().int().optional(),
  isPrivate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Repository tree structure
 */
export const repositoryTreeSchema = z.object({
  commitHash: z.string(),
  files: z.array(z.object({
    path: z.string(),
    sha: z.string(),
    size: z.number().int(),
    mode: z.string()
  }))
});

/**
 * Branch information from provider
 */
export const branchInfoSchema = z.object({
  name: z.string(),
  commitHash: z.string(),
  commitMessage: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  lastCommitAt: z.date().optional(),
  isProtected: z.boolean().default(false)
});

/**
 * Change set for incremental sync
 */
export const changeSetSchema = z.object({
  latestCommit: z.string(),
  files: z.array(z.object({
    path: z.string(),
    changeType: z.enum(['added', 'modified', 'deleted']),
    sha: z.string().optional(),
    previousSha: z.string().optional()
  }))
});

/**
 * File change for webhook processing
 */
export const fileChangeSchema = z.object({
  path: z.string(),
  changeType: z.enum(['added', 'modified', 'deleted']),
  sha: z.string().optional()
});

// ===================
// TYPESCRIPT TYPES
// ===================

export type RepositoryConfig = z.infer<typeof repositoryConfigSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type Branch = z.infer<typeof branchSchema>;
export type RepositoryCodeFile = z.infer<typeof codeFileSchema>;
export type SyncLog = z.infer<typeof syncLogSchema>;
export type RepositoryWebhook = z.infer<typeof webhookSchema>;
export type SyncOptions = z.infer<typeof syncOptionsSchema>;
export type SyncResult = z.infer<typeof syncResultSchema>;
export type RepositoryInfo = z.infer<typeof repositoryInfoSchema>;
export type RepositoryTree = z.infer<typeof repositoryTreeSchema>;
export type BranchInfo = z.infer<typeof branchInfoSchema>;
export type ChangeSet = z.infer<typeof changeSetSchema>;
export type FileChange = z.infer<typeof fileChangeSchema>;

// ===================
// PROCESSED FILES RESULT
// ===================

/**
 * Result of file processing operations
 */
export interface ProcessedFilesResult {
  total: number;
  added: number;
  modified: number;
  deleted: number;
  errors: number;
}

// ===================
// API REQUEST/RESPONSE TYPES
// ===================

/**
 * Repository creation request
 */
export const createRepositoryRequestSchema = repositoryConfigSchema;
export type CreateRepositoryRequest = z.infer<typeof createRepositoryRequestSchema>;

/**
 * Repository update request
 */
export const updateRepositoryRequestSchema = repositoryConfigSchema.partial().omit({ url: true, provider: true });
export type UpdateRepositoryRequest = z.infer<typeof updateRepositoryRequestSchema>;

/**
 * Repository list response
 */
export const repositoryListResponseSchema = z.object({
  repositories: z.array(repositorySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int()
});
export type RepositoryListResponse = z.infer<typeof repositoryListResponseSchema>;

/**
 * Sync trigger request
 */
export const syncTriggerRequestSchema = syncOptionsSchema;
export type SyncTriggerRequest = z.infer<typeof syncTriggerRequestSchema>;

/**
 * Repository stats response
 */
export const repositoryStatsSchema = z.object({
  totalRepositories: z.number().int(),
  activeRepositories: z.number().int(),
  totalFiles: z.number().int(),
  totalSizeKb: z.number().int(),
  lastSyncAt: z.date().optional(),
  syncStatus: z.record(z.number().int())
});
export type RepositoryStats = z.infer<typeof repositoryStatsSchema>;