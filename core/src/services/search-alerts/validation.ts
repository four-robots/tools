import { z } from 'zod';
import {
  TriggerConditions,
  ScheduleConfig,
  NotificationChannelConfig,
  CreateAlertRequest,
  UpdateAlertRequest,
  CreateTemplateRequest,
} from '../../shared/types/search-alerts.js';
import {
  AlertValidationError,
  ScheduleValidationError,
  NotificationTemplateError,
} from './errors.js';

/**
 * Search Alerts Validation Utilities
 * 
 * Comprehensive validation functions for search alerts system including:
 * - Alert definition validation
 * - Schedule configuration validation
 * - Notification channel validation
 * - Template validation
 * - Business rule validation
 */

/**
 * Validate trigger conditions configuration
 */
export function validateTriggerConditions(conditions: TriggerConditions): void {
  const errors: Record<string, string> = {};

  // Check result threshold
  if (conditions.resultThreshold !== undefined) {
    if (conditions.resultThreshold < 0) {
      errors.resultThreshold = 'Result threshold must be non-negative';
    }
    if (conditions.resultThreshold > 100000) {
      errors.resultThreshold = 'Result threshold cannot exceed 100,000';
    }
  }

  // Check percentage changes
  if (conditions.resultIncrease !== undefined) {
    if (conditions.resultIncrease < 0 || conditions.resultIncrease > 1000) {
      errors.resultIncrease = 'Result increase must be between 0 and 1000 percent';
    }
  }

  if (conditions.resultDecrease !== undefined) {
    if (conditions.resultDecrease < 0 || conditions.resultDecrease > 100) {
      errors.resultDecrease = 'Result decrease must be between 0 and 100 percent';
    }
  }

  // Validate custom conditions
  if (conditions.customConditions) {
    conditions.customConditions.forEach((condition, index) => {
      if (!condition.field?.trim()) {
        errors[`customCondition${index}Field`] = `Custom condition ${index + 1} field is required`;
      }
      
      if (!condition.operator) {
        errors[`customCondition${index}Operator`] = `Custom condition ${index + 1} operator is required`;
      }
      
      if (condition.value === undefined || condition.value === null || condition.value === '') {
        errors[`customCondition${index}Value`] = `Custom condition ${index + 1} value is required`;
      }

      // Validate operator-value combinations
      if (condition.operator === 'greater_than' || condition.operator === 'less_than') {
        if (isNaN(Number(condition.value))) {
          errors[`customCondition${index}Value`] = `Custom condition ${index + 1} value must be a number for ${condition.operator}`;
        }
      }
    });
  }

  // Business rule validation
  const hasAnyCondition = !!(
    conditions.resultThreshold ||
    conditions.changeDetection ||
    conditions.newResults ||
    conditions.resultIncrease ||
    conditions.resultDecrease ||
    (conditions.customConditions && conditions.customConditions.length > 0)
  );

  if (!hasAnyCondition) {
    errors.general = 'At least one trigger condition must be specified';
  }

  if (Object.keys(errors).length > 0) {
    throw new AlertValidationError(errors);
  }
}

/**
 * Validate schedule configuration
 */
export function validateScheduleConfig(config: ScheduleConfig): void {
  const errors: Record<string, string> = {};

  // Validate schedule type specific configurations
  switch (config.type) {
    case 'interval':
      if (!config.interval) {
        errors.interval = 'Interval configuration is required for interval schedule type';
      } else {
        if (config.interval.value <= 0) {
          errors.intervalValue = 'Interval value must be positive';
        }

        // Enforce minimum intervals to prevent system overload
        const minIntervals = {
          minutes: 5,
          hours: 1,
          days: 1,
        };

        if (config.interval.value < minIntervals[config.interval.unit]) {
          errors.intervalValue = `Minimum interval is ${minIntervals[config.interval.unit]} ${config.interval.unit}`;
        }

        // Maximum intervals for practical purposes
        const maxIntervals = {
          minutes: 1440, // 24 hours
          hours: 168,    // 7 days
          days: 365,     // 1 year
        };

        if (config.interval.value > maxIntervals[config.interval.unit]) {
          errors.intervalValue = `Maximum interval is ${maxIntervals[config.interval.unit]} ${config.interval.unit}`;
        }
      }
      break;

    case 'cron':
      if (!config.cronExpression?.trim()) {
        errors.cronExpression = 'Cron expression is required for cron schedule type';
      } else {
        validateCronExpression(config.cronExpression);
      }
      break;

    case 'real_time':
      // Real-time alerts have no additional configuration requirements
      break;

    case 'manual':
      // Manual alerts have no schedule configuration
      break;

    default:
      errors.type = `Invalid schedule type: ${config.type}`;
  }

  // Validate timezone
  if (config.timezone && !isValidTimezone(config.timezone)) {
    errors.timezone = 'Invalid timezone identifier';
  }

  // Validate active hours
  if (config.activeHours) {
    const { start, end, days } = config.activeHours;
    
    if (!isValidTimeFormat(start)) {
      errors.activeHoursStart = 'Active hours start time must be in HH:MM format';
    }
    
    if (!isValidTimeFormat(end)) {
      errors.activeHoursEnd = 'Active hours end time must be in HH:MM format';
    }
    
    if (days.some(day => day < 0 || day > 6)) {
      errors.activeHoursDays = 'Active hours days must be between 0 (Sunday) and 6 (Saturday)';
    }
    
    if (days.length === 0) {
      errors.activeHoursDays = 'At least one day must be selected for active hours';
    }

    // Validate time range
    if (start && end && start === end) {
      errors.activeHoursRange = 'Start and end times cannot be the same';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ScheduleValidationError(config.type, Object.values(errors).join(', '));
  }
}

/**
 * Validate notification channels configuration
 */
export function validateNotificationChannels(channels: NotificationChannelConfig[]): void {
  const errors: Record<string, string> = {};

  if (channels.length === 0) {
    errors.channels = 'At least one notification channel is required';
  }

  channels.forEach((channel, index) => {
    const channelErrors = validateNotificationChannel(channel, index);
    Object.assign(errors, channelErrors);
  });

  // Check for duplicate channels of the same type with same config
  const channelKeys = channels.map((channel, index) => {
    const key = `${channel.type}-${JSON.stringify(channel.config)}`;
    return { key, index };
  });

  const duplicates = channelKeys.filter((item, index) => 
    channelKeys.findIndex(other => other.key === item.key) !== index
  );

  if (duplicates.length > 0) {
    errors.duplicates = 'Duplicate notification channels are not allowed';
  }

  if (Object.keys(errors).length > 0) {
    throw new AlertValidationError(errors);
  }
}

/**
 * Validate individual notification channel
 */
function validateNotificationChannel(channel: NotificationChannelConfig, index: number): Record<string, string> {
  const errors: Record<string, string> = {};
  const prefix = `channel${index}`;

  switch (channel.type) {
    case 'email':
      if (!channel.config.recipient?.trim()) {
        errors[`${prefix}Recipient`] = 'Email recipient is required';
      } else if (!isValidEmail(channel.config.recipient)) {
        errors[`${prefix}Recipient`] = 'Invalid email address format';
      }

      // Validate CC and BCC if provided
      if (channel.config.cc) {
        channel.config.cc.forEach((email: string, ccIndex: number) => {
          if (!isValidEmail(email)) {
            errors[`${prefix}CC${ccIndex}`] = `Invalid CC email address at position ${ccIndex + 1}`;
          }
        });
      }

      if (channel.config.bcc) {
        channel.config.bcc.forEach((email: string, bccIndex: number) => {
          if (!isValidEmail(email)) {
            errors[`${prefix}BCC${bccIndex}`] = `Invalid BCC email address at position ${bccIndex + 1}`;
          }
        });
      }
      break;

    case 'webhook':
      if (!channel.config.url?.trim()) {
        errors[`${prefix}URL`] = 'Webhook URL is required';
      } else if (!isValidURL(channel.config.url)) {
        errors[`${prefix}URL`] = 'Invalid webhook URL format';
      }

      // Validate HTTP method
      if (channel.config.method && !['GET', 'POST'].includes(channel.config.method)) {
        errors[`${prefix}Method`] = 'HTTP method must be GET or POST';
      }

      // Validate headers if provided
      if (channel.config.headers) {
        Object.keys(channel.config.headers).forEach(headerName => {
          if (!isValidHTTPHeaderName(headerName)) {
            errors[`${prefix}Headers`] = `Invalid HTTP header name: ${headerName}`;
          }
        });
      }
      break;

    case 'sms':
      if (!channel.config.phoneNumber?.trim()) {
        errors[`${prefix}Phone`] = 'Phone number is required';
      } else if (!isValidPhoneNumber(channel.config.phoneNumber)) {
        errors[`${prefix}Phone`] = 'Invalid phone number format (use international format, e.g., +1234567890)';
      }
      break;

    case 'in_app':
      if (!channel.config.userId?.trim()) {
        errors[`${prefix}UserId`] = 'User ID is required for in-app notifications';
      }

      if (channel.config.priority && !['low', 'normal', 'high'].includes(channel.config.priority)) {
        errors[`${prefix}Priority`] = 'Invalid priority level';
      }
      break;

    default:
      errors[`${prefix}Type`] = `Invalid notification channel type: ${channel.type}`;
  }

  return errors;
}

/**
 * Validate notification template
 */
export function validateNotificationTemplate(template: CreateTemplateRequest): void {
  const errors: Record<string, string> = {};

  // Validate template name
  if (!template.name.trim()) {
    errors.name = 'Template name is required';
  } else if (template.name.length > 255) {
    errors.name = 'Template name cannot exceed 255 characters';
  }

  // Validate template body
  if (!template.bodyTemplate.trim()) {
    errors.bodyTemplate = 'Template body is required';
  } else if (template.bodyTemplate.length > 10000) {
    errors.bodyTemplate = 'Template body cannot exceed 10,000 characters';
  }

  // Validate template variables (check for valid JSON)
  if (template.templateVariables) {
    try {
      JSON.stringify(template.templateVariables);
    } catch {
      errors.templateVariables = 'Template variables must be valid JSON';
    }
  }

  // Validate styling options for HTML templates
  if (template.format === 'html' && template.stylingOptions) {
    try {
      JSON.stringify(template.stylingOptions);
    } catch {
      errors.stylingOptions = 'Styling options must be valid JSON';
    }
  }

  // Validate template syntax (basic check for variable placeholders)
  const validVariablePattern = /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g;
  const invalidVariablePattern = /\{\{[^}]*\}\}/g;
  
  const bodyVariables = template.bodyTemplate.match(invalidVariablePattern) || [];
  const validBodyVariables = template.bodyTemplate.match(validVariablePattern) || [];
  
  if (bodyVariables.length !== validBodyVariables.length) {
    errors.bodyTemplate = 'Template contains invalid variable syntax. Use {{variableName}} format.';
  }

  if (template.subjectTemplate) {
    const subjectVariables = template.subjectTemplate.match(invalidVariablePattern) || [];
    const validSubjectVariables = template.subjectTemplate.match(validVariablePattern) || [];
    
    if (subjectVariables.length !== validSubjectVariables.length) {
      errors.subjectTemplate = 'Subject template contains invalid variable syntax. Use {{variableName}} format.';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new NotificationTemplateError('validation', JSON.stringify(errors));
  }
}

/**
 * Validate alert rate limits
 */
export function validateRateLimits(maxAlertsPerHour: number, maxAlertsPerDay: number): void {
  const errors: Record<string, string> = {};

  if (maxAlertsPerHour < 1 || maxAlertsPerHour > 100) {
    errors.maxAlertsPerHour = 'Max alerts per hour must be between 1 and 100';
  }

  if (maxAlertsPerDay < 1 || maxAlertsPerDay > 1000) {
    errors.maxAlertsPerDay = 'Max alerts per day must be between 1 and 1,000';
  }

  if (maxAlertsPerHour > maxAlertsPerDay) {
    errors.rateLimitLogic = 'Hourly limit cannot exceed daily limit';
  }

  // Check for reasonable hourly vs daily ratios
  if (maxAlertsPerHour * 24 > maxAlertsPerDay * 2) {
    errors.rateLimitLogic = 'Hourly limit seems too high relative to daily limit';
  }

  if (Object.keys(errors).length > 0) {
    throw new AlertValidationError(errors);
  }
}

/**
 * Comprehensive alert request validation
 */
export function validateCreateAlertRequest(request: CreateAlertRequest): void {
  // Basic schema validation first
  try {
    // This would be done by the schema validation in the API route
    // but we can add additional business logic validation here
  } catch (error) {
    throw new AlertValidationError({ schema: 'Request does not match expected schema' });
  }

  // Validate components
  validateTriggerConditions(request.triggerConditions);
  validateScheduleConfig(request.scheduleConfig);
  validateNotificationChannels(request.notificationChannels);
  validateRateLimits(request.maxAlertsPerDay, request.maxAlertsPerHour);

  // Additional business rule validation
  if (request.name.length < 3) {
    throw new AlertValidationError({ name: 'Alert name must be at least 3 characters long' });
  }

  if (request.description && request.description.length > 1000) {
    throw new AlertValidationError({ description: 'Description cannot exceed 1,000 characters' });
  }
}

// ===============================
// Helper validation functions
// ===============================

function validateCronExpression(expression: string): void {
  // Basic cron validation - in production, use a proper cron parser
  const parts = expression.trim().split(/\s+/);
  
  if (parts.length < 5 || parts.length > 6) {
    throw new ScheduleValidationError('cron', 'Cron expression must have 5 or 6 parts');
  }

  // Basic syntax check - a more sophisticated parser would be better
  const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|[0-6]|\*\/[0-6])$/;
  
  if (!cronRegex.test(expression)) {
    throw new ScheduleValidationError('cron', 'Invalid cron expression format');
  }
}

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function isValidTimeFormat(time: string): boolean {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

function isValidPhoneNumber(phone: string): boolean {
  // Basic international phone number validation
  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  return phoneRegex.test(phone);
}

function isValidHTTPHeaderName(headerName: string): boolean {
  // Basic HTTP header name validation
  const headerRegex = /^[a-zA-Z0-9!#$&'*+.^_`|~-]+$/;
  return headerRegex.test(headerName);
}