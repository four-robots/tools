import { z } from 'zod';

/**
 * Saved Search Management Types
 * 
 * Comprehensive type definitions for saved search management system including:
 * - Search saving and organization
 * - Collections and folders
 * - Scheduling and automation
 * - Sharing and collaboration
 * - Version history
 * - Analytics and usage tracking
 */

// Base search query data structure
export const SearchQueryDataSchema = z.object({
  query: z.string(),
  filters: z.record(z.any()).optional(),
  facets: z.record(z.any()).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  dataSources: z.array(z.string()).optional(),
  aiSummaryEnabled: z.boolean().optional(),
  summaryType: z.enum(['key_points', 'overview', 'detailed']).optional(),
  facetSelections: z.record(z.array(z.string())).optional(),
  customFilters: z.any().optional(), // Filter tree from custom filter builder
  searchMode: z.enum(['standard', 'semantic', 'hybrid']).optional(),
  timeRange: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
    relative: z.string().optional(),
  }).optional(),
});

export type SearchQueryData = z.infer<typeof SearchQueryDataSchema>;

// Main saved search type
export const SavedSearchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  queryData: SearchQueryDataSchema,
  ownerId: z.string().uuid(),
  isPublic: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  executionCount: z.number().int().min(0).default(0),
  lastExecutedAt: z.date().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SavedSearch = z.infer<typeof SavedSearchSchema>;

// Search collection/folder type
export const SearchCollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  ownerId: z.string().uuid(),
  parentCollectionId: z.string().uuid().optional(),
  isShared: z.boolean().default(false),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(), // Hex color
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().default(0),
  children: z.array(z.lazy(() => SearchCollectionSchema)).optional(),
  searches: z.array(SavedSearchSchema).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SearchCollection = z.infer<typeof SearchCollectionSchema>;

// Search collection item relationship
export const SearchCollectionItemSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  collectionId: z.string().uuid(),
  addedAt: z.date(),
  addedBy: z.string().uuid(),
});

export type SearchCollectionItem = z.infer<typeof SearchCollectionItemSchema>;

// Notification settings for scheduled searches
export const NotificationSettingsSchema = z.object({
  email: z.boolean().default(false),
  webhook: z.boolean().default(false),
  webhookUrl: z.string().url().optional(),
  emailRecipients: z.array(z.string().email()).default([]),
  notifyOnSuccess: z.boolean().default(true),
  notifyOnFailure: z.boolean().default(true),
  notifyOnNoResults: z.boolean().default(false),
  includeResults: z.boolean().default(false),
  maxResultsToInclude: z.number().int().positive().default(10),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

// Search schedule type
export const SearchScheduleSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  scheduleType: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']),
  cronExpression: z.string().optional(),
  timezone: z.string().default('UTC'),
  isActive: z.boolean().default(true),
  nextExecutionAt: z.date().optional(),
  lastExecutionAt: z.date().optional(),
  executionCount: z.number().int().min(0).default(0),
  maxExecutions: z.number().int().positive().optional(),
  notificationSettings: NotificationSettingsSchema.default({}),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SearchSchedule = z.infer<typeof SearchScheduleSchema>;

// Search sharing configuration
export const SearchShareSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  sharedWithUserId: z.string().uuid().optional(),
  sharedWithTeamId: z.string().uuid().optional(), // Future team functionality
  permissionLevel: z.enum(['view', 'edit', 'admin']).default('view'),
  shareToken: z.string().max(100).optional(),
  expiresAt: z.date().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
});

export type SearchShare = z.infer<typeof SearchShareSchema>;

// Search version for history tracking
export const SearchVersionSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  name: z.string().min(1).max(200),
  queryData: SearchQueryDataSchema,
  changeDescription: z.string().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
});

export type SearchVersion = z.infer<typeof SearchVersionSchema>;

// Search execution record
export const SearchExecutionSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  scheduleId: z.string().uuid().optional(),
  executionType: z.enum(['manual', 'scheduled']),
  resultCount: z.number().int().min(0).optional(),
  executionTimeMs: z.number().int().positive().optional(),
  status: z.enum(['success', 'error', 'timeout']),
  errorMessage: z.string().optional(),
  executedBy: z.string().uuid().optional(),
  executedAt: z.date(),
});

export type SearchExecution = z.infer<typeof SearchExecutionSchema>;

// Search analytics event
export const SearchAnalyticsEventSchema = z.object({
  id: z.string().uuid(),
  searchId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  actionType: z.enum(['execute', 'view', 'edit', 'share', 'favorite', 'schedule', 'delete']),
  resultCount: z.number().int().min(0).optional(),
  clickPosition: z.number().int().positive().optional(),
  dwellTimeSeconds: z.number().int().positive().optional(),
  queryModifications: z.record(z.any()).optional(),
  createdAt: z.date(),
});

export type SearchAnalyticsEvent = z.infer<typeof SearchAnalyticsEventSchema>;

// Request/response schemas for API operations
export const SaveSearchRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  queryData: SearchQueryDataSchema,
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  collectionIds: z.array(z.string().uuid()).optional(),
});

export type SaveSearchRequest = z.infer<typeof SaveSearchRequestSchema>;

export const UpdateSearchRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  queryData: SearchQueryDataSchema.optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});

export type UpdateSearchRequest = z.infer<typeof UpdateSearchRequestSchema>;

export const SearchListOptionsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'executionCount', 'lastExecutedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  collectionId: z.string().uuid().optional(),
  query: z.string().optional(), // Search within saved search names/descriptions
});

export type SearchListOptions = z.infer<typeof SearchListOptionsSchema>;

export const CreateCollectionRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  parentCollectionId: z.string().uuid().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  icon: z.string().max(50).optional(),
  isShared: z.boolean().default(false),
});

export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

export const SearchSharingConfigSchema = z.object({
  sharedWithUserIds: z.array(z.string().uuid()).optional(),
  sharedWithTeamIds: z.array(z.string().uuid()).optional(),
  permissionLevel: z.enum(['view', 'edit', 'admin']).default('view'),
  generateShareToken: z.boolean().default(false),
  expiresAt: z.date().optional(),
});

export type SearchSharingConfig = z.infer<typeof SearchSharingConfigSchema>;

// Analytics aggregations
export const SearchAnalyticsSchema = z.object({
  totalExecutions: z.number().int().min(0),
  uniqueUsers: z.number().int().min(0),
  averageResultCount: z.number().min(0),
  averageExecutionTime: z.number().min(0),
  popularTimeRanges: z.record(z.number().int().min(0)),
  topModifications: z.record(z.number().int().min(0)),
  clickThroughRates: z.record(z.number().min(0).max(1)),
  usageByDay: z.record(z.number().int().min(0)),
  errorRate: z.number().min(0).max(1),
  mostClickedPositions: z.array(z.object({
    position: z.number().int().positive(),
    clicks: z.number().int().min(0),
  })),
});

export type SearchAnalytics = z.infer<typeof SearchAnalyticsSchema>;

export const UserSearchStatsSchema = z.object({
  totalSavedSearches: z.number().int().min(0),
  totalExecutions: z.number().int().min(0),
  favoriteSearches: z.number().int().min(0),
  sharedSearches: z.number().int().min(0),
  scheduledSearches: z.number().int().min(0),
  totalCollections: z.number().int().min(0),
  averageSearchesPerCollection: z.number().min(0),
  mostUsedTags: z.array(z.object({
    tag: z.string(),
    count: z.number().int().min(0),
  })),
  searchesCreatedByMonth: z.record(z.number().int().min(0)),
  executionsByMonth: z.record(z.number().int().min(0)),
});

export type UserSearchStats = z.infer<typeof UserSearchStatsSchema>;

// Date range utilities
export const DateRangeSchema = z.object({
  from: z.date(),
  to: z.date(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
});

export type DateRange = z.infer<typeof DateRangeSchema>;

// Search action types for analytics
export type SearchAction = 'execute' | 'view' | 'edit' | 'share' | 'favorite' | 'schedule' | 'delete';

// Scheduled search with extended info
export const ScheduledSearchSchema = SearchScheduleSchema.extend({
  search: SavedSearchSchema,
});

export type ScheduledSearch = z.infer<typeof ScheduledSearchSchema>;

// Shared search with extended info
export const SharedSearchSchema = SearchShareSchema.extend({
  search: SavedSearchSchema,
  sharedBy: z.object({
    id: z.string().uuid(),
    name: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});

export type SharedSearch = z.infer<typeof SharedSearchSchema>;

// Paginated response wrapper
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(itemSchema),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  currentPage: z.number().int().positive(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PaginatedResponse<T> = {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// Collection tree with nested searches
export const CollectionTreeNodeSchema = SearchCollectionSchema.extend({
  children: z.array(z.lazy(() => CollectionTreeNodeSchema)).optional(),
  searches: z.array(SavedSearchSchema).optional(),
  searchCount: z.number().int().min(0).optional(),
});

export type CollectionTreeNode = z.infer<typeof CollectionTreeNodeSchema>;