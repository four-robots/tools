import { DatabaseManager } from '../../../utils/database.js';
import {
  QueryProcessingCache,
  ProcessedQuery,
  QueryFeedback,
  NLPModel
} from '../../../shared/types/nlp.js';

export interface CacheQueryOptions {
  limit?: number;
  offset?: number;
  minConfidence?: number;
  languages?: string[];
  intents?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface CacheStatistics {
  totalQueries: number;
  uniqueQueries: number;
  averageProcessingTime: number;
  averageConfidence: number;
  cacheHitRate: number;
  languageDistribution: Record<string, number>;
  intentDistribution: Record<string, number>;
  topQueries: Array<{
    query: string;
    count: number;
    avgConfidence: number;
  }>;
}

export class NLPCacheRepository {
  constructor(private db: DatabaseManager) {}

  // Cache management methods
  async getCachedQuery(queryHash: string): Promise<QueryProcessingCache | null> {
    try {
      const result = await this.db.query(`
        SELECT * FROM query_processing_cache 
        WHERE query_hash = $1
        ORDER BY created_at DESC 
        LIMIT 1
      `, [queryHash]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        queryHash: row.query_hash,
        originalQuery: row.original_query,
        processedQuery: row.processed_query,
        intent: row.intent,
        entities: row.entities,
        expansions: row.expansions,
        language: row.language,
        confidence: row.confidence,
        processingTimeMs: row.processing_time_ms,
        createdAt: row.created_at,
        accessedCount: row.accessed_count,
        lastAccessedAt: row.last_accessed_at
      };
    } catch (error) {
      console.error('Failed to get cached query:', error);
      return null;
    }
  }

  async cacheQuery(
    queryHash: string,
    originalQuery: string,
    processedQuery: Record<string, any>,
    intent?: string,
    entities?: any[],
    expansions?: any[],
    language?: string,
    confidence?: number,
    processingTimeMs?: number
  ): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO query_processing_cache (
          query_hash, original_query, processed_query, intent, entities, 
          expansions, language, confidence, processing_time_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (query_hash) 
        DO UPDATE SET 
          processed_query = $3,
          intent = $4,
          entities = $5,
          expansions = $6,
          language = $7,
          confidence = $8,
          processing_time_ms = $9,
          accessed_count = query_processing_cache.accessed_count + 1,
          last_accessed_at = NOW()
      `, [
        queryHash,
        originalQuery,
        JSON.stringify(processedQuery),
        intent,
        JSON.stringify(entities || []),
        JSON.stringify(expansions || []),
        language,
        confidence,
        processingTimeMs
      ]);
    } catch (error) {
      console.error('Failed to cache query:', error);
      throw error;
    }
  }

  async updateAccessCount(queryHash: string): Promise<void> {
    try {
      await this.db.query(`
        UPDATE query_processing_cache 
        SET accessed_count = accessed_count + 1, last_accessed_at = NOW()
        WHERE query_hash = $1
      `, [queryHash]);
    } catch (error) {
      console.error('Failed to update access count:', error);
    }
  }

  async searchCachedQueries(options: CacheQueryOptions = {}): Promise<QueryProcessingCache[]> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (options.minConfidence !== undefined) {
        conditions.push(`confidence >= $${paramIndex}`);
        params.push(options.minConfidence);
        paramIndex++;
      }

      if (options.languages && options.languages.length > 0) {
        conditions.push(`language = ANY($${paramIndex})`);
        params.push(options.languages);
        paramIndex++;
      }

      if (options.intents && options.intents.length > 0) {
        conditions.push(`intent = ANY($${paramIndex})`);
        params.push(options.intents);
        paramIndex++;
      }

      if (options.createdAfter) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(options.createdAfter);
        paramIndex++;
      }

      if (options.createdBefore) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(options.createdBefore);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
      const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

      const query = `
        SELECT * FROM query_processing_cache
        ${whereClause}
        ORDER BY created_at DESC
        ${limitClause} ${offsetClause}
      `;

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        queryHash: row.query_hash,
        originalQuery: row.original_query,
        processedQuery: row.processed_query,
        intent: row.intent,
        entities: row.entities,
        expansions: row.expansions,
        language: row.language,
        confidence: row.confidence,
        processingTimeMs: row.processing_time_ms,
        createdAt: row.created_at,
        accessedCount: row.accessed_count,
        lastAccessedAt: row.last_accessed_at
      }));
    } catch (error) {
      console.error('Failed to search cached queries:', error);
      return [];
    }
  }

  async deleteCachedQuery(queryHash: string): Promise<void> {
    try {
      await this.db.query(`
        DELETE FROM query_processing_cache WHERE query_hash = $1
      `, [queryHash]);
    } catch (error) {
      console.error('Failed to delete cached query:', error);
      throw error;
    }
  }

  async cleanupExpiredCache(maxAgeHours: number = 24): Promise<number> {
    try {
      const result = await this.db.query(`
        DELETE FROM query_processing_cache 
        WHERE created_at < NOW() - INTERVAL '${maxAgeHours} hours'
        AND accessed_count <= 1
      `);

      return result.rowCount || 0;
    } catch (error) {
      console.error('Failed to cleanup expired cache:', error);
      return 0;
    }
  }

  // Feedback management methods
  async storeFeedback(
    queryHash: string,
    userId?: string,
    feedbackType: string = 'helpful',
    feedbackData: Record<string, any> = {}
  ): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO query_feedback (query_hash, user_id, feedback_type, feedback_data, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [queryHash, userId, feedbackType, JSON.stringify(feedbackData)]);
    } catch (error) {
      console.error('Failed to store feedback:', error);
      throw error;
    }
  }

  async getFeedbackForQuery(queryHash: string): Promise<QueryFeedback[]> {
    try {
      const result = await this.db.query(`
        SELECT * FROM query_feedback 
        WHERE query_hash = $1
        ORDER BY created_at DESC
      `, [queryHash]);

      return result.rows.map(row => ({
        id: row.id,
        queryHash: row.query_hash,
        userId: row.user_id,
        feedbackType: row.feedback_type,
        feedbackData: row.feedback_data,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Failed to get feedback for query:', error);
      return [];
    }
  }

  async getFeedbackSummary(timeframeHours: number = 168): Promise<{
    totalFeedback: number;
    feedbackTypes: Record<string, number>;
    averageSentiment: number;
    topIssues: Array<{ issue: string; count: number }>;
  }> {
    try {
      // Get total feedback and distribution
      const distributionResult = await this.db.query(`
        SELECT feedback_type, COUNT(*) as count
        FROM query_feedback 
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
        GROUP BY feedback_type
      `);

      const feedbackTypes: Record<string, number> = {};
      let totalFeedback = 0;

      distributionResult.rows.forEach(row => {
        feedbackTypes[row.feedback_type] = parseInt(row.count);
        totalFeedback += parseInt(row.count);
      });

      // Calculate average sentiment (helpful = 1, not_helpful = 0, wrong_* = -1)
      const sentimentResult = await this.db.query(`
        SELECT 
          SUM(CASE 
            WHEN feedback_type = 'helpful' THEN 1
            WHEN feedback_type = 'not_helpful' THEN 0
            ELSE -1
          END)::float / COUNT(*) as avg_sentiment
        FROM query_feedback 
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
      `);

      const averageSentiment = parseFloat(sentimentResult.rows[0]?.avg_sentiment || '0');

      // Get top issues from feedback data
      const issuesResult = await this.db.query(`
        SELECT 
          feedback_data->>'issue' as issue,
          COUNT(*) as count
        FROM query_feedback 
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
          AND feedback_data->>'issue' IS NOT NULL
        GROUP BY feedback_data->>'issue'
        ORDER BY count DESC
        LIMIT 10
      `);

      const topIssues = issuesResult.rows.map(row => ({
        issue: row.issue,
        count: parseInt(row.count)
      }));

      return {
        totalFeedback,
        feedbackTypes,
        averageSentiment,
        topIssues
      };
    } catch (error) {
      console.error('Failed to get feedback summary:', error);
      return {
        totalFeedback: 0,
        feedbackTypes: {},
        averageSentiment: 0,
        topIssues: []
      };
    }
  }

  // Statistics and analytics
  async getCacheStatistics(timeframeHours: number = 168): Promise<CacheStatistics> {
    try {
      // Get basic statistics
      const basicStats = await this.db.query(`
        SELECT 
          COUNT(*) as total_queries,
          COUNT(DISTINCT query_hash) as unique_queries,
          AVG(processing_time_ms) as avg_processing_time,
          AVG(confidence) as avg_confidence,
          AVG(accessed_count::float) as avg_access_count
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
      `);

      const stats = basicStats.rows[0];
      const totalQueries = parseInt(stats.total_queries);
      const uniqueQueries = parseInt(stats.unique_queries);
      const averageProcessingTime = Math.round(parseFloat(stats.avg_processing_time || '0'));
      const averageConfidence = Math.round(parseFloat(stats.avg_confidence || '0') * 100) / 100;
      const cacheHitRate = parseFloat(stats.avg_access_count || '1') > 1 ? 
        Math.round((parseFloat(stats.avg_access_count) - 1) * 100) / 100 : 0;

      // Get language distribution
      const languageResult = await this.db.query(`
        SELECT language, COUNT(*) as count
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
          AND language IS NOT NULL
        GROUP BY language
        ORDER BY count DESC
      `);

      const languageDistribution: Record<string, number> = {};
      languageResult.rows.forEach(row => {
        languageDistribution[row.language] = parseInt(row.count);
      });

      // Get intent distribution
      const intentResult = await this.db.query(`
        SELECT intent, COUNT(*) as count
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
          AND intent IS NOT NULL
        GROUP BY intent
        ORDER BY count DESC
      `);

      const intentDistribution: Record<string, number> = {};
      intentResult.rows.forEach(row => {
        intentDistribution[row.intent] = parseInt(row.count);
      });

      // Get top queries
      const topQueriesResult = await this.db.query(`
        SELECT 
          original_query,
          accessed_count as count,
          AVG(confidence) as avg_confidence
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
        GROUP BY original_query, accessed_count
        ORDER BY accessed_count DESC, avg_confidence DESC
        LIMIT 10
      `);

      const topQueries = topQueriesResult.rows.map(row => ({
        query: row.original_query,
        count: parseInt(row.count),
        avgConfidence: Math.round(parseFloat(row.avg_confidence) * 100) / 100
      }));

      return {
        totalQueries,
        uniqueQueries,
        averageProcessingTime,
        averageConfidence,
        cacheHitRate,
        languageDistribution,
        intentDistribution,
        topQueries
      };
    } catch (error) {
      console.error('Failed to get cache statistics:', error);
      return {
        totalQueries: 0,
        uniqueQueries: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        cacheHitRate: 0,
        languageDistribution: {},
        intentDistribution: {},
        topQueries: []
      };
    }
  }

  // Model management methods
  async storeNLPModel(
    modelName: string,
    modelType: string,
    version: string,
    configuration: Record<string, any>,
    performanceMetrics: Record<string, any> = {},
    isActive: boolean = false
  ): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO nlp_models (
          model_name, model_type, version, configuration, 
          performance_metrics, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `, [
        modelName,
        modelType,
        version,
        JSON.stringify(configuration),
        JSON.stringify(performanceMetrics),
        isActive
      ]);
    } catch (error) {
      console.error('Failed to store NLP model:', error);
      throw error;
    }
  }

  async getActiveNLPModels(): Promise<NLPModel[]> {
    try {
      const result = await this.db.query(`
        SELECT * FROM nlp_models
        WHERE is_active = true
        ORDER BY model_type, created_at DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        modelName: row.model_name,
        modelType: row.model_type,
        version: row.version,
        configuration: row.configuration,
        performanceMetrics: row.performance_metrics,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Failed to get active NLP models:', error);
      return [];
    }
  }

  async updateModelPerformanceMetrics(
    modelId: string,
    metrics: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.query(`
        UPDATE nlp_models 
        SET performance_metrics = $2, updated_at = NOW()
        WHERE id = $1
      `, [modelId, JSON.stringify(metrics)]);
    } catch (error) {
      console.error('Failed to update model performance metrics:', error);
      throw error;
    }
  }

  async setActiveModel(modelId: string, modelType: string): Promise<void> {
    try {
      // First deactivate all models of this type
      await this.db.query(`
        UPDATE nlp_models 
        SET is_active = false, updated_at = NOW()
        WHERE model_type = $1
      `, [modelType]);

      // Then activate the specified model
      await this.db.query(`
        UPDATE nlp_models 
        SET is_active = true, updated_at = NOW()
        WHERE id = $1 AND model_type = $2
      `, [modelId, modelType]);
    } catch (error) {
      console.error('Failed to set active model:', error);
      throw error;
    }
  }

  // Query optimization analysis
  async analyzeQueryPatterns(timeframeHours: number = 168): Promise<{
    commonFailurePatterns: Array<{ pattern: string; count: number; avgConfidence: number }>;
    improvementOpportunities: Array<{ category: string; suggestion: string; impact: number }>;
    performanceBottlenecks: Array<{ stage: string; avgTime: number; count: number }>;
  }> {
    try {
      // Find common patterns in low-confidence queries
      const failurePatternsResult = await this.db.query(`
        SELECT 
          CASE 
            WHEN confidence < 0.3 THEN 'very_low_confidence'
            WHEN confidence < 0.5 THEN 'low_confidence'
            WHEN processing_time_ms > 2000 THEN 'slow_processing'
            WHEN array_length(entities, 1) IS NULL THEN 'no_entities_found'
            ELSE 'other'
          END as pattern,
          COUNT(*) as count,
          AVG(confidence) as avg_confidence
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
        GROUP BY 1
        ORDER BY count DESC
      `);

      const commonFailurePatterns = failurePatternsResult.rows.map(row => ({
        pattern: row.pattern,
        count: parseInt(row.count),
        avgConfidence: Math.round(parseFloat(row.avg_confidence) * 100) / 100
      }));

      // Identify improvement opportunities
      const improvementOpportunities = [
        {
          category: 'Intent Classification',
          suggestion: 'Improve training data for low-confidence intents',
          impact: commonFailurePatterns.find(p => p.pattern === 'low_confidence')?.count || 0
        },
        {
          category: 'Entity Extraction',
          suggestion: 'Enhance technical term recognition',
          impact: commonFailurePatterns.find(p => p.pattern === 'no_entities_found')?.count || 0
        },
        {
          category: 'Performance',
          suggestion: 'Optimize processing pipeline',
          impact: commonFailurePatterns.find(p => p.pattern === 'slow_processing')?.count || 0
        }
      ];

      // Analyze performance bottlenecks
      const performanceResult = await this.db.query(`
        SELECT 
          CASE 
            WHEN processing_time_ms < 500 THEN 'fast'
            WHEN processing_time_ms < 1000 THEN 'medium'
            WHEN processing_time_ms < 2000 THEN 'slow'
            ELSE 'very_slow'
          END as stage,
          AVG(processing_time_ms) as avg_time,
          COUNT(*) as count
        FROM query_processing_cache
        WHERE created_at > NOW() - INTERVAL '${timeframeHours} hours'
          AND processing_time_ms IS NOT NULL
        GROUP BY 1
        ORDER BY avg_time DESC
      `);

      const performanceBottlenecks = performanceResult.rows.map(row => ({
        stage: row.stage,
        avgTime: Math.round(parseFloat(row.avg_time)),
        count: parseInt(row.count)
      }));

      return {
        commonFailurePatterns,
        improvementOpportunities,
        performanceBottlenecks
      };
    } catch (error) {
      console.error('Failed to analyze query patterns:', error);
      return {
        commonFailurePatterns: [],
        improvementOpportunities: [],
        performanceBottlenecks: []
      };
    }
  }
}