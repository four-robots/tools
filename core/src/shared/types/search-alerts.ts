import { z } from 'zod';

/**
 * Search Alerts & Notifications Types
 * 
 * Comprehensive type definitions for search alerts and notification system including:
 * - Alert definitions and configurations
 * - Notification templates and channels
 * - Alert execution tracking
 * - Notification delivery status
 * - Alert subscriptions and preferences
 * - Rate limiting and spam prevention
 */

// Alert trigger conditions configuration
export const TriggerConditionsSchema = z.object({
  resultThreshold: z.number().int().positive().optional(), // Minimum results to trigger
  changeDetection: z.boolean().default(false), // Only trigger on changes
  resultIncrease: z.number().min(0).max(100).optional(), // Trigger on X% increase
  resultDecrease: z.number().min(0).max(100).optional(), // Trigger on X% decrease
  newResults: z.boolean().default(false), // Trigger on new results only
  customConditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'contains', 'greater_than', 'less_than', 'not_equals']),
    value: z.any(),
  })).optional(),
});

export type TriggerConditions = z.infer<typeof TriggerConditionsSchema>;

// Schedule configuration for alerts
export const ScheduleConfigSchema = z.object({
  type: z.enum(['manual', 'interval', 'cron', 'real_time']),
  interval: z.object({
    value: z.number().int().positive(),
    unit: z.enum(['minutes', 'hours', 'days']),
  }).optional(),
  cronExpression: z.string().optional(), // For cron-based scheduling
  timezone: z.string().default('UTC'), // User's timezone
  activeHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm format
    end: z.string().regex(/^\d{2}:\d{2}$/),
    days: z.array(z.number().int().min(0).max(6)), // Days of week (0-6)
  }).optional(),
});

export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

// Notification channel configuration
export const NotificationChannelConfigSchema = z.object({
  type: z.enum(['email', 'in_app', 'webhook', 'sms']),
  config: z.object({
    // Email
    recipient: z.string().email().optional(),
    cc: z.array(z.string().email()).optional(),
    bcc: z.array(z.string().email()).optional(),
    
    // Webhook  
    url: z.string().url().optional(),
    method: z.enum(['GET', 'POST']).optional(),
    headers: z.record(z.string()).optional(),
    
    // SMS
    phoneNumber: z.string().optional(),
    
    // In-app
    userId: z.string().uuid().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
  }),
});

export type NotificationChannelConfig = z.infer<typeof NotificationChannelConfigSchema>;

// Notification template for customizable messages
export const NotificationTemplateSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(255),
  templateType: z.enum(['email', 'in_app', 'webhook', 'sms']),
  
  // Template content
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string(),
  templateVariables: z.record(z.any()).default({}), // Available variables
  
  // Formatting options
  format: z.enum(['plain', 'html', 'markdown']).default('plain'),
  stylingOptions: z.record(z.any()).default({}),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;

// Core alert definition
export const AlertDefinitionSchema = z.object({
  id: z.string().uuid(),
  savedSearchId: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  
  // Alert conditions
  triggerConditions: TriggerConditionsSchema,
  resultThreshold: z.number().int().positive().optional(),
  changeDetection: z.boolean().default(false),
  
  // Scheduling
  scheduleType: z.enum(['manual', 'interval', 'cron', 'real_time']).default('manual'),
  scheduleConfig: ScheduleConfigSchema,
  timezone: z.string().default('UTC'),
  
  // Notification settings  
  notificationChannels: z.array(NotificationChannelConfigSchema),
  notificationTemplateId: z.string().uuid().optional(),
  
  // Alert limits
  maxAlertsPerDay: z.number().int().positive().default(10),
  maxAlertsPerHour: z.number().int().positive().default(2),
  
  // Metadata
  createdAt: z.date(),
  updatedAt: z.date(),
  lastTriggeredAt: z.date().optional(),
  nextScheduledAt: z.date().optional(),
});

export type AlertDefinition = z.infer<typeof AlertDefinitionSchema>;

// Alert execution tracking
export const AlertExecutionSchema = z.object({
  id: z.string().uuid(),
  alertDefinitionId: z.string().uuid(),
  
  // Execution details
  executedAt: z.date(),
  executionDurationMs: z.number().int().positive().optional(),
  triggerReason: z.enum(['scheduled', 'manual', 'real_time']),
  
  // Search results
  searchExecuted: z.boolean().default(false),
  resultCount: z.number().int().min(0).optional(),
  resultSummary: z.record(z.any()).optional(),
  resultsChanged: z.boolean().default(false),
  changeSummary: z.record(z.any()).optional(),
  
  // Execution status
  status: z.enum(['pending', 'success', 'failed', 'partial', 'cancelled']),
  errorMessage: z.string().optional(),
  
  // Notifications sent
  notificationsSent: z.number().int().min(0).default(0),
  notificationFailures: z.number().int().min(0).default(0),
  notificationDetails: z.record(z.any()).default({}),
});

export type AlertExecution = z.infer<typeof AlertExecutionSchema>;

// Individual notification delivery tracking
export const AlertNotificationSchema = z.object({
  id: z.string().uuid(),
  alertExecutionId: z.string().uuid(),
  
  // Notification details
  channelType: z.enum(['email', 'in_app', 'webhook', 'sms']),
  recipient: z.string(),
  
  // Delivery tracking
  sentAt: z.date(),
  deliveryStatus: z.enum(['pending', 'sent', 'delivered', 'failed', 'bounced', 'expired']).default('pending'),
  deliveryAttemptedAt: z.date().optional(),
  deliveryConfirmedAt: z.date().optional(),
  
  // Content
  subject: z.string().optional(),
  messageBody: z.string(),
  messageFormat: z.enum(['plain', 'html', 'markdown']).default('plain'),
  
  // Error handling
  retryCount: z.number().int().min(0).default(0),
  maxRetries: z.number().int().min(0).default(3),
  errorMessage: z.string().optional(),
  errorCode: z.string().optional(),
  
  // Engagement tracking
  openedAt: z.date().optional(),
  clickedAt: z.date().optional(),
});

export type AlertNotification = z.infer<typeof AlertNotificationSchema>;

// Alert subscription management
export const AlertSubscriptionSchema = z.object({
  id: z.string().uuid(),
  alertDefinitionId: z.string().uuid(),
  subscriberId: z.string().uuid(),
  
  // Subscription preferences
  subscriptionType: z.enum(['standard', 'digest', 'summary']).default('standard'),
  notificationChannels: z.array(NotificationChannelConfigSchema).default([]),
  frequencyOverride: z.string().optional(), // Override alert frequency for this subscriber
  
  // Subscription status
  isActive: z.boolean().default(true),
  subscribedAt: z.date(),
  unsubscribedAt: z.date().optional(),
  unsubscribeReason: z.string().optional(),
});

export type AlertSubscription = z.infer<typeof AlertSubscriptionSchema>;

// Alert rate limiting to prevent spam
export const AlertRateLimitSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  
  // Rate limit settings
  limitType: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
  limitCount: z.number().int().positive(),
  currentCount: z.number().int().min(0).default(0),
  
  // Time window
  windowStart: z.date(),
  windowEnd: z.date().optional(),
  
  // Reset tracking
  lastResetAt: z.date(),
});

export type AlertRateLimit = z.infer<typeof AlertRateLimitSchema>;

// Request/response schemas for API operations

// Create alert request
export const CreateAlertRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  savedSearchId: z.string().uuid(),
  triggerConditions: TriggerConditionsSchema,
  scheduleConfig: ScheduleConfigSchema,
  notificationChannels: z.array(NotificationChannelConfigSchema),
  notificationTemplateId: z.string().uuid().optional(),
  maxAlertsPerDay: z.number().int().positive().default(10),
  maxAlertsPerHour: z.number().int().positive().default(2),
});

export type CreateAlertRequest = z.infer<typeof CreateAlertRequestSchema>;

// Update alert request
export const UpdateAlertRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  triggerConditions: TriggerConditionsSchema.optional(),
  scheduleConfig: ScheduleConfigSchema.optional(),
  notificationChannels: z.array(NotificationChannelConfigSchema).optional(),
  notificationTemplateId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  maxAlertsPerDay: z.number().int().positive().optional(),
  maxAlertsPerHour: z.number().int().positive().optional(),
});

export type UpdateAlertRequest = z.infer<typeof UpdateAlertRequestSchema>;

// Alert list options
export const AlertListOptionsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'lastTriggeredAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  isActive: z.boolean().optional(),
  scheduleType: z.enum(['manual', 'interval', 'cron', 'real_time']).optional(),
  savedSearchId: z.string().uuid().optional(),
  query: z.string().optional(), // Search within alert names/descriptions
});

export type AlertListOptions = z.infer<typeof AlertListOptionsSchema>;

// Create notification template request
export const CreateTemplateRequestSchema = z.object({
  name: z.string().min(1).max(255),
  templateType: z.enum(['email', 'in_app', 'webhook', 'sms']),
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string(),
  templateVariables: z.record(z.any()).default({}),
  format: z.enum(['plain', 'html', 'markdown']).default('plain'),
  stylingOptions: z.record(z.any()).default({}),
});

export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;

// Alert analytics aggregations
export const AlertAnalyticsSchema = z.object({
  totalAlerts: z.number().int().min(0),
  activeAlerts: z.number().int().min(0),
  totalExecutions: z.number().int().min(0),
  successfulExecutions: z.number().int().min(0),
  failedExecutions: z.number().int().min(0),
  averageExecutionTime: z.number().min(0),
  totalNotificationsSent: z.number().int().min(0),
  notificationSuccessRate: z.number().min(0).max(1),
  topAlertsByExecutions: z.array(z.object({
    alertId: z.string().uuid(),
    alertName: z.string(),
    executionCount: z.number().int().min(0),
  })),
  executionsByDay: z.record(z.number().int().min(0)),
  notificationsByChannel: z.record(z.number().int().min(0)),
  averageResultsPerAlert: z.number().min(0),
});

export type AlertAnalytics = z.infer<typeof AlertAnalyticsSchema>;

// User alert statistics
export const UserAlertStatsSchema = z.object({
  totalAlerts: z.number().int().min(0),
  activeAlerts: z.number().int().min(0),
  totalExecutions: z.number().int().min(0),
  totalNotifications: z.number().int().min(0),
  subscriptions: z.number().int().min(0),
  alertsCreatedByMonth: z.record(z.number().int().min(0)),
  executionsByMonth: z.record(z.number().int().min(0)),
  mostUsedChannels: z.array(z.object({
    channel: z.string(),
    count: z.number().int().min(0),
  })),
  averageAlertsPerSearch: z.number().min(0),
});

export type UserAlertStats = z.infer<typeof UserAlertStatsSchema>;

// Alert test configuration for testing alert setup
export const AlertTestConfigSchema = z.object({
  dryRun: z.boolean().default(true), // Don't actually send notifications
  mockResults: z.boolean().default(false), // Use mock search results
  testRecipient: z.string().optional(), // Override recipient for testing
  includeDebugInfo: z.boolean().default(true), // Include debug information
});

export type AlertTestConfig = z.infer<typeof AlertTestConfigSchema>;

// Alert trigger result
export const AlertTriggerResultSchema = z.object({
  triggered: z.boolean(),
  reason: z.string(),
  resultCount: z.number().int().min(0),
  conditionsMet: z.array(z.string()),
  executionDetails: z.object({
    searchExecuted: z.boolean(),
    executionTimeMs: z.number().int().positive(),
    notificationsSent: z.number().int().min(0),
    errors: z.array(z.string()),
  }),
});

export type AlertTriggerResult = z.infer<typeof AlertTriggerResultSchema>;

// Paginated response wrapper for alerts
export type PaginatedAlertsResponse<T> = {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// Common alert action types
export type AlertAction = 'create' | 'update' | 'delete' | 'trigger' | 'subscribe' | 'unsubscribe' | 'activate' | 'deactivate';

// Alert with extended information
export const AlertWithDetailsSchema = AlertDefinitionSchema.extend({
  savedSearch: z.object({
    id: z.string().uuid(),
    name: z.string(),
    queryData: z.record(z.any()),
  }),
  notificationTemplate: NotificationTemplateSchema.optional(),
  recentExecutions: z.array(AlertExecutionSchema).optional(),
  subscriptionCount: z.number().int().min(0).optional(),
  nextExecution: z.date().optional(),
});

export type AlertWithDetails = z.infer<typeof AlertWithDetailsSchema>;

// Alert execution with extended information
export const AlertExecutionWithDetailsSchema = AlertExecutionSchema.extend({
  alert: z.object({
    id: z.string().uuid(),
    name: z.string(),
    ownerId: z.string().uuid(),
  }),
  notifications: z.array(AlertNotificationSchema).optional(),
});

export type AlertExecutionWithDetails = z.infer<typeof AlertExecutionWithDetailsSchema>;