/**
 * AISummaryService Unit Tests
 */

import { AISummaryService } from '../ai-summary-service';
import { SummaryGenerator } from '../summary-generator';
import { FactChecker } from '../fact-checker';
import { KeyPointsExtractor } from '../key-points-extractor';
import { SourceAttributionService } from '../source-attribution-service';
import { DatabaseManager } from '../../../utils/database';
import { LLMService } from '../../nlp/llm-service';
import { 
  GenerateSummaryRequest, 
  SearchSummary,
  ContentSource 
} from '../../../shared/types/ai-summaries';

// Mock dependencies
jest.mock('../summary-generator');
jest.mock('../fact-checker');
jest.mock('../key-points-extractor');
jest.mock('../source-attribution-service');
jest.mock('../../../utils/database');
jest.mock('../../nlp/llm-service');

describe('AISummaryService', () => {
  let aiSummaryService: AISummaryService;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockDatabaseManager: jest.Mocked<DatabaseManager>;
  let mockSummaryGenerator: jest.Mocked<SummaryGenerator>;
  let mockFactChecker: jest.Mocked<FactChecker>;
  let mockKeyPointsExtractor: jest.Mocked<KeyPointsExtractor>;
  let mockSourceAttributionService: jest.Mocked<SourceAttributionService>;

  const mockContentSources: ContentSource[] = [
    {
      id: 'source1',
      url: 'https://example.com/doc1',
      title: 'Test Document 1',
      content: 'This is the first test document with important information.',
      type: 'web_page',
      lastModified: new Date(),
      metadata: {
        author: 'John Doe',
        publishDate: '2024-01-01',
        wordCount: 100
      }
    },
    {
      id: 'source2',
      url: 'https://example.com/doc2',
      title: 'Test Document 2',
      content: 'This is the second test document with additional context.',
      type: 'document',
      lastModified: new Date(),
      metadata: {
        author: 'Jane Smith',
        publishDate: '2024-01-02',
        wordCount: 150
      }
    }
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockLLMService = new LLMService({} as any) as jest.Mocked<LLMService>;
    mockDatabaseManager = new DatabaseManager({} as any) as jest.Mocked<DatabaseManager>;
    mockSummaryGenerator = new SummaryGenerator({} as any) as jest.Mocked<SummaryGenerator>;
    mockFactChecker = new FactChecker({} as any) as jest.Mocked<FactChecker>;
    mockKeyPointsExtractor = new KeyPointsExtractor({} as any) as jest.Mocked<KeyPointsExtractor>;
    mockSourceAttributionService = new SourceAttributionService() as jest.Mocked<SourceAttributionService>;

    // Mock constructors to return our mocks
    (SummaryGenerator as jest.MockedClass<typeof SummaryGenerator>).mockImplementation(() => mockSummaryGenerator);
    (FactChecker as jest.MockedClass<typeof FactChecker>).mockImplementation(() => mockFactChecker);
    (KeyPointsExtractor as jest.MockedClass<typeof KeyPointsExtractor>).mockImplementation(() => mockKeyPointsExtractor);
    (SourceAttributionService as jest.MockedClass<typeof SourceAttributionService>).mockImplementation(() => mockSourceAttributionService);

    // Initialize service
    aiSummaryService = new AISummaryService(
      mockLLMService,
      mockDatabaseManager,
      {
        cacheEnabled: true,
        maxCacheAge: 3600000,
        rateLimitEnabled: true,
        maxRequestsPerHour: 100
      }
    );
  });

  describe('generateResultSummary', () => {
    const mockRequest: GenerateSummaryRequest = {
      searchQuery: 'test query',
      searchResults: mockContentSources,
      summaryType: 'general_summary',
      summaryLength: 'medium',
      userId: 'user123'
    };

    beforeEach(() => {
      // Mock service responses
      mockSummaryGenerator.generateSummary.mockResolvedValue('Generated summary content');
      mockSourceAttributionService.attributeSources.mockResolvedValue({
        totalSources: 2,
        primarySources: ['source1', 'source2'],
        diversityScore: 0.8
      });
      mockKeyPointsExtractor.extractKeyPoints.mockResolvedValue([
        { text: 'Key point 1', importance: 0.9, source: 'source1' },
        { text: 'Key point 2', importance: 0.8, source: 'source2' }
      ]);
      mockFactChecker.checkFactualAccuracy.mockResolvedValue([
        {
          claim: 'Test claim',
          isAccurate: true,
          confidence: 0.9,
          sources: ['source1'],
          context: 'Supporting context'
        }
      ]);
      mockFactChecker.detectHallucinations.mockResolvedValue([]);

      // Mock database operations
      mockDatabaseManager.create = jest.fn().mockResolvedValue({
        id: 'summary123',
        ...mockRequest,
        summaryContent: 'Generated summary content'
      });
    });

    it('should generate summary successfully with all components', async () => {
      const result = await aiSummaryService.generateResultSummary(mockRequest);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.summaryContent).toBe('Generated summary content');
      expect(result.summary.searchQuery).toBe('test query');
      
      // Verify all services were called
      expect(mockSummaryGenerator.generateSummary).toHaveBeenCalledWith(
        'test query',
        mockContentSources,
        'medium'
      );
      expect(mockSourceAttributionService.attributeSources).toHaveBeenCalledWith(mockContentSources);
      expect(mockKeyPointsExtractor.extractKeyPoints).toHaveBeenCalledWith(
        'Generated summary content',
        mockContentSources
      );
      expect(mockFactChecker.checkFactualAccuracy).toHaveBeenCalledWith(
        'Generated summary content',
        mockContentSources
      );
    });

    it('should handle different summary types correctly', async () => {
      const answerRequest = {
        ...mockRequest,
        summaryType: 'answer_generation',
        specificQuestion: 'What is the main topic?'
      };

      await aiSummaryService.generateResultSummary(answerRequest);

      expect(mockSummaryGenerator.generateSummary).toHaveBeenCalledWith(
        'test query',
        mockContentSources,
        'medium',
        'answer_generation',
        'What is the main topic?'
      );
    });

    it('should handle errors gracefully', async () => {
      mockSummaryGenerator.generateSummary.mockRejectedValue(new Error('LLM service error'));

      await expect(aiSummaryService.generateResultSummary(mockRequest))
        .rejects.toThrow('Failed to generate summary: LLM service error');
    });

    it('should skip optional components when disabled', async () => {
      const requestWithoutFactChecking = {
        ...mockRequest,
        includeFactChecking: false,
        includeKeyPoints: false
      };

      await aiSummaryService.generateResultSummary(requestWithoutFactChecking);

      expect(mockFactChecker.checkFactualAccuracy).not.toHaveBeenCalled();
      expect(mockKeyPointsExtractor.extractKeyPoints).not.toHaveBeenCalled();
    });
  });

  describe('getSummaryById', () => {
    const mockSummary: SearchSummary = {
      id: 'summary123',
      searchResultsHash: 'hash123',
      searchQuery: 'test query',
      summaryType: 'general_summary',
      summaryContent: 'Test summary content',
      summaryLength: 'medium',
      confidence: 0.85,
      qualityMetrics: {
        accuracy: 0.9,
        completeness: 0.8,
        relevance: 0.95,
        clarity: 0.87,
        conciseness: 0.82
      },
      generatedAt: new Date(),
      userId: 'user123',
      processingTimeMs: 5000
    };

    beforeEach(() => {
      mockDatabaseManager.findById = jest.fn().mockResolvedValue(mockSummary);
    });

    it('should retrieve summary by ID successfully', async () => {
      const result = await aiSummaryService.getSummaryById('summary123');

      expect(result).toEqual(mockSummary);
      expect(mockDatabaseManager.findById).toHaveBeenCalledWith('search_summaries', 'summary123');
    });

    it('should return null for non-existent summary', async () => {
      mockDatabaseManager.findById = jest.fn().mockResolvedValue(null);

      const result = await aiSummaryService.getSummaryById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits when enabled', async () => {
      // Mock rate limit check
      const checkRateLimit = jest.spyOn(aiSummaryService as any, 'checkRateLimit');
      checkRateLimit.mockResolvedValue(true);

      const mockRequest: GenerateSummaryRequest = {
        searchQuery: 'test query',
        searchResults: mockContentSources,
        summaryType: 'general_summary',
        summaryLength: 'medium',
        userId: 'user123'
      };

      // Setup mocks for successful generation
      mockSummaryGenerator.generateSummary.mockResolvedValue('Generated content');
      mockSourceAttributionService.attributeSources.mockResolvedValue({
        totalSources: 2,
        primarySources: ['source1', 'source2'],
        diversityScore: 0.8
      });
      mockKeyPointsExtractor.extractKeyPoints.mockResolvedValue([]);
      mockFactChecker.checkFactualAccuracy.mockResolvedValue([]);
      mockFactChecker.detectHallucinations.mockResolvedValue([]);
      mockDatabaseManager.create = jest.fn().mockResolvedValue({
        id: 'summary123',
        ...mockRequest,
        summaryContent: 'Generated content'
      });

      await aiSummaryService.generateResultSummary(mockRequest);

      expect(checkRateLimit).toHaveBeenCalledWith('user123');
    });
  });

  describe('caching', () => {
    it('should check cache before generating new summary', async () => {
      const getCachedSummary = jest.spyOn(aiSummaryService as any, 'getCachedSummary');
      getCachedSummary.mockResolvedValue(null);

      const mockRequest: GenerateSummaryRequest = {
        searchQuery: 'test query',
        searchResults: mockContentSources,
        summaryType: 'general_summary',
        summaryLength: 'medium',
        userId: 'user123'
      };

      // Setup mocks
      mockSummaryGenerator.generateSummary.mockResolvedValue('Generated content');
      mockSourceAttributionService.attributeSources.mockResolvedValue({
        totalSources: 2,
        primarySources: ['source1', 'source2'],
        diversityScore: 0.8
      });
      mockKeyPointsExtractor.extractKeyPoints.mockResolvedValue([]);
      mockFactChecker.checkFactualAccuracy.mockResolvedValue([]);
      mockFactChecker.detectHallucinations.mockResolvedValue([]);
      mockDatabaseManager.create = jest.fn().mockResolvedValue({
        id: 'summary123',
        ...mockRequest,
        summaryContent: 'Generated content'
      });

      await aiSummaryService.generateResultSummary(mockRequest);

      expect(getCachedSummary).toHaveBeenCalled();
    });
  });
});