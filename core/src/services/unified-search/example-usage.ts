/**
 * Unified Search Service Usage Example
 * 
 * Demonstrates how to use the unified search service to aggregate
 * and rank results from all content sources.
 */

import { 
  createUnifiedSearchService,
  type UnifiedSearchRequest,
  validateSearchQuery,
  createOptimalFilters,
  formatSearchResultsForDisplay,
  DEFAULT_UNIFIED_SEARCH_CONFIG
} from './index.js';

// Note: In a real application, you would inject actual service instances
// This is just for demonstration purposes

/**
 * Example usage of the unified search service
 */
async function demonstrateUnifiedSearch() {
  console.log('🔍 Unified Search Service Demo\n');

  // Mock service instances (in production, these would be real services)
  const mockServices = {
    memoryService: {} as any,
    kanbanService: {} as any,
    wikiService: {} as any,
    scraperService: {
      searchScrapedContent: async (query: string, options: any) => {
        // Mock scraper results
        return {
          results: [
            {
              id: 'scraped-1',
              title: `Results for "${query}"`,
              preview: `Mock scraped content containing "${query}"`,
              url: 'https://example.com/mock-result',
              score: 0.75,
              scrapedAt: new Date().toISOString()
            }
          ]
        };
      }
    } as any
  };

  // Create unified search service
  const unifiedSearch = createUnifiedSearchService(
    mockServices.memoryService,
    mockServices.kanbanService,
    mockServices.wikiService,
    mockServices.scraperService,
    {
      ...DEFAULT_UNIFIED_SEARCH_CONFIG,
      maxSearchTimeoutMs: 5000,
      enableAnalytics: true,
      enableCaching: true
    }
  );

  console.log('✅ Unified search service created\n');

  // Example search queries
  const exampleQueries = [
    'machine learning algorithms',
    'how to deploy applications',
    'fix database connection issues',
    'react component best practices',
    'project management workflow'
  ];

  for (const query of exampleQueries) {
    console.log(`🔍 Searching for: "${query}"`);
    
    // Validate query
    if (!validateSearchQuery(query)) {
      console.log('❌ Invalid query, skipping...\n');
      continue;
    }

    // Create optimal filters based on query content
    const optimalFilters = createOptimalFilters(query);
    console.log(`📋 Optimal filters:`, optimalFilters);

    // Build search request
    const searchRequest: UnifiedSearchRequest = {
      query,
      filters: optimalFilters,
      sort: 'relevance',
      pagination: { page: 1, limit: 10 },
      use_semantic: true,
      use_fuzzy: true,
      include_preview: true,
      include_highlights: true
    };

    try {
      // Perform search
      const startTime = Date.now();
      const results = await unifiedSearch.searchAcrossSystem(
        searchRequest,
        'demo-user-123',
        'demo-session-456'
      );
      const searchTime = Date.now() - startTime;

      console.log(`⚡ Search completed in ${searchTime}ms`);
      console.log(`📊 Found ${results.total_count} results`);

      // Format results for display
      const formatted = formatSearchResultsForDisplay(results);
      
      console.log('🎯 Top results:');
      formatted.formattedResults.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.title} (${result.relevanceScore}%)`);
        console.log(`     ${result.preview.substring(0, 100)}...`);
        console.log(`     Type: ${result.type} | Source: ${result.source}\n`);
      });

      // Show aggregations
      console.log('📈 Result breakdown:');
      Object.entries(results.aggregations.by_type).forEach(([type, count]) => {
        console.log(`  ${type}: ${count} results`);
      });

      // Show suggestions if any
      if (results.suggestions && results.suggestions.length > 0) {
        console.log('💡 Query suggestions:');
        results.suggestions.forEach(suggestion => {
          console.log(`  "${suggestion.query}" (${Math.round(suggestion.confidence * 100)}%)`);
        });
      }

      console.log('─'.repeat(60) + '\n');

    } catch (error) {
      console.error(`❌ Search failed for "${query}":`, error);
      console.log('─'.repeat(60) + '\n');
    }
  }

  // Show analytics after searches
  try {
    console.log('📊 Search Analytics Summary');
    const analytics = await unifiedSearch.getAnalytics('demo-user-123');
    
    console.log(`Total queries: ${analytics.performance.total_queries}`);
    console.log(`Average response time: ${Math.round(analytics.performance.avg_response_time_ms)}ms`);
    console.log(`Success rate: ${Math.round(analytics.performance.success_rate * 100)}%`);
    
    if (analytics.popularTerms.length > 0) {
      console.log('Popular terms:', analytics.popularTerms.map(t => t.term).join(', '));
    }
    
    console.log('');
  } catch (error) {
    console.log('Analytics not available (expected in mock environment)\n');
  }

  // Show cache statistics
  try {
    const cacheStats = unifiedSearch.getCacheStats();
    console.log('💾 Cache Statistics');
    console.log(`Total entries: ${cacheStats.totalEntries}`);
    console.log(`Hit rate: ${Math.round(cacheStats.hitRate * 100)}%`);
    console.log(`Memory usage: ${Math.round(cacheStats.memoryUsageBytes / 1024)}KB`);
    console.log('');
  } catch (error) {
    console.log('Cache statistics not available\n');
  }

  // Clean up
  await unifiedSearch.shutdown();
  console.log('🛑 Unified search service shut down');
}

/**
 * Demonstrate query processing capabilities
 */
async function demonstrateQueryProcessing() {
  console.log('\n🧠 Query Processing Demo\n');

  const { QueryProcessor } = await import('./QueryProcessor.js');
  const queryProcessor = new QueryProcessor();

  const testQueries = [
    'how to fix javascript errors',
    'machine learning tutorial',
    'find user profile page',
    'analyze sales data trends'
  ];

  for (const query of testQueries) {
    console.log(`Processing query: "${query}"`);
    
    const processed = await queryProcessor.processQuery({
      query,
      pagination: { page: 1, limit: 20 }
    });

    console.log(`  Intent: ${processed.intent}`);
    console.log(`  Complexity: ${processed.complexity.toFixed(2)}`);
    console.log(`  Keywords: ${processed.keywords.join(', ')}`);
    console.log(`  Strategies: ${processed.strategies.join(', ')}`);
    
    if (processed.metadata.expectedResultTypes?.length) {
      console.log(`  Expected types: ${processed.metadata.expectedResultTypes.join(', ')}`);
    }
    
    const suggestions = await queryProcessor.generateSuggestions(processed);
    if (suggestions.length > 0) {
      console.log(`  Suggestions: ${suggestions.map(s => s.query).join(', ')}`);
    }
    
    console.log('');
  }
}

/**
 * Run the demonstration
 */
export async function runUnifiedSearchDemo() {
  try {
    await demonstrateUnifiedSearch();
    await demonstrateQueryProcessing();
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runUnifiedSearchDemo().catch(console.error);
}