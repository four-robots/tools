import { LLMService } from '../llm-service.js';
import { DatabaseManager } from '../../../utils/database.js';
import {
  LLMConfig,
  LLMProvider,
  QueryUnderstanding,
  IntentClassification,
  ProcessedQuery
} from '../../../shared/types/nlp.js';

// Mock OpenAI
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}));

// Mock Anthropic
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }))
}));

describe('LLMService', () => {
  let service: LLMService;
  let mockDb: jest.Mocked<DatabaseManager>;

  const mockOpenAIConfig: LLMConfig = {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-openai-key',
    temperature: 0.1,
    maxTokens: 1000,
    timeout: 30000,
    retryAttempts: 3
  };

  const mockAnthropicConfig: LLMConfig = {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    apiKey: 'test-anthropic-key',
    temperature: 0.1,
    maxTokens: 1000,
    timeout: 30000,
    retryAttempts: 3
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    service = new LLMService(mockDb, [mockOpenAIConfig, mockAnthropicConfig]);
  });

  describe('Configuration Management', () => {
    it('should add configurations correctly', () => {
      const newService = new LLMService();
      newService.addConfiguration(mockOpenAIConfig);

      const providers = newService.getAvailableProviders();
      expect(providers).toContain('openai');
    });

    it('should get configuration for provider', () => {
      const config = service.getConfig('openai');
      expect(config).toEqual(mockOpenAIConfig);
    });

    it('should return available providers', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
    });
  });

  describe('OpenAI Integration', () => {
    it('should generate completion with OpenAI', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Test response' },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        },
        model: 'gpt-4'
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await service.generateCompletion(
        'Test prompt',
        'System prompt',
        'openai',
        0.1
      );

      expect(result.content).toBe('Test response');
      expect(result.usage?.totalTokens).toBe(15);
      expect(result.model).toBe('gpt-4');
    });

    it('should handle OpenAI errors', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockRejectedValue(new Error('API Error'));

      await expect(
        service.generateCompletion('Test prompt', undefined, 'openai')
      ).rejects.toThrow('Failed to generate completion');
    });
  });

  describe('Anthropic Integration', () => {
    it('should generate completion with Anthropic', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test response' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5
        },
        model: 'claude-3-haiku-20240307',
        stop_reason: 'end_turn'
      };

      const Anthropic = require('@anthropic-ai/sdk').default;
      const mockInstance = new Anthropic();
      mockInstance.messages.create.mockResolvedValue(mockResponse);

      const result = await service.generateCompletion(
        'Test prompt',
        'System prompt',
        'anthropic',
        0.1
      );

      expect(result.content).toBe('Test response');
      expect(result.usage?.totalTokens).toBe(15);
      expect(result.model).toBe('claude-3-haiku-20240307');
    });
  });

  describe('Query Understanding', () => {
    it('should understand search queries', async () => {
      const mockResponse = {
        content: JSON.stringify({
          mainIntent: 'search',
          subIntents: [],
          entities: [
            {
              text: 'React',
              type: 'framework',
              confidence: 0.9,
              startIndex: 0,
              endIndex: 5,
              metadata: {}
            }
          ],
          concepts: ['web development', 'frontend'],
          expectedResultTypes: ['documentation', 'tutorial'],
          confidence: 0.85,
          reasoning: 'Query is asking for React-related information',
          searchStrategy: 'hybrid',
          complexity: 'simple',
          ambiguity: 0.1
        })
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse.content } }],
        usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
        model: 'gpt-4'
      });

      const understanding = await service.understandQuery('How to use React?');

      expect(understanding.mainIntent).toBe('search');
      expect(understanding.entities).toHaveLength(1);
      expect(understanding.entities[0].text).toBe('React');
      expect(understanding.confidence).toBe(0.85);
      expect(understanding.searchStrategy).toBe('hybrid');
    });

    it('should handle malformed JSON responses', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Invalid JSON' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4'
      });

      const understanding = await service.understandQuery('Test query');

      // Should return fallback understanding
      expect(understanding.mainIntent).toBe('search');
      expect(understanding.confidence).toBe(0.3);
      expect(understanding.reasoning).toContain('Failed to parse');
    });
  });

  describe('Search Term Generation', () => {
    it('should generate relevant search terms', async () => {
      const mockResponse = {
        content: JSON.stringify(['React', 'components', 'JSX', 'hooks', 'state'])
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse.content } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'gpt-4'
      });

      const terms = await service.generateSearchTerms('React development');

      expect(terms).toHaveLength(5);
      expect(terms).toContain('React');
      expect(terms).toContain('hooks');
    });

    it('should fallback to original query on JSON parsing errors', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Not JSON' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4'
      });

      const terms = await service.generateSearchTerms('React development');

      expect(terms).toEqual(['React development']);
    });
  });

  describe('Intent Classification', () => {
    it('should classify query intents', async () => {
      const mockResponse = {
        content: JSON.stringify({
          intent: 'tutorial',
          confidence: 0.9,
          alternatives: [
            { intent: 'question', confidence: 0.3 }
          ],
          reasoning: 'Query asks how to do something',
          features: {
            hasQuestionWords: true,
            hasHowToWords: true
          }
        })
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse.content } }],
        usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 },
        model: 'gpt-4'
      });

      const classification = await service.classifySearchIntent('How to use React hooks?');

      expect(classification.intent).toBe('tutorial');
      expect(classification.confidence).toBe(0.9);
      expect(classification.alternatives).toHaveLength(1);
      expect(classification.features.hasHowToWords).toBe(true);
    });
  });

  describe('Query Expansion', () => {
    it('should expand queries with synonyms', async () => {
      const mockResponse = {
        content: JSON.stringify(['JavaScript', 'JS', 'ECMAScript', 'Node.js'])
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse.content } }],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
        model: 'gpt-4'
      });

      const synonyms = await service.expandWithSynonyms('JavaScript');

      expect(synonyms).toContain('JS');
      expect(synonyms).toContain('ECMAScript');
      expect(synonyms).toHaveLength(4);
    });

    it('should generate related queries', async () => {
      const mockResponse = {
        content: JSON.stringify([
          {
            query: 'React hooks tutorial',
            intent: 'tutorial',
            confidence: 0.8,
            similarity: 0.9,
            reasoning: 'Related learning material'
          },
          {
            query: 'React component lifecycle',
            intent: 'question',
            confidence: 0.7,
            similarity: 0.8,
            reasoning: 'Related concept'
          }
        ])
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse.content } }],
        usage: { prompt_tokens: 15, completion_tokens: 40, total_tokens: 55 },
        model: 'gpt-4'
      });

      const relatedQueries = await service.generateRelatedQueries('React development');

      expect(relatedQueries).toHaveLength(2);
      expect(relatedQueries[0].query).toBe('React hooks tutorial');
      expect(relatedQueries[0].intent).toBe('tutorial');
      expect(relatedQueries[0].similarity).toBe(0.9);
    });
  });

  describe('Language Support', () => {
    it('should translate queries', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'How to use React?' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4'
      });

      const translated = await service.translateQuery(
        '¿Cómo usar React?',
        'es',
        'en'
      );

      expect(translated).toBe('How to use React?');
    });

    it('should detect language', async () => {
      const mockResponse = {
        content: JSON.stringify({
          language: 'en',
          confidence: 0.95,
          alternatives: [
            { language: 'es', confidence: 0.05 }
          ]
        })
      };

      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse.content } }],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        model: 'gpt-4'
      });

      const detection = await service.detectLanguage('How to use React?');

      expect(detection.language).toBe('en');
      expect(detection.confidence).toBe(0.95);
      expect(detection.alternatives).toHaveLength(1);
    });
  });

  describe('Query Improvement', () => {
    it('should improve queries based on context', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'How to implement React hooks for state management in modern web applications' } }],
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
        model: 'gpt-4'
      });

      const improved = await service.improveQuery(
        'React hooks',
        'User is building a web application and needs state management'
      );

      expect(improved).toContain('state management');
      expect(improved).toContain('React hooks');
    });
  });

  describe('Confidence and Validation', () => {
    it('should calculate processing confidence', async () => {
      const mockProcessing: ProcessedQuery = {
        original: 'test query',
        normalized: 'test query',
        intent: 'search',
        entities: [
          { text: 'test', type: 'concept', confidence: 0.8, startIndex: 0, endIndex: 4, metadata: {} },
          { text: 'query', type: 'concept', confidence: 0.9, startIndex: 5, endIndex: 10, metadata: {} }
        ],
        expansion: { synonyms: [], relatedTerms: [], conceptualTerms: [], alternativePhrasings: [], technicalVariations: [], confidence: 0.7 },
        confidence: 0.8,
        language: 'en',
        corrections: [],
        context: {
          previousQueries: [],
          sessionId: 'test',
          timeContext: new Date(),
          conversationTurn: 0,
          userPreferences: {},
          activeProjects: []
        },
        searchStrategy: 'hybrid',
        processingTimeMs: 500,
        cached: false,
        queryHash: 'hash123'
      };

      const confidence = await service.calculateConfidence(mockProcessing);

      expect(confidence).toBeGreaterThan(0.5);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('should validate processing results', async () => {
      const validProcessing: ProcessedQuery = {
        original: 'test query',
        normalized: 'test query',
        intent: 'search',
        entities: [],
        expansion: { synonyms: [], relatedTerms: [], conceptualTerms: [], alternativePhrasings: [], technicalVariations: [], confidence: 0.5 },
        confidence: 0.8,
        language: 'en',
        corrections: [],
        context: {
          previousQueries: [],
          sessionId: 'test',
          timeContext: new Date(),
          conversationTurn: 0,
          userPreferences: {},
          activeProjects: []
        },
        searchStrategy: 'hybrid',
        processingTimeMs: 500,
        cached: false,
        queryHash: 'hash123'
      };

      const isValid = await service.validateProcessing('test query', validProcessing);
      expect(isValid).toBe(true);

      // Test invalid processing
      const invalidProcessing = { ...validProcessing, normalized: '', confidence: 0.05 };
      const isInvalid = await service.validateProcessing('test query', invalidProcessing);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Caching', () => {
    it('should cache LLM responses', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Cached response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4'
      });

      // First call
      const result1 = await service.generateCompletion('Test prompt', 'System', 'openai', 0.1);
      
      // Second call with same parameters should use cache
      const result2 = await service.generateCompletion('Test prompt', 'System', 'openai', 0.1);

      expect(result1).toEqual(result2);
      expect(mockInstance.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it('should not cache responses with different parameters', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4'
      });

      await service.generateCompletion('Test prompt', 'System', 'openai', 0.1);
      await service.generateCompletion('Test prompt', 'System', 'openai', 0.5); // Different temperature

      expect(mockInstance.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status for working providers', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Health check OK' } }],
        usage: { prompt_tokens: 3, completion_tokens: 3, total_tokens: 6 },
        model: 'gpt-4'
      });

      const Anthropic = require('@anthropic-ai/sdk').default;
      const mockAnthropicInstance = new Anthropic();
      mockAnthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'Health check OK' }],
        usage: { input_tokens: 3, output_tokens: 3 },
        model: 'claude-3-haiku-20240307'
      });

      const health = await service.healthCheck();

      expect(health).toHaveLength(2);
      expect(health.find(h => h.provider === 'openai')?.status).toBe('healthy');
      expect(health.find(h => h.provider === 'anthropic')?.status).toBe('healthy');
    });

    it('should report error status for failing providers', async () => {
      const OpenAI = require('openai').OpenAI;
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const health = await service.healthCheck();

      const openaiHealth = health.find(h => h.provider === 'openai');
      expect(openaiHealth?.status).toBe('error');
      expect(openaiHealth?.error).toContain('API Error');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration', async () => {
      await expect(
        service.generateCompletion('test', undefined, 'google')
      ).rejects.toThrow('No configuration found for provider: google');
    });

    it('should handle unsupported providers', async () => {
      const unsupportedService = new LLMService(mockDb, [{
        provider: 'local' as LLMProvider,
        model: 'test',
        temperature: 0.1,
        maxTokens: 100,
        timeout: 30000,
        retryAttempts: 3
      }]);

      await expect(
        unsupportedService.generateCompletion('test', undefined, 'local')
      ).rejects.toThrow('Local provider not implemented yet');
    });
  });
});