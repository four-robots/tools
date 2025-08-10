/**
 * Dynamic Facets API Routes
 * 
 * REST API endpoints for dynamic facet operations, discovery, filtering, and statistics.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  DynamicFacetService,
  FacetDiscoveryEngine,
  FacetFilterEngine,
  FacetStatisticsService,
  type DynamicFacetServiceOptions,
  type FacetDiscoveryOptions
} from '@mcp-tools/core/src/services/dynamic-facets';
import {
  type SearchResult,
  type FacetFilter,
  type GenerateFacetsRequest,
  type ApplyFiltersRequest,
  type FacetStatisticsRequest,
  DynamicFacetSchemas
} from '@mcp-tools/core/src/shared/types';

const router = Router();

// Initialize services
const facetService = new DynamicFacetService({
  cacheEnabled: true,
  performanceTracking: true,
  maxProcessingTime: 10000 // 10 seconds
});

const discoveryEngine = new FacetDiscoveryEngine();
const filterEngine = new FacetFilterEngine();
const statisticsService = new FacetStatisticsService();

// ============================================================================
// Core Facet Operations
// ============================================================================

/**
 * GET /api/v1/facets - List all active facets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      active = 'true',
      type,
      limit = '50',
      offset = '0'
    } = req.query;

    // In a full implementation, this would query the database
    const facets = []; // Would fetch from facet_definitions table

    res.json({
      success: true,
      data: {
        facets,
        total: facets.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch facets',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/facets/generate - Generate facets from search results
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const requestData = DynamicFacetSchemas.GenerateFacetsRequest.parse(req.body);

    const startTime = Date.now();
    const facetCollection = await facetService.generateFacets(
      requestData.results,
      requestData.query,
      {
        maxFacets: requestData.maxFacets,
        minQualityScore: requestData.minQualityScore,
        includeRanges: requestData.includeRanges,
        includeHierarchical: requestData.includeHierarchical
      }
    );

    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: facetCollection,
      meta: {
        processingTimeMs: processingTime,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to generate facets',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/v1/facets/:id - Get specific facet details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate UUID
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid facet ID format'
      });
    }

    // In a full implementation, this would query the database
    const facet = null; // Would fetch from facet_definitions table

    if (!facet) {
      return res.status(404).json({
        success: false,
        error: 'Facet not found'
      });
    }

    res.json({
      success: true,
      data: facet
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch facet',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/v1/facets/:id - Update facet configuration
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate UUID
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid facet ID format'
      });
    }

    // Validate update data
    const updateSchema = z.object({
      displayName: z.string().max(200).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      configuration: z.record(z.string(), z.any()).optional()
    });

    const updateData = updateSchema.parse(req.body);

    // In a full implementation, this would update the database
    const updatedFacet = { id, ...updateData }; // Would update facet_definitions table

    res.json({
      success: true,
      data: updatedFacet
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update facet',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// ============================================================================
// Facet Discovery and Analysis
// ============================================================================

/**
 * POST /api/v1/facets/discover - Discover facets from data
 */
router.post('/discover', async (req: Request, res: Response) => {
  try {
    const requestSchema = z.object({
      results: z.array(z.any()), // SearchResult array
      options: z.object({
        maxFacets: z.number().int().positive().optional(),
        minQualityScore: z.number().min(0).max(1).optional(),
        minCoverage: z.number().min(0).max(1).optional(),
        maxCardinality: z.number().int().positive().optional(),
        includeDates: z.boolean().optional(),
        includeRanges: z.boolean().optional(),
        includeHierarchical: z.boolean().optional()
      }).optional()
    });

    const { results, options = {} } = requestSchema.parse(req.body);

    const startTime = Date.now();
    const discoveredFacets = await discoveryEngine.discoverFacets(results, options);
    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        discoveredFacets,
        totalDiscovered: discoveredFacets.length,
        processingTimeMs: processingTime
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to discover facets',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * POST /api/v1/facets/analyze - Analyze potential facet quality
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const requestSchema = z.object({
      results: z.array(z.any()), // SearchResult array
      fieldPaths: z.array(z.string()).optional()
    });

    const { results, fieldPaths } = requestSchema.parse(req.body);

    // Analyze specific fields or discover all
    const analysisOptions = fieldPaths ? { maxFacets: 50 } : {};
    const discoveredFacets = await discoveryEngine.discoverFacets(results, analysisOptions);

    // Filter by field paths if specified
    const relevantFacets = fieldPaths 
      ? discoveredFacets.filter(f => fieldPaths.includes(f.sourceField))
      : discoveredFacets;

    res.json({
      success: true,
      data: {
        analysis: relevantFacets.map(facet => ({
          sourceField: facet.sourceField,
          facetType: facet.facetType,
          qualityScore: facet.qualityScore,
          usefulnessScore: facet.usefulnessScore,
          cardinality: facet.cardinality,
          coverage: facet.coverage,
          reasons: facet.reasons
        })),
        recommendations: relevantFacets
          .filter(f => f.qualityScore >= 0.7)
          .slice(0, 5)
          .map(f => ({
            sourceField: f.sourceField,
            displayName: f.displayName,
            reason: f.reasons[0] || 'High quality facet candidate'
          }))
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to analyze facets',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/v1/facets/suggestions - Get facet suggestions
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { 
      context,
      limit = '10',
      minScore = '0.6'
    } = req.query;

    // In a full implementation, this would analyze usage patterns and context
    const suggestions = []; // Would generate suggestions based on context

    res.json({
      success: true,
      data: {
        suggestions,
        context: context as string,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// Facet Filtering
// ============================================================================

/**
 * POST /api/v1/facets/apply-filters - Apply filters to results
 */
router.post('/apply-filters', async (req: Request, res: Response) => {
  try {
    const requestData = DynamicFacetSchemas.ApplyFiltersRequest.parse(req.body);

    const startTime = Date.now();
    const filteredResults = await filterEngine.applyFilters(
      requestData.results,
      requestData.filters,
      requestData.filterLogic
    );
    const processingTime = Date.now() - startTime;

    // Generate filter statistics
    const statistics = filterEngine.generateFilterStatistics(
      requestData.results,
      filteredResults,
      requestData.filters,
      processingTime
    );

    res.json({
      success: true,
      data: {
        filteredResults: requestData.returnResults ? filteredResults : [],
        statistics,
        totalFiltered: filteredResults.length,
        totalOriginal: requestData.results.length,
        processingTimeMs: processingTime
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to apply filters',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

/**
 * GET /api/v1/facets/filter-stats - Get filter statistics
 */
router.get('/filter-stats', async (req: Request, res: Response) => {
  try {
    const { 
      timeframe = '24h',
      facetId 
    } = req.query;

    // In a full implementation, this would query filter usage statistics
    const stats = {
      totalFiltersApplied: 0,
      avgResultsReduction: 0,
      mostUsedFilters: [],
      avgProcessingTime: 0,
      timeframe: timeframe as string
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get filter statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/facets/optimize-filters - Optimize filter performance
 */
router.post('/optimize-filters', async (req: Request, res: Response) => {
  try {
    const requestSchema = z.object({
      filters: z.array(DynamicFacetSchemas.FacetFilter),
      results: z.array(z.any()).optional(), // SearchResult array for analysis
      optimizationType: z.enum(['performance', 'accuracy', 'balanced']).default('balanced')
    });

    const { filters, results, optimizationType } = requestSchema.parse(req.body);

    // In a full implementation, this would analyze and reorder filters
    const optimizedFilters = filters; // Would apply optimization logic
    const recommendations = []; // Would provide optimization recommendations

    res.json({
      success: true,
      data: {
        originalFilters: filters,
        optimizedFilters,
        recommendations,
        optimizationType,
        estimatedImprovement: '15%' // Would calculate actual improvement
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to optimize filters',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// ============================================================================
// Real-time Statistics
// ============================================================================

/**
 * GET /api/v1/facets/:id/statistics - Get facet statistics
 */
router.get('/:id/statistics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      includeHourly = 'false',
      dateFrom,
      dateTo 
    } = req.query;

    // Validate UUID
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid facet ID format'
      });
    }

    const statistics = await statisticsService.getFacetStatistics(id);

    if (!statistics) {
      return res.status(404).json({
        success: false,
        error: 'Facet statistics not found'
      });
    }

    let hourlyStats = {};
    if (includeHourly === 'true' && dateFrom && dateTo) {
      hourlyStats = await statisticsService.getHourlyStatistics(
        id,
        dateFrom as string,
        dateTo as string
      );
    }

    res.json({
      success: true,
      data: {
        ...statistics,
        hourlyStats: includeHourly === 'true' ? hourlyStats : undefined
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get facet statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/v1/facets/:id/refresh-stats - Refresh statistics
 */
router.post('/:id/refresh-stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate UUID
    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid facet ID format'
      });
    }

    const startTime = Date.now();
    const refreshedStats = await statisticsService.refreshStatistics(id);
    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: refreshedStats,
      meta: {
        processingTimeMs: processingTime,
        refreshedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to refresh statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/v1/facets/global-stats - Get global faceting statistics
 */
router.get('/global-stats', async (req: Request, res: Response) => {
  try {
    const globalStats = await statisticsService.getGlobalStatistics();

    res.json({
      success: true,
      data: globalStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get global statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// User Preferences
// ============================================================================

/**
 * GET /api/v1/facets/user-preferences - Get user facet preferences
 */
router.get('/user-preferences', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId || !z.string().uuid().safeParse(userId).success) {
      return res.status(400).json({
        success: false,
        error: 'Valid user ID is required'
      });
    }

    // In a full implementation, this would query user_facet_preferences table
    const preferences = []; // Would fetch from database

    res.json({
      success: true,
      data: {
        userId,
        preferences
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get user preferences',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/v1/facets/user-preferences - Update user preferences
 */
router.put('/user-preferences', async (req: Request, res: Response) => {
  try {
    const requestSchema = z.object({
      userId: z.string().uuid(),
      preferences: z.array(z.object({
        facetId: z.string().uuid(),
        isVisible: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        defaultExpanded: z.boolean().optional(),
        customDisplayName: z.string().max(200).optional()
      }))
    });

    const { userId, preferences } = requestSchema.parse(req.body);

    // In a full implementation, this would update the database
    // For now, just return the preferences as saved
    const savedPreferences = preferences; // Would save to user_facet_preferences table

    res.json({
      success: true,
      data: {
        userId,
        preferences: savedPreferences,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update user preferences',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

export default router;