/**
 * Facet Discovery Engine
 * 
 * Automatically discovers potential facets from search result content
 * by analyzing field patterns, data types, and value distributions.
 */

import {
  type SearchResult,
  type DiscoveredFacet,
  type FacetType,
  type FacetDataType,
  DynamicFacetSchemas
} from '@shared/types';

export interface FacetDiscoveryOptions {
  /** Maximum number of facets to discover */
  maxFacets?: number;
  /** Minimum quality score for facets */
  minQualityScore?: number;
  /** Minimum coverage percentage (0.0 to 1.0) */
  minCoverage?: number;
  /** Maximum cardinality for categorical facets */
  maxCardinality?: number;
  /** Include date-based facets */
  includeDates?: boolean;
  /** Include range-based facets */
  includeRanges?: boolean;
  /** Include hierarchical facets */
  includeHierarchical?: boolean;
}

export interface FieldAnalysis {
  field: string;
  dataType: FacetDataType;
  uniqueValues: Set<any>;
  sampleValues: any[];
  nullCount: number;
  coverage: number;
  cardinality: 'low' | 'medium' | 'high' | 'very_high';
  isNumeric: boolean;
  isDate: boolean;
  isHierarchical: boolean;
  hasNesting: boolean;
  patterns: string[];
}

export class FacetDiscoveryEngine {
  private readonly defaultOptions: Required<FacetDiscoveryOptions> = {
    maxFacets: 10,
    minQualityScore: 0.5,
    minCoverage: 0.1,
    maxCardinality: 1000,
    includeDates: true,
    includeRanges: true,
    includeHierarchical: true
  };

  /**
   * Discover facets from search results
   */
  async discoverFacets(
    results: SearchResult[], 
    options: FacetDiscoveryOptions = {}
  ): Promise<DiscoveredFacet[]> {
    const opts = { ...this.defaultOptions, ...options };
    
    if (results.length === 0) {
      return [];
    }

    // Extract all fields from results
    const fieldAnalyses = await this.analyzeFields(results);
    
    // Generate facet candidates
    const candidates: DiscoveredFacet[] = [];
    
    for (const analysis of fieldAnalyses) {
      if (analysis.coverage < opts.minCoverage) {
        continue;
      }

      const facet = await this.createFacetCandidate(analysis, results.length, opts);
      
      if (facet && facet.qualityScore >= opts.minQualityScore) {
        candidates.push(facet);
      }
    }

    // Sort by quality and usefulness scores
    candidates.sort((a, b) => {
      const scoreA = (a.qualityScore + a.usefulnessScore) / 2;
      const scoreB = (b.qualityScore + b.usefulnessScore) / 2;
      return scoreB - scoreA;
    });

    return candidates.slice(0, opts.maxFacets);
  }

  /**
   * Analyze all fields in search results
   */
  private async analyzeFields(results: SearchResult[]): Promise<FieldAnalysis[]> {
    const fieldMap = new Map<string, FieldAnalysis>();
    const totalResults = results.length;

    for (const result of results) {
      // Analyze standard fields
      this.analyzeObjectFields('', result, fieldMap, totalResults);
      
      // Analyze metadata fields specifically
      if (result.metadata) {
        this.analyzeObjectFields('metadata', result.metadata, fieldMap, totalResults);
      }
    }

    return Array.from(fieldMap.values());
  }

  /**
   * Recursively analyze object fields
   */
  private analyzeObjectFields(
    prefix: string,
    obj: any,
    fieldMap: Map<string, FieldAnalysis>,
    totalResults: number
  ): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      
      // Skip certain system fields
      if (this.shouldSkipField(fieldPath)) {
        continue;
      }

      let analysis = fieldMap.get(fieldPath);
      if (!analysis) {
        analysis = this.createFieldAnalysis(fieldPath);
        fieldMap.set(fieldPath, analysis);
      }

      this.updateFieldAnalysis(analysis, value, totalResults);

      // Recursively analyze nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.analyzeObjectFields(fieldPath, value, fieldMap, totalResults);
      }
    }
  }

  /**
   * Create initial field analysis structure
   */
  private createFieldAnalysis(field: string): FieldAnalysis {
    return {
      field,
      dataType: 'string',
      uniqueValues: new Set(),
      sampleValues: [],
      nullCount: 0,
      coverage: 0,
      cardinality: 'low',
      isNumeric: false,
      isDate: false,
      isHierarchical: false,
      hasNesting: false,
      patterns: []
    };
  }

  /**
   * Update field analysis with new value
   */
  private updateFieldAnalysis(
    analysis: FieldAnalysis,
    value: any,
    totalResults: number
  ): void {
    if (value == null) {
      analysis.nullCount++;
      return;
    }

    // Add to unique values (convert to string for Set comparison)
    const stringValue = this.normalizeValue(value);
    analysis.uniqueValues.add(stringValue);

    // Keep sample values
    if (analysis.sampleValues.length < 20) {
      analysis.sampleValues.push(stringValue);
    }

    // Determine data type
    const detectedType = this.detectDataType(value);
    if (analysis.dataType === 'string' || detectedType !== 'string') {
      analysis.dataType = detectedType;
    }

    // Update flags
    analysis.isNumeric = analysis.isNumeric || this.isNumericValue(value);
    analysis.isDate = analysis.isDate || this.isDateValue(value);
    analysis.isHierarchical = analysis.isHierarchical || this.isHierarchicalValue(value);
    analysis.hasNesting = analysis.hasNesting || Array.isArray(value) || 
      (typeof value === 'object' && value !== null);

    // Calculate coverage and cardinality
    analysis.coverage = (totalResults - analysis.nullCount) / totalResults;
    analysis.cardinality = this.calculateCardinality(analysis.uniqueValues.size);
  }

  /**
   * Create a facet candidate from field analysis
   */
  private async createFacetCandidate(
    analysis: FieldAnalysis,
    totalResults: number,
    options: Required<FacetDiscoveryOptions>
  ): Promise<DiscoveredFacet | null> {
    const facetType = this.determineFacetType(analysis, options);
    if (!facetType) {
      return null;
    }

    const displayName = this.generateDisplayName(analysis.field);
    const qualityScore = this.calculateQualityScore(analysis);
    const usefulnessScore = this.calculateUsefulnessScore(analysis, facetType);

    return {
      facetName: this.sanitizeFacetName(analysis.field),
      facetType,
      dataType: analysis.dataType,
      sourceField: analysis.field,
      displayName,
      qualityScore,
      usefulnessScore,
      uniqueValueCount: analysis.uniqueValues.size,
      sampleValues: analysis.sampleValues.slice(0, 10),
      cardinality: analysis.cardinality,
      coverage: analysis.coverage,
      reasons: this.generateRecommendationReasons(analysis, facetType)
    };
  }

  /**
   * Determine the appropriate facet type for a field
   */
  private determineFacetType(
    analysis: FieldAnalysis,
    options: Required<FacetDiscoveryOptions>
  ): FacetType | null {
    // Date facets
    if (options.includeDates && analysis.isDate) {
      return 'date';
    }

    // Range facets for numeric data
    if (options.includeRanges && analysis.isNumeric && 
        analysis.cardinality === 'high' || analysis.cardinality === 'very_high') {
      return 'range';
    }

    // Hierarchical facets
    if (options.includeHierarchical && analysis.isHierarchical) {
      return 'hierarchical';
    }

    // Categorical facets
    if (analysis.cardinality !== 'very_high' && 
        analysis.uniqueValues.size <= options.maxCardinality) {
      return 'categorical';
    }

    return null;
  }

  /**
   * Calculate quality score for a facet candidate
   */
  private calculateQualityScore(analysis: FieldAnalysis): number {
    let score = 0;

    // Coverage weight (40%)
    score += analysis.coverage * 0.4;

    // Cardinality weight (30%)
    const cardinalityScore = this.getCardinalityScore(analysis.cardinality);
    score += cardinalityScore * 0.3;

    // Data consistency weight (20%)
    const consistencyScore = this.getDataConsistencyScore(analysis);
    score += consistencyScore * 0.2;

    // Field naming weight (10%)
    const namingScore = this.getFieldNamingScore(analysis.field);
    score += namingScore * 0.1;

    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Calculate usefulness score for a facet candidate
   */
  private calculateUsefulnessScore(analysis: FieldAnalysis, facetType: FacetType): number {
    let score = 0;

    // Discriminative power (50%)
    const discriminativePower = this.calculateDiscriminativePower(analysis);
    score += discriminativePower * 0.5;

    // Facet type appropriateness (30%)
    const typeScore = this.getFacetTypeScore(analysis, facetType);
    score += typeScore * 0.3;

    // Expected user interest (20%)
    const interestScore = this.getExpectedInterestScore(analysis.field);
    score += interestScore * 0.2;

    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Check if field should be skipped from facet discovery
   */
  private shouldSkipField(field: string): boolean {
    const skipPatterns = [
      'id', 'uuid', '_id', 'password', 'token', 'secret',
      'hash', 'checksum', 'timestamp', 'created_at', 'updated_at',
      'preview.text', 'preview.length', 'score.relevance'
    ];

    return skipPatterns.some(pattern => 
      field.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Normalize value for comparison and storage
   */
  private normalizeValue(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  /**
   * Detect data type of value
   */
  private detectDataType(value: any): FacetDataType {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (this.isDateValue(value)) return 'date';
    return 'string';
  }

  /**
   * Check if value is numeric
   */
  private isNumericValue(value: any): boolean {
    if (typeof value === 'number') return true;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return !isNaN(num) && isFinite(num);
    }
    return false;
  }

  /**
   * Check if value represents a date
   */
  private isDateValue(value: any): boolean {
    if (value instanceof Date) return true;
    if (typeof value === 'string') {
      // Check for ISO date format or other common date patterns
      const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
      return dateRegex.test(value) && !isNaN(new Date(value).getTime());
    }
    return false;
  }

  /**
   * Check if value suggests hierarchical structure
   */
  private isHierarchicalValue(value: any): boolean {
    if (typeof value === 'string') {
      // Look for path-like patterns
      return value.includes('/') || value.includes('\\') || 
             value.includes('::') || value.includes('.');
    }
    return false;
  }

  /**
   * Calculate cardinality category
   */
  private calculateCardinality(uniqueCount: number): 'low' | 'medium' | 'high' | 'very_high' {
    if (uniqueCount <= 10) return 'low';
    if (uniqueCount <= 50) return 'medium';
    if (uniqueCount <= 500) return 'high';
    return 'very_high';
  }

  /**
   * Generate human-readable display name
   */
  private generateDisplayName(field: string): string {
    return field
      .split('.')
      .pop()! // Get last part of field path
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Sanitize facet name for system use
   */
  private sanitizeFacetName(field: string): string {
    return field
      .replace(/[^a-zA-Z0-9_.]/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Generate reasons for facet recommendation
   */
  private generateRecommendationReasons(
    analysis: FieldAnalysis,
    facetType: FacetType
  ): string[] {
    const reasons: string[] = [];

    if (analysis.coverage >= 0.8) {
      reasons.push('High field coverage across results');
    }

    if (analysis.cardinality === 'low' || analysis.cardinality === 'medium') {
      reasons.push('Optimal number of unique values for filtering');
    }

    if (facetType === 'date') {
      reasons.push('Date values enable temporal filtering');
    }

    if (facetType === 'range') {
      reasons.push('Numeric values suitable for range filtering');
    }

    if (facetType === 'hierarchical') {
      reasons.push('Hierarchical structure detected');
    }

    if (analysis.field.includes('tag') || analysis.field.includes('category')) {
      reasons.push('Field name suggests taxonomic organization');
    }

    return reasons;
  }

  /**
   * Get score based on cardinality
   */
  private getCardinalityScore(cardinality: string): number {
    switch (cardinality) {
      case 'low': return 0.9;
      case 'medium': return 1.0;
      case 'high': return 0.7;
      case 'very_high': return 0.3;
      default: return 0.5;
    }
  }

  /**
   * Get data consistency score
   */
  private getDataConsistencyScore(analysis: FieldAnalysis): number {
    // Higher score for consistent data types and patterns
    const nullRate = analysis.nullCount / (analysis.uniqueValues.size + analysis.nullCount);
    return 1.0 - nullRate;
  }

  /**
   * Get field naming quality score
   */
  private getFieldNamingScore(field: string): number {
    // Higher score for descriptive field names
    const descriptiveTerms = [
      'category', 'type', 'status', 'tag', 'language', 'format',
      'priority', 'level', 'grade', 'class', 'group', 'kind'
    ];
    
    const fieldLower = field.toLowerCase();
    const hasDescriptiveTerms = descriptiveTerms.some(term => 
      fieldLower.includes(term)
    );
    
    return hasDescriptiveTerms ? 0.8 : 0.5;
  }

  /**
   * Calculate discriminative power of field
   */
  private calculateDiscriminativePower(analysis: FieldAnalysis): number {
    // Higher score for fields that can effectively partition results
    const uniqueRatio = analysis.uniqueValues.size / 
      (analysis.uniqueValues.size + analysis.nullCount);
    
    // Ideal range is 10-50% of total results for categorical facets
    if (analysis.cardinality === 'medium') {
      return 0.9;
    } else if (analysis.cardinality === 'low') {
      return 0.7;
    } else if (analysis.cardinality === 'high') {
      return 0.8;
    }
    
    return 0.4;
  }

  /**
   * Get score for facet type appropriateness
   */
  private getFacetTypeScore(analysis: FieldAnalysis, facetType: FacetType): number {
    switch (facetType) {
      case 'categorical':
        return analysis.cardinality === 'low' || analysis.cardinality === 'medium' ? 1.0 : 0.5;
      case 'range':
        return analysis.isNumeric ? 1.0 : 0.3;
      case 'date':
        return analysis.isDate ? 1.0 : 0.2;
      case 'hierarchical':
        return analysis.isHierarchical ? 1.0 : 0.4;
      default:
        return 0.5;
    }
  }

  /**
   * Get expected user interest score
   */
  private getExpectedInterestScore(field: string): number {
    // Common fields users typically want to filter by
    const highInterestFields = [
      'type', 'category', 'status', 'language', 'format', 'author',
      'tag', 'priority', 'date', 'time', 'location', 'size'
    ];
    
    const fieldLower = field.toLowerCase();
    const isHighInterest = highInterestFields.some(term => 
      fieldLower.includes(term)
    );
    
    return isHighInterest ? 0.8 : 0.5;
  }
}