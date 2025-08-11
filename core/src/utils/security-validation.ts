/**
 * Security Validation Utilities
 * 
 * Provides comprehensive input validation and sanitization for security-sensitive operations
 * Part of Multi-tenant Search Infrastructure security enhancements
 */

import { z } from 'zod';
import { logger } from './logger.js';

// UUID validation regex (RFC 4122 compliant)
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// SQL injection patterns to detect and block
const SQL_INJECTION_PATTERNS = [
  /(\s|^)(union|select|insert|update|delete|drop|create|alter|exec|execute|declare|cast|convert)\s+/i,
  /(\s|^)(or|and)\s+\d+\s*[=<>]/i,
  /([\'\"];?\s*)?(--|\/\*|\*\/)/i,
  /(\s|^)xp_/i,
  /sp_password/i,
  /(\s|^)(waitfor\s+delay|benchmark\s*\()/i
];

// XSS patterns to detect
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<\s*\w+[^>]*\s+(on\w+|href|src)\s*=/gi
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\/|\.\.\\/gi,
  /\.\.%2f|\.\.%5c/gi,
  /%2e%2e%2f|%2e%2e%5c/gi
];

/**
 * Validate UUID format
 */
export function validateUUID(value: string): boolean {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value);
}

/**
 * Validate tenant slug with security constraints
 */
export function validateTenantSlug(slug: string): { valid: boolean; reason?: string } {
  if (!slug || typeof slug !== 'string') {
    return { valid: false, reason: 'Slug must be a non-empty string' };
  }

  // Length constraints
  if (slug.length < 3 || slug.length > 63) {
    return { valid: false, reason: 'Slug must be between 3 and 63 characters' };
  }

  // Format validation (DNS-safe)
  const slugRegex = /^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$/;
  if (!slugRegex.test(slug)) {
    return { 
      valid: false, 
      reason: 'Slug must start and end with alphanumeric characters, contain only lowercase letters, numbers, and hyphens' 
    };
  }

  // Reserved words
  const reservedSlugs = [
    'api', 'www', 'admin', 'root', 'system', 'public', 'private', 'internal',
    'localhost', 'health', 'status', 'metrics', 'test', 'staging', 'prod', 'production',
    'dev', 'development', 'default', 'null', 'undefined', 'true', 'false'
  ];

  if (reservedSlugs.includes(slug.toLowerCase())) {
    return { valid: false, reason: 'Slug is a reserved word' };
  }

  return { valid: true };
}

/**
 * Detect potential SQL injection attempts
 */
export function detectSQLInjection(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  const normalizedInput = input.toLowerCase().trim();
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(normalizedInput));
}

/**
 * Detect potential XSS attempts
 */
export function detectXSS(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  return XSS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Detect path traversal attempts
 */
export function detectPathTraversal(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Comprehensive security validation for user inputs
 */
export function validateSecureInput(
  input: string, 
  context: 'tenant_slug' | 'user_id' | 'email' | 'name' | 'generic'
): { valid: boolean; sanitized?: string; violations: string[] } {
  const violations: string[] = [];
  
  if (typeof input !== 'string') {
    return { valid: false, violations: ['Input must be a string'] };
  }

  // Check for security violations
  if (detectSQLInjection(input)) {
    violations.push('Potential SQL injection detected');
  }

  if (detectXSS(input)) {
    violations.push('Potential XSS attempt detected');
  }

  if (detectPathTraversal(input)) {
    violations.push('Path traversal attempt detected');
  }

  // Context-specific validation
  let sanitized = input.trim();
  
  switch (context) {
    case 'tenant_slug':
      const slugValidation = validateTenantSlug(sanitized);
      if (!slugValidation.valid) {
        violations.push(slugValidation.reason!);
      }
      break;

    case 'user_id':
      if (!/^[a-zA-Z0-9\-_@.]{1,255}$/.test(sanitized)) {
        violations.push('User ID contains invalid characters');
      }
      break;

    case 'email':
      try {
        sanitized = z.string().email().max(320).toLowerCase().parse(sanitized);
      } catch (error) {
        violations.push('Invalid email format');
      }
      break;

    case 'name':
      if (!/^[a-zA-Z0-9\s\-_.()]{1,255}$/.test(sanitized)) {
        violations.push('Name contains invalid characters');
      }
      // Remove excessive whitespace
      sanitized = sanitized.replace(/\s+/g, ' ').trim();
      break;

    case 'generic':
      // Basic sanitization - remove control characters
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
      break;
  }

  // Length checks (prevent DoS)
  if (sanitized.length > 10000) {
    violations.push('Input exceeds maximum length');
  }

  // Null byte injection check
  if (sanitized.includes('\x00')) {
    violations.push('Null byte injection detected');
  }

  const isValid = violations.length === 0;
  
  // Log security violations
  if (!isValid) {
    logger.warn('Security validation failed:', {
      context,
      violations,
      inputLength: input.length,
      sanitizedLength: sanitized.length
    });
  }

  return {
    valid: isValid,
    sanitized: isValid ? sanitized : undefined,
    violations
  };
}

/**
 * Validate IP address format
 */
export function validateIPAddress(ip: string): boolean {
  if (typeof ip !== 'string') return false;

  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Rate limiting key sanitization
 */
export function sanitizeRateLimitKey(key: string): string {
  if (typeof key !== 'string') return 'unknown';
  
  // Replace dangerous characters and limit length
  return key
    .replace(/[^a-zA-Z0-9\-_:.]/g, '_')
    .substring(0, 100)
    .toLowerCase();
}

/**
 * Validate JSON structure safely
 */
export function validateJSON(jsonString: string, maxDepth: number = 10): { valid: boolean; parsed?: any; error?: string } {
  try {
    if (typeof jsonString !== 'string') {
      return { valid: false, error: 'Input must be a string' };
    }

    // Check for potential JSON bombs (excessive length)
    if (jsonString.length > 100000) {
      return { valid: false, error: 'JSON payload too large' };
    }

    const parsed = JSON.parse(jsonString);
    
    // Check nesting depth to prevent stack overflow
    const checkDepth = (obj: any, depth: number): boolean => {
      if (depth > maxDepth) return false;
      
      if (typeof obj === 'object' && obj !== null) {
        for (const value of Object.values(obj)) {
          if (!checkDepth(value, depth + 1)) return false;
        }
      }
      
      return true;
    };

    if (!checkDepth(parsed, 0)) {
      return { valid: false, error: 'JSON nesting too deep' };
    }

    return { valid: true, parsed };

  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid JSON'
    };
  }
}

/**
 * Security audit logger
 */
export function logSecurityViolation(
  violation: string,
  context: {
    tenantId?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    input?: string;
    endpoint?: string;
  }
): void {
  logger.error('Security violation detected', {
    violation,
    timestamp: new Date().toISOString(),
    ...context,
    // Don't log the full input to avoid sensitive data in logs
    inputLength: context.input?.length || 0
  });
}