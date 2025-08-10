/**
 * Search Alerts & Notifications Services
 * 
 * Export all search alerts related services for easy importing
 */

export { AlertService } from './alert-service.js';
export { NotificationService } from './notification-service.js';
export { AlertSchedulerService } from './alert-scheduler-service.js';
export { AlertAnalyticsService } from './alert-analytics-service.js';

// Export error classes and utilities
export {
  SearchAlertError,
  AlertNotFoundError,
  AlertAccessDeniedError,
  AlertValidationError,
  AlertExecutionError,
  AlertRateLimitError,
  NotificationTemplateError,
  NotificationDeliveryError,
  ScheduleValidationError,
  ExternalServiceError,
  AlertDatabaseError,
  AlertConfigurationError,
  isSearchAlertError,
  formatErrorResponse,
  getErrorSeverity,
  getRetryConfig,
  getErrorRecoveryMessage,
  logError,
  ErrorSeverity,
} from './errors.js';

// Export validation utilities
export {
  validateTriggerConditions,
  validateScheduleConfig,
  validateNotificationChannels,
  validateNotificationTemplate,
  validateRateLimits,
  validateCreateAlertRequest,
} from './validation.js';

// Re-export types for convenience
export type {
  AlertDefinition,
  AlertExecution,
  AlertNotification,
  AlertSubscription,
  AlertRateLimit,
  NotificationTemplate,
  TriggerConditions,
  ScheduleConfig,
  NotificationChannelConfig,
  CreateAlertRequest,
  UpdateAlertRequest,
  AlertListOptions,
  CreateTemplateRequest,
  AlertAnalytics,
  UserAlertStats,
  AlertTestConfig,
  AlertTriggerResult,
  AlertWithDetails,
  AlertExecutionWithDetails,
  PaginatedAlertsResponse,
  AlertAction,
} from '../../shared/types/search-alerts.js';