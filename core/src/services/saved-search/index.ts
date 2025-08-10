/**
 * Saved Search Management Services
 * 
 * Export all saved search related services for easy importing
 */

export { SavedSearchService } from './saved-search-service.js';
export { CachedSavedSearchService } from './cached-saved-search-service.js';
export { SearchSharingService } from './search-sharing-service.js';
export { SearchSchedulerService } from './search-scheduler-service.js';
export { SearchAnalyticsService } from './search-analytics-service.js';

// Export all error classes for proper error handling
export {
  SavedSearchError,
  SearchNotFoundError,
  PermissionDeniedError,
  CollectionNotFoundError,
  VersionNotFoundError,
  ShareNotFoundError,
  ScheduleNotFoundError,
  ValidationError,
  DuplicateError,
  SearchExecutionError,
  SharingError,
  SchedulingError,
  DatabaseError,
  ExternalServiceError,
  RateLimitError,
  isSavedSearchError,
  formatErrorResponse,
  isErrorType,
} from './errors.js';

// Re-export types for convenience
export type {
  SavedSearch,
  SearchCollection,
  SearchSchedule,
  SearchShare,
  SearchVersion,
  SearchExecution,
  SearchAnalyticsEvent,
  SaveSearchRequest,
  UpdateSearchRequest,
  SearchListOptions,
  CreateCollectionRequest,
  SearchSharingConfig,
  ScheduledSearch,
  SharedSearch,
  SearchAnalytics,
  UserSearchStats,
  DateRange,
  SearchAction,
  PaginatedResponse,
  CollectionTreeNode,
} from '../../shared/types/saved-search.js';