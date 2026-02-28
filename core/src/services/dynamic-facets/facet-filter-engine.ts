/**
 * Facet Filter Engine
 * 
 * Handles application of multi-facet filters with AND/OR logic,
 * hierarchical filter inheritance, and performance optimization.
 */

import {
  type SearchResult,
  type FacetFilter,
  type FacetFilterLogic,
  DynamicFacetSchemas
} from '@shared/types';
import type { Kysely } from 'kysely';

export interface FilterEngineOptions {
  /** Maximum number of concurrent filter operations */
  maxConcurrency?: number;
  /** Enable filter optimization */
  enableOptimization?: boolean;
  /** Cache filter results */
  enableCaching?: boolean;
  /** Database connection for facet field lookup */
  db?: Kysely<any>;
}

export interface FilterStatistics {
  originalCount: number;
  filteredCount: number;
  reductionPercentage: number;
  processingTimeMs: number;
  filtersApplied: number;
}

export class FacetFilterEngine {
  private readonly options: Required<Omit<FilterEngineOptions, 'db'>> & { db?: Kysely<any> };
  private filterCache = new Map<string, SearchResult[]>();
  private db?: Kysely<any>;

  constructor(options: FilterEngineOptions = {}) {
    this.options = {
      maxConcurrency: 5,
      enableOptimization: true,
      enableCaching: true,
      ...options
    };
    this.db = options.db;
  }

  /**
   * Apply multiple filters to search results with specified logic
   */
  async applyFilters(
    results: SearchResult[],
    filters: FacetFilter[],
    globalLogic: FacetFilterLogic = 'AND'
  ): Promise<SearchResult[]> {
    const startTime = Date.now();

    if (filters.length === 0) {
      return results;
    }

    // Check cache
    const cacheKey = this.generateCacheKey(results, filters, globalLogic);
    if (this.options.enableCaching && this.filterCache.has(cacheKey)) {
      return this.filterCache.get(cacheKey)!;
    }

    // Optimize filter order if enabled
    const optimizedFilters = this.options.enableOptimization
      ? this.optimizeFilterOrder(filters, results)
      : filters;

    // Apply filters based on global logic
    let filteredResults: SearchResult[];
    
    if (globalLogic === 'AND') {
      filteredResults = await this.applyFiltersWithAnd(results, optimizedFilters);
    } else if (globalLogic === 'OR') {
      filteredResults = await this.applyFiltersWithOr(results, optimizedFilters);
    } else {
      // NOT logic - exclude results that match any filter
      filteredResults = await this.applyFiltersWithNot(results, optimizedFilters);
    }

    // Cache result
    if (this.options.enableCaching) {
      this.filterCache.set(cacheKey, filteredResults);
    }

    return filteredResults;
  }

  /**
   * Apply filters with AND logic (all filters must match)
   */
  private async applyFiltersWithAnd(
    results: SearchResult[],
    filters: FacetFilter[]
  ): Promise<SearchResult[]> {
    let currentResults = results;

    for (const filter of filters) {
      currentResults = await this.applySingleFilter(currentResults, filter);
      
      // Early termination if no results remain
      if (currentResults.length === 0) {
        break;
      }
    }

    return currentResults;
  }

  /**
   * Apply filters with OR logic (at least one filter must match)
   */
  private async applyFiltersWithOr(
    results: SearchResult[],
    filters: FacetFilter[]
  ): Promise<SearchResult[]> {
    const matchingSets = await Promise.all(
      filters.map(filter => this.applySingleFilter(results, filter))
    );

    // Combine all matching results, removing duplicates
    const uniqueResults = new Map<string, SearchResult>();
    
    for (const matchingSet of matchingSets) {
      for (const result of matchingSet) {
        uniqueResults.set(result.id, result);
      }
    }

    return Array.from(uniqueResults.values());
  }

  /**
   * Apply filters with NOT logic (results must NOT match any filter)
   */
  private async applyFiltersWithNot(
    results: SearchResult[],
    filters: FacetFilter[]
  ): Promise<SearchResult[]> {
    const excludedIds = new Set<string>();

    for (const filter of filters) {
      const matchingResults = await this.applySingleFilter(results, filter);
      for (const result of matchingResults) {
        excludedIds.add(result.id);
      }
    }

    return results.filter(result => !excludedIds.has(result.id));
  }

  /**
   * Apply a single filter to results
   */
  private async applySingleFilter(
    results: SearchResult[],
    filter: FacetFilter
  ): Promise<SearchResult[]> {
    const matchingResults: SearchResult[] = [];

    try {
      const sourceField = await this.getSourceFieldForFacet(filter.facetId);
      
      for (const result of results) {
        const fieldValue = this.extractFieldValue(result, sourceField);
        
        if (await this.matchesFilter(fieldValue, filter)) {
          matchingResults.push(result);
        }
      }
    } catch (error) {
      console.error(`Failed to apply filter for facet ${filter.facetId}:`, error);
      // Return original results if filter application fails
      return results;
    }

    return matchingResults;
  }

  /**
   * Check if a field value matches a filter
   */
  private async matchesFilter(fieldValue: any, filter: FacetFilter): Promise<boolean> {
    if (fieldValue == null) {
      return filter.operation === 'not_exists';
    }

    switch (filter.operation) {
      case 'equals':
        return this.matchesEquals(fieldValue, filter.values);
      
      case 'contains':
        return this.matchesContains(fieldValue, filter.values);
      
      case 'range':
        return this.matchesRange(fieldValue, filter.rangeMin, filter.rangeMax);
      
      case 'exists':
        return true; // We already checked for null above
      
      case 'not_exists':
        return false; // We already checked for null above
      
      default:
        return false;
    }
  }

  /**
   * Check if field value equals any of the filter values
   */
  private matchesEquals(fieldValue: any, filterValues: string[]): boolean {
    const normalizedFieldValue = this.normalizeValue(fieldValue);
    const normalizedFilterValues = filterValues.map(v => this.normalizeValue(v));
    
    return normalizedFilterValues.includes(normalizedFieldValue);
  }

  /**
   * Check if field value contains any of the filter values
   */
  private matchesContains(fieldValue: any, filterValues: string[]): boolean {
    const normalizedFieldValue = this.normalizeValue(fieldValue).toLowerCase();
    
    return filterValues.some(filterValue => 
      normalizedFieldValue.includes(this.normalizeValue(filterValue).toLowerCase())
    );
  }

  /**
   * Check if field value falls within range
   */
  private matchesRange(fieldValue: any, rangeMin?: number, rangeMax?: number): boolean {
    const numericValue = this.toNumeric(fieldValue);
    if (numericValue === null) {
      return false;
    }

    if (rangeMin !== undefined && numericValue < rangeMin) {
      return false;
    }

    if (rangeMax !== undefined && numericValue > rangeMax) {
      return false;
    }

    return true;
  }

  /**
   * Optimize filter order for better performance
   */
  private optimizeFilterOrder(filters: FacetFilter[], results: SearchResult[]): FacetFilter[] {
    // Sort filters by estimated selectivity (most selective first)
    return [...filters].sort((a, b) => {
      const selectivityA = this.estimateFilterSelectivity(a, results);
      const selectivityB = this.estimateFilterSelectivity(b, results);
      return selectivityA - selectivityB; // More selective filters first
    });
  }

  /**
   * Estimate filter selectivity (0 = most selective, 1 = least selective)
   */
  private estimateFilterSelectivity(filter: FacetFilter, results: SearchResult[]): number {
    // Simple heuristic based on filter type and value count
    switch (filter.operation) {
      case 'equals':
        // More specific values are more selective
        return Math.min(filter.values.length / 10, 0.9);
      
      case 'contains':
        // Contains operations are generally less selective
        return 0.5;
      
      case 'range':
        // Range selectivity depends on range size (hard to estimate without data)
        return 0.3;
      
      case 'exists':
        // Exists filters are usually not very selective
        return 0.8;
      
      case 'not_exists':
        // Not exists can be highly selective if field is usually present
        return 0.2;
      
      default:
        return 0.5;
    }
  }

  /**
   * Apply hierarchical filter inheritance
   */
  async applyHierarchicalFilter(
    results: SearchResult[],
    filter: FacetFilter,
    includeChildren: boolean = true
  ): Promise<SearchResult[]> {
    if (!includeChildren) {
      return this.applySingleFilter(results, filter);
    }

    // For hierarchical filters, also include child values
    const expandedFilter: FacetFilter = {
      ...filter,
      values: await this.expandHierarchicalValues(filter.values, filter.facetId)
    };

    return this.applySingleFilter(results, expandedFilter);
  }

  /**
   * Expand hierarchical values to include children
   */
  private async expandHierarchicalValues(values: string[], facetId: string): Promise<string[]> {
    const expandedValues = new Set(values);
    
    for (const value of values) {
      try {
        const childValues = await this.getHierarchicalChildren(value, facetId);
        for (const child of childValues) {
          expandedValues.add(child);
        }
      } catch (error) {
        console.error(`Failed to expand hierarchical value ${value} for facet ${facetId}:`, error);
      }
    }

    return Array.from(expandedValues);
  }

  /**
   * Get hierarchical children for a value (stub implementation)
   */
  private async getHierarchicalChildren(parentValue: string, facetId: string): Promise<string[]> {
    if (!this.db) {
      console.warn('Database not available for hierarchical child lookup');
      return [];
    }

    try {
      const result = await this.db
        .selectFrom('facet_values')
        .select('value_key')
        .where('facet_id', '=', facetId)
        .where('parent_value_id', '=', parentValue)
        .execute();
      
      return result.map(row => row.value_key);
    } catch (error) {
      console.error('Failed to get hierarchical children:', error);
      return [];
    }
  }

  /**
   * Generate filter statistics
   */
  generateFilterStatistics(
    originalResults: SearchResult[],
    filteredResults: SearchResult[],
    filters: FacetFilter[],
    processingTime: number
  ): FilterStatistics {
    const originalCount = originalResults.length;
    const filteredCount = filteredResults.length;
    
    return {
      originalCount,
      filteredCount,
      reductionPercentage: originalCount > 0 ? 
        ((originalCount - filteredCount) / originalCount) * 100 : 0,
      processingTimeMs: processingTime,
      filtersApplied: filters.length
    };
  }

  /**
   * Clear filter cache
   */
  clearCache(): void {
    this.filterCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): { size: number; hitRate?: number } {
    return {
      size: this.filterCache.size,
      // Hit rate would be calculated from usage statistics
      hitRate: undefined
    };
  }

  // Private helper methods

  private generateCacheKey(
    results: SearchResult[],
    filters: FacetFilter[],
    logic: FacetFilterLogic
  ): string {
    const resultHash = this.hashResults(results);
    const filterHash = this.hashFilters(filters);
    return `${resultHash}:${filterHash}:${logic}`;
  }

  private hashResults(results: SearchResult[]): string {
    // Create a hash of result IDs for cache key generation
    const ids = results.map(r => r.id).sort().join(',');
    return btoa(ids).slice(0, 16);
  }

  private hashFilters(filters: FacetFilter[]): string {
    // Create a hash of filters for cache key generation
    const filterString = JSON.stringify(filters.map(f => ({
      facetId: f.facetId,
      operation: f.operation,
      values: [...f.values].sort(),
      rangeMin: f.rangeMin,
      rangeMax: f.rangeMax
    })));
    
    return btoa(filterString).slice(0, 16);
  }

  private extractFieldValue(result: SearchResult, sourceField: string): any {
    if (!sourceField) return null;
    
    const parts = sourceField.split('.');
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

  private async getSourceFieldForFacet(facetId: string): Promise<string> {
    if (!this.db) {
      // Fallback to common field mappings when database is not available
      const fallbackMappings: Record<string, string> = {
        'category': 'metadata.category',
        'tags': 'metadata.tags',
        'priority': 'metadata.priority',
        'status': 'metadata.status',
        'type': 'type',
        'language': 'metadata.language',
        'estimate': 'metadata.estimate',
        'estimate-facet': 'metadata.estimate',
        'specific_field': 'metadata.specific_field',
        'common_field': 'metadata.common_field'
      };

      // Try exact match first
      if (fallbackMappings[facetId]) {
        return fallbackMappings[facetId];
      }
      
      // Try to match by common field name patterns
      const fieldName = facetId.toLowerCase().replace(/[-_\s]/g, '');
      for (const [key, field] of Object.entries(fallbackMappings)) {
        if (fieldName.includes(key) || key.includes(fieldName)) {
          return field;
        }
      }

      // Default fallback
      console.warn(`Database not available for facet field lookup. Using fallback for facetId: ${facetId}`);
      return 'metadata.tags';
    }

    try {
      const result = await this.db
        .selectFrom('facet_definitions')
        .select('source_field')
        .where('id', '=', facetId)
        .where('is_active', '=', true)
        .executeTakeFirst();
      
      if (!result) {
        throw new Error(`Facet definition not found for ID: ${facetId}`);
      }
      
      return result.source_field;
    } catch (error) {
      console.error('Failed to get source field for facet:', error);
      throw new Error(`Failed to retrieve facet source field: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private normalizeValue(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  private toNumeric(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }
}