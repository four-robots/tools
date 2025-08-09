import { NLPQueryProcessor } from '../nlp-query-processor.js';
import { LLMService } from '../llm-service.js';
import { IntentClassifier } from '../intent-classifier.js';
import { EntityExtractor } from '../entity-extractor.js';
import { DatabaseManager } from '../../../utils/database.js';
import {
  ProcessedQuery,
  QueryContext,
  LLMConfig,
  QueryIntent,
  EntityType
} from '../../../shared/types/nlp.js';

// Mock dependencies
jest.mock('../llm-service.js');
jest.mock('../intent-classifier.js');
jest.mock('../entity-extractor.js');
jest.mock('../../../utils/database.js');

describe('NLPQueryProcessor', () => {
  let processor: NLPQueryProcessor;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockIntentClassifier: jest.Mocked<IntentClassifier>;
  let mockEntityExtractor: jest.Mocked<EntityExtractor>;

  const mockLLMConfigs: LLMConfig[] = [
    {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'test-key',
      temperature: 0.1,
      maxTokens: 1000,
      timeout: 30000,
      retryAttempts: 3
    }
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock database
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    // Setup mock services
    mockLLMService = new LLMService(mockDb, mockLLMConfigs) as jest.Mocked<LLMService>;
    mockIntentClassifier = new IntentClassifier(mockLLMService, mockDb) as jest.Mocked<IntentClassifier>;
    mockEntityExtractor = new EntityExtractor(mockLLMService, mockDb) as jest.Mocked<EntityExtractor>;

    // Create processor
    processor = new NLPQueryProcessor(mockDb, undefined, mockLLMConfigs);
  });

  describe('Query Processing', () => {
    it('should process a simple search query successfully', async () => {
      // Setup mocks
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        intent: 'search',
        confidence: 0.85,
        alternatives: [],
        reasoning: 'Contains search-related terms',
        features: {}
      });

      mockEntityExtractor.extractEntities.mockResolvedValue([
        {
          text: 'JavaScript',
          type: 'programming_language',
          confidence: 0.9,
          startIndex: 0,
          endIndex: 10,
          metadata: { source: 'regex' }
        }
      ]);

      mockLLMService.expandWithSynonyms.mockResolvedValue(['JS', 'ECMAScript']);
      mockLLMService.generateRelatedQueries.mockResolvedValue([
        {
          query: 'JavaScript tutorial',
          intent: 'tutorial',
          confidence: 0.8,
          similarity: 0.7,
          reasoning: 'Related learning query'
        }
      ]);

      // Test query processing
      const result = await processor.processQuery('JavaScript programming', undefined, {
        maxProcessingTime: 10000
      });

      // Verify results
      expect(result).toBeDefined();
      expect(result.original).toBe('JavaScript programming');
      expect(result.intent).toBe('search');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].text).toBe('JavaScript');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.language).toBe('en');
      expect(result.searchStrategy).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle question queries correctly', async () => {
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        intent: 'question',
        confidence: 0.9,
        alternatives: [{ intent: 'definition', confidence: 0.3 }],
        reasoning: 'Contains question words',
        features: { hasQuestionWords: true }
      });

      mockEntityExtractor.extractEntities.mockResolvedValue([
        {
          text: 'React',
          type: 'framework',
          confidence: 0.95,
          startIndex: 8,
          endIndex: 13,
          metadata: { source: 'llm' }
        }
      ]);

      const result = await processor.processQuery('What is React framework?');

      expect(result.intent).toBe('question');
      expect(result.entities[0].type).toBe('framework');
      expect(result.searchStrategy).toBe('semantic');
    });

    it('should handle tutorial queries', async () => {
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        intent: 'tutorial',
        confidence: 0.88,
        alternatives: [],
        reasoning: 'Contains how-to keywords',
        features: { hasHowToWords: true }
      });

      mockEntityExtractor.extractEntities.mockResolvedValue([
        {
          text: 'Docker',
          type: 'technology',
          confidence: 0.9,
          startIndex: 14,
          endIndex: 20,
          metadata: { source: 'regex' }
        }
      ]);

      const result = await processor.processQuery('How to deploy Docker containers?');

      expect(result.intent).toBe('tutorial');
      expect(result.searchStrategy).toBe('hybrid');
      expect(result.entities[0].text).toBe('Docker');
    });

    it('should handle troubleshooting queries', async () => {
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        intent: 'troubleshoot',
        confidence: 0.92,
        alternatives: [],
        reasoning: 'Contains troubleshooting keywords',
        features: { hasTroubleshootingWords: true }
      });

      mockEntityExtractor.extractEntities.mockResolvedValue([
        {
          text: 'database',
          type: 'concept',
          confidence: 0.8,
          startIndex: 4,
          endIndex: 12,
          metadata: { source: 'compromise' }
        }
      ]);

      const result = await processor.processQuery('Fix database connection error');

      expect(result.intent).toBe('troubleshoot');
      expect(result.searchStrategy).toBe('hybrid');
    });
  });

  describe('Language Detection', () => {
    it('should detect English queries', async () => {
      const language = await processor.detectLanguage('How to use React hooks?');
      expect(language).toBe('en');
    });

    it('should default to English for ambiguous text', async () => {
      const language = await processor.detectLanguage('xyz 123');
      expect(language).toBe('en');
    });
  });

  describe('Query Expansion', () => {
    it('should expand queries with synonyms and related terms', async () => {
      mockLLMService.expandWithSynonyms.mockResolvedValue([
        'JavaScript', 'JS', 'ECMAScript'
      ]);

      mockLLMService.generateRelatedQueries.mockResolvedValue([
        {
          query: 'Node.js development',
          intent: 'search',
          confidence: 0.8,
          similarity: 0.7,
          reasoning: 'Related JavaScript runtime'
        }
      ]);

      const expansion = await processor.expandQuery('JavaScript');

      expect(expansion.synonyms).toContain('JavaScript');
      expect(expansion.relatedTerms).toContain('Node.js development');
      expect(expansion.confidence).toBeGreaterThan(0);
    });

    it('should generate technical variations', async () => {
      mockLLMService.expandWithSynonyms.mockResolvedValue([]);
      mockLLMService.generateRelatedQueries.mockResolvedValue([]);

      const expansion = await processor.expandQuery('JavaScript API');

      expect(expansion.technicalVariations).toContain('js');
    });
  });

  describe('Spell Correction', () => {
    it('should identify and correct spelling errors', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            original: 'javscript',
            corrected: 'javascript',
            confidence: 0.9,
            suggestions: ['javascript', 'java script']
          }
        ])
      });

      const corrections = await processor.correctSpelling('javscript programming');

      expect(corrections).toHaveLength(1);
      expect(corrections[0].original).toBe('javscript');
      expect(corrections[0].corrected).toBe('javascript');
      expect(corrections[0].confidence).toBe(0.9);
    });

    it('should preserve technical terms', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([]) // No corrections needed
      });

      const corrections = await processor.correctSpelling('React useState hook');

      expect(corrections).toHaveLength(0);
    });
  });

  describe('Context Handling', () => {
    it('should parse query context', async () => {
      const context = await processor.parseContext('current query', ['previous query']);

      expect(context.previousQueries).toContain('previous query');
      expect(context.conversationTurn).toBe(1);
      expect(context.timeContext).toBeInstanceOf(Date);
      expect(context.sessionId).toBeDefined();
    });

    it('should resolve simple references', async () => {
      const context: QueryContext = {
        previousQueries: ['React hooks documentation'],
        sessionId: 'test-session',
        timeContext: new Date(),
        conversationTurn: 1,
        userPreferences: {},
        activeProjects: []
      };

      const resolved = await processor.resolveReferences('How do I use it?', context);

      expect(resolved).toContain('hooks'); // Should replace 'it' with context
    });
  });

  describe('Caching', () => {
    it('should cache processed queries', async () => {
      const mockQuery = {
        original: 'test query',
        queryHash: 'hash123',
        intent: 'search' as QueryIntent,
        confidence: 0.8
      };

      // Mock database response for caching
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await processor.cacheProcessedQuery('test query', mockQuery as ProcessedQuery);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO query_processing_cache'),
        expect.arrayContaining(['hash123', 'test query'])
      );
    });

    it('should retrieve cached queries', async () => {
      const cachedData = {
        id: 'uuid',
        query_hash: 'hash123',
        original_query: 'test query',
        processed_query: { normalized: 'test query' },
        intent: 'search',
        entities: [],
        expansions: { synonyms: [], relatedTerms: [], conceptualTerms: [], alternativePhrasings: [], technicalVariations: [], confidence: 0 },
        language: 'en',
        confidence: 0.8,
        processing_time_ms: 500,
        created_at: new Date(),
        accessed_count: 1,
        last_accessed_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({ rows: [cachedData], rowCount: 1 });

      const cached = await processor.getCachedProcessing('test query');

      expect(cached).toBeDefined();
      expect(cached?.original).toBe('test query');
      expect(cached?.intent).toBe('search');
      expect(cached?.cached).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete processing within timeout', async () => {
      const startTime = Date.now();
      
      const result = await processor.processQuery('test query', undefined, {
        maxProcessingTime: 1000
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000);
      expect(result.processingTimeMs).toBeLessThan(1000);
    });

    it('should provide fallback processing on timeout', async () => {
      // Make the intent classifier take too long
      mockIntentClassifier.classifyIntent.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          intent: 'search',
          confidence: 0.5,
          alternatives: [],
          reasoning: 'delayed',
          features: {}
        }), 2000))
      );

      const result = await processor.processQuery('test query', undefined, {
        maxProcessingTime: 500
      });

      expect(result.intent).toBe('search');
      expect(result.confidence).toBeLessThan(0.5); // Fallback has lower confidence
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM service errors gracefully', async () => {
      mockLLMService.generateCompletion.mockRejectedValue(new Error('API Error'));
      mockIntentClassifier.classifyIntent.mockRejectedValue(new Error('Classification failed'));

      const result = await processor.processQuery('test query', undefined, {
        fallbackStrategy: 'rules'
      });

      // Should still return a result with fallback processing
      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.intent).toBe('search'); // Default fallback
    });

    it('should handle entity extraction failures', async () => {
      mockEntityExtractor.extractEntities.mockRejectedValue(new Error('Entity extraction failed'));

      const result = await processor.processQuery('test query');

      expect(result.entities).toHaveLength(0);
      expect(result).toBeDefined();
    });

    it('should handle database connection failures', async () => {
      mockDb.query.mockRejectedValue(new Error('Database connection failed'));

      const result = await processor.processQuery('test query');

      // Should still work without database caching
      expect(result).toBeDefined();
      expect(result.cached).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should perform comprehensive health check', async () => {
      mockLLMService.healthCheck.mockResolvedValue([
        { provider: 'openai', status: 'healthy' }
      ]);

      mockDb.query.mockResolvedValueOnce({
        rows: [{ total: 100, avg_time: 500, cache_hits: 50 }],
        rowCount: 1
      });

      const health = await processor.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.components.llm.status).toBe('healthy');
      expect(health.components.database.status).toBe('healthy');
      expect(health.metrics.totalProcessedQueries).toBe(100);
    });

    it('should report degraded status on component failures', async () => {
      mockLLMService.healthCheck.mockResolvedValue([
        { provider: 'openai', status: 'error', error: 'API key invalid' }
      ]);

      const health = await processor.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.components.llm.status).toBe('error');
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate comprehensive performance metrics', async () => {
      // Mock database response for metrics
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_queries: 1000,
          avg_processing_time: 450,
          cache_hit_rate: 0.65,
          language: 'en',
          lang_count: 900
        }, {
          total_queries: 100,
          avg_processing_time: 500,
          cache_hit_rate: 0.70,
          language: 'es',
          lang_count: 100
        }],
        rowCount: 2
      });

      mockIntentClassifier.getClassificationMetrics.mockResolvedValue({
        totalClassifications: 1000,
        accuracyRate: 0.85,
        averageConfidence: 0.78,
        intentDistribution: {
          search: 600,
          question: 200,
          tutorial: 150,
          troubleshoot: 50
        }
      });

      const metrics = await processor.getPerformanceMetrics();

      expect(metrics.totalQueries).toBe(1100); // 1000 + 100
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
      expect(metrics.intentAccuracy).toBe(0.85);
      expect(metrics.languageDistribution).toHaveProperty('en');
      expect(metrics.languageDistribution).toHaveProperty('es');
    });
  });

  describe('Integration', () => {
    it('should process complex queries end-to-end', async () => {
      // Setup complex mock responses
      mockIntentClassifier.classifyIntent.mockResolvedValue({
        intent: 'tutorial',
        confidence: 0.89,
        alternatives: [{ intent: 'question', confidence: 0.4 }],
        reasoning: 'Contains how-to keywords',
        features: { hasHowToWords: true, hasCodeTerms: true }
      });

      mockEntityExtractor.extractEntities.mockResolvedValue([
        {
          text: 'React',
          type: 'framework',
          confidence: 0.95,
          startIndex: 11,
          endIndex: 16,
          metadata: { source: 'regex' }
        },
        {
          text: 'TypeScript',
          type: 'programming_language', 
          confidence: 0.92,
          startIndex: 22,
          endIndex: 32,
          metadata: { source: 'llm' }
        }
      ]);

      mockLLMService.expandWithSynonyms.mockResolvedValue([
        'React.js', 'ReactJS'
      ]);

      mockLLMService.generateRelatedQueries.mockResolvedValue([
        {
          query: 'React hooks tutorial',
          intent: 'tutorial',
          confidence: 0.8,
          similarity: 0.85,
          reasoning: 'Related React concept'
        }
      ]);

      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([]) // No spelling corrections needed
      });

      const result = await processor.processQuery(
        'How to use React with TypeScript for modern web development?'
      );

      // Verify comprehensive processing
      expect(result.intent).toBe('tutorial');
      expect(result.entities).toHaveLength(2);
      expect(result.entities.find(e => e.text === 'React')).toBeDefined();
      expect(result.entities.find(e => e.text === 'TypeScript')).toBeDefined();
      expect(result.expansion.synonyms).toContain('React.js');
      expect(result.expansion.relatedTerms).toContain('React hooks tutorial');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.searchStrategy).toBe('hybrid');
      expect(result.language).toBe('en');
    });
  });
});