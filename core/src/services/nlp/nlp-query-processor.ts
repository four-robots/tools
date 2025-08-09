import { DatabaseManager } from '../../utils/database.js';
import { LLMService } from './llm-service.js';
import { IntentClassifier } from './intent-classifier.js';
import { EntityExtractor } from './entity-extractor.js';
import {
  ProcessedQuery,
  QueryContext,
  ProcessQueryRequest,
  ProcessQueryResponse,
  QueryIntent,
  NamedEntity,
  QueryExpansion,
  SpellCorrection,
  SearchStrategy,
  LLMConfig,
  QueryProcessingCache
} from '../../shared/types/nlp.js';
import { createHash } from 'crypto';
import * as natural from 'natural';
import franc from 'franc';

export interface NLPProcessingOptions {
  skipCache?: boolean;
  includeExpansion?: boolean;
  includeEntities?: boolean;
  includeSpellCorrection?: boolean;
  maxProcessingTime?: number;
  fallbackStrategy?: 'rules' | 'simple' | 'none';
}

export interface CacheService {
  get(key: string): Promise<ProcessedQuery | null>;
  set(key: string, value: ProcessedQuery, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}

export class NLPQueryProcessor {
  private llmService: LLMService;
  private intentClassifier: IntentClassifier;
  private entityExtractor: EntityExtractor;
  private stemmer: natural.PorterStemmer;
  private readonly cacheTimeout = 15 * 60 * 1000; // 15 minutes

  constructor(
    private db?: DatabaseManager,
    private cacheService?: CacheService,
    llmConfigs: LLMConfig[] = []
  ) {
    // Initialize services
    this.llmService = new LLMService(db, llmConfigs);
    this.intentClassifier = new IntentClassifier(this.llmService, db);
    this.entityExtractor = new EntityExtractor(this.llmService, db);
    this.stemmer = natural.PorterStemmer;
  }

  // Main query processing method
  async processQuery(
    query: string, 
    context?: QueryContext,
    options: NLPProcessingOptions = {}
  ): Promise<ProcessedQuery> {
    const startTime = Date.now();
    
    // Set default options
    const opts: Required<NLPProcessingOptions> = {
      skipCache: false,
      includeExpansion: true,
      includeEntities: true,
      includeSpellCorrection: true,
      maxProcessingTime: 5000,
      fallbackStrategy: 'rules',
      ...options
    };

    // Generate query hash for caching
    const queryHash = this.generateQueryHash(query, context);

    // Check cache first (unless skipped)
    if (!opts.skipCache) {
      const cached = await this.getCachedProcessing(query);
      if (cached) {
        return {
          ...cached,
          cached: true,
          processingTimeMs: Date.now() - startTime
        };
      }
    }

    try {
      // Process with timeout
      const processed = await Promise.race([
        this.performFullProcessing(query, context, opts),
        this.createTimeoutPromise(opts.maxProcessingTime)
      ]);

      // Update processing time
      processed.processingTimeMs = Date.now() - startTime;
      processed.queryHash = queryHash;

      // Cache the result
      await this.cacheProcessedQuery(query, processed);

      return processed;
    } catch (error) {
      console.error('Query processing failed:', error);
      
      // Return fallback processing
      return this.createFallbackProcessing(query, context, Date.now() - startTime, queryHash);
    }
  }

  // Core processing method
  private async performFullProcessing(
    query: string,
    context?: QueryContext,
    options: Required<NLPProcessingOptions> = {} as Required<NLPProcessingOptions>
  ): Promise<ProcessedQuery> {
    // Step 1: Normalize and clean query
    const normalized = this.normalizeQuery(query);

    // Step 2: Detect language
    const language = await this.detectLanguage(normalized);

    // Step 3: Spell correction
    let corrections: SpellCorrection[] = [];
    let correctedQuery = normalized;
    if (options.includeSpellCorrection) {
      corrections = await this.correctSpelling(normalized);
      if (corrections.length > 0 && corrections[0].confidence > 0.7) {
        correctedQuery = corrections[0].corrected;
      }
    }

    // Step 4: Intent classification
    const intentResult = await this.intentClassifier.classifyIntent(correctedQuery, context);

    // Step 5: Entity extraction
    let entities: NamedEntity[] = [];
    if (options.includeEntities) {
      entities = await this.entityExtractor.extractEntities(correctedQuery, {
        confidenceThreshold: 0.4,
        includeTechnicalTerms: true,
        includeAbbreviations: true
      });
    }

    // Step 6: Query expansion
    let expansion: QueryExpansion = {
      synonyms: [],
      relatedTerms: [],
      conceptualTerms: [],
      alternativePhrasings: [],
      technicalVariations: [],
      confidence: 0
    };
    
    if (options.includeExpansion) {
      expansion = await this.expandQuery(correctedQuery);
    }

    // Step 7: Determine search strategy
    const searchStrategy = this.determineSearchStrategy(intentResult.intent, entities, expansion);

    // Step 8: Calculate overall confidence
    const confidence = await this.calculateOverallConfidence({
      intentConfidence: intentResult.confidence,
      entityConfidence: entities.length > 0 ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length : 0.5,
      expansionConfidence: expansion.confidence,
      correctionImpact: corrections.length
    });

    // Step 9: Parse context and resolve references if available
    const processedContext = context || await this.parseContext(correctedQuery, []);

    return {
      original: query,
      normalized: correctedQuery,
      intent: intentResult.intent,
      entities,
      expansion,
      confidence,
      language,
      corrections,
      context: processedContext,
      searchStrategy,
      processingTimeMs: 0, // Will be set by caller
      cached: false,
      queryHash: ''  // Will be set by caller
    };
  }

  // Intent classification
  async classifyIntent(query: string): Promise<QueryIntent> {
    const result = await this.intentClassifier.classifyIntent(query);
    return result.intent;
  }

  // Entity extraction
  async extractEntities(query: string): Promise<NamedEntity[]> {
    return this.entityExtractor.extractEntities(query);
  }

  // Query expansion
  async expandQuery(query: string): Promise<QueryExpansion> {
    try {
      // Get synonyms using LLM
      const synonyms = await this.llmService.expandWithSynonyms(query);
      
      // Get related queries and extract terms
      const relatedQueries = await this.llmService.generateRelatedQueries(query);
      const relatedTerms = relatedQueries.map(q => q.query);
      
      // Generate conceptual terms using stemming and word analysis
      const conceptualTerms = this.generateConceptualTerms(query);
      
      // Generate alternative phrasings
      const alternativePhrasings = await this.generateAlternativePhrasings(query);
      
      // Generate technical variations
      const technicalVariations = this.generateTechnicalVariations(query);

      const expansion: QueryExpansion = {
        synonyms: synonyms.slice(0, 5),
        relatedTerms: relatedTerms.slice(0, 5),
        conceptualTerms: conceptualTerms.slice(0, 5),
        alternativePhrasings: alternativePhrasings.slice(0, 3),
        technicalVariations: technicalVariations.slice(0, 5),
        confidence: this.calculateExpansionConfidence(synonyms, relatedTerms, conceptualTerms)
      };

      return expansion;
    } catch (error) {
      console.error('Query expansion failed:', error);
      return {
        synonyms: [],
        relatedTerms: [],
        conceptualTerms: [],
        alternativePhrasings: [],
        technicalVariations: [],
        confidence: 0
      };
    }
  }

  // Language detection
  async detectLanguage(query: string): Promise<string> {
    try {
      // Use franc for fast language detection
      const detected = franc(query);
      
      // Map franc codes to ISO codes
      const langMap: Record<string, string> = {
        'eng': 'en',
        'spa': 'es',
        'fra': 'fr',
        'deu': 'de',
        'jpn': 'ja',
        'zho': 'zh'
      };

      return langMap[detected] || 'en';
    } catch (error) {
      console.warn('Language detection failed:', error);
      return 'en'; // Default to English
    }
  }

  // Spell correction
  async correctSpelling(query: string): Promise<SpellCorrection[]> {
    try {
      const corrections: SpellCorrection[] = [];
      
      // Use LLM for context-aware spell correction
      const prompt = `Check for spelling errors in this technical query and suggest corrections. 
      Preserve technical terms and programming languages. Return JSON:
      [{"original": "word", "corrected": "word", "confidence": 0.9, "suggestions": ["alt1", "alt2"]}]
      
      Query: "${query}"`;
      
      const response = await this.llmService.generateCompletion(
        prompt,
        'You are an expert at correcting spelling in technical queries while preserving technical terminology.',
        'openai',
        0.1
      );

      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        corrections.push(...parsed);
      }

      return corrections;
    } catch (error) {
      console.warn('Spell correction failed:', error);
      return [];
    }
  }

  // Context parsing
  async parseContext(query: string, history: string[]): Promise<QueryContext> {
    return {
      previousQueries: history,
      sessionId: require('crypto').randomUUID(),
      timeContext: new Date(),
      conversationTurn: history.length,
      userPreferences: {},
      activeProjects: []
    };
  }

  // Reference resolution
  async resolveReferences(query: string, context: QueryContext): Promise<string> {
    // Simple reference resolution - in production would be more sophisticated
    let resolved = query;
    
    // Replace pronouns with context from previous queries
    if (context.previousQueries.length > 0 && (query.includes('it') || query.includes('that') || query.includes('this'))) {
      const lastQuery = context.previousQueries[context.previousQueries.length - 1];
      // Extract main subject from last query (simplified)
      const words = lastQuery.split(' ');
      const mainSubject = words.find(word => word.length > 3 && !['what', 'how', 'when', 'where', 'why'].includes(word.toLowerCase()));
      
      if (mainSubject) {
        resolved = resolved.replace(/\bit\b/gi, mainSubject);
        resolved = resolved.replace(/\bthat\b/gi, mainSubject);
        resolved = resolved.replace(/\bthis\b/gi, mainSubject);
      }
    }

    return resolved;
  }

  // Caching methods
  async getCachedProcessing(query: string): Promise<ProcessedQuery | null> {
    try {
      if (this.cacheService) {
        const cached = await this.cacheService.get(this.generateQueryHash(query));
        if (cached) {
          return cached;
        }
      }

      // Check database cache
      if (this.db) {
        const queryHash = this.generateQueryHash(query);
        const result = await this.db.query(`
          SELECT * FROM query_processing_cache 
          WHERE query_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'
          ORDER BY created_at DESC LIMIT 1
        `, [queryHash]);

        if (result.rows.length > 0) {
          const row = result.rows[0];
          
          // Update access count
          await this.db.query(`
            UPDATE query_processing_cache 
            SET accessed_count = accessed_count + 1, last_accessed_at = NOW()
            WHERE id = $1
          `, [row.id]);

          return {
            original: row.original_query,
            normalized: row.processed_query.normalized || row.original_query,
            intent: row.intent as QueryIntent,
            entities: row.entities || [],
            expansion: row.expansions || { synonyms: [], relatedTerms: [], conceptualTerms: [], alternativePhrasings: [], technicalVariations: [], confidence: 0 },
            confidence: row.confidence || 0.5,
            language: row.language || 'en',
            corrections: [],
            context: this.parseContext(row.original_query, []),
            searchStrategy: 'hybrid' as SearchStrategy,
            processingTimeMs: row.processing_time_ms || 0,
            cached: true,
            queryHash: row.query_hash
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get cached processing:', error);
      return null;
    }
  }

  async cacheProcessedQuery(query: string, processed: ProcessedQuery): Promise<void> {
    try {
      // Cache in memory cache service
      if (this.cacheService) {
        await this.cacheService.set(processed.queryHash, processed, this.cacheTimeout);
      }

      // Cache in database
      if (this.db) {
        await this.db.query(`
          INSERT INTO query_processing_cache (
            query_hash, original_query, processed_query, intent, entities, expansions, 
            language, confidence, processing_time_ms, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (query_hash) 
          DO UPDATE SET 
            processed_query = $3,
            intent = $4,
            entities = $5,
            expansions = $6,
            confidence = $8,
            processing_time_ms = $9,
            accessed_count = query_processing_cache.accessed_count + 1,
            last_accessed_at = NOW()
        `, [
          processed.queryHash,
          processed.original,
          JSON.stringify({ normalized: processed.normalized }),
          processed.intent,
          JSON.stringify(processed.entities),
          JSON.stringify(processed.expansion),
          processed.language,
          processed.confidence,
          processed.processingTimeMs
        ]);
      }
    } catch (error) {
      console.error('Failed to cache processed query:', error);
    }
  }

  // Utility methods
  private normalizeQuery(query: string): string {
    return query
      .trim()
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .replace(/[^\w\s\-_.@]/g, ' ')  // Remove special chars except common technical ones
      .toLowerCase();
  }

  private determineSearchStrategy(
    intent: QueryIntent, 
    entities: NamedEntity[], 
    expansion: QueryExpansion
  ): SearchStrategy {
    // Determine best search strategy based on query characteristics
    if (intent === 'definition' || intent === 'question') {
      return 'semantic';
    }
    
    if (intent === 'troubleshoot' || intent === 'tutorial') {
      return 'hybrid';
    }
    
    if (entities.some(e => e.type === 'technology' || e.type === 'programming_language')) {
      return 'structured';
    }
    
    if (expansion.synonyms.length > 0 || expansion.relatedTerms.length > 0) {
      return 'hybrid';
    }
    
    return 'keyword';
  }

  private async calculateOverallConfidence(params: {
    intentConfidence: number;
    entityConfidence: number;
    expansionConfidence: number;
    correctionImpact: number;
  }): Promise<number> {
    const weights = {
      intent: 0.35,
      entities: 0.25,
      expansion: 0.25,
      corrections: 0.15
    };

    let confidence = 0;
    confidence += params.intentConfidence * weights.intent;
    confidence += params.entityConfidence * weights.entities;
    confidence += params.expansionConfidence * weights.expansion;
    
    // Correction impact (more corrections = lower confidence)
    const correctionConfidence = Math.max(0, 1 - (params.correctionImpact * 0.1));
    confidence += correctionConfidence * weights.corrections;

    return Math.min(1, Math.max(0, confidence));
  }

  private generateConceptualTerms(query: string): string[] {
    const tokenizer = new natural.WordTokenizer();
    const words = tokenizer.tokenize(query.toLowerCase()) || [];
    const stems = words.map(word => this.stemmer.stem(word));
    
    // Generate related conceptual terms based on stems
    const conceptualTerms: string[] = [];
    
    stems.forEach(stem => {
      // Add plural/singular variations
      conceptualTerms.push(stem + 's');
      conceptualTerms.push(stem + 'ing');
      conceptualTerms.push(stem + 'ed');
    });

    return [...new Set(conceptualTerms)]; // Remove duplicates
  }

  private async generateAlternativePhrasings(query: string): Promise<string[]> {
    try {
      const prompt = `Generate 3 alternative ways to phrase this query: "${query}"`;
      const response = await this.llmService.generateCompletion(prompt, undefined, 'openai', 0.4);
      
      // Parse response and extract alternatives
      const lines = response.content.split('\n').filter(line => line.trim().length > 0);
      return lines.slice(0, 3).map(line => line.replace(/^\d+\.?\s*/, '').trim());
    } catch (error) {
      return [];
    }
  }

  private generateTechnicalVariations(query: string): string[] {
    const variations: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Common technical term variations
    const technicalMappings = new Map<string, string[]>([
      ['javascript', ['js', 'ecmascript', 'es6', 'es2015']],
      ['typescript', ['ts']],
      ['python', ['py']],
      ['database', ['db', 'data store', 'datastore']],
      ['api', ['rest api', 'web api', 'service']],
      ['user interface', ['ui', 'frontend', 'client']],
      ['continuous integration', ['ci', 'build automation']],
      ['continuous deployment', ['cd', 'deployment automation']]
    ]);

    for (const [term, variants] of technicalMappings.entries()) {
      if (lowerQuery.includes(term)) {
        variations.push(...variants);
      }
    }

    return variations;
  }

  private calculateExpansionConfidence(synonyms: string[], relatedTerms: string[], conceptualTerms: string[]): number {
    const totalTerms = synonyms.length + relatedTerms.length + conceptualTerms.length;
    
    if (totalTerms === 0) return 0;
    if (totalTerms >= 10) return 0.9;
    if (totalTerms >= 5) return 0.7;
    if (totalTerms >= 2) return 0.5;
    
    return 0.3;
  }

  private generateQueryHash(query: string, context?: QueryContext): string {
    const content = query.toLowerCase().trim() + (context?.sessionId || '');
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  private createTimeoutPromise(timeout: number): Promise<ProcessedQuery> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query processing timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  private createFallbackProcessing(
    query: string, 
    context?: QueryContext,
    processingTime: number = 0,
    queryHash: string = ''
  ): ProcessedQuery {
    return {
      original: query,
      normalized: this.normalizeQuery(query),
      intent: 'search', // Default intent
      entities: [],
      expansion: {
        synonyms: [],
        relatedTerms: [],
        conceptualTerms: [],
        alternativePhrasings: [],
        technicalVariations: [],
        confidence: 0
      },
      confidence: 0.3, // Low confidence fallback
      language: 'en',
      corrections: [],
      context: context || {
        previousQueries: [],
        sessionId: require('crypto').randomUUID(),
        timeContext: new Date(),
        conversationTurn: 0,
        userPreferences: {},
        activeProjects: []
      },
      searchStrategy: 'hybrid',
      processingTimeMs: processingTime,
      cached: false,
      queryHash: queryHash || this.generateQueryHash(query, context)
    };
  }

  // Health check and metrics
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, { status: 'healthy' | 'error'; error?: string }>;
    metrics: {
      cacheHitRate: number;
      averageProcessingTime: number;
      totalProcessedQueries: number;
    };
  }> {
    const components: Record<string, { status: 'healthy' | 'error'; error?: string }> = {};

    // Check LLM service
    try {
      const llmStatus = await this.llmService.healthCheck();
      components.llm = llmStatus.some(s => s.status === 'healthy') ? 
        { status: 'healthy' } : 
        { status: 'error', error: 'No healthy LLM providers' };
    } catch (error) {
      components.llm = { status: 'error', error: 'LLM health check failed' };
    }

    // Check database
    try {
      if (this.db) {
        await this.db.query('SELECT 1');
        components.database = { status: 'healthy' };
      } else {
        components.database = { status: 'error', error: 'Database not configured' };
      }
    } catch (error) {
      components.database = { status: 'error', error: 'Database connection failed' };
    }

    // Get metrics
    let metrics = {
      cacheHitRate: 0,
      averageProcessingTime: 0,
      totalProcessedQueries: 0
    };

    try {
      if (this.db) {
        const result = await this.db.query(`
          SELECT 
            COUNT(*) as total,
            AVG(processing_time_ms) as avg_time,
            SUM(accessed_count) as cache_hits
          FROM query_processing_cache
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `);
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          metrics = {
            totalProcessedQueries: parseInt(row.total) || 0,
            averageProcessingTime: parseFloat(row.avg_time) || 0,
            cacheHitRate: parseInt(row.cache_hits) > 0 ? 
              parseInt(row.cache_hits) / parseInt(row.total) : 0
          };
        }
      }
    } catch (error) {
      console.warn('Failed to get metrics for health check:', error);
    }

    // Determine overall status
    const hasErrors = Object.values(components).some(c => c.status === 'error');
    const status = hasErrors ? 'degraded' : 'healthy';

    return { status, components, metrics };
  }

  // Performance metrics
  async getPerformanceMetrics(): Promise<{
    totalQueries: number;
    averageProcessingTime: number;
    cacheHitRate: number;
    intentAccuracy: number;
    languageDistribution: Record<string, number>;
  }> {
    if (!this.db) {
      return {
        totalQueries: 0,
        averageProcessingTime: 0,
        cacheHitRate: 0,
        intentAccuracy: 0,
        languageDistribution: {}
      };
    }

    try {
      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total_queries,
          AVG(processing_time_ms) as avg_processing_time,
          AVG(accessed_count::float / GREATEST(1, accessed_count)) as cache_hit_rate,
          language,
          COUNT(*) as lang_count
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY language
      `);

      let totalQueries = 0;
      let avgProcessingTime = 0;
      let cacheHitRate = 0;
      const languageDistribution: Record<string, number> = {};

      result.rows.forEach(row => {
        totalQueries += parseInt(row.total_queries);
        avgProcessingTime += parseFloat(row.avg_processing_time) * parseInt(row.lang_count);
        cacheHitRate += parseFloat(row.cache_hit_rate) * parseInt(row.lang_count);
        languageDistribution[row.language] = parseInt(row.lang_count);
      });

      if (totalQueries > 0) {
        avgProcessingTime /= totalQueries;
        cacheHitRate /= totalQueries;
      }

      // Get intent accuracy from classifier
      const intentMetrics = await this.intentClassifier.getClassificationMetrics();

      return {
        totalQueries,
        averageProcessingTime: Math.round(avgProcessingTime),
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        intentAccuracy: Math.round(intentMetrics.accuracyRate * 100) / 100,
        languageDistribution
      };
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return {
        totalQueries: 0,
        averageProcessingTime: 0,
        cacheHitRate: 0,
        intentAccuracy: 0,
        languageDistribution: {}
      };
    }
  }
}