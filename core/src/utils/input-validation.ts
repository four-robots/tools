/**
 * Input Validation and XSS Protection Utilities
 * 
 * Provides comprehensive input validation and sanitization to prevent
 * XSS attacks and ensure data integrity in whiteboard presence systems.
 */

import { sanitizeInput } from './sql-security.js';

/**
 * XSS protection utility using allowlist approach
 */
export const sanitizeForXSS = (input: string, maxLength: number = 1000): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // First apply SQL sanitization
  let sanitized = sanitizeInput(input);
  
  // Additional XSS protection - remove HTML tags, scripts, and dangerous characters
  sanitized = sanitized
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers (onclick, onload, etc.)
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/&#/g, '') // Remove HTML entities that could encode malicious content
    .replace(/&[a-z]+;/gi, '') // Remove named HTML entities
    .trim();

  // Ensure length limits
  return sanitized.substring(0, maxLength);
};

/**
 * Validates user name input
 */
export const validateUserName = (userName: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!userName || typeof userName !== 'string') {
    return { valid: false, sanitized: '', error: 'User name is required' };
  }

  const sanitized = sanitizeForXSS(userName, 100);
  
  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: 'User name contains invalid characters' };
  }

  if (sanitized.length < 1) {
    return { valid: false, sanitized, error: 'User name must be at least 1 character' };
  }

  if (sanitized.length > 100) {
    return { valid: false, sanitized, error: 'User name must be less than 100 characters' };
  }

  // Check for only whitespace
  if (sanitized.trim().length === 0) {
    return { valid: false, sanitized, error: 'User name cannot be empty or only whitespace' };
  }

  return { valid: true, sanitized };
};

/**
 * Validates email input
 */
export const validateEmail = (email: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!email || typeof email !== 'string') {
    return { valid: true, sanitized: '', error: undefined }; // Email is optional
  }

  const sanitized = sanitizeForXSS(email, 320); // RFC 5321 max email length
  
  if (sanitized.length === 0) {
    return { valid: true, sanitized: '', error: undefined }; // Empty after sanitization is OK for optional field
  }

  // Basic email validation pattern
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(sanitized)) {
    return { valid: false, sanitized, error: 'Invalid email format' };
  }

  return { valid: true, sanitized };
};

/**
 * Validates avatar URL input
 */
export const validateAvatar = (avatar: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!avatar || typeof avatar !== 'string') {
    return { valid: true, sanitized: '', error: undefined }; // Avatar is optional
  }

  const sanitized = sanitizeForXSS(avatar, 2048); // Reasonable URL length limit
  
  if (sanitized.length === 0) {
    return { valid: true, sanitized: '', error: undefined }; // Empty after sanitization is OK for optional field
  }

  // Allow data URIs for base64 images and HTTP(S) URLs
  const isDataUri = sanitized.startsWith('data:image/');
  const isHttpUrl = /^https?:\/\/[^\s<>{}|\\^`[\]]+$/i.test(sanitized);
  
  if (!isDataUri && !isHttpUrl) {
    return { valid: false, sanitized, error: 'Avatar must be a valid HTTP(S) URL or data URI' };
  }

  // Additional validation for data URIs
  if (isDataUri) {
    const dataUriRegex = /^data:image\/(jpeg|jpg|png|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/;
    if (!dataUriRegex.test(sanitized)) {
      return { valid: false, sanitized, error: 'Invalid data URI format for avatar' };
    }
  }

  return { valid: true, sanitized };
};

/**
 * Validates custom status input
 */
export const validateCustomStatus = (customStatus: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!customStatus || typeof customStatus !== 'string') {
    return { valid: true, sanitized: '', error: undefined }; // Custom status is optional
  }

  const sanitized = sanitizeForXSS(customStatus, 200);
  
  if (sanitized.length === 0) {
    return { valid: true, sanitized: '', error: undefined }; // Empty after sanitization is OK for optional field
  }

  if (sanitized.length > 200) {
    return { valid: false, sanitized, error: 'Custom status must be less than 200 characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Validates activity description input
 */
export const validateActivityDescription = (description: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!description || typeof description !== 'string') {
    return { valid: true, sanitized: '', error: undefined }; // Description is optional
  }

  const sanitized = sanitizeForXSS(description, 500);
  
  if (sanitized.length === 0) {
    return { valid: true, sanitized: '', error: undefined }; // Empty after sanitization is OK for optional field
  }

  if (sanitized.length > 500) {
    return { valid: false, sanitized, error: 'Activity description must be less than 500 characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Validates element ID input
 */
export const validateElementId = (elementId: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!elementId || typeof elementId !== 'string') {
    return { valid: false, sanitized: '', error: 'Element ID is required' };
  }

  // Element IDs should be alphanumeric with limited special characters
  const sanitized = elementId.replace(/[^a-zA-Z0-9_\-:.]/g, '');
  
  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: 'Element ID contains invalid characters' };
  }

  if (sanitized.length > 100) {
    return { valid: false, sanitized, error: 'Element ID must be less than 100 characters' };
  }

  if (sanitized !== elementId) {
    return { valid: false, sanitized, error: 'Element ID contains invalid characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Validates whiteboard ID input
 */
export const validateWhiteboardId = (whiteboardId: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!whiteboardId || typeof whiteboardId !== 'string') {
    return { valid: false, sanitized: '', error: 'Whiteboard ID is required' };
  }

  // Whiteboard IDs should follow UUID format or be simple alphanumeric
  const sanitized = whiteboardId.replace(/[^a-zA-Z0-9_\-]/g, '');
  
  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: 'Whiteboard ID contains invalid characters' };
  }

  if (sanitized.length > 50) {
    return { valid: false, sanitized, error: 'Whiteboard ID must be less than 50 characters' };
  }

  if (sanitized !== whiteboardId) {
    return { valid: false, sanitized, error: 'Whiteboard ID contains invalid characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Validates session ID input
 */
export const validateSessionId = (sessionId: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, sanitized: '', error: 'Session ID is required' };
  }

  // Session IDs should be alphanumeric with underscores and hyphens
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '');
  
  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: 'Session ID contains invalid characters' };
  }

  if (sanitized.length > 100) {
    return { valid: false, sanitized, error: 'Session ID must be less than 100 characters' };
  }

  if (sanitized !== sessionId) {
    return { valid: false, sanitized, error: 'Session ID contains invalid characters' };
  }

  return { valid: true, sanitized };
};

/**
 * Comprehensive validation for user info in whiteboard operations
 */
export interface ValidationResult {
  valid: boolean;
  sanitizedData: any;
  errors: string[];
}

export const validateUserInfo = (userInfo: {
  userName: string;
  userEmail?: string;
  avatar?: string;
  customStatus?: string;
}): ValidationResult => {
  const errors: string[] = [];
  const sanitizedData: any = {};

  // Validate user name (required)
  const userNameValidation = validateUserName(userInfo.userName);
  if (!userNameValidation.valid) {
    errors.push(userNameValidation.error!);
  } else {
    sanitizedData.userName = userNameValidation.sanitized;
  }

  // Validate email (optional)
  const emailValidation = validateEmail(userInfo.userEmail || '');
  if (!emailValidation.valid) {
    errors.push(emailValidation.error!);
  } else {
    sanitizedData.userEmail = emailValidation.sanitized || undefined;
  }

  // Validate avatar (optional)
  const avatarValidation = validateAvatar(userInfo.avatar || '');
  if (!avatarValidation.valid) {
    errors.push(avatarValidation.error!);
  } else {
    sanitizedData.avatar = avatarValidation.sanitized || undefined;
  }

  // Validate custom status (optional)
  const customStatusValidation = validateCustomStatus(userInfo.customStatus || '');
  if (!customStatusValidation.valid) {
    errors.push(customStatusValidation.error!);
  } else {
    sanitizedData.customStatus = customStatusValidation.sanitized || undefined;
  }

  return {
    valid: errors.length === 0,
    sanitizedData,
    errors
  };
};

/**
 * Validates activity info
 */
export const validateActivityInfo = (activity: {
  type: string;
  elementId?: string;
  description?: string;
}): ValidationResult => {
  const errors: string[] = [];
  const sanitizedData: any = {};

  // Validate activity type
  const validActivityTypes = ['drawing', 'typing', 'selecting', 'commenting', 'idle'];
  if (!activity.type || !validActivityTypes.includes(activity.type)) {
    errors.push('Invalid activity type');
  } else {
    sanitizedData.type = activity.type;
  }

  // Validate element ID (optional)
  if (activity.elementId) {
    const elementIdValidation = validateElementId(activity.elementId);
    if (!elementIdValidation.valid) {
      errors.push(elementIdValidation.error!);
    } else {
      sanitizedData.elementId = elementIdValidation.sanitized;
    }
  }

  // Validate description (optional)
  const descriptionValidation = validateActivityDescription(activity.description || '');
  if (!descriptionValidation.valid) {
    errors.push(descriptionValidation.error!);
  } else {
    sanitizedData.description = descriptionValidation.sanitized || undefined;
  }

  return {
    valid: errors.length === 0,
    sanitizedData,
    errors
  };
};

/**
 * Rate limiting enhancement - validates requests to prevent abuse
 */
export const validatePresenceUpdateRequest = (data: any): ValidationResult => {
  const errors: string[] = [];
  const sanitizedData: any = {};

  // Validate timestamp to prevent replay attacks
  if (data.timestamp && typeof data.timestamp === 'number') {
    const now = Date.now();
    const timeDiff = Math.abs(now - data.timestamp);
    const maxSkew = 5 * 60 * 1000; // 5 minutes max time skew
    
    if (timeDiff > maxSkew) {
      errors.push('Timestamp too old or too far in future');
    } else {
      sanitizedData.timestamp = data.timestamp;
    }
  }

  // Validate data size to prevent memory exhaustion
  const dataString = JSON.stringify(data);
  const maxDataSize = 10 * 1024; // 10KB max per presence update
  
  if (dataString.length > maxDataSize) {
    errors.push('Presence update data too large');
  }

  return {
    valid: errors.length === 0,
    sanitizedData,
    errors
  };
};