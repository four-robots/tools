import { WhiteboardSearchService } from './whiteboard-search-service';
import { WhiteboardSearchPerformance, BenchmarkConfig, BenchmarkResults } from './whiteboard-search-performance';
import { DatabasePool } from '../../utils/database-pool';
import { Logger } from '../../utils/logger';
import { AdvancedSearchQuery } from '@shared/types/whiteboard';

/**
 * Predefined test queries for benchmarking
 */
export const BENCHMARK_QUERIES: AdvancedSearchQuery[] = [
  // Simple queries
  {
    query: 'design',
    syntaxType: 'natural',
  },
  {
    query: 'user interface',
    syntaxType: 'natural',
  },
  {
    query: 'prototype',
    syntaxType: 'natural',
    searchFields: ['title', 'description'],
  },
  
  // Complex queries with filters
  {
    query: 'system architecture',
    syntaxType: 'natural',
    searchFields: ['title', 'description', 'content'],
    includeHighlights: true,
    includePreviews: true,
    fuzzyMatch: true,
    dateRange: {
      field: 'modified',
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
    },
  },
  {
    query: 'feedback OR review',
    syntaxType: 'boolean',
    searchFields: ['title', 'description', 'comments'],
    hasComments: true,
    visibility: ['workspace', 'members'],
    activityLevel: 'high',
  },
  
  // Regex queries (most complex)
  {
    query: '^(Design|UI|UX).*System$',
    syntaxType: 'regex',
    searchFields: ['title'],
    includeHighlights: true,
    fuzzyMatch: false,
  },
  
  // Field-specific queries
  {
    query: 'kanban',
    syntaxType: 'field_specific',
    searchFields: ['tags'],
    elementTypes: ['text', 'shape'],
    hasElements: true,
  },
];

/**
 * Search benchmark scenarios
 */
export interface BenchmarkScenario {
  name: string;
  description: string;
  queries: AdvancedSearchQuery[];
  config: BenchmarkConfig;
}

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'light_load',
    description: 'Light load testing with simple queries',
    queries: BENCHMARK_QUERIES.slice(0, 3),
    config: {
      concurrentUsers: 5,
      requestsPerUser: 10,
      rampUpTime: 10,
      testDuration: 60,
    },
  },
  {
    name: 'moderate_load',
    description: 'Moderate load testing with mixed query complexity',
    queries: BENCHMARK_QUERIES,
    config: {
      concurrentUsers: 25,
      requestsPerUser: 20,
      rampUpTime: 30,
      testDuration: 120,
    },
  },
  {
    name: 'heavy_load',
    description: 'Heavy load testing simulating peak usage',
    queries: BENCHMARK_QUERIES,
    config: {
      concurrentUsers: 100,
      requestsPerUser: 50,
      rampUpTime: 60,
      testDuration: 300,
    },
  },
  {
    name: 'stress_test',
    description: 'Stress testing to find system limits',
    queries: BENCHMARK_QUERIES,
    config: {
      concurrentUsers: 200,
      requestsPerUser: 100,
      rampUpTime: 120,
      testDuration: 600,
    },
  },
];

/**
 * Comprehensive search benchmark results
 */
export interface ComprehensiveBenchmarkResults {
  scenarioName: string;
  startTime: string;
  endTime: string;
  duration: number;
  overallResults: BenchmarkResults;
  queryResults: Map<string, BenchmarkResults>;
  performanceStats: any;
  cacheStats: any;
  recommendations: {
    recommendedIndexes: string[];
    queryOptimizations: string[];
    performanceImprovements: string[];
  };
  systemMetrics: {
    initialMemory: NodeJS.MemoryUsage;
    finalMemory: NodeJS.MemoryUsage;
    memoryDelta: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

/**
 * Whiteboard search benchmarking utility
 */
export class WhiteboardSearchBenchmark {
  private searchService: WhiteboardSearchService;
  private performanceService: WhiteboardSearchPerformance;

  constructor(
    private db: DatabasePool,
    private logger: Logger,
    private workspaceId: string = 'benchmark-workspace',
    private userId: string = 'benchmark-user'
  ) {
    this.searchService = new WhiteboardSearchService(db, logger);
    this.performanceService = new WhiteboardSearchPerformance(db, logger);
  }

  /**
   * Run a comprehensive benchmark scenario
   */
  async runScenario(scenarioName: string): Promise<ComprehensiveBenchmarkResults> {
    const scenario = BENCHMARK_SCENARIOS.find(s => s.name === scenarioName);
    if (!scenario) {
      throw new Error(`Benchmark scenario '${scenarioName}' not found`);
    }

    this.logger.info(`Starting benchmark scenario: ${scenario.name}`, scenario.description);
    
    const startTime = new Date();
    const initialMemory = process.memoryUsage();
    const cpuUsageStart = process.cpuUsage();
    
    // Clear caches before benchmark
    this.performanceService.clearCaches();
    
    try {
      // Run individual query benchmarks
      const queryResults = new Map<string, BenchmarkResults>();
      
      for (const query of scenario.queries) {
        const queryName = this.generateQueryName(query);
        this.logger.info(`Benchmarking query: ${queryName}`);
        
        const queryBenchmark = await this.benchmarkSingleQuery(query, scenario.config);
        queryResults.set(queryName, queryBenchmark);
        
        // Small delay between query types to avoid resource exhaustion
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Run overall mixed query benchmark
      const overallResults = await this.benchmarkMixedQueries(scenario.queries, scenario.config);
      
      const endTime = new Date();
      const finalMemory = process.memoryUsage();
      const cpuUsage = process.cpuUsage(cpuUsageStart);
      
      // Gather performance statistics
      const performanceStats = this.performanceService.getPerformanceStats();
      const cacheStats = this.performanceService.getCacheStats();
      const recommendations = await this.performanceService.optimizeQueries();
      
      const results: ComprehensiveBenchmarkResults = {
        scenarioName: scenario.name,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: endTime.getTime() - startTime.getTime(),
        overallResults,
        queryResults,
        performanceStats,
        cacheStats,
        recommendations,
        systemMetrics: {
          initialMemory,
          finalMemory,
          memoryDelta: {
            rss: finalMemory.rss - initialMemory.rss,
            heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
            heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            external: finalMemory.external - initialMemory.external,
            arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers,
          },
          cpuUsage,
        },
      };
      
      this.logger.info(`Benchmark scenario completed: ${scenario.name}`, {
        duration: results.duration,
        successRate: overallResults.successfulRequests / overallResults.totalRequests,
        avgResponseTime: overallResults.averageResponseTime,
        requestsPerSecond: overallResults.requestsPerSecond,
      });
      
      return results;
      
    } catch (error) {
      this.logger.error(`Benchmark scenario failed: ${scenario.name}`, { error });
      throw error;
    }
  }

  /**
   * Benchmark a single query type
   */
  private async benchmarkSingleQuery(
    query: AdvancedSearchQuery,
    config: BenchmarkConfig
  ): Promise<BenchmarkResults> {
    const searchFunction = async () => {
      return this.searchService.advancedSearch(
        this.workspaceId,
        this.userId,
        query,
        { field: 'relevance', direction: 'desc' },
        20,
        0
      );
    };

    return this.performanceService.runSearchBenchmark(searchFunction, config);
  }

  /**
   * Benchmark mixed queries to simulate realistic usage
   */
  private async benchmarkMixedQueries(
    queries: AdvancedSearchQuery[],
    config: BenchmarkConfig
  ): Promise<BenchmarkResults> {
    let queryIndex = 0;
    
    const searchFunction = async () => {
      // Rotate through queries to simulate mixed usage
      const query = queries[queryIndex % queries.length];
      queryIndex++;
      
      return this.searchService.advancedSearch(
        this.workspaceId,
        this.userId,
        query,
        { field: 'relevance', direction: 'desc' },
        20,
        0
      );
    };

    return this.performanceService.runSearchBenchmark(searchFunction, config);
  }

  /**
   * Generate a descriptive name for a query
   */
  private generateQueryName(query: AdvancedSearchQuery): string {
    let name = `${query.syntaxType || 'natural'}_${query.query.substring(0, 20).replace(/\s+/g, '_')}`;
    
    if (query.searchFields?.length) {
      name += `_fields_${query.searchFields.length}`;
    }
    if (query.includeHighlights) name += '_highlights';
    if (query.fuzzyMatch) name += '_fuzzy';
    if (query.dateRange) name += '_dated';
    
    return name.toLowerCase();
  }

  /**
   * Run all benchmark scenarios sequentially
   */
  async runAllScenarios(): Promise<Map<string, ComprehensiveBenchmarkResults>> {
    const results = new Map<string, ComprehensiveBenchmarkResults>();
    
    for (const scenario of BENCHMARK_SCENARIOS) {
      try {
        const result = await this.runScenario(scenario.name);
        results.set(scenario.name, result);
        
        // Recovery time between scenarios
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
        
      } catch (error) {
        this.logger.error(`Failed to run scenario: ${scenario.name}`, { error });
      }
    }
    
    return results;
  }

  /**
   * Generate benchmark report
   */
  generateReport(results: ComprehensiveBenchmarkResults): string {
    const report = `
# Whiteboard Search Benchmark Report

**Scenario:** ${results.scenarioName}
**Duration:** ${Math.round(results.duration / 1000)} seconds
**Started:** ${new Date(results.startTime).toLocaleString()}
**Completed:** ${new Date(results.endTime).toLocaleString()}

## Overall Performance

- **Total Requests:** ${results.overallResults.totalRequests}
- **Successful Requests:** ${results.overallResults.successfulRequests}
- **Failed Requests:** ${results.overallResults.failedRequests}
- **Success Rate:** ${Math.round((results.overallResults.successfulRequests / results.overallResults.totalRequests) * 100)}%
- **Error Rate:** ${Math.round(results.overallResults.errorRate * 100)}%

## Response Times

- **Average:** ${Math.round(results.overallResults.averageResponseTime)}ms
- **Minimum:** ${Math.round(results.overallResults.minResponseTime)}ms
- **Maximum:** ${Math.round(results.overallResults.maxResponseTime)}ms
- **95th Percentile:** ${Math.round(results.overallResults.p95ResponseTime)}ms
- **99th Percentile:** ${Math.round(results.overallResults.p99ResponseTime)}ms

## Throughput

- **Requests per Second:** ${Math.round(results.overallResults.requestsPerSecond)}
- **Cache Hit Rate:** ${Math.round(results.overallResults.cacheHitRate * 100)}%

## Query Performance Breakdown

${Array.from(results.queryResults.entries()).map(([queryName, queryResult]) => `
### ${queryName}
- Avg Response: ${Math.round(queryResult.averageResponseTime)}ms
- Success Rate: ${Math.round((queryResult.successfulRequests / queryResult.totalRequests) * 100)}%
- RPS: ${Math.round(queryResult.requestsPerSecond)}
`).join('')}

## System Resource Usage

- **Memory Delta:** ${Math.round(results.systemMetrics.memoryDelta.heapUsed / 1024 / 1024)} MB
- **Peak Memory:** ${Math.round(results.systemMetrics.finalMemory.heapUsed / 1024 / 1024)} MB
- **CPU User Time:** ${Math.round(results.systemMetrics.cpuUsage?.user || 0 / 1000)}ms
- **CPU System Time:** ${Math.round(results.systemMetrics.cpuUsage?.system || 0 / 1000)}ms

## Cache Statistics

- **Search Cache Size:** ${results.cacheStats.searchCache.size}/${results.cacheStats.searchCache.maxSize}
- **Search Cache Hit Rate:** ${Math.round(results.cacheStats.searchCache.hitRate * 100)}%
- **Suggestion Cache Size:** ${results.cacheStats.suggestionCache.size}/${results.cacheStats.suggestionCache.maxSize}

## Performance Analysis

- **Total Historical Requests:** ${results.performanceStats.totalRequests}
- **Average Response Time:** ${results.performanceStats.averageResponseTime}ms
- **Slow Queries:** ${results.performanceStats.slowQueries}
- **Query Complexity Distribution:**
  - Low: ${results.performanceStats.complexityDistribution.low}
  - Medium: ${results.performanceStats.complexityDistribution.medium}
  - High: ${results.performanceStats.complexityDistribution.high}

## Recommendations

### Database Optimizations
${results.recommendations.recommendedIndexes.map(index => `- ${index}`).join('\n')}

### Query Optimizations
${results.recommendations.queryOptimizations.map(opt => `- ${opt}`).join('\n')}

### Performance Improvements
${results.recommendations.performanceImprovements.map(imp => `- ${imp}`).join('\n')}

## Conclusion

${this.generateConclusion(results)}
`;

    return report;
  }

  /**
   * Generate benchmark conclusion based on results
   */
  private generateConclusion(results: ComprehensiveBenchmarkResults): string {
    const successRate = results.overallResults.successfulRequests / results.overallResults.totalRequests;
    const avgResponseTime = results.overallResults.averageResponseTime;
    const rps = results.overallResults.requestsPerSecond;
    
    let conclusion = '';
    
    if (successRate >= 0.99 && avgResponseTime < 200 && rps > 50) {
      conclusion = '✅ **Excellent Performance** - The search system meets all performance targets with high throughput and low latency.';
    } else if (successRate >= 0.95 && avgResponseTime < 500 && rps > 20) {
      conclusion = '✅ **Good Performance** - The search system performs well within acceptable limits.';
    } else if (successRate >= 0.90 && avgResponseTime < 1000 && rps > 10) {
      conclusion = '⚠️ **Acceptable Performance** - Performance is acceptable but could be improved with optimizations.';
    } else {
      conclusion = '❌ **Performance Issues Detected** - The search system requires optimization to meet performance targets.';
    }
    
    if (results.overallResults.cacheHitRate < 0.3) {
      conclusion += ' Consider improving cache hit rates through better caching strategies.';
    }
    
    if (results.performanceStats.slowQueries > results.performanceStats.totalRequests * 0.1) {
      conclusion += ' High number of slow queries detected - database optimization recommended.';
    }
    
    return conclusion;
  }

  /**
   * Export benchmark results to file
   */
  async exportResults(results: ComprehensiveBenchmarkResults, format: 'json' | 'csv' | 'markdown' = 'json'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `search-benchmark-${results.scenarioName}-${timestamp}`;
    
    switch (format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'markdown':
        return this.generateReport(results);
      case 'csv':
        return this.generateCSV(results);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate CSV export of benchmark results
   */
  private generateCSV(results: ComprehensiveBenchmarkResults): string {
    const rows = [
      'Query,Total_Requests,Successful_Requests,Failed_Requests,Avg_Response_Time,Min_Response_Time,Max_Response_Time,P95_Response_Time,P99_Response_Time,Requests_Per_Second,Error_Rate,Cache_Hit_Rate'
    ];
    
    // Add overall results
    rows.push([
      'Overall',
      results.overallResults.totalRequests,
      results.overallResults.successfulRequests,
      results.overallResults.failedRequests,
      Math.round(results.overallResults.averageResponseTime),
      Math.round(results.overallResults.minResponseTime),
      Math.round(results.overallResults.maxResponseTime),
      Math.round(results.overallResults.p95ResponseTime),
      Math.round(results.overallResults.p99ResponseTime),
      Math.round(results.overallResults.requestsPerSecond),
      Math.round(results.overallResults.errorRate * 100),
      Math.round(results.overallResults.cacheHitRate * 100),
    ].join(','));
    
    // Add individual query results
    for (const [queryName, queryResult] of results.queryResults.entries()) {
      rows.push([
        queryName,
        queryResult.totalRequests,
        queryResult.successfulRequests,
        queryResult.failedRequests,
        Math.round(queryResult.averageResponseTime),
        Math.round(queryResult.minResponseTime),
        Math.round(queryResult.maxResponseTime),
        Math.round(queryResult.p95ResponseTime),
        Math.round(queryResult.p99ResponseTime),
        Math.round(queryResult.requestsPerSecond),
        Math.round(queryResult.errorRate * 100),
        Math.round(queryResult.cacheHitRate * 100),
      ].join(','));
    }
    
    return rows.join('\n');
  }
}