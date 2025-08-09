/**
 * Scraper API Routes
 * 
 * REST API endpoints for web scraping functionality.
 */

import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ScraperService, EnhancedScraperService } from '@mcp-tools/core/scraper';

const router = Router();

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.error('VALIDATION_ERROR', 'Request validation failed', errors.array(), 400);
  }
  next();
};

// POST /api/scraper/scrape - Scrape a URL
router.post('/scrape', [
  body('url').isURL(),
  body('options').optional().isObject(),
  body('options.waitForSelector').optional().isString(),
  body('options.timeout').optional().isInt({ min: 1000, max: 60000 }),
  body('options.removeAds').optional().isBoolean(),
  body('options.removeImages').optional().isBoolean(),
  body('options.extractMetadata').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const scraperService: ScraperService = req.app.locals.scraperService;
  
  try {
    const result = await scraperService.scrapeUrl({
      url: req.body.url,
      options: req.body.options || {}
    });
    
    res.success(result);
  } catch (error: any) {
    return res.error('SCRAPE_ERROR', 'Failed to scrape URL', error.message);
  }
}));

// POST /api/scraper/scrape-enhanced - Enhanced scraping with vector processing
router.post('/scrape-enhanced', [
  body('url').isURL(),
  body('vector.enabled').optional().isBoolean(),
  body('vector.generateEmbeddings').optional().isBoolean(),
  body('vector.convertToMarkdown').optional().isBoolean(),
  body('vector.chunkingOptions.strategy').optional().isIn(['fixed_size', 'paragraph', 'sentence']),
  body('vector.chunkingOptions.target_size').optional().isInt({ min: 100, max: 8000 }),
  body('vector.chunkingOptions.max_size').optional().isInt({ min: 100, max: 10000 }),
  body('vector.chunkingOptions.min_size').optional().isInt({ min: 50, max: 1000 }),
  body('vector.chunkingOptions.overlap_size').optional().isInt({ min: 0, max: 500 }),
  body('options').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const enhancedScraperService: EnhancedScraperService = req.app.locals.enhancedScraperService;
  
  if (!enhancedScraperService) {
    return res.error('SERVICE_UNAVAILABLE', 'Enhanced scraper service not available', null, 503);
  }
  
  try {
    const result = await enhancedScraperService.scrapeUrlWithEmbeddings({
      url: req.body.url,
      vector: req.body.vector,
      options: req.body.options || {}
    });
    
    res.success(result);
  } catch (error: any) {
    return res.error('ENHANCED_SCRAPE_ERROR', 'Failed to perform enhanced scraping', error.message);
  }
}));

// POST /api/scraper/search - Search scraped content
router.post('/search', [
  body('query').isString().isLength({ min: 1, max: 500 }),
  body('threshold').optional().isFloat({ min: 0, max: 1 }),
  body('limit').optional().isInt({ min: 1, max: 100 }),
  body('domain').optional().isString(),
  body('dateRange.from').optional().isISO8601(),
  body('dateRange.to').optional().isISO8601(),
  body('includeChunks').optional().isBoolean(),
  body('searchType').optional().isIn(['vector', 'text', 'hybrid']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const enhancedScraperService: EnhancedScraperService = req.app.locals.enhancedScraperService;
  
  if (!enhancedScraperService) {
    return res.error('SERVICE_UNAVAILABLE', 'Enhanced scraper service not available', null, 503);
  }
  
  try {
    const results = await enhancedScraperService.searchScrapedContent(
      req.body.query,
      {
        threshold: req.body.threshold,
        limit: req.body.limit,
        domain: req.body.domain,
        dateRange: req.body.dateRange,
        includeChunks: req.body.includeChunks,
        searchType: req.body.searchType || 'vector'
      }
    );
    
    res.success(results);
  } catch (error: any) {
    return res.error('SEARCH_ERROR', 'Failed to search scraped content', error.message);
  }
}));

// POST /api/scraper/backfill - Backfill existing content with embeddings
router.post('/backfill', [
  body('missingEmbeddingsOnly').optional().isBoolean(),
  body('batchSize').optional().isInt({ min: 1, max: 100 }),
  body('domain').optional().isString(),
  body('dateRange.from').optional().isISO8601(),
  body('dateRange.to').optional().isISO8601(),
  body('chunkingOptions.strategy').optional().isIn(['fixed_size', 'paragraph', 'sentence']),
  body('chunkingOptions.target_size').optional().isInt({ min: 100, max: 8000 }),
  body('forceReprocess').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const enhancedScraperService: EnhancedScraperService = req.app.locals.enhancedScraperService;
  
  if (!enhancedScraperService) {
    return res.error('SERVICE_UNAVAILABLE', 'Enhanced scraper service not available', null, 503);
  }
  
  try {
    const results = await enhancedScraperService.backfillExistingContent({
      missingEmbeddingsOnly: req.body.missingEmbeddingsOnly,
      batchSize: req.body.batchSize,
      domain: req.body.domain,
      dateRange: req.body.dateRange,
      chunkingOptions: req.body.chunkingOptions,
      forceReprocess: req.body.forceReprocess
    });
    
    res.success(results);
  } catch (error: any) {
    return res.error('BACKFILL_ERROR', 'Failed to backfill content', error.message);
  }
}));

// GET /api/scraper/stats/enhanced - Get enhanced scraper statistics
router.get('/stats/enhanced', asyncHandler(async (req: any, res: any) => {
  const enhancedScraperService: EnhancedScraperService = req.app.locals.enhancedScraperService;
  
  if (!enhancedScraperService) {
    return res.error('SERVICE_UNAVAILABLE', 'Enhanced scraper service not available', null, 503);
  }
  
  try {
    const stats = await enhancedScraperService.getEnhancedStats();
    res.success(stats);
  } catch (error: any) {
    return res.error('STATS_ERROR', 'Failed to get enhanced statistics', error.message);
  }
}));

// GET /api/scraper/health - Check scraper service health
router.get('/health', asyncHandler(async (req: any, res: any) => {
  const scraperService: ScraperService = req.app.locals.scraperService;
  const enhancedScraperService: EnhancedScraperService = req.app.locals.enhancedScraperService;
  
  try {
    const health = await scraperService.getStats();
    
    // Add enhanced service status if available
    let enhancedStatus = null;
    if (enhancedScraperService) {
      try {
        const enhancedStats = await enhancedScraperService.getEnhancedStats();
        enhancedStatus = {
          available: true,
          services: enhancedStats.services,
          vectorStats: enhancedStats.vector
        };
      } catch (enhancedError) {
        enhancedStatus = {
          available: false,
          error: enhancedError instanceof Error ? enhancedError.message : 'Unknown error'
        };
      }
    }
    
    res.success({
      basic: health,
      enhanced: enhancedStatus
    });
  } catch (error: any) {
    return res.error('HEALTH_ERROR', 'Failed to get scraper health', error.message);
  }
}));

export default router;