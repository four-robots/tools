import { Router } from 'express';
import { APIDocumentationDiscoveryService } from '@mcp-tools/core';
import { ScraperService } from '@mcp-tools/core';

const router = Router();

// Get API documentation recommendations for a repository
router.get('/repositories/:repositoryId/api-documentation-recommendations', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { filter = 'all', sort = 'confidence', status = 'recommended' } = req.query;
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    const recommendations = await discoveryService.getRecommendationsForRepository(
      repositoryId, 
      status as string
    );
    
    // Apply filtering and sorting logic
    let filtered = recommendations;
    
    if (filter === 'high-confidence') {
      filtered = filtered.filter(r => r.usageConfidence >= 0.7);
    } else if (filter === 'direct-deps') {
      filtered = filtered.filter(r => r.recommendationReason.includes('Direct dependency'));
    }
    
    // Sort recommendations
    filtered.sort((a, b) => {
      switch (sort) {
        case 'health':
          return b.healthScore - a.healthScore;
        case 'relevance':
          return b.relevanceScore - a.relevanceScore;
        case 'confidence':
        default:
          return b.usageConfidence - a.usageConfidence;
      }
    });
    
    res.json({
      recommendations: filtered,
      total: filtered.length,
      stats: {
        totalRecommendations: recommendations.length,
        highConfidence: recommendations.filter(r => r.usageConfidence >= 0.7).length,
        estimatedIndexingTime: recommendations.reduce((sum, r) => sum + r.estimatedIndexingTime, 0),
        estimatedStorageSize: recommendations.reduce((sum, r) => sum + r.estimatedStorageSize, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching API documentation recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// Approve API documentation recommendations for indexing
router.post('/repositories/:repositoryId/api-documentation-recommendations/approve', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { recommendationIds } = req.body;
    
    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
      return res.status(400).json({ error: 'Invalid recommendation IDs' });
    }
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    const scraperService = req.app.get('scraperService') as ScraperService;
    
    // Update recommendation status to 'approved'
    await discoveryService.updateRecommendationStatus(recommendationIds, 'approved');
    
    // Get approved recommendations
    const recommendations = await discoveryService.getRecommendationsByIds(recommendationIds);
    
    // Schedule scraping for each approved documentation
    const scrapingTasks = [];
    for (const recommendation of recommendations) {
      const scrapingTask = {
        url: recommendation.documentationUrl,
        type: 'api-documentation' as const,
        metadata: {
          packageName: recommendation.packageName,
          packageVersion: recommendation.packageVersion,
          language: recommendation.language,
          repositoryId,
          recommendationId: recommendation.id
        },
        vectorOptions: {
          enabled: true,
          chunkingOptions: {
            strategy: 'paragraph' as const,
            target_size: 1000,
            max_size: 1500,
            min_size: 200,
            overlap_size: 100
          }
        }
      };
      
      scrapingTasks.push(scrapingTask);
      
      // Also scrape API reference and examples if available
      if (recommendation.apiReferenceUrl) {
        scrapingTasks.push({
          ...scrapingTask,
          url: recommendation.apiReferenceUrl,
          metadata: {
            ...scrapingTask.metadata,
            documentationType: 'api-reference'
          }
        });
      }
      
      if (recommendation.examplesUrl) {
        scrapingTasks.push({
          ...scrapingTask,
          url: recommendation.examplesUrl,
          metadata: {
            ...scrapingTask.metadata,
            documentationType: 'examples'
          }
        });
      }
    }
    
    // Submit scraping tasks
    const scrapeResults = await Promise.all(
      scrapingTasks.map(task => scraperService.scrapeUrl(task))
    );
    
    // Update recommendation status to 'indexed'
    await discoveryService.updateRecommendationStatus(recommendationIds, 'indexed');
    
    res.json({
      message: `Successfully approved and scheduled indexing for ${recommendationIds.length} recommendations`,
      approvedRecommendations: recommendationIds,
      scrapingTasks: scrapeResults.length,
      estimatedCompletionTime: recommendations.reduce((sum, r) => sum + r.estimatedIndexingTime, 0)
    });
    
  } catch (error) {
    console.error('Error approving API documentation recommendations:', error);
    res.status(500).json({ error: 'Failed to approve recommendations' });
  }
});

// Reject API documentation recommendations
router.post('/repositories/:repositoryId/api-documentation-recommendations/reject', async (req, res) => {
  try {
    const { recommendationIds } = req.body;
    
    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
      return res.status(400).json({ error: 'Invalid recommendation IDs' });
    }
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    
    // Update recommendation status to 'rejected'
    await discoveryService.updateRecommendationStatus(recommendationIds, 'rejected');
    
    res.json({
      message: `Successfully rejected ${recommendationIds.length} recommendations`,
      rejectedRecommendations: recommendationIds
    });
    
  } catch (error) {
    console.error('Error rejecting API documentation recommendations:', error);
    res.status(500).json({ error: 'Failed to reject recommendations' });
  }
});

// Trigger repository analysis for API documentation
router.post('/repositories/:repositoryId/api-documentation-recommendations/analyze', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { ecosystems, minConfidence = 0.5, maxRecommendations = 100 } = req.body;
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    
    const analysis = await discoveryService.analyzeRepositoryForAPIDocumentation({
      repository_id: repositoryId,
      ecosystems,
      min_confidence: minConfidence,
      max_recommendations: maxRecommendations
    });
    
    res.json({
      message: 'Analysis completed successfully',
      repositoryId,
      analysis
    });
    
  } catch (error) {
    console.error('Error analyzing repository for API documentation:', error);
    res.status(500).json({ error: 'Failed to analyze repository' });
  }
});

export default router;