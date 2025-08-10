/**
 * AI Summary Service
 * 
 * Main service for generating AI-powered summaries of search results.
 * Coordinates LLM-based content generation, fact checking, and quality assurance.
 */

import crypto from 'crypto';
import { validateInput } from '../../utils/validation.js';
import { DatabaseManager } from '../../utils/database.js';
import { LLMService } from '../nlp/llm-service.js';

import type {
  SearchResult,
  UnifiedSearchResponse
} from '../../shared/types/search.js';

import type {
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  SearchSummary,
  SummaryType,
  ContentSource,
  KeyPoint,
  GeneratedAnswer,
  SynthesizedContent,
  Comparison,
  ContentGap,
  FactCheck,
  HallucinationCheck,
  GenerateSummaryRequestSchema
} from '../../shared/types/ai-summaries.js';

import { SummaryGenerator } from './summary-generator.js';
import { SourceAttributionService } from './source-attribution-service.js';
import { FactChecker } from './fact-checker.js';
import { KeyPointsExtractor } from './key-points-extractor.js';

/**
 * Configuration for the AI Summary Service
 */
export interface AISummaryConfig {
  /** Enable caching of generated summaries */
  enableCaching: boolean;
  /** Enable fact checking */
  enableFactChecking: boolean;
  /** Enable hallucination detection */
  enableHallucinationCheck: boolean;
  /** Maximum processing time in milliseconds */
  maxProcessingTimeMs: number;
  /** Minimum confidence threshold for summaries */
  minConfidenceThreshold: number;
  /** Default LLM provider */
  defaultLLMProvider: string;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
}

/**
 * Summary generation context
 */
interface SummaryContext {
  /** Original request */
  request: GenerateSummaryRequest;
  /** Content sources */
  sources: ContentSource[];
  /** Generation start time */
  startTime: number;
  /** Results hash for caching */
  resultsHash: string;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
}

export class AISummaryService {
  private summaryGenerator: SummaryGenerator;
  private sourceAttributionService: SourceAttributionService;
  private factChecker: FactChecker;
  private keyPointsExtractor: KeyPointsExtractor;
  private summaryCache: Map<string, SearchSummary> = new Map();

  constructor(
    private llmService: LLMService,
    private db: DatabaseManager,
    private config: AISummaryConfig
  ) {
    // Initialize sub-services
    this.summaryGenerator = new SummaryGenerator(llmService, config);
    this.sourceAttributionService = new SourceAttributionService(config);
    this.factChecker = new FactChecker(llmService, config);
    this.keyPointsExtractor = new KeyPointsExtractor(llmService, config);

    // Setup cache cleanup
    if (config.enableCaching) {
      this.setupCacheCleanup();
    }
  }

  /**
   * Generate a comprehensive summary from search results
   */
  async generateResultSummary(
    request: GenerateSummaryRequest
  ): Promise<GenerateSummaryResponse> {
    try {
      // Validate request
      const validatedRequest = validateInput(GenerateSummaryRequestSchema, request);
      const startTime = Date.now();

      console.log(`🤖 Generating ${validatedRequest.summaryType} summary for: "${validatedRequest.query}"`);

      // Create summary context
      const context = await this.createSummaryContext(validatedRequest, startTime);

      // Check cache if enabled
      if (this.config.enableCaching) {
        const cached = this.summaryCache.get(context.resultsHash);
        if (cached) {
          console.log('📦 Returning cached summary');
          await this.updateAccessInfo(cached.id);
          return {
            success: true,
            summary: cached,
            metadata: {
              processingTime: Date.now() - startTime,
              llmProvider: cached.llmProvider,
              llmModel: cached.llmModel,
              cached: true
            }
          };
        }
      }

      // Generate summary based on type
      let summary: SearchSummary;
      
      switch (validatedRequest.summaryType) {
        case 'answer_generation':
          summary = await this.generateAnswerSummary(context);
          break;
        case 'key_points':
          summary = await this.generateKeyPointsSummary(context);
          break;
        case 'synthesis':
          summary = await this.generateSynthesisSummary(context);
          break;
        case 'comparison':
          summary = await this.generateComparisonSummary(context);
          break;
        default:
          summary = await this.generateGeneralSummary(context);
      }

      // Store in cache if enabled
      if (this.config.enableCaching) {
        this.summaryCache.set(context.resultsHash, summary);
        
        // Schedule cache cleanup
        setTimeout(() => {
          this.summaryCache.delete(context.resultsHash);
        }, this.config.cacheTtlMs);
      }

      // Store in database
      await this.storeSummary(summary);

      const totalTime = Date.now() - startTime;
      console.log(`✅ Summary generated in ${totalTime}ms with confidence ${summary.overallConfidence.toFixed(2)}`);

      return {
        success: true,
        summary,
        metadata: {
          processingTime: totalTime,
          llmProvider: summary.llmProvider,
          llmModel: summary.llmModel,
          tokensUsed: undefined, // Would need to track from LLM calls
          cached: false
        }
      };

    } catch (error) {
      console.error('❌ Summary generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          processingTime: Date.now() - (request as any).startTime || 0,
          llmProvider: this.config.defaultLLMProvider,
          llmModel: 'unknown',
          cached: false
        }
      };
    }
  }

  /**
   * Generate answer for a specific question
   */
  async generateAnswerFromResults(
    question: string,
    results: SearchResult[]
  ): Promise<GeneratedAnswer> {
    const request: GenerateSummaryRequest = {
      query: question,
      searchResults: results,
      summaryType: 'answer_generation',
      question
    };

    const response = await this.generateResultSummary(request);
    
    if (!response.success || !response.summary?.generatedAnswer) {
      throw new Error('Failed to generate answer');
    }

    return response.summary.generatedAnswer;
  }

  /**
   * Extract key points from content
   */
  async extractKeyPoints(
    content: string[]
  ): Promise<KeyPoint[]> {
    return this.keyPointsExtractor.extractFromContent(content);
  }

  /**
   * Synthesize information from multiple sources
   */
  async synthesizeInformation(
    sources: ContentSource[]
  ): Promise<SynthesizedContent> {
    return this.summaryGenerator.synthesizeContent(sources);
  }

  /**
   * Compare results and highlight differences
   */
  async compareResults(
    results: SearchResult[]
  ): Promise<Comparison> {
    const sources = await this.sourceAttributionService.convertToContentSources(results);
    return this.summaryGenerator.compareContent(sources);
  }

  /**
   * Identify gaps in available information
   */
  async identifyGaps(
    query: string,
    results: SearchResult[]
  ): Promise<ContentGap[]> {
    const sources = await this.sourceAttributionService.convertToContentSources(results);
    return this.summaryGenerator.identifyContentGaps(query, sources);
  }

  /**
   * Validate factual accuracy of summary content
   */
  async validateFactualAccuracy(
    summary: string,
    sources: ContentSource[]
  ): Promise<FactCheck[]> {
    if (!this.config.enableFactChecking) {
      return [];
    }

    return this.factChecker.checkFactualAccuracy(summary, sources);
  }

  /**
   * Calculate overall confidence for summary
   */
  async calculateConfidence(
    summary: string,
    sources: ContentSource[]
  ): Promise<number> {
    const factors = {
      sourceQuality: this.calculateSourceQualityScore(sources),
      contentCoverage: this.calculateCoverageScore(summary, sources),
      factCheckResults: 0.8, // Would be calculated from actual fact checks
      coherence: 0.9, // Would be calculated from coherence analysis
      sourceConsistency: 0.85 // Would be calculated from source agreement
    };

    // Weighted average of confidence factors
    const weights = {
      sourceQuality: 0.25,
      contentCoverage: 0.2,
      factCheckResults: 0.25,
      coherence: 0.15,
      sourceConsistency: 0.15
    };

    return Object.keys(factors).reduce((confidence, factor) => {
      return confidence + (factors[factor as keyof typeof factors] * weights[factor as keyof typeof weights]);
    }, 0);
  }

  /**
   * Detect potential hallucinations in summary
   */
  async detectHallucinations(
    summary: string,
    sources: ContentSource[]
  ): Promise<HallucinationCheck[]> {
    if (!this.config.enableHallucinationCheck) {
      return [];
    }

    return this.factChecker.detectHallucinations(summary, sources);
  }

  /**
   * Get summary by ID
   */
  async getSummaryById(summaryId: string): Promise<SearchSummary | null> {
    try {
      const result = await this.db.selectFrom('search_summaries')
        .selectAll()
        .where('id', '=', summaryId)
        .executeTakeFirst();

      if (!result) {
        return null;
      }

      // Convert database result to SearchSummary type
      return this.convertDbResultToSummary(result);

    } catch (error) {
      console.error('Failed to get summary by ID:', error);
      return null;
    }
  }

  /**
   * Get summaries for a user
   */
  async getUserSummaries(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SearchSummary[]> {
    try {
      const results = await this.db.selectFrom('search_summaries')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

      return results.map(result => this.convertDbResultToSummary(result));

    } catch (error) {
      console.error('Failed to get user summaries:', error);
      return [];
    }
  }

  /**
   * Private helper methods
   */

  private async createSummaryContext(
    request: GenerateSummaryRequest,
    startTime: number
  ): Promise<SummaryContext> {
    // Convert search results to content sources
    const sources = await this.sourceAttributionService.convertToContentSources(request.searchResults);
    
    // Generate hash for caching
    const resultsHash = this.generateResultsHash(request);

    return {
      request,
      sources,
      startTime,
      resultsHash,
      userId: request.userId,
      sessionId: request.sessionId
    };
  }

  private async generateGeneralSummary(context: SummaryContext): Promise<SearchSummary> {
    const { request, sources, startTime, resultsHash } = context;

    // Generate main summary content
    const content = await this.summaryGenerator.generateSummary(
      request.query,
      sources,
      request.summaryLength || 'medium'
    );

    // Extract key points
    const keyPoints = await this.keyPointsExtractor.extractFromSources(sources);

    // Perform fact checking if enabled
    const factChecks = await this.validateFactualAccuracy(content, sources);
    
    // Check for hallucinations if enabled
    const hallucinationChecks = await this.detectHallucinations(content, sources);

    // Identify content gaps
    const contentGaps = await this.identifyGaps(request.query, request.searchResults as SearchResult[]);

    // Calculate confidence
    const overallConfidence = await this.calculateConfidence(content, sources);

    // Build source attribution
    const sourceAttribution = this.sourceAttributionService.buildAttribution(sources, content);

    return {
      id: crypto.randomUUID(),
      searchResultsHash: resultsHash,
      searchQuery: request.query,
      queryIntent: 'general_search', // Would be determined from query analysis
      summaryType: request.summaryType,
      content,
      length: content.length,
      language: request.language || 'en',
      llmProvider: this.config.defaultLLMProvider,
      llmModel: this.config.defaultLLMModel || 'unknown', // Use configured model or unknown
      processingTimeMs: Date.now() - startTime,
      sources: sourceAttribution,
      keyPoints,
      factChecks,
      hallucinationChecks,
      contentGaps,
      overallConfidence,
      qualityMetrics: this.calculateQualityMetrics(content, sources, factChecks),
      userId: context.userId,
      sessionId: context.sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 1,
      lastAccessedAt: new Date()
    };
  }

  private async generateAnswerSummary(context: SummaryContext): Promise<SearchSummary> {
    const baseSummary = await this.generateGeneralSummary(context);
    
    // Generate specific answer
    const generatedAnswer = await this.summaryGenerator.generateAnswer(
      context.request.question || context.request.query,
      context.sources
    );

    return {
      ...baseSummary,
      summaryType: 'answer_generation',
      generatedAnswer
    };
  }

  private async generateKeyPointsSummary(context: SummaryContext): Promise<SearchSummary> {
    const baseSummary = await this.generateGeneralSummary(context);
    
    // Generate key points focused summary
    const keyPointsContent = await this.summaryGenerator.generateKeyPointsSummary(context.sources);

    return {
      ...baseSummary,
      summaryType: 'key_points',
      content: keyPointsContent
    };
  }

  private async generateSynthesisSummary(context: SummaryContext): Promise<SearchSummary> {
    const baseSummary = await this.generateGeneralSummary(context);
    
    // Generate synthesis
    const synthesizedContent = await this.synthesizeInformation(context.sources);

    return {
      ...baseSummary,
      summaryType: 'synthesis',
      synthesizedContent
    };
  }

  private async generateComparisonSummary(context: SummaryContext): Promise<SearchSummary> {
    const baseSummary = await this.generateGeneralSummary(context);
    
    // Generate comparison
    const comparison = await this.summaryGenerator.compareContent(context.sources);

    return {
      ...baseSummary,
      summaryType: 'comparison',
      comparison
    };
  }

  private generateResultsHash(request: GenerateSummaryRequest): string {
    const hashInput = JSON.stringify({
      query: request.query,
      summaryType: request.summaryType,
      searchResults: request.searchResults,
      language: request.language
    });
    
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private calculateSourceQualityScore(sources: ContentSource[]): number {
    if (sources.length === 0) return 0;
    
    const averageRelevance = sources.reduce((sum, source) => sum + source.relevance, 0) / sources.length;
    const diversityScore = this.calculateSourceDiversity(sources);
    
    return (averageRelevance * 0.7) + (diversityScore * 0.3);
  }

  private calculateCoverageScore(summary: string, sources: ContentSource[]): number {
    // Simple heuristic - would be more sophisticated in practice
    const summaryWords = summary.toLowerCase().split(/\s+/);
    const sourceWords = sources.flatMap(s => s.content.toLowerCase().split(/\s+/));
    
    const coverage = summaryWords.filter(word => sourceWords.includes(word)).length / summaryWords.length;
    return Math.min(coverage, 1.0);
  }

  private calculateSourceDiversity(sources: ContentSource[]): number {
    const uniqueTypes = new Set(sources.map(s => s.type));
    return uniqueTypes.size / Math.max(sources.length, 1);
  }

  private calculateQualityMetrics(content: string, sources: ContentSource[], factChecks: FactCheck[]) {
    // Simplified quality metrics calculation
    return {
      accuracy: factChecks.length > 0 ? 
        factChecks.filter(fc => fc.accuracy === 'verified' || fc.accuracy === 'likely_true').length / factChecks.length : 0.8,
      completeness: Math.min(content.length / 1000, 1.0), // Simple heuristic
      relevance: this.calculateSourceQualityScore(sources),
      clarity: 0.8, // Would be calculated using readability metrics
      conciseness: Math.max(0, 1.0 - (content.length / 2000)) // Penalize very long summaries
    };
  }

  private async storeSummary(summary: SearchSummary): Promise<void> {
    try {
      await this.db.insertInto('search_summaries')
        .values({
          id: summary.id,
          search_results_hash: summary.searchResultsHash,
          search_query: summary.searchQuery,
          query_intent: summary.queryIntent,
          summary_type: summary.summaryType,
          summary_content: summary.content,
          summary_length: summary.length,
          language: summary.language,
          llm_provider: summary.llmProvider,
          llm_model: summary.llmModel,
          total_sources: summary.sources.totalSources,
          processing_time_ms: summary.processingTimeMs,
          user_id: summary.userId,
          session_id: summary.sessionId,
          created_at: summary.createdAt,
          updated_at: summary.updatedAt,
          accessed_count: summary.accessCount,
          last_accessed_at: summary.lastAccessedAt
        })
        .execute();

      // Store related data in separate tables
      await this.storeSourceAttribution(summary);
      await this.storeKeyPoints(summary);
      await this.storeFactChecks(summary);
      await this.storeHallucinationChecks(summary);

    } catch (error) {
      console.error('Failed to store summary:', error);
      // Don't throw - summary generation succeeded, storage is secondary
    }
  }

  private async storeSourceAttribution(summary: SearchSummary): Promise<void> {
    if (!this.db) return;
    
    try {
      // Store summary sources
      const sourceInserts = summary.sources.sources.map(source => ({
        summary_id: summary.id,
        source_type: source.type,
        source_id: source.id,
        source_url: source.url,
        source_title: source.title,
        attribution_score: source.attribution_score,
        relevance_score: source.relevance_score,
        created_at: new Date()
      }));
      
      if (sourceInserts.length > 0) {
        await this.db.insertInto('summary_sources')
          .values(sourceInserts)
          .execute();
      }

      // Store citations
      if (summary.sources.citations) {
        const citationInserts = summary.sources.citations.map(citation => ({
          summary_id: summary.id,
          citation_text: citation.text,
          citation_url: citation.url,
          citation_title: citation.title || null,
          position_in_text: citation.position || 0,
          created_at: new Date()
        }));

        if (citationInserts.length > 0) {
          await this.db.insertInto('summary_citations')
            .values(citationInserts)
            .execute();
        }
      }
    } catch (error) {
      console.error('Failed to store source attribution:', error);
    }
  }

  private async storeKeyPoints(summary: SearchSummary): Promise<void> {
    if (!this.db || !summary.keyPoints) return;
    
    try {
      const keyPointInserts = summary.keyPoints.points.map((point, index) => ({
        summary_id: summary.id,
        key_point_text: point.text,
        importance_score: point.importance,
        confidence_score: point.confidence,
        category: point.category || null,
        position_index: index,
        sources: JSON.stringify(point.sources || []),
        created_at: new Date()
      }));
      
      if (keyPointInserts.length > 0) {
        await this.db.insertInto('summary_key_points')
          .values(keyPointInserts)
          .execute();
      }
    } catch (error) {
      console.error('Failed to store key points:', error);
    }
  }

  private async storeFactChecks(summary: SearchSummary): Promise<void> {
    if (!this.db || !summary.factChecks) return;
    
    try {
      await this.db.insertInto('fact_check_results')
        .values({
          summary_id: summary.id,
          overall_accuracy: summary.factChecks.overallAccuracy,
          confidence_score: summary.factChecks.confidence,
          risk_level: summary.factChecks.riskLevel,
          flagged_claims: JSON.stringify(summary.factChecks.flaggedClaims || []),
          verification_sources: JSON.stringify(summary.factChecks.verificationSources || []),
          fact_check_notes: summary.factChecks.notes || null,
          created_at: new Date()
        })
        .execute();

      // Store individual fact check claims if available
      if (summary.factChecks.flaggedClaims && summary.factChecks.flaggedClaims.length > 0) {
        const claimInserts = summary.factChecks.flaggedClaims.map(claim => ({
          summary_id: summary.id,
          claim_text: claim.text,
          claim_status: claim.status,
          accuracy_score: claim.accuracy || 0,
          verification_source: claim.source || null,
          explanation: claim.explanation || null,
          created_at: new Date()
        }));

        await this.db.insertInto('fact_check_claims')
          .values(claimInserts)
          .execute();
      }
    } catch (error) {
      console.error('Failed to store fact checks:', error);
    }
  }

  private async storeHallucinationChecks(summary: SearchSummary): Promise<void> {
    if (!this.db || !summary.hallucinationChecks) return;
    
    try {
      await this.db.insertInto('hallucination_checks')
        .values({
          summary_id: summary.id,
          detected_hallucinations: summary.hallucinationChecks.detectedHallucinations,
          risk_score: summary.hallucinationChecks.riskScore,
          confidence_level: summary.hallucinationChecks.confidenceLevel,
          validation_method: summary.hallucinationChecks.validationMethod || 'automatic',
          check_details: JSON.stringify(summary.hallucinationChecks.details || {}),
          created_at: new Date()
        })
        .execute();

      // Store individual hallucination instances if available
      if (summary.hallucinationChecks.details && Array.isArray(summary.hallucinationChecks.details.instances)) {
        const instanceInserts = summary.hallucinationChecks.details.instances.map((instance: any) => ({
          summary_id: summary.id,
          hallucination_text: instance.text || '',
          hallucination_type: instance.type || 'unknown',
          severity_score: instance.severity || 0,
          confidence_score: instance.confidence || 0,
          context_text: instance.context || null,
          created_at: new Date()
        }));

        if (instanceInserts.length > 0) {
          await this.db.insertInto('hallucination_instances')
            .values(instanceInserts)
            .execute();
        }
      }
    } catch (error) {
      console.error('Failed to store hallucination checks:', error);
    }
  }

  private async updateAccessInfo(summaryId: string): Promise<void> {
    try {
      await this.db.updateTable('search_summaries')
        .set({
          accessed_count: this.db.raw('accessed_count + 1'),
          last_accessed_at: new Date()
        })
        .where('id', '=', summaryId)
        .execute();
    } catch (error) {
      console.error('Failed to update access info:', error);
    }
  }

  private convertDbResultToSummary(dbResult: any): SearchSummary {
    // Convert database result to SearchSummary type
    // This would need to be implemented based on actual database schema
    // For now, return a simplified conversion
    return {
      id: dbResult.id,
      searchResultsHash: dbResult.search_results_hash,
      searchQuery: dbResult.search_query,
      queryIntent: dbResult.query_intent,
      summaryType: dbResult.summary_type,
      content: dbResult.summary_content,
      length: dbResult.summary_length,
      language: dbResult.language,
      llmProvider: dbResult.llm_provider,
      llmModel: dbResult.llm_model,
      processingTimeMs: dbResult.processing_time_ms,
      sources: { sources: [], citations: [], totalSources: 0, primarySources: [], diversityScore: 0 },
      keyPoints: [],
      factChecks: [],
      hallucinationChecks: [],
      contentGaps: [],
      overallConfidence: 0.8,
      qualityMetrics: { accuracy: 0.8, completeness: 0.8, relevance: 0.8, clarity: 0.8, conciseness: 0.8 },
      userId: dbResult.user_id,
      sessionId: dbResult.session_id,
      createdAt: dbResult.created_at,
      updatedAt: dbResult.updated_at,
      accessCount: dbResult.accessed_count,
      lastAccessedAt: dbResult.last_accessed_at
    };
  }

  private setupCacheCleanup(): void {
    // Clean up expired cache entries periodically
    setInterval(() => {
      console.log('🧹 Cleaning up AI summary cache');
      // Cache entries are automatically cleaned up via setTimeout
    }, 60000); // Check every minute
  }

  async getAnalytics(options?: {
    dateFrom?: string;
    dateTo?: string;
    userId?: string;
    summaryType?: string;
    includeQualityMetrics?: boolean;
  }): Promise<any> {
    if (!this.db) {
      return {
        summary_stats: {
          total_summaries: 0,
          summaries_by_type: {},
          average_confidence: 0,
          average_processing_time: 0
        },
        usage_patterns: {
          most_common_queries: [],
          peak_usage_hours: [],
          user_engagement: {}
        },
        quality_metrics: null
      };
    }

    try {
      // Build base query with filters
      let query = this.db.selectFrom('search_summaries');
      
      if (options?.dateFrom) {
        query = query.where('created_at', '>=', new Date(options.dateFrom));
      }
      if (options?.dateTo) {
        query = query.where('created_at', '<=', new Date(options.dateTo));
      }
      if (options?.userId) {
        query = query.where('user_id', '=', options.userId);
      }
      if (options?.summaryType) {
        query = query.where('summary_type', '=', options.summaryType);
      }

      // Get basic summary statistics
      const summaryStats = await query
        .select([
          this.db.fn.count('id').as('total_summaries'),
          this.db.fn.avg('overall_confidence').as('average_confidence'),
          this.db.fn.avg('processing_time_ms').as('average_processing_time')
        ])
        .executeTakeFirst();

      // Get summaries by type
      const summariesByType = await query
        .select([
          'summary_type',
          this.db.fn.count('id').as('count')
        ])
        .groupBy('summary_type')
        .execute();

      // Get most common queries (top 10)
      const commonQueries = await query
        .select([
          'search_query',
          this.db.fn.count('id').as('count')
        ])
        .groupBy('search_query')
        .orderBy('count', 'desc')
        .limit(10)
        .execute();

      // Get peak usage hours
      const peakUsageHours = await query
        .select([
          this.db.fn('EXTRACT', ['HOUR', 'created_at']).as('hour'),
          this.db.fn.count('id').as('count')
        ])
        .groupBy('hour')
        .orderBy('count', 'desc')
        .execute();

      // Get user engagement metrics
      const userEngagement = await query
        .select([
          this.db.fn.avg('accessed_count').as('average_access_count'),
          this.db.fn.count('DISTINCT user_id').as('unique_users'),
          this.db.fn.avg('EXTRACT(EPOCH FROM (last_accessed_at - created_at))').as('average_time_to_access')
        ])
        .executeTakeFirst();

      const analytics = {
        summary_stats: {
          total_summaries: Number(summaryStats?.total_summaries || 0),
          summaries_by_type: summariesByType.reduce((acc, item) => {
            acc[item.summary_type] = Number(item.count);
            return acc;
          }, {} as Record<string, number>),
          average_confidence: Number(summaryStats?.average_confidence || 0),
          average_processing_time: Number(summaryStats?.average_processing_time || 0)
        },
        usage_patterns: {
          most_common_queries: commonQueries.map(q => ({
            query: q.search_query,
            count: Number(q.count)
          })),
          peak_usage_hours: peakUsageHours.map(h => ({
            hour: Number(h.hour),
            count: Number(h.count)
          })),
          user_engagement: {
            average_access_count: Number(userEngagement?.average_access_count || 0),
            unique_users: Number(userEngagement?.unique_users || 0),
            average_time_to_access_seconds: Number(userEngagement?.average_time_to_access || 0)
          }
        },
        quality_metrics: null
      };

      // Add quality metrics if requested
      if (options?.includeQualityMetrics) {
        const factCheckStats = await this.db.selectFrom('fact_check_results')
          .select([
            this.db.fn.avg('overall_accuracy').as('average_accuracy'),
            this.db.fn.avg('confidence_score').as('average_confidence'),
            this.db.fn.count('id').as('total_fact_checks')
          ])
          .executeTakeFirst();

        const hallucinationStats = await this.db.selectFrom('hallucination_checks')
          .select([
            this.db.fn.avg('risk_score').as('average_risk_score'),
            this.db.fn.count('id').as('total_checks'),
            this.db.fn.sum('CASE WHEN detected_hallucinations THEN 1 ELSE 0 END').as('hallucinations_detected')
          ])
          .executeTakeFirst();

        analytics.quality_metrics = {
          fact_check_accuracy: Number(factCheckStats?.average_accuracy || 0),
          hallucination_rate: Number(hallucinationStats?.hallucinations_detected || 0) / Math.max(Number(hallucinationStats?.total_checks || 1), 1),
          user_satisfaction: 0, // Would need feedback data
          source_attribution_completeness: 0.95 // Would need to calculate from sources data
        };
      }

      return analytics;

    } catch (error) {
      console.error('Failed to generate analytics:', error);
      return {
        summary_stats: {
          total_summaries: 0,
          summaries_by_type: {},
          average_confidence: 0,
          average_processing_time: 0
        },
        usage_patterns: {
          most_common_queries: [],
          peak_usage_hours: [],
          user_engagement: {}
        },
        quality_metrics: options?.includeQualityMetrics ? {
          fact_check_accuracy: 0,
          hallucination_rate: 0,
          user_satisfaction: 0,
          source_attribution_completeness: 0
        } : null
      };
    }
  }
}