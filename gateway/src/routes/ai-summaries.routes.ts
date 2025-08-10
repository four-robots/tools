/**
 * AI Summaries API Routes
 * 
 * REST API endpoints for AI-powered search result summarization,
 * including content generation, fact checking, and citation management.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { 
  GenerateSummaryRequestSchema,
  AISummarySchemas 
} from '@mcp-tools/core';

const router = Router();

// ============================================================================
// Rate Limiting for AI Summary Endpoints
// ============================================================================

const summaryGenerationRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // limit each IP to 20 summary generation requests per windowMs
  message: {
    error: {
      code: 'SUMMARY_RATE_LIMITED',
      message: 'Too many summary generation requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const summaryRetrievalRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // limit each IP to 100 summary retrieval requests per windowMs
  message: {
    error: {
      code: 'SUMMARY_RETRIEVAL_RATE_LIMITED',
      message: 'Too many summary retrieval requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const feedbackRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit feedback submissions to 10 per windowMs
  message: {
    error: {
      code: 'FEEDBACK_RATE_LIMITED',
      message: 'Too many feedback submissions from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Validation Schemas
// ============================================================================

// Query parameters for summary retrieval
const GetSummaryQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  summary_type: z.enum(['general_summary', 'answer_generation', 'key_points', 'synthesis', 'comparison', 'explanation']).optional()
});

// Summary feedback schema
const SummaryFeedbackSchema = z.object({
  summaryId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  feedbackType: z.enum([
    'helpful', 'not_helpful', 'inaccurate', 'incomplete', 
    'too_long', 'too_short', 'unclear', 'excellent'
  ]),
  rating: z.number().min(1).max(5).optional(),
  specificIssues: z.array(z.string()).default([]),
  suggestedImprovements: z.string().optional(),
  preferences: z.object({
    length: z.enum(['shorter', 'longer', 'just_right']).optional(),
    style: z.enum(['more_detailed', 'more_concise', 'more_technical', 'simpler']).optional(),
    focus: z.enum(['more_examples', 'more_theory', 'more_practical', 'balanced']).optional()
  }).optional(),
  feedbackText: z.string().optional()
});

// Analytics query schema
const SummaryAnalyticsQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  summary_type: z.string().optional(),
  include_quality_metrics: z.coerce.boolean().default(false)
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/v1/ai-summaries - Generate AI summary from search results
 * 
 * Creates an AI-powered summary from provided search results with
 * comprehensive analysis, fact checking, and source attribution.
 */
router.post('/', [
  summaryGenerationRateLimit,
  validateRequest(GenerateSummaryRequestSchema, 'body')
], asyncHandler(async (req: any, res: any) => {
  const startTime = Date.now();
  const summaryRequest = req.body;
  const userId = req.headers['user-id'] as string;
  const sessionId = req.headers['session-id'] as string;
  
  console.log(`🤖 AI Summary request received: "${summaryRequest.query}" (${summaryRequest.summaryType}) from user ${userId}`);
  
  try {
    // Get AI summary service from app locals
    const aiSummaryService = req.app.locals.aiSummaryService;
    
    if (!aiSummaryService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'AI Summary service is not available. Please try again later.'
      );
    }

    // Add user context to request if available
    if (userId) {
      summaryRequest.userId = userId;
    }
    if (sessionId) {
      summaryRequest.sessionId = sessionId;
    }
    
    // Execute summary generation with timeout
    const summaryPromise = aiSummaryService.generateResultSummary(summaryRequest);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Summary generation timed out'));
      }, 60000); // 60 second timeout for AI processing
    });
    
    const summaryResponse = await Promise.race([
      summaryPromise,
      timeoutPromise
    ]) as any;
    
    const processingTime = Date.now() - startTime;
    
    // Add performance headers
    res.set({
      'X-Summary-Processing-Time': processingTime.toString(),
      'X-Summary-Type': summaryRequest.summaryType,
      'X-Summary-Success': summaryResponse.success ? 'true' : 'false',
      'X-Summary-Cached': summaryResponse.metadata?.cached ? 'true' : 'false'
    });

    if (!summaryResponse.success) {
      console.error(`❌ Summary generation failed: ${summaryResponse.error}`);
      return res.status(400).error(
        'SUMMARY_GENERATION_FAILED',
        summaryResponse.error || 'Failed to generate summary',
        { 
          processing_time_ms: processingTime,
          summary_type: summaryRequest.summaryType
        }
      );
    }
    
    console.log(`✅ AI Summary generated in ${processingTime}ms with confidence ${summaryResponse.summary?.overallConfidence.toFixed(2)}`);
    
    // Return successful summary response
    res.success({
      ...summaryResponse,
      performance: {
        ...summaryResponse.metadata,
        gateway_processing_time_ms: processingTime,
        total_processing_time_ms: processingTime
      }
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ AI Summary request failed:', error);
    
    // Set performance headers even on error
    res.set({
      'X-Summary-Processing-Time': processingTime.toString(),
      'X-Summary-Error': 'true'
    });
    
    if (error instanceof Error && error.message === 'Summary generation timed out') {
      return res.status(408).error(
        'SUMMARY_TIMEOUT',
        'Summary generation timed out. Please try with fewer search results or a simpler query.',
        { processing_time_ms: processingTime }
      );
    }
    
    // Return generic summary error
    res.status(500).error(
      'SUMMARY_FAILED',
      'An error occurred while generating the AI summary.',
      { 
        processing_time_ms: processingTime,
        error_type: error?.constructor?.name || 'Unknown'
      }
    );
  }
}));

/**
 * GET /api/v1/ai-summaries/:id - Get specific summary by ID
 * 
 * Retrieves a previously generated summary with all associated metadata,
 * fact checks, and source attribution.
 */
router.get('/:id', [
  summaryRetrievalRateLimit
], asyncHandler(async (req: any, res: any) => {
  const summaryId = req.params.id;
  
  if (!summaryId || !z.string().uuid().safeParse(summaryId).success) {
    return res.status(400).error(
      'INVALID_SUMMARY_ID',
      'Please provide a valid summary ID.'
    );
  }
  
  try {
    const aiSummaryService = req.app.locals.aiSummaryService;
    
    if (!aiSummaryService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'AI Summary service is not available.'
      );
    }
    
    const summary = await aiSummaryService.getSummaryById(summaryId);
    
    if (!summary) {
      return res.status(404).error(
        'SUMMARY_NOT_FOUND',
        'The requested summary was not found.'
      );
    }

    // Update access tracking
    summary.accessCount = (summary.accessCount || 0) + 1;
    summary.lastAccessedAt = new Date();
    
    res.success({
      summary,
      retrieved_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to retrieve summary:', error);
    res.status(500).error(
      'SUMMARY_RETRIEVAL_FAILED',
      'Failed to retrieve the requested summary.'
    );
  }
}));

/**
 * GET /api/v1/ai-summaries - Get user summaries
 * 
 * Retrieves summaries for a specific user with pagination and filtering.
 */
router.get('/', [
  summaryRetrievalRateLimit,
  validateRequest(GetSummaryQuerySchema, 'query')
], asyncHandler(async (req: any, res: any) => {
  const { user_id, limit, offset, summary_type } = req.query as any;
  
  try {
    const aiSummaryService = req.app.locals.aiSummaryService;
    
    if (!aiSummaryService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'AI Summary service is not available.'
      );
    }
    
    if (!user_id) {
      return res.status(400).error(
        'USER_ID_REQUIRED',
        'User ID is required to retrieve summaries.'
      );
    }
    
    const summaries = await aiSummaryService.getUserSummaries(user_id, limit, offset);
    
    // Filter by summary type if specified
    const filteredSummaries = summary_type ? 
      summaries.filter(s => s.summaryType === summary_type) : 
      summaries;
    
    res.success({
      summaries: filteredSummaries,
      pagination: {
        limit,
        offset,
        count: filteredSummaries.length,
        has_more: filteredSummaries.length === limit
      },
      filters: {
        user_id,
        summary_type
      },
      retrieved_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to retrieve user summaries:', error);
    res.status(500).error(
      'SUMMARIES_RETRIEVAL_FAILED',
      'Failed to retrieve user summaries.'
    );
  }
}));

/**
 * POST /api/v1/ai-summaries/:id/feedback - Submit feedback on summary
 * 
 * Allows users to provide feedback on summary quality, accuracy, and usefulness.
 */
router.post('/:id/feedback', [
  feedbackRateLimit,
  validateRequest(SummaryFeedbackSchema, 'body')
], asyncHandler(async (req: any, res: any) => {
  const summaryId = req.params.id;
  const feedbackData = req.body;
  
  if (!summaryId || !z.string().uuid().safeParse(summaryId).success) {
    return res.status(400).error(
      'INVALID_SUMMARY_ID',
      'Please provide a valid summary ID.'
    );
  }
  
  try {
    const aiSummaryService = req.app.locals.aiSummaryService;
    
    if (!aiSummaryService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'AI Summary service is not available.'
      );
    }
    
    // Verify summary exists
    const summary = await aiSummaryService.getSummaryById(summaryId);
    
    if (!summary) {
      return res.status(404).error(
        'SUMMARY_NOT_FOUND',
        'The summary you are trying to provide feedback for was not found.'
      );
    }
    
    // Store feedback (this would typically go to a dedicated feedback service)
    const feedback = {
      ...feedbackData,
      summaryId,
      createdAt: new Date()
    };
    
    // In a real implementation, you would store this in a database
    console.log('📝 Summary feedback received:', feedback);
    
    res.success({
      message: 'Feedback submitted successfully',
      feedback_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to submit summary feedback:', error);
    res.status(500).error(
      'FEEDBACK_SUBMISSION_FAILED',
      'Failed to submit summary feedback.'
    );
  }
}));

/**
 * GET /api/v1/ai-summaries/analytics - Get summary analytics
 * 
 * Returns analytics data about summary generation, usage patterns, and quality metrics.
 */
router.get('/analytics', [
  validateRequest(SummaryAnalyticsQuerySchema, 'query')
], asyncHandler(async (req: any, res: any) => {
  const { user_id, date_from, date_to, summary_type, include_quality_metrics } = req.query as any;
  
  try {
    const aiSummaryService = req.app.locals.aiSummaryService;
    
    if (!aiSummaryService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'AI Summary analytics service is not available.'
      );
    }
    
    // Get real analytics from the service
    const analyticsData = await aiSummaryService.getAnalytics({
      dateFrom: date_from,
      dateTo: date_to,
      userId: user_id,
      summaryType: summary_type,
      includeQualityMetrics: include_quality_metrics
    });
    
    res.success({
      analytics: analyticsData,
      date_range: {
        from: date_from,
        to: date_to
      },
      filters: {
        user_id,
        summary_type
      },
      generated_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Summary analytics failed:', error);
    res.status(500).error(
      'ANALYTICS_FAILED',
      'Failed to retrieve summary analytics data.',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/ai-summaries/extract-key-points - Extract key points from content
 * 
 * Standalone endpoint for extracting key points from provided content.
 */
router.post('/extract-key-points', [
  summaryGenerationRateLimit,
  validateRequest(z.object({
    content: z.array(z.string().min(1)).min(1).max(10),
    maxPoints: z.number().int().min(1).max(20).default(10),
    userId: z.string().uuid().optional()
  }), 'body')
], asyncHandler(async (req: any, res: any) => {
  const startTime = Date.now();
  const { content, maxPoints, userId } = req.body;
  
  try {
    const aiSummaryService = req.app.locals.aiSummaryService;
    
    if (!aiSummaryService) {
      return res.status(503).error(
        'SERVICE_UNAVAILABLE',
        'AI Summary service is not available.'
      );
    }
    
    const keyPoints = await aiSummaryService.extractKeyPoints(content);
    const limitedKeyPoints = keyPoints.slice(0, maxPoints);
    
    const processingTime = Date.now() - startTime;
    
    res.success({
      key_points: limitedKeyPoints,
      total_points_found: keyPoints.length,
      points_returned: limitedKeyPoints.length,
      processing_time_ms: processingTime,
      extracted_at: new Date().toISOString()
    });
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Key points extraction failed:', error);
    
    res.status(500).error(
      'KEY_POINTS_EXTRACTION_FAILED',
      'Failed to extract key points from content.',
      { processing_time_ms: processingTime }
    );
  }
}));

// ============================================================================
// Health Check Endpoint
// ============================================================================

/**
 * GET /api/v1/ai-summaries/health - AI Summary service health check
 */
router.get('/health', asyncHandler(async (req: any, res: any) => {
  try {
    const aiSummaryService = req.app.locals.aiSummaryService;
    const isAvailable = !!aiSummaryService;
    
    let llmStatus = 'unknown';
    try {
      if (aiSummaryService && aiSummaryService.llmService) {
        // Check if LLM service is healthy
        const healthCheck = await aiSummaryService.llmService.healthCheck();
        llmStatus = healthCheck.some(h => h.status === 'healthy') ? 'healthy' : 'unhealthy';
      }
    } catch {
      llmStatus = 'unavailable';
    }
    
    res.success({
      status: isAvailable ? 'healthy' : 'unhealthy',
      ai_summary_service: isAvailable ? 'available' : 'unavailable',
      llm_service: llmStatus,
      features: {
        summary_generation: isAvailable,
        fact_checking: isAvailable,
        source_attribution: isAvailable,
        key_points_extraction: isAvailable
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AI Summary health check failed:', error);
    res.status(503).error(
      'HEALTH_CHECK_FAILED',
      'AI Summary service health check failed.'
    );
  }
}));

export default router;