/**
 * Code Embeddings Service Tests
 * 
 * Comprehensive test suite for code embeddings and semantic search functionality.
 */

import { CodeEmbeddingsService } from '../code-embeddings-service.js';
import { EmbeddingModelManager } from '../embeddings/model-manager.js';
import { CodeChunkingService } from '../code-chunking-service.js';
import { DatabaseManager } from '../../../utils/database.js';
import {
  CodeSearchQuery,
  QueryType,
  SupportedLanguage,
  EmbeddingModelType,
  SemanticSearchResult,
  CodeChunk,
  CodeEmbedding
} from '../../../shared/types/codebase.js';

// Mock dependencies
jest.mock('../../../utils/database.js');
jest.mock('../embeddings/model-manager.js');
jest.mock('../code-chunking-service.js');

describe('CodeEmbeddingsService', () => {
  let service: CodeEmbeddingsService;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockChunkingService: jest.Mocked<CodeChunkingService>;
  let mockModelManager: jest.Mocked<EmbeddingModelManager>;

  const mockEmbeddingConfig = {
    defaultModel: 'codebert',
    maxConcurrentModels: 3,
    modelCacheTTL: 3600000,
    apiKeys: { huggingface: 'test-key' },
    memoryThreshold: 1000
  };

  const mockCodeChunk: CodeChunk = {
    id: 'chunk-123',
    fileId: 'file-456',
    repositoryId: 'repo-789',
    chunkType: 'function' as any,
    chunkIndex: 0,
    startLine: 1,
    endLine: 10,
    startColumn: 0,
    endColumn: 50,
    content: 'function calculateSum(a: number, b: number): number { return a + b; }',
    contentHash: 'hash123',
    language: SupportedLanguage.TYPESCRIPT,
    symbolName: 'calculateSum',
    symbolType: 'function' as any,
    parentChunkId: undefined,
    contextBefore: '',
    contextAfter: '',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockEmbedding: CodeEmbedding = {
    id: 'embedding-123',
    chunkId: 'chunk-123',
    modelName: 'codebert',
    modelVersion: '1.0',
    embeddingVector: new Array(768).fill(0.1),
    embeddingMetadata: {},
    confidenceScore: 0.85,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    mockDb = new DatabaseManager({} as any) as jest.Mocked<DatabaseManager>;
    mockChunkingService = new CodeChunkingService(mockDb) as jest.Mocked<CodeChunkingService>;
    mockModelManager = new EmbeddingModelManager(mockDb, mockEmbeddingConfig) as jest.Mocked<EmbeddingModelManager>;

    // Mock DatabaseManager methods
    mockDb.executeQuery = jest.fn();

    // Mock EmbeddingModelManager methods
    mockModelManager.initialize = jest.fn().mockResolvedValue(undefined);
    mockModelManager.generateEmbedding = jest.fn().mockResolvedValue(new Array(768).fill(0.1));
    mockModelManager.getModelInfo = jest.fn().mockResolvedValue({
      name: 'codebert',
      version: '1.0',
      dimension: 768,
      maxTokens: 512,
      supportedLanguages: [SupportedLanguage.TYPESCRIPT],
      memoryUsage: 1200,
      avgInferenceTime: 150,
      isLoaded: true
    });

    service = new CodeEmbeddingsService(mockDb, mockChunkingService, mockEmbeddingConfig);
    // Inject mocked model manager
    (service as any).modelManager = mockModelManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      expect(mockModelManager.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('embedding generation', () => {
    beforeEach(() => {
      // Mock database queries for chunk retrieval
      mockDb.executeQuery
        .mockResolvedValueOnce({ 
          rows: [{
            id: mockCodeChunk.id,
            file_id: mockCodeChunk.fileId,
            repository_id: mockCodeChunk.repositoryId,
            chunk_type: mockCodeChunk.chunkType,
            chunk_index: mockCodeChunk.chunkIndex,
            start_line: mockCodeChunk.startLine,
            end_line: mockCodeChunk.endLine,
            start_column: mockCodeChunk.startColumn,
            end_column: mockCodeChunk.endColumn,
            content: mockCodeChunk.content,
            content_hash: mockCodeChunk.contentHash,
            language: mockCodeChunk.language,
            symbol_name: mockCodeChunk.symbolName,
            symbol_type: mockCodeChunk.symbolType,
            parent_chunk_id: mockCodeChunk.parentChunkId,
            context_before: mockCodeChunk.contextBefore,
            context_after: mockCodeChunk.contextAfter,
            metadata: mockCodeChunk.metadata,
            created_at: mockCodeChunk.createdAt,
            updated_at: mockCodeChunk.updatedAt
          }]
        }) // getChunkById
        .mockResolvedValueOnce({ rows: [] }) // getExistingEmbedding (none exists)
        .mockResolvedValueOnce({ 
          rows: [{
            id: mockEmbedding.id,
            chunk_id: mockEmbedding.chunkId,
            model_name: mockEmbedding.modelName,
            model_version: mockEmbedding.modelVersion,
            embedding_vector: mockEmbedding.embeddingVector,
            embedding_metadata: mockEmbedding.embeddingMetadata,
            confidence_score: mockEmbedding.confidenceScore,
            created_at: mockEmbedding.createdAt,
            updated_at: mockEmbedding.updatedAt
          }]
        }); // storeEmbedding
    });

    it('should generate embedding for a chunk', async () => {
      const result = await service.generateEmbeddingForChunk('chunk-123', 'codebert');
      
      expect(result).toBeDefined();
      expect(result.chunkId).toBe('chunk-123');
      expect(result.modelName).toBe('codebert');
      expect(result.embeddingVector).toHaveLength(768);
      expect(result.confidenceScore).toBeGreaterThan(0);

      expect(mockModelManager.generateEmbedding).toHaveBeenCalledWith(
        mockCodeChunk.content,
        'codebert',
        {
          language: mockCodeChunk.language,
          symbolType: mockCodeChunk.symbolType,
          contextType: mockCodeChunk.chunkType
        }
      );
    });

    it('should return existing embedding if available', async () => {
      // Mock existing embedding
      mockDb.executeQuery
        .mockResolvedValueOnce({ 
          rows: [{
            id: mockCodeChunk.id,
            file_id: mockCodeChunk.fileId,
            repository_id: mockCodeChunk.repositoryId,
            chunk_type: mockCodeChunk.chunkType,
            chunk_index: mockCodeChunk.chunkIndex,
            start_line: mockCodeChunk.startLine,
            end_line: mockCodeChunk.endLine,
            start_column: mockCodeChunk.startColumn,
            end_column: mockCodeChunk.endColumn,
            content: mockCodeChunk.content,
            content_hash: mockCodeChunk.contentHash,
            language: mockCodeChunk.language,
            symbol_name: mockCodeChunk.symbolName,
            symbol_type: mockCodeChunk.symbolType,
            parent_chunk_id: mockCodeChunk.parentChunkId,
            context_before: mockCodeChunk.contextBefore,
            context_after: mockCodeChunk.contextAfter,
            metadata: mockCodeChunk.metadata,
            created_at: mockCodeChunk.createdAt,
            updated_at: mockCodeChunk.updatedAt
          }]
        }) // getChunkById
        .mockResolvedValueOnce({ 
          rows: [{
            id: mockEmbedding.id,
            chunk_id: mockEmbedding.chunkId,
            model_name: mockEmbedding.modelName,
            model_version: mockEmbedding.modelVersion,
            embedding_vector: mockEmbedding.embeddingVector,
            embedding_metadata: mockEmbedding.embeddingMetadata,
            confidence_score: mockEmbedding.confidenceScore,
            created_at: mockEmbedding.createdAt,
            updated_at: mockEmbedding.updatedAt
          }]
        }); // getExistingEmbedding

      const result = await service.generateEmbeddingForChunk('chunk-123', 'codebert');
      
      expect(result).toBeDefined();
      expect(result.id).toBe(mockEmbedding.id);
      expect(mockModelManager.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should handle batch embedding generation', async () => {
      // Mock repository chunks query
      const mockChunks = [mockCodeChunk];
      (service as any).getRepositoryChunks = jest.fn().mockResolvedValue(mockChunks);
      (service as any).getExistingEmbedding = jest.fn().mockResolvedValue(null);
      (service as any).generateEmbeddingForChunk = jest.fn().mockResolvedValue(mockEmbedding);

      const result = await service.batchGenerateEmbeddings('repo-789', {
        modelName: 'codebert',
        batchSize: 10,
        parallel: true
      });

      expect(result).toBeDefined();
      expect(result.repositoryId).toBe('repo-789');
      expect(result.totalChunks).toBe(1);
      expect(result.embeddingsGenerated).toBe(1);
      expect(result.modelUsed).toBe('codebert');
    });
  });

  describe('semantic search', () => {
    const mockQuery: CodeSearchQuery = {
      query: 'function that calculates sum',
      queryType: QueryType.NATURAL_LANGUAGE,
      language: SupportedLanguage.TYPESCRIPT,
      maxResults: 10,
      similarityThreshold: 0.7,
      includeContext: false,
      searchFilters: {}
    };

    beforeEach(() => {
      // Mock search-related methods
      (service as any).searchByNaturalLanguage = jest.fn().mockResolvedValue([
        {
          chunk: mockCodeChunk,
          similarity: 0.85,
          explanation: '85% similar based on codebert embeddings',
          highlightedContent: mockCodeChunk.content
        }
      ]);
      
      (service as any).recordSearchAnalytics = jest.fn().mockResolvedValue(undefined);
      (service as any).generateSearchSuggestions = jest.fn().mockResolvedValue([
        'Try: "sum calculation function"',
        'Try: "arithmetic operations"'
      ]);
    });

    it('should perform semantic search', async () => {
      const result = await service.searchSimilarCode(mockQuery);
      
      expect(result).toBeDefined();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].chunk.id).toBe(mockCodeChunk.id);
      expect(result.results[0].similarity).toBe(0.85);
      expect(result.totalResults).toBe(1);
      expect(result.modelUsed).toBe('codebert');
      expect(result.suggestions).toContain('Try: "sum calculation function"');
    });

    it('should cache search results', async () => {
      await service.searchSimilarCode(mockQuery);
      
      // Second call should use cache
      const result2 = await service.searchSimilarCode(mockQuery);
      
      expect(result2).toBeDefined();
      expect((service as any).searchByNaturalLanguage).toHaveBeenCalledTimes(1); // Only called once due to caching
    });

    it('should handle different query types', async () => {
      const codeQuery: CodeSearchQuery = {
        ...mockQuery,
        queryType: QueryType.CODE,
        query: 'function calculateSum(a, b) { return a + b; }'
      };

      (service as any).searchByCodeSimilarity = jest.fn().mockResolvedValue([
        {
          chunk: mockCodeChunk,
          similarity: 0.92,
          explanation: '92% similar code structure'
        }
      ]);

      const result = await service.searchSimilarCode(codeQuery);
      
      expect(result).toBeDefined();
      expect((service as any).searchByCodeSimilarity).toHaveBeenCalledWith(codeQuery, 'codebert');
    });
  });

  describe('cross-language search', () => {
    it('should find similar chunks', async () => {
      const mockSimilarChunks = [
        {
          chunk: mockCodeChunk,
          similarity: 0.88,
          explanation: '88% similar based on codebert embeddings',
          highlightedContent: mockCodeChunk.content
        }
      ];

      (service as any).getChunkEmbedding = jest.fn().mockResolvedValue(mockEmbedding);
      (service as any).findSimilarEmbeddings = jest.fn().mockResolvedValue([
        { chunkId: 'other-chunk', similarity: 0.88 },
        { chunkId: mockCodeChunk.id, similarity: 1.0 } // Self-match to be filtered
      ]);
      (service as any).getChunkById = jest.fn()
        .mockResolvedValueOnce(null) // First call returns null (will be filtered)
        .mockResolvedValueOnce(mockCodeChunk); // Second call returns the chunk

      const result = await service.findSimilarChunks('chunk-123', 5);
      
      expect(result).toHaveLength(1);
      expect(result[0].chunk.id).toBe(mockCodeChunk.id);
      expect(result[0].similarity).toBe(0.88);
    });

    it('should find cross-language equivalents', async () => {
      (service as any).getChunkById = jest.fn().mockResolvedValue(mockCodeChunk);
      (service as any).getExistingCrossLanguageMappings = jest.fn().mockResolvedValue([]);
      (service as any).getChunkEmbedding = jest.fn().mockResolvedValue(mockEmbedding);
      (service as any).findSimilarChunksInLanguage = jest.fn().mockResolvedValue([
        { chunkId: 'python-chunk-456', similarity: 0.83 }
      ]);
      (service as any).createCrossLanguageMapping = jest.fn().mockResolvedValue({
        id: 'mapping-123',
        sourceChunkId: 'chunk-123',
        targetChunkId: 'python-chunk-456',
        sourceLanguage: SupportedLanguage.TYPESCRIPT,
        targetLanguage: SupportedLanguage.PYTHON,
        similarityScore: 0.83,
        mappingType: 'equivalent',
        confidenceLevel: 'high',
        verifiedByHuman: false,
        modelUsed: 'codebert',
        createdAt: new Date()
      });

      const pythonChunk = {
        ...mockCodeChunk,
        id: 'python-chunk-456',
        language: SupportedLanguage.PYTHON,
        content: 'def calculate_sum(a, b):\n    return a + b'
      };

      (service as any).getChunkById
        .mockResolvedValueOnce(mockCodeChunk) // Source chunk
        .mockResolvedValueOnce(pythonChunk); // Target chunk

      const result = await service.findCrossLanguageEquivalents('chunk-123');
      
      expect(result).toHaveLength(1);
      expect(result[0].sourceChunk.id).toBe('chunk-123');
      expect(result[0].equivalents).toHaveLength(1);
      expect(result[0].equivalents[0].chunk.language).toBe(SupportedLanguage.PYTHON);
    });
  });

  describe('error handling', () => {
    it('should handle chunk not found error', async () => {
      mockDb.executeQuery.mockResolvedValue({ rows: [] });
      
      await expect(service.generateEmbeddingForChunk('nonexistent', 'codebert'))
        .rejects.toThrow('Chunk not found: nonexistent');
    });

    it('should handle model generation errors', async () => {
      mockDb.executeQuery.mockResolvedValueOnce({ 
        rows: [{
          id: mockCodeChunk.id,
          file_id: mockCodeChunk.fileId,
          repository_id: mockCodeChunk.repositoryId,
          chunk_type: mockCodeChunk.chunkType,
          chunk_index: mockCodeChunk.chunkIndex,
          start_line: mockCodeChunk.startLine,
          end_line: mockCodeChunk.endLine,
          start_column: mockCodeChunk.startColumn,
          end_column: mockCodeChunk.endColumn,
          content: mockCodeChunk.content,
          content_hash: mockCodeChunk.contentHash,
          language: mockCodeChunk.language,
          symbol_name: mockCodeChunk.symbolName,
          symbol_type: mockCodeChunk.symbolType,
          parent_chunk_id: mockCodeChunk.parentChunkId,
          context_before: mockCodeChunk.contextBefore,
          context_after: mockCodeChunk.contextAfter,
          metadata: mockCodeChunk.metadata,
          created_at: mockCodeChunk.createdAt,
          updated_at: mockCodeChunk.updatedAt
        }]
      });
      mockDb.executeQuery.mockResolvedValueOnce({ rows: [] }); // No existing embedding

      mockModelManager.generateEmbedding.mockRejectedValue(new Error('Model unavailable'));
      
      await expect(service.generateEmbeddingForChunk('chunk-123', 'codebert'))
        .rejects.toThrow('Model unavailable');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await service.cleanup();
      expect(mockModelManager.cleanup).toHaveBeenCalledTimes(1);
    });
  });
});

describe('EmbeddingModelManager', () => {
  let manager: EmbeddingModelManager;
  let mockDb: jest.Mocked<DatabaseManager>;

  const mockConfig = {
    defaultModel: 'codebert',
    maxConcurrentModels: 2,
    modelCacheTTL: 3600000,
    apiKeys: { huggingface: 'test-key' },
    memoryThreshold: 1000
  };

  beforeEach(() => {
    mockDb = new DatabaseManager({} as any) as jest.Mocked<DatabaseManager>;
    mockDb.executeQuery = jest.fn();
    
    manager = new EmbeddingModelManager(mockDb, mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    beforeEach(() => {
      mockDb.executeQuery.mockResolvedValue({
        rows: [{
          id: 'model-1',
          name: 'codebert',
          display_name: 'CodeBERT',
          description: 'Microsoft CodeBERT model',
          model_type: 'codebert',
          embedding_dimension: 768,
          supported_languages: ['typescript', 'javascript', 'python'],
          model_config: { max_length: 512 },
          api_endpoint: null,
          local_path: null,
          is_active: true,
          is_default: true,
          performance_metrics: { accuracy_score: 0.85 },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]
      });
    });

    it('should initialize and load model configurations', async () => {
      await manager.initialize();
      
      expect(mockDb.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM embedding_models')
      );
      
      const availableModels = manager.getAvailableModels();
      expect(availableModels).toContain('codebert');
    });
  });

  describe('model management', () => {
    it('should get usage statistics', () => {
      const stats = manager.getUsageStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    it('should perform health check', async () => {
      const health = await manager.healthCheck();
      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
    });
  });
});