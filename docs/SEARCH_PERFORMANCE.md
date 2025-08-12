# Search Performance Optimization

This document describes the comprehensive search performance optimization system implemented for the Whiteboard Search functionality in WB-009.

## Overview

The search performance optimization system provides:
- **Intelligent Caching**: LRU cache with TTL and stale-while-revalidate strategies
- **Performance Monitoring**: Real-time metrics collection and analysis
- **Query Optimization**: Automatic complexity analysis and optimization recommendations
- **Load Testing**: Comprehensive benchmarking tools for performance validation
- **Memory Management**: Efficient memory usage and garbage collection

## Architecture

### Components

1. **WhiteboardSearchPerformance**: Core optimization service
2. **WhiteboardSearchBenchmark**: Benchmarking and load testing utilities
3. **Performance CLI**: Command-line tool for running benchmarks
4. **Integration**: Seamless integration with existing search service

### Cache Strategy

The system implements a two-tiered caching approach:

```typescript
// Search results cache (5 minutes TTL)
searchCache: LRUCache<string, CachedSearchResult>

// Search suggestions cache (10 minutes TTL)  
suggestionCache: LRUCache<string, CachedSuggestions>
```

#### Cache Features
- **LRU Eviction**: Least recently used items are evicted first
- **TTL Support**: Automatic expiration of stale entries
- **Stale While Revalidate**: Serves stale content while fetching fresh data
- **Cache Key Generation**: Deterministic keys based on query parameters

### Performance Metrics

The system collects comprehensive metrics for each search operation:

```typescript
interface SearchMetrics {
  executionTime: number;        // Total execution time
  cacheHit: boolean;           // Whether result came from cache
  queryComplexity: number;     // Calculated complexity score
  resultCount: number;         // Number of results returned
  dbQueryTime?: number;        // Database query time
  processingTime?: number;     // Result processing time
}
```

### Query Complexity Analysis

Queries are automatically analyzed for complexity using multiple factors:

- **Base Complexity**: Query length and syntax type
- **Field Complexity**: Number of search fields
- **Filter Complexity**: Date ranges, user filters, tag filters
- **Feature Complexity**: Highlights, previews, fuzzy matching

Complexity scores are used for:
- Performance monitoring
- Optimization recommendations
- Resource allocation decisions

## Usage

### Basic Integration

The performance optimization is automatically integrated into the search service:

```typescript
const searchService = new WhiteboardSearchService(db, logger);

// Performance optimization is enabled by default
const results = await searchService.advancedSearch(
  workspaceId,
  userId,
  query,
  sort,
  limit,
  offset
);
```

### Performance Statistics

Get real-time performance statistics:

```typescript
const stats = searchService.getPerformanceStats();
console.log({
  totalRequests: stats.totalRequests,
  averageResponseTime: stats.averageResponseTime,
  cacheHitRate: stats.cacheHitRate,
  slowQueries: stats.slowQueries
});
```

### Cache Management

Monitor and manage caches:

```typescript
// Get cache statistics
const cacheStats = searchService.getCacheStats();

// Clear all caches
searchService.clearCaches();

// Get optimization recommendations
const recommendations = await searchService.getOptimizationRecommendations();
```

## Benchmarking

### CLI Tool

Run performance benchmarks using the CLI tool:

```bash
# Light load testing
npm run benchmark:search:light

# Moderate load testing  
npm run benchmark:search:moderate

# Heavy load testing
npm run benchmark:search:heavy

# Run all scenarios and export results
npm run benchmark:search:all

# Custom scenario with export
npm run benchmark:search -- --scenario stress_test --export json --output results.json
```

### Benchmark Scenarios

The system includes predefined benchmark scenarios:

| Scenario | Users | Requests/User | Duration | Description |
|----------|-------|---------------|----------|-------------|
| light_load | 5 | 10 | 60s | Light load with simple queries |
| moderate_load | 25 | 20 | 120s | Mixed complexity queries |
| heavy_load | 100 | 50 | 300s | Peak usage simulation |
| stress_test | 200 | 100 | 600s | System limit testing |

### Custom Benchmarks

Create custom benchmarks programmatically:

```typescript
import { WhiteboardSearchBenchmark } from '@mcp-tools/core';

const benchmark = new WhiteboardSearchBenchmark(db, logger);

const customConfig = {
  concurrentUsers: 50,
  requestsPerUser: 25,
  rampUpTime: 30,
  testDuration: 180
};

const results = await benchmark.runScenario('moderate_load');
const report = benchmark.generateReport(results);
```

## Performance Targets

The system is designed to meet these performance targets:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Average Response Time | < 200ms | 95th percentile |
| Search Throughput | > 100 RPS | Concurrent requests |
| Cache Hit Rate | > 70% | Regular usage patterns |
| Error Rate | < 1% | Under normal load |
| Memory Usage | < 512MB | Peak usage |

## Optimization Recommendations

The system automatically generates optimization recommendations:

### Database Optimizations
- Recommended indexes for slow queries
- Compound index suggestions
- Query rewriting recommendations

### Cache Optimizations  
- Cache size adjustments
- TTL optimization
- Cache key strategy improvements

### Application Optimizations
- Query complexity reduction
- Result pagination strategies
- Pre-computation opportunities

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Response Time Percentiles**
   - p50, p95, p99 response times
   - Monitor for degradation trends

2. **Cache Performance**
   - Cache hit/miss rates
   - Cache size and eviction rates

3. **Query Complexity Distribution**
   - Track high-complexity queries
   - Identify optimization opportunities

4. **Error Rates**
   - Search failures and timeouts
   - Database connection issues

### Alerting Thresholds

```typescript
// Example monitoring configuration
const alertThresholds = {
  averageResponseTime: 500,    // Alert if > 500ms
  p95ResponseTime: 1000,       // Alert if p95 > 1s
  cacheHitRate: 0.5,          // Alert if < 50%
  errorRate: 0.05,            // Alert if > 5%
  slowQueryRate: 0.1          // Alert if > 10% slow queries
};
```

## Advanced Features

### Query Pre-computation

For frequently executed complex queries, consider pre-computation:

```typescript
// Identify candidates for pre-computation
const recommendations = await searchService.getOptimizationRecommendations();
const precomputeCandidates = recommendations.performanceImprovements
  .filter(imp => imp.includes('pre-computation'));
```

### Adaptive Caching

The system adapts cache settings based on usage patterns:

- **Hot Queries**: Longer TTL for frequently accessed queries
- **Complex Queries**: Higher cache priority for expensive operations  
- **Memory Pressure**: Automatic cache size adjustment

### Load Balancing

For high-load scenarios, consider:

- **Query Distribution**: Route queries based on complexity
- **Cache Warming**: Pre-populate caches with common queries
- **Circuit Breakers**: Fail-fast for overloaded resources

## Troubleshooting

### Common Performance Issues

1. **High Response Times**
   - Check database query performance
   - Verify index usage
   - Monitor memory usage

2. **Low Cache Hit Rates**
   - Analyze query patterns
   - Adjust cache TTL settings
   - Review cache key generation

3. **Memory Leaks**
   - Monitor metrics history size
   - Check cache size limits
   - Review object retention

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
const searchService = new WhiteboardSearchService(
  db, 
  new Logger('SearchService', 'debug')
);
```

### Performance Profiling

Use built-in profiling tools:

```typescript
// Run performance profiling
const profiler = searchService.getPerformanceService();
const metrics = profiler.getPerformanceStats();

console.log('Performance Profile:', {
  slowQueries: metrics.slowQueries,
  complexityDistribution: metrics.complexityDistribution,
  cacheEffectiveness: metrics.cacheHitRate
});
```

## Best Practices

### Query Optimization

1. **Use Specific Fields**: Limit search to relevant fields
2. **Avoid Regex**: Use natural or boolean syntax when possible
3. **Implement Pagination**: Use reasonable limit sizes
4. **Cache Frequently Used Queries**: Leverage automatic caching

### Performance Testing

1. **Regular Benchmarking**: Run benchmarks after changes
2. **Realistic Data**: Test with production-like data volumes
3. **Load Testing**: Test concurrent user scenarios
4. **Monitor Trends**: Track performance over time

### Cache Strategy

1. **Appropriate TTL**: Balance freshness with performance
2. **Cache Key Design**: Ensure deterministic key generation
3. **Memory Limits**: Set appropriate cache size limits
4. **Invalidation Strategy**: Clear caches when data changes

## Integration with Monitoring Systems

### Metrics Export

Export metrics to monitoring systems:

```typescript
// Export metrics in Prometheus format
const promMetrics = searchService.getPerformanceStats();

// Export to application monitoring
const metricsPayload = {
  timestamp: Date.now(),
  service: 'whiteboard-search',
  metrics: promMetrics
};
```

### Health Checks

Implement health checks for search performance:

```typescript
// Health check endpoint
async function searchHealthCheck() {
  const stats = searchService.getPerformanceStats();
  
  return {
    healthy: stats.averageResponseTime < 500,
    responseTime: stats.averageResponseTime,
    cacheHitRate: stats.cacheHitRate,
    lastUpdated: new Date().toISOString()
  };
}
```

This comprehensive performance optimization system ensures that the whiteboard search functionality can handle high loads while maintaining sub-200ms response times and providing valuable insights for continuous optimization.