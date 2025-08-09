/**
 * Search Validation Middleware
 * 
 * Specialized validation middleware for search-related requests with enhanced
 * validation rules, sanitization, and security measures specific to search operations.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';

// ============================================================================
// Search-Specific Validation Schemas
// ============================================================================

/**
 * Enhanced query validation with security measures
 */
export const SearchQuerySchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query is too long (max 1000 characters)')
    .refine(
      (query) => {
        // Prevent potential injection attacks
        const suspiciousPatterns = [
          /<script/i,
          /javascript:/i,
          /data:text\/html/i,
          /vbscript:/i,
          /onload=/i,
          /onerror=/i
        ];
        return !suspiciousPatterns.some(pattern => pattern.test(query));
      },
      'Query contains potentially unsafe content'
    )
    .transform((query) => {
      // Sanitize the query
      return query
        .trim()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/[^\w\s\-.,!?'"()]/g, ''); // Remove potentially harmful characters
    }),
  
  filters: z.object({
    content_types: z.array(z.enum([
      'scraped_page',
      'scraped_content_chunk',
      'wiki_page', 
      'kanban_card',
      'memory_thought',
      'code_file',
      'code_chunk'
    ])).optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    created_by: z.string().uuid().optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
    min_quality: z.number().min(0).max(1).optional(),
    language: z.string().max(20).optional(),
    repository: z.string().max(100).optional()
  }).optional(),
  
  sort: z.enum([
    'relevance',
    'date_desc', 
    'date_asc',
    'title_asc',
    'title_desc',
    'quality_desc'
  ]).default('relevance'),
  
  pagination: z.object({
    page: z.number().int().min(1).max(1000).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).optional()
  }).default({}),
  
  use_semantic: z.boolean().default(true),
  use_fuzzy: z.boolean().default(true),
  include_preview: z.boolean().default(true),
  include_highlights: z.boolean().default(true),
  user_id: z.string().uuid().optional()
});

/**
 * Validation for search suggestions requests
 */
export const SearchSuggestionsSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(20).default(5),
  user_id: z.string().uuid().optional()
});

/**
 * Validation for analytics requests
 */
export const SearchAnalyticsSchema = z.object({
  user_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  include_performance: z.boolean().default(false)
});

// ============================================================================
// Search Rate Limiting
// ============================================================================

/**
 * Rate limiting for regular search requests
 */
export const searchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per window
  keyGenerator: (req: Request) => {
    // Use user ID if available, otherwise IP
    const userId = req.headers['user-id'] as string;
    return userId || req.ip;
  },
  message: {
    success: false,
    error: {
      code: 'SEARCH_RATE_LIMITED',
      message: 'Too many search requests. Please wait before trying again.',
      retry_after_seconds: 300
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true
});

/**
 * Stricter rate limiting for cache operations
 */
export const cacheOperationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 cache operations per window
  keyGenerator: (req: Request) => {
    const userId = req.headers['user-id'] as string;
    return userId || req.ip;
  },
  message: {
    success: false,
    error: {
      code: 'CACHE_RATE_LIMITED',
      message: 'Too many cache operations. Please wait before trying again.',
      retry_after_seconds: 900
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiting for analytics requests
 */
export const analyticsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 analytics requests per window
  keyGenerator: (req: Request) => {
    const userId = req.headers['user-id'] as string;
    return userId || req.ip;
  },
  message: {
    success: false,
    error: {
      code: 'ANALYTICS_RATE_LIMITED',
      message: 'Too many analytics requests. Please wait before trying again.',
      retry_after_seconds: 600
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// Validation Middleware Functions
// ============================================================================

/**
 * Validate search request body
 */
export function validateSearchRequest(
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  try {
    // Validate and sanitize the request body
    const validated = SearchQuerySchema.parse(req.body);
    req.body = validated;
    
    // Additional validation checks
    if (validated.filters?.date_from && validated.filters?.date_to) {
      const fromDate = new Date(validated.filters.date_from);
      const toDate = new Date(validated.filters.date_to);
      
      if (fromDate > toDate) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DATE_RANGE',
            message: 'date_from must be before date_to'
          }
        });
      }
      
      // Limit date range to prevent excessive queries
      const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
      if (toDate.getTime() - fromDate.getTime() > maxRangeMs) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'DATE_RANGE_TOO_LARGE',
            message: 'Date range cannot exceed 1 year'
          }
        });
      }
    }
    
    // Add request metadata for analytics
    req.searchMeta = {
      sanitized_query: validated.query,
      has_filters: !!validated.filters && Object.keys(validated.filters).length > 0,
      is_semantic: validated.use_semantic,
      is_fuzzy: validated.use_fuzzy,
      request_timestamp: new Date().toISOString()
    };
    
    next();
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));
      
      return res.status(400).json({
        success: false,
        error: {
          code: 'SEARCH_VALIDATION_ERROR',
          message: 'Invalid search request',
          details: errorMessages
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'SEARCH_REQUEST_ERROR',
        message: 'Failed to process search request'
      }
    });
  }
}

/**
 * Validate search suggestions request
 */
export function validateSearchSuggestions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated = SearchSuggestionsSchema.parse(req.query);
    req.query = validated as any;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SUGGESTIONS_VALIDATION_ERROR',
          message: 'Invalid suggestions request',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'SUGGESTIONS_REQUEST_ERROR',
        message: 'Failed to process suggestions request'
      }
    });
  }
}

/**
 * Validate search analytics request
 */
export function validateSearchAnalytics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const validated = SearchAnalyticsSchema.parse(req.query);
    req.query = validated as any;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ANALYTICS_VALIDATION_ERROR',
          message: 'Invalid analytics request',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'ANALYTICS_REQUEST_ERROR',
        message: 'Failed to process analytics request'
      }
    });
  }
}

/**
 * Security headers middleware for search endpoints
 */
export function addSearchSecurityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Add search-specific security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Search-API-Version': '1.0'
  });
  
  next();
}

/**
 * Request timeout middleware for search operations
 */
export function setSearchTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set request timeout
    req.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: {
            code: 'SEARCH_TIMEOUT',
            message: 'Search request timed out',
            timeout_ms: timeoutMs
          }
        });
      }
    });
    
    next();
  };
}

/**
 * Request logging middleware for search operations
 */
export function logSearchRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  
  // Log request start
  console.log(`🔍 Search ${req.method} ${req.path} - ${req.ip} - ${new Date().toISOString()}`);
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const processingTime = Date.now() - startTime;
    const success = data?.success !== false;
    
    console.log(
      `${success ? '✅' : '❌'} Search ${req.method} ${req.path} - ` +
      `${res.statusCode} - ${processingTime}ms - ${req.ip}`
    );
    
    return originalJson.call(this, data);
  };
  
  next();
}

// ============================================================================
// Type Extensions for Request Object
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      searchMeta?: {
        sanitized_query: string;
        has_filters: boolean;
        is_semantic: boolean;
        is_fuzzy: boolean;
        request_timestamp: string;
      };
    }
  }
}

export default {
  validateSearchRequest,
  validateSearchSuggestions,
  validateSearchAnalytics,
  searchRateLimit,
  cacheOperationRateLimit,
  analyticsRateLimit,
  addSearchSecurityHeaders,
  setSearchTimeout,
  logSearchRequest
};