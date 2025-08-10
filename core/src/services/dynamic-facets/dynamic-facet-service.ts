/**
 * Dynamic Facet Service
 * 
 * Main service for dynamic facet generation, management, and application.
 * Orchestrates facet discovery, filtering, and statistical analysis.
 */

import {
  type SearchResult,
  type FacetCollection,
  type FacetDefinition,
  type FacetFilter,
  type FacetValue,
  type DiscoveredFacet,
  type RangeFacet,
  type HierarchicalFacet,
  type FacetStatistics,
  type FacetPerformanceMetrics,
  type GenerateFacetsRequest,
  type ApplyFiltersRequest,
  type FacetOperationResult,
  DynamicFacetSchemas
} from '@shared/types';

import { FacetDiscoveryEngine, type FacetDiscoveryOptions } from './facet-discovery-engine.js';
import { FacetFilterEngine } from './facet-filter-engine.js';
import { FacetStatisticsService } from './facet-statistics-service.js';
import { FacetCacheManager } from './facet-cache-manager.js';

export interface DynamicFacetServiceOptions {
  /** Database connection or service */
  database?: any;
  /** Cache configuration */
  cacheEnabled?: boolean;
  /** Performance tracking enabled */
  performanceTracking?: boolean;
  /** Maximum processing time in milliseconds */
  maxProcessingTime?: number;
}

export interface FacetCounts {
  [facetId: string]: {
    [valueKey: string]: number;
  };
}

export class DynamicFacetService {
  private readonly discoveryEngine: FacetDiscoveryEngine;
  private readonly filterEngine: FacetFilterEngine;
  private readonly statisticsService: FacetStatisticsService;
  private readonly cacheManager: FacetCacheManager;
  
  private readonly options: Required<DynamicFacetServiceOptions>;

  constructor(options: DynamicFacetServiceOptions = {}) {
    this.options = {
      database: null,
      cacheEnabled: true,
      performanceTracking: true,
      maxProcessingTime: 5000,
      ...options
    };

    this.discoveryEngine = new FacetDiscoveryEngine();
    this.filterEngine = new FacetFilterEngine();
    this.statisticsService = new FacetStatisticsService(options.database);
    this.cacheManager = new FacetCacheManager({
      enabled: this.options.cacheEnabled
    });
  }

  /**
   * Generate dynamic facets from search results
   */
  async generateFacets(
    results: SearchResult[], 
    query: string,
    options: FacetDiscoveryOptions = {}
  ): Promise<FacetCollection> {
    const startTime = Date.now();
    const operation = 'generateFacets';
    
    try {
      // Check cache first
      const cacheKey = this.cacheManager.generateCacheKey('facets', {
        query,
        resultHash: this.hashResults(results),
        options
      });

      if (this.options.cacheEnabled) {
        const cached = await this.cacheManager.get<FacetCollection>(cacheKey);
        if (cached) {
          await this.recordPerformance(operation, Date.now() - startTime, results.length, true);
          return cached;
        }
      }

      // Discover potential facets
      const discoveredFacets = await this.discoveryEngine.discoverFacets(results, options);
      
      // Convert discovered facets to facet definitions
      const facetDefinitions = await this.convertDiscoveredFacets(discoveredFacets);
      
      // Build facet values and statistics
      const facetsWithValues = await this.buildFacetValues(facetDefinitions, results);
      
      // Generate performance metrics
      const performance = await this.generatePerformanceMetrics(startTime, results.length, false);
      
      // Create facet collection
      const facetCollection: FacetCollection = {
        facets: facetsWithValues,
        totalResults: results.length,
        appliedFilters: [],
        availableFilters: await this.generateAvailableFilters(facetsWithValues, results),
        performance,
        generatedAt: new Date().toISOString(),
        cacheInfo: this.options.cacheEnabled ? {
          fromCache: false,
          cacheKey,
          expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
        } : undefined
      };

      // Cache the result
      if (this.options.cacheEnabled) {
        await this.cacheManager.set(cacheKey, facetCollection, 3600); // 1 hour TTL
      }

      await this.recordPerformance(operation, Date.now() - startTime, results.length, false);
      return facetCollection;

    } catch (error) {
      await this.recordError(operation, error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Discover facets from search results without full generation
   */
  async discoverFacets(results: SearchResult[], options: FacetDiscoveryOptions = {}): Promise<DiscoveredFacet[]> {
    const startTime = Date.now();
    
    try {
      const discovered = await this.discoveryEngine.discoverFacets(results, options);
      await this.recordPerformance('discoverFacets', Date.now() - startTime, results.length, false);
      return discovered;
    } catch (error) {
      await this.recordError('discoverFacets', error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Build hierarchical facets from results
   */
  async buildHierarchicalFacets(results: SearchResult[]): Promise<HierarchicalFacet[]> {
    const startTime = Date.now();
    
    try {
      // Discover hierarchical facet candidates
      const discoveredFacets = await this.discoveryEngine.discoverFacets(results, {
        includeHierarchical: true,
        includeDates: false,
        includeRanges: false
      });

      const hierarchicalFacets: HierarchicalFacet[] = [];
      
      for (const discovered of discoveredFacets) {
        if (discovered.facetType === 'hierarchical') {
          const hierarchical = await this.buildSingleHierarchicalFacet(discovered, results);
          if (hierarchical) {
            hierarchicalFacets.push(hierarchical);
          }
        }
      }

      await this.recordPerformance('buildHierarchicalFacets', Date.now() - startTime, results.length, false);
      return hierarchicalFacets;
    } catch (error) {
      await this.recordError('buildHierarchicalFacets', error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Apply facet filters to search results
   */
  async applyFacetFilters(results: SearchResult[], filters: FacetFilter[]): Promise<SearchResult[]> {
    const startTime = Date.now();
    
    try {
      const filtered = await this.filterEngine.applyFilters(results, filters);
      await this.recordPerformance('applyFacetFilters', Date.now() - startTime, results.length, false);
      return filtered;
    } catch (error) {
      await this.recordError('applyFacetFilters', error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Calculate facet counts for given results and facets
   */
  async calculateFacetCounts(results: SearchResult[], facets: FacetDefinition[]): Promise<FacetCounts> {
    const startTime = Date.now();
    
    try {
      const counts: FacetCounts = {};
      
      for (const facet of facets) {
        counts[facet.id] = {};
        
        for (const result of results) {
          const fieldValue = this.extractFieldValue(result, facet.sourceField);
          if (fieldValue != null) {
            const valueKey = this.normalizeValueKey(fieldValue);
            counts[facet.id][valueKey] = (counts[facet.id][valueKey] || 0) + 1;
          }
        }
      }

      await this.recordPerformance('calculateFacetCounts', Date.now() - startTime, results.length, false);
      return counts;
    } catch (error) {
      await this.recordError('calculateFacetCounts', error as Error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Refresh facet statistics
   */
  async refreshFacetStatistics(facetId: string): Promise<FacetStatistics> {
    return this.statisticsService.refreshStatistics(facetId);
  }

  /**
   * Generate range facets for numeric fields
   */
  async generateRangeFacets(field: string, results: SearchResult[]): Promise<RangeFacet | null> {
    const values = results
      .map(result => this.extractFieldValue(result, field))
      .filter(value => value != null && typeof value === 'number') as number[];

    if (values.length === 0) {
      return null;
    }

    const ranges = await this.calculateOptimalRanges(values);
    
    // Create range facet definition
    const facetDefinition: FacetDefinition = {
      id: crypto.randomUUID(),
      facetName: field.replace(/\./g, '_'),
      facetType: 'range',
      dataType: 'number',
      sourceField: field,
      displayName: this.formatDisplayName(field),
      isActive: true,
      sortOrder: 0,
      configuration: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return {
      ...facetDefinition,
      ranges,
      distribution: this.calculateNumberDistribution(values),
      optimalBuckets: ranges.length
    };
  }

  /**
   * Calculate optimal ranges for numeric values using quantile-based bucketing
   */
  async calculateOptimalRanges(values: number[], maxBuckets: number = 10): Promise<Array<{
    label: string;
    min: number;
    max: number;
    count: number;
    selected: boolean;
    percentage?: number;
  }>> {
    if (values.length === 0) {
      return [];
    }

    const sortedValues = [...values].sort((a, b) => a - b);
    const min = sortedValues[0];
    const max = sortedValues[sortedValues.length - 1];
    
    // Use quantile-based bucketing for better distribution
    const ranges = [];
    const bucketSize = Math.ceil(sortedValues.length / maxBuckets);
    
    for (let i = 0; i < maxBuckets; i++) {
      const startIdx = i * bucketSize;
      const endIdx = Math.min((i + 1) * bucketSize - 1, sortedValues.length - 1);
      
      if (startIdx <= endIdx) {
        const rangeMin = i === 0 ? min : sortedValues[startIdx];
        const rangeMax = i === maxBuckets - 1 ? max : sortedValues[endIdx];
        const count = endIdx - startIdx + 1;
        const percentage = (count / sortedValues.length) * 100;
        
        // Format range label with appropriate precision
        const minLabel = rangeMin % 1 === 0 ? rangeMin.toString() : rangeMin.toFixed(2);
        const maxLabel = rangeMax % 1 === 0 ? rangeMax.toString() : rangeMax.toFixed(2);
        
        ranges.push({
          label: rangeMin === rangeMax ? minLabel : `${minLabel} - ${maxLabel}`,
          min: rangeMin,
          max: rangeMax,
          count,
          percentage,
          selected: false
        });
      }
    }
    
    // Filter out empty buckets and merge small adjacent buckets if needed
    return this.optimizeBuckets(ranges, sortedValues.length);
  }

  /**
   * Optimize bucket distribution by merging small adjacent buckets
   */
  private optimizeBuckets(ranges: Array<{
    label: string;
    min: number;
    max: number;
    count: number;
    percentage?: number;
    selected: boolean;
  }>, totalCount: number): Array<{
    label: string;
    min: number;
    max: number;
    count: number;
    selected: boolean;
  }> {
    const minBucketPercentage = 2; // Minimum 2% per bucket
    const optimized = [];
    let currentBucket: typeof ranges[0] | null = null;

    for (const bucket of ranges) {
      if (bucket.count === 0) {
        continue; // Skip empty buckets
      }

      if (currentBucket && (bucket.percentage || 0) < minBucketPercentage && 
          (currentBucket.percentage || 0) < minBucketPercentage * 2) {
        // Merge with previous small bucket
        const mergedCount = currentBucket.count + bucket.count;
        const minLabel = currentBucket.min % 1 === 0 ? currentBucket.min.toString() : currentBucket.min.toFixed(2);
        const maxLabel = bucket.max % 1 === 0 ? bucket.max.toString() : bucket.max.toFixed(2);
        
        currentBucket = {
          label: `${minLabel} - ${maxLabel}`,
          min: currentBucket.min,
          max: bucket.max,
          count: mergedCount,
          selected: false
        };
      } else {
        if (currentBucket) {
          optimized.push(currentBucket);
        }
        currentBucket = {
          label: bucket.label,
          min: bucket.min,
          max: bucket.max,
          count: bucket.count,
          selected: bucket.selected
        };
      }
    }

    if (currentBucket) {
      optimized.push(currentBucket);
    }

    return optimized;
  }

  /**
   * Precompute facets for better performance
   */
  async precomputeFacets(facetId: string): Promise<void> {
    // Implementation would depend on specific caching strategy
    await this.cacheManager.precomputeFacetData(facetId);
  }

  /**
   * Cache facet data
   */
  async cacheFacetData(facetId: string, data: any): Promise<void> {
    const cacheKey = `facet_data:${facetId}`;
    await this.cacheManager.set(cacheKey, data);
  }

  // Private helper methods

  private async convertDiscoveredFacets(discovered: DiscoveredFacet[]): Promise<FacetDefinition[]> {
    return discovered.map(d => ({
      id: crypto.randomUUID(),
      facetName: d.facetName,
      facetType: d.facetType,
      dataType: d.dataType,
      sourceField: d.sourceField,
      displayName: d.displayName,
      description: `Auto-discovered facet with ${d.uniqueValueCount} unique values`,
      isActive: true,
      sortOrder: 0,
      configuration: {
        qualityScore: d.qualityScore,
        usefulnessScore: d.usefulnessScore,
        cardinality: d.cardinality,
        coverage: d.coverage
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  private async buildFacetValues(facets: FacetDefinition[], results: SearchResult[]): Promise<FacetDefinition[]> {
    // For now, return facets as-is. In a full implementation,
    // this would fetch or generate facet values from the database
    return facets;
  }

  private async generateAvailableFilters(facets: FacetDefinition[], results: SearchResult[]) {
    return facets.map(facet => ({
      facetId: facet.id,
      availableValues: [], // Would be populated with actual values
      canFilter: true,
      estimatedResults: results.length
    }));
  }

  private async buildSingleHierarchicalFacet(
    discovered: DiscoveredFacet, 
    results: SearchResult[]
  ): Promise<HierarchicalFacet | null> {
    // Extract hierarchical values and build tree structure
    const hierarchyMap = new Map<string, Set<string>>();
    
    for (const result of results) {
      const value = this.extractFieldValue(result, discovered.sourceField);
      if (value && typeof value === 'string') {
        const parts = this.parseHierarchicalValue(value);
        if (parts.length > 1) {
          for (let i = 0; i < parts.length - 1; i++) {
            const parent = parts.slice(0, i + 1).join('/');
            const child = parts.slice(0, i + 2).join('/');
            
            if (!hierarchyMap.has(parent)) {
              hierarchyMap.set(parent, new Set());
            }
            hierarchyMap.get(parent)!.add(child);
          }
        }
      }
    }

    if (hierarchyMap.size === 0) {
      return null;
    }

    // Build facet definition
    const facetDefinition: FacetDefinition = {
      id: crypto.randomUUID(),
      facetName: discovered.facetName,
      facetType: 'hierarchical',
      dataType: discovered.dataType,
      sourceField: discovered.sourceField,
      displayName: discovered.displayName,
      isActive: true,
      sortOrder: 0,
      configuration: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return {
      ...facetDefinition,
      levels: [], // Would build actual level structure
      maxDepth: Math.max(...Array.from(hierarchyMap.keys()).map(k => k.split('/').length)),
      expansion: {
        expandedValues: [],
        defaultLevel: 0,
        showAllLevels: false
      }
    };
  }

  private parseHierarchicalValue(value: string): string[] {
    // Parse hierarchical values like "category/subcategory/item"
    const separators = ['/', '\\', '::', '.'];
    
    for (const sep of separators) {
      if (value.includes(sep)) {
        return value.split(sep).map(part => part.trim()).filter(part => part.length > 0);
      }
    }
    
    return [value];
  }

  private extractFieldValue(result: SearchResult, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value: any = result;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  }

  private normalizeValueKey(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  private formatDisplayName(field: string): string {
    return field
      .split('.')
      .pop()!
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private calculateNumberDistribution(values: number[]) {
    if (values.length === 0) {
      return {
        min: 0, max: 0, mean: 0, median: 0, 
        standardDeviation: 0, q25: 0, q75: 0
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    const q25 = sorted[Math.floor(sorted.length * 0.25)];
    const q75 = sorted[Math.floor(sorted.length * 0.75)];

    return { min, max, mean, median, standardDeviation, q25, q75 };
  }

  private hashResults(results: SearchResult[]): string {
    // Simple hash of result IDs for cache key generation
    const ids = results.map(r => r.id).sort().join(',');
    return btoa(ids).slice(0, 32);
  }

  private async generatePerformanceMetrics(
    startTime: number, 
    itemCount: number, 
    cacheHit: boolean
  ): Promise<FacetPerformanceMetrics> {
    const processingTime = Date.now() - startTime;
    
    return {
      avgProcessingTime: processingTime,
      p95ProcessingTime: processingTime, // Would be calculated from historical data
      cacheHitRate: cacheHit ? 1.0 : 0.0,
      totalOperations: 1,
      errorRate: 0.0,
      memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024
    };
  }

  private async recordPerformance(
    operation: string, 
    processingTime: number, 
    dataSize: number, 
    cacheHit: boolean
  ): Promise<void> {
    if (!this.options.performanceTracking) {
      return;
    }

    // In a full implementation, this would save to database
    console.debug(`Facet operation: ${operation}, time: ${processingTime}ms, size: ${dataSize}, cache: ${cacheHit}`);
  }

  private async recordError(operation: string, error: Error, processingTime: number): Promise<void> {
    if (!this.options.performanceTracking) {
      return;
    }

    // In a full implementation, this would save to database
    console.error(`Facet operation error: ${operation}, time: ${processingTime}ms, error: ${error.message}`);
  }
}