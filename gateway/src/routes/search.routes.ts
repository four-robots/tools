/**
 * Search API Routes
 * 
 * REST API endpoints for unified search functionality across all content sources
 * (Memory, Kanban, Wiki, Scraper) with proper validation, error handling, and performance.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateRequest, validateMultiple } from '../middleware/validation.middleware.js';
import { createSearchService } from '../services/search-service.js';
import { 
  UnifiedSearchRequestSchema, 
  SearchSchemas 
} from '@mcp-tools/core';

const router = Router();

// ============================================================================
// Rate Limiting for Search Endpoints
// ============================================================================

const searchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // limit each IP to 100 search requests per windowMs
  message: {
    error: {
      code: 'SEARCH_RATE_LIMITED',
      message: 'Too many search requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const cacheOperationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit cache operations to 10 per windowMs
  message: {
    error: {
      code: 'CACHE_RATE_LIMITED',
      message: 'Too many cache operations from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Validation Schemas
// ============================================================================

// Query parameters for search suggestions
const SearchSuggestionsQuerySchema = z.object({
  q: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  user_id: z.string().uuid().optional()
});

// Query parameters for search analytics
const SearchAnalyticsQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  include_performance: z.coerce.boolean().default(false)
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/v1/search - Main unified search endpoint
 * 
 * Performs unified search across all content sources with comprehensive
 * filtering, sorting, and pagination options.
 */
router.post('/', [
  searchRateLimit,
  validateRequest(UnifiedSearchRequestSchema, 'body')
], asyncHandler(async (req: any, res: any) => {
  const startTime = Date.now();
  const searchRequest = req.body;
  const userId = req.headers['user-id'] as string;
  const sessionId = req.headers['session-id'] as string;
  
  console.log(`🔍 Search request received: "${searchRequest.query}" from user ${userId}`);
  
  try {
    // Get search service from app locals
    const searchService = createSearchService(req.app.locals);
    
    if (!searchService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'Search service is not available. Please try again later.'
      );
    }
    
    // Execute unified search with timeout
    const searchPromise = searchService.searchAcrossSystem(
      searchRequest,
      userId,
      sessionId
    );
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Search request timed out'));
      }, 30000); // 30 second timeout
    });
    
    const searchResults = await Promise.race([
      searchPromise,
      timeoutPromise
    ]) as any;
    
    const processingTime = Date.now() - startTime;
    
    // Add performance headers
    res.set({
      'X-Search-Processing-Time': processingTime.toString(),
      'X-Search-Results-Count': searchResults.total_count.toString(),
      'X-Search-Cache-Hit': searchResults.from_cache ? 'true' : 'false'
    });
    
    console.log(`⚡ Search completed in ${processingTime}ms with ${searchResults.results.length} results`);
    
    // Return successful search results
    res.success({
      ...searchResults,
      performance: {
        ...searchResults.performance,
        gateway_processing_time_ms: processingTime
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Search request failed:', error);
    
    // Set performance headers even on error
    res.set({
      'X-Search-Processing-Time': processingTime.toString(),
      'X-Search-Results-Count': '0',
      'X-Search-Error': 'true'
    });
    
    if (error instanceof Error && error.message === 'Search request timed out') {
      return res.status(408).error(
        'SEARCH_TIMEOUT',
        'Search request timed out. Please try a more specific query.',
        { processing_time_ms: processingTime }
      );
    }
    
    // Return generic search error
    res.status(500).error(
      'SEARCH_FAILED',
      'An error occurred while processing your search request.',
      { 
        processing_time_ms: processingTime,
        error_type: error?.constructor?.name || 'Unknown'
      }
    );
  }
}));

/**
 * GET /api/v1/search/suggestions - Query suggestions endpoint
 * 
 * Provides search suggestions based on query prefix, popular searches,
 * and personalized recommendations.
 */
router.get('/suggestions', [
  searchRateLimit,
  validateRequest(SearchSuggestionsQuerySchema, 'query')
], asyncHandler(async (req: any, res: any) => {
  const { q: queryPrefix, limit, user_id } = req.query as any;
  
  try {
    const searchService = createSearchService(req.app.locals);
    
    if (!searchService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'Search suggestions service is not available.'
      );
    }
    
    // For now, provide basic suggestions
    // This can be enhanced with actual suggestion logic
    const suggestions = await generateSearchSuggestions(queryPrefix, limit, user_id);
    
    res.success({
      suggestions,
      query_prefix: queryPrefix,
      total_suggestions: suggestions.length,
      personalized: !!user_id
    });
    
  } catch (error) {
    console.error('❌ Search suggestions failed:', error);
    res.status(500).error(
      'SUGGESTIONS_FAILED',
      'Failed to generate search suggestions.'
    );
  }
}));

/**
 * GET /api/v1/search/analytics - Search analytics endpoint
 * 
 * Returns search analytics data including performance metrics,
 * popular queries, and user search patterns.
 */
router.get('/analytics', [
  validateRequest(SearchAnalyticsQuerySchema, 'query')
], asyncHandler(async (req: any, res: any) => {
  const { user_id, date_from, date_to, include_performance } = req.query as any;
  
  try {
    const searchService = createSearchService(req.app.locals);
    
    if (!searchService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'Search analytics service is not available.'
      );
    }
    
    // Get analytics data
    const analyticsData = await searchService.getAnalytics(
      user_id,
      date_from ? new Date(date_from) : undefined,
      date_to ? new Date(date_to) : undefined
    );
    
    let cacheStats = null;
    if (include_performance) {
      try {
        cacheStats = searchService.getCacheStats();
      } catch (error) {
        console.warn('⚠️ Cache stats not available:', error.message);
      }
    }
    
    res.success({
      analytics: analyticsData,
      cache_stats: cacheStats,
      date_range: {
        from: date_from,
        to: date_to
      },
      generated_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Search analytics failed:', error);
    res.status(500).error(
      'ANALYTICS_FAILED',
      'Failed to retrieve search analytics data.',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * DELETE /api/v1/search/cache - Clear search cache endpoint
 * 
 * Clears the search result cache. This endpoint should be used sparingly
 * and typically only by administrators or during maintenance.
 */
router.delete('/cache', [
  cacheOperationRateLimit
], asyncHandler(async (req: any, res: any) => {
  try {
    const searchService = createSearchService(req.app.locals);
    
    if (!searchService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'Search cache service is not available.'
      );
    }
    
    // Clear search cache
    await searchService.clearCache();
    
    console.log('🧹 Search cache cleared successfully');
    
    res.success({
      message: 'Search cache cleared successfully',
      cleared_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to clear search cache:', error);
    res.status(500).error(
      'CACHE_CLEAR_FAILED',
      'Failed to clear search cache.',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /api/v1/search/health - Search service health check
 */
router.get('/health', asyncHandler(async (req: any, res: any) => {
  try {
    const searchService = createSearchService(req.app.locals);
    const isAvailable = !!searchService;
    
    let cacheStatus = 'unknown';
    try {
      if (searchService) {
        const stats = searchService.getCacheStats();
        cacheStatus = 'healthy';
      }
    } catch {
      cacheStatus = 'disabled';
    }
    
    res.success({
      status: isAvailable ? 'healthy' : 'unhealthy',
      search_service: isAvailable ? 'available' : 'unavailable',
      cache_service: cacheStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Search health check failed:', error);
    res.status(503).error(
      'HEALTH_CHECK_FAILED',
      'Search service health check failed.'
    );
  }
}));

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate search suggestions (placeholder implementation)
 */
async function generateSearchSuggestions(
  queryPrefix?: string, 
  limit: number = 5, 
  userId?: string
): Promise<Array<{ query: string; type: string; confidence: number }>> {
  // This is a placeholder implementation
  // In a real implementation, this would:
  // 1. Query popular searches from analytics
  // 2. Use user's search history for personalization
  // 3. Generate completions based on indexed content
  // 4. Use ML models for better suggestions
  
  if (!queryPrefix) {
    // Return popular/default suggestions
    return [
      { query: 'machine learning', type: 'popular', confidence: 0.9 },
      { query: 'javascript tutorial', type: 'popular', confidence: 0.8 },
      { query: 'database design', type: 'popular', confidence: 0.7 },
      { query: 'api documentation', type: 'popular', confidence: 0.6 },
      { query: 'project management', type: 'popular', confidence: 0.5 }
    ].slice(0, limit);
  }
  
  // Generate prefix-based suggestions
  const suggestions = [
    `${queryPrefix} tutorial`,
    `${queryPrefix} examples`,
    `${queryPrefix} documentation`,
    `${queryPrefix} best practices`,
    `${queryPrefix} guide`
  ].map((query, index) => ({
    query,
    type: 'completion',
    confidence: Math.max(0.5, 1.0 - (index * 0.1))
  }));
  
  return suggestions.slice(0, limit);
}

export default router;