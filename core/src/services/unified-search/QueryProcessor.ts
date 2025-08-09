/**
 * Query Processor for Unified Search
 * 
 * Handles query preprocessing, enhancement, and analysis to improve
 * search quality and performance across all content sources.
 */

import { z } from 'zod';
import type { 
  UnifiedSearchRequest, 
  SearchFilters, 
  ContentType 
} from '../../shared/types/search.js';

/**
 * Processed query with enhancements and metadata
 */
export interface ProcessedQuery {
  /** Original query text */
  original: string;
  /** Cleaned and normalized query */
  normalized: string;
  /** Extracted keywords */
  keywords: string[];
  /** Query intent classification */
  intent: QueryIntent;
  /** Query complexity score (0.0 to 1.0) */
  complexity: number;
  /** Suggested search strategies */
  strategies: SearchStrategy[];
  /** Query metadata */
  metadata: {
    language?: string;
    containsCode?: boolean;
    containsDates?: boolean;
    containsSpecialTerms?: boolean;
    expectedResultTypes?: ContentType[];
  };
}

/**
 * Query intent classification
 */
export type QueryIntent = 
  | 'informational'    // Looking for information/facts
  | 'navigational'     // Looking for specific item/page  
  | 'procedural'       // Looking for how-to/process
  | 'analytical'       // Looking for analysis/insights
  | 'creative'         // Looking for ideas/inspiration
  | 'troubleshooting'; // Looking for solutions/fixes

/**
 * Search strategies based on query analysis
 */
export type SearchStrategy = 
  | 'semantic_vector'  // Use vector similarity search
  | 'keyword_exact'    // Exact keyword matching
  | 'fuzzy_text'       // Fuzzy text matching
  | 'date_temporal'    // Time-based search
  | 'tag_categorical'  // Tag/category filtering
  | 'code_specific';   // Code-specific search patterns

/**
 * Query suggestions for refinement
 */
export interface QuerySuggestion {
  /** Suggested query text */
  query: string;
  /** Suggestion type */
  type: 'spelling' | 'completion' | 'related' | 'refinement';
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** Explanation of suggestion */
  reason?: string;
}

/**
 * Query enhancement options
 */
const QueryEnhancementOptionsSchema = z.object({
  /** Enable spell checking and correction */
  enableSpellCheck: z.boolean().default(true),
  /** Enable query expansion with synonyms */
  enableExpansion: z.boolean().default(true),
  /** Enable intent classification */
  enableIntentAnalysis: z.boolean().default(true),
  /** Generate query suggestions */
  generateSuggestions: z.boolean().default(true),
  /** Maximum number of suggestions */
  maxSuggestions: z.number().int().min(1).max(10).default(5)
});

export type QueryEnhancementOptions = z.infer<typeof QueryEnhancementOptionsSchema>;

export class QueryProcessor {
  private readonly stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
  ]);

  private readonly codePatterns = [
    /\b(function|class|const|let|var|if|else|for|while|return)\b/i,
    /[{}[\]();]/,
    /\b\w+\.\w+\(/,
    /(import|export|from|require)\s/i
  ];

  private readonly datePatterns = [
    /\d{4}-\d{2}-\d{2}/,
    /\d{1,2}\/\d{1,2}\/\d{4}/,
    /(yesterday|today|tomorrow|last\s+week|next\s+week)/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)/i
  ];

  /**
   * Process and enhance a search query
   */
  async processQuery(
    request: UnifiedSearchRequest,
    options: Partial<QueryEnhancementOptions> = {}
  ): Promise<ProcessedQuery> {
    const opts = QueryEnhancementOptionsSchema.parse(options);
    const query = request.query.trim();

    // Step 1: Normalize the query
    const normalized = this.normalizeQuery(query);

    // Step 2: Extract keywords
    const keywords = this.extractKeywords(normalized);

    // Step 3: Classify intent
    const intent = this.classifyIntent(normalized, keywords, request.filters);

    // Step 4: Calculate complexity
    const complexity = this.calculateComplexity(normalized, keywords, request.filters);

    // Step 5: Determine search strategies
    const strategies = this.determineStrategies(normalized, intent, request);

    // Step 6: Analyze metadata
    const metadata = this.analyzeMetadata(normalized, request.filters);

    return {
      original: query,
      normalized,
      keywords,
      intent,
      complexity,
      strategies,
      metadata
    };
  }

  /**
   * Generate query suggestions for refinement
   */
  async generateSuggestions(
    processedQuery: ProcessedQuery,
    options: Partial<QueryEnhancementOptions> = {}
  ): Promise<QuerySuggestion[]> {
    const opts = QueryEnhancementOptionsSchema.parse(options);
    const suggestions: QuerySuggestion[] = [];

    if (!opts.generateSuggestions) {
      return suggestions;
    }

    // Spelling corrections
    if (opts.enableSpellCheck) {
      const spellingSuggestions = this.generateSpellingSuggestions(processedQuery.original);
      suggestions.push(...spellingSuggestions);
    }

    // Query completions
    const completionSuggestions = this.generateCompletions(processedQuery);
    suggestions.push(...completionSuggestions);

    // Related queries
    const relatedSuggestions = this.generateRelatedQueries(processedQuery);
    suggestions.push(...relatedSuggestions);

    // Query refinements
    const refinementSuggestions = this.generateRefinements(processedQuery);
    suggestions.push(...refinementSuggestions);

    // Sort by confidence and limit
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, opts.maxSuggestions);
  }

  /**
   * Normalize query text for better processing
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s\-_.]/g, ' ') // Keep only alphanumeric, spaces, hyphens, underscores, dots
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract meaningful keywords from query
   */
  private extractKeywords(normalizedQuery: string): string[] {
    const words = normalizedQuery.split(/\s+/);
    
    return words
      .filter(word => word.length > 2)
      .filter(word => !this.stopWords.has(word))
      .filter(word => !/^\d+$/.test(word)) // Exclude pure numbers
      .slice(0, 20); // Limit to 20 keywords
  }

  /**
   * Classify the intent of the query
   */
  private classifyIntent(
    normalizedQuery: string,
    keywords: string[],
    filters?: SearchFilters
  ): QueryIntent {
    const query = normalizedQuery.toLowerCase();

    // Navigation patterns
    if (/^(find|get|show|display|open)\s/.test(query) || 
        keywords.some(k => ['dashboard', 'settings', 'profile'].includes(k))) {
      return 'navigational';
    }

    // Procedural patterns
    if (/^(how\s+to|steps?\s+to|guide|tutorial|process)/.test(query) ||
        keywords.some(k => ['install', 'setup', 'configure', 'create'].includes(k))) {
      return 'procedural';
    }

    // Analytical patterns
    if (/^(analyze|compare|statistics|metrics|performance|trends)/.test(query) ||
        keywords.some(k => ['stats', 'analytics', 'report', 'insights'].includes(k))) {
      return 'analytical';
    }

    // Troubleshooting patterns
    if (/^(fix|solve|error|problem|issue|bug|trouble)/.test(query) ||
        keywords.some(k => ['broken', 'failed', 'debug', 'troubleshoot'].includes(k))) {
      return 'troubleshooting';
    }

    // Creative patterns
    if (/^(ideas?|inspiration|examples?|samples?)/.test(query) ||
        keywords.some(k => ['creative', 'brainstorm', 'design'].includes(k))) {
      return 'creative';
    }

    // Default to informational
    return 'informational';
  }

  /**
   * Calculate query complexity score
   */
  private calculateComplexity(
    normalizedQuery: string,
    keywords: string[],
    filters?: SearchFilters
  ): number {
    let complexity = 0.0;

    // Base complexity from query length
    complexity += Math.min(normalizedQuery.length / 100, 0.3);

    // Keyword count complexity
    complexity += Math.min(keywords.length / 10, 0.2);

    // Filter complexity
    if (filters) {
      if (filters.content_types?.length) complexity += 0.1;
      if (filters.date_from || filters.date_to) complexity += 0.1;
      if (filters.created_by) complexity += 0.1;
      if (filters.tags?.length) complexity += 0.1;
      if (filters.min_quality) complexity += 0.1;
    }

    // Special pattern complexity
    if (this.codePatterns.some(pattern => pattern.test(normalizedQuery))) {
      complexity += 0.1;
    }
    if (this.datePatterns.some(pattern => pattern.test(normalizedQuery))) {
      complexity += 0.1;
    }

    return Math.min(complexity, 1.0);
  }

  /**
   * Determine optimal search strategies
   */
  private determineStrategies(
    normalizedQuery: string,
    intent: QueryIntent,
    request: UnifiedSearchRequest
  ): SearchStrategy[] {
    const strategies: SearchStrategy[] = [];

    // Always include semantic search for quality results
    if (request.use_semantic) {
      strategies.push('semantic_vector');
    }

    // Keyword exact matching for specific terms
    if (normalizedQuery.includes('"') || intent === 'navigational') {
      strategies.push('keyword_exact');
    }

    // Fuzzy matching for broader results
    if (request.use_fuzzy && intent !== 'navigational') {
      strategies.push('fuzzy_text');
    }

    // Date-based search if temporal patterns detected
    if (this.datePatterns.some(pattern => pattern.test(normalizedQuery)) ||
        request.filters?.date_from || request.filters?.date_to) {
      strategies.push('date_temporal');
    }

    // Tag-based search if tags specified
    if (request.filters?.tags?.length) {
      strategies.push('tag_categorical');
    }

    // Code-specific search if code patterns detected
    if (this.codePatterns.some(pattern => pattern.test(normalizedQuery))) {
      strategies.push('code_specific');
    }

    return strategies.length > 0 ? strategies : ['semantic_vector', 'fuzzy_text'];
  }

  /**
   * Analyze query metadata
   */
  private analyzeMetadata(normalizedQuery: string, filters?: SearchFilters): ProcessedQuery['metadata'] {
    const metadata: ProcessedQuery['metadata'] = {};

    // Check for code patterns
    if (this.codePatterns.some(pattern => pattern.test(normalizedQuery))) {
      metadata.containsCode = true;
    }

    // Check for date patterns
    if (this.datePatterns.some(pattern => pattern.test(normalizedQuery))) {
      metadata.containsDates = true;
    }

    // Check for special terms
    const specialTerms = ['urgent', 'important', 'critical', 'high', 'priority'];
    if (specialTerms.some(term => normalizedQuery.includes(term))) {
      metadata.containsSpecialTerms = true;
    }

    // Infer expected result types from query content
    const expectedTypes: ContentType[] = [];
    
    if (normalizedQuery.includes('wiki') || normalizedQuery.includes('page')) {
      expectedTypes.push('wiki_page');
    }
    if (normalizedQuery.includes('task') || normalizedQuery.includes('card') || normalizedQuery.includes('kanban')) {
      expectedTypes.push('kanban_card');
    }
    if (normalizedQuery.includes('memory') || normalizedQuery.includes('thought') || normalizedQuery.includes('note')) {
      expectedTypes.push('memory_thought');
    }
    if (metadata.containsCode || normalizedQuery.includes('code')) {
      expectedTypes.push('code_file', 'code_chunk');
    }
    if (normalizedQuery.includes('scraped') || normalizedQuery.includes('web') || normalizedQuery.includes('url')) {
      expectedTypes.push('scraped_page', 'scraped_content_chunk');
    }

    if (expectedTypes.length > 0) {
      metadata.expectedResultTypes = expectedTypes;
    }

    return metadata;
  }

  /**
   * Generate spelling suggestions (simplified implementation)
   */
  private generateSpellingSuggestions(query: string): QuerySuggestion[] {
    // This is a simplified implementation
    // In production, you'd use a proper spell-checking library
    const suggestions: QuerySuggestion[] = [];

    const commonMisspellings: Record<string, string> = {
      'teh': 'the',
      'adn': 'and',
      'recieve': 'receive',
      'seperate': 'separate',
      'occurence': 'occurrence',
      'definitly': 'definitely'
    };

    const words = query.toLowerCase().split(/\s+/);
    let hasCorrection = false;
    const correctedWords = words.map(word => {
      const correction = commonMisspellings[word];
      if (correction) {
        hasCorrection = true;
        return correction;
      }
      return word;
    });

    if (hasCorrection) {
      suggestions.push({
        query: correctedWords.join(' '),
        type: 'spelling',
        confidence: 0.8,
        reason: 'Corrected spelling errors'
      });
    }

    return suggestions;
  }

  /**
   * Generate query completions
   */
  private generateCompletions(processedQuery: ProcessedQuery): QuerySuggestion[] {
    const suggestions: QuerySuggestion[] = [];
    const query = processedQuery.normalized;

    // Common completion patterns based on intent
    const completions: Record<QueryIntent, string[]> = {
      informational: [' definition', ' overview', ' examples', ' details'],
      navigational: [' page', ' dashboard', ' settings', ' list'],
      procedural: [' steps', ' tutorial', ' guide', ' process'],
      analytical: [' analysis', ' report', ' statistics', ' trends'],
      creative: [' ideas', ' examples', ' templates', ' inspiration'],
      troubleshooting: [' solution', ' fix', ' debug', ' help']
    };

    const intentCompletions = completions[processedQuery.intent] || completions.informational;
    
    intentCompletions.forEach(completion => {
      suggestions.push({
        query: processedQuery.original + completion,
        type: 'completion',
        confidence: 0.6,
        reason: `Complete query with ${completion.trim()}`
      });
    });

    return suggestions;
  }

  /**
   * Generate related queries
   */
  private generateRelatedQueries(processedQuery: ProcessedQuery): QuerySuggestion[] {
    const suggestions: QuerySuggestion[] = [];
    
    // Generate related queries based on keywords
    processedQuery.keywords.slice(0, 3).forEach(keyword => {
      suggestions.push({
        query: `related to ${keyword}`,
        type: 'related',
        confidence: 0.5,
        reason: `Find content related to ${keyword}`
      });
    });

    return suggestions;
  }

  /**
   * Generate query refinements
   */
  private generateRefinements(processedQuery: ProcessedQuery): QuerySuggestion[] {
    const suggestions: QuerySuggestion[] = [];

    // Suggest more specific queries if complexity is low
    if (processedQuery.complexity < 0.3) {
      suggestions.push({
        query: processedQuery.original + ' detailed',
        type: 'refinement',
        confidence: 0.4,
        reason: 'Add specificity to the query'
      });
    }

    // Suggest broader queries if complexity is high
    if (processedQuery.complexity > 0.7) {
      const mainKeywords = processedQuery.keywords.slice(0, 2);
      if (mainKeywords.length > 0) {
        suggestions.push({
          query: mainKeywords.join(' '),
          type: 'refinement',
          confidence: 0.5,
          reason: 'Simplify query for broader results'
        });
      }
    }

    return suggestions;
  }
}