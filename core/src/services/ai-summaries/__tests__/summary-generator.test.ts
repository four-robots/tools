/**
 * SummaryGenerator Unit Tests
 */

import { SummaryGenerator } from '../summary-generator';
import { LLMService } from '../../nlp/llm-service';
import { 
  ContentSource
} from '../../../shared/types/ai-summaries';

// Mock LLMService
jest.mock('../../nlp/llm-service');

describe('SummaryGenerator', () => {
  let summaryGenerator: SummaryGenerator;
  let mockLLMService: jest.Mocked<LLMService>;

  const mockConfig = {
    defaultLLMProvider: 'openai',
    maxProcessingTimeMs: 30000,
    minConfidenceThreshold: 0.7
  };

  const mockContentSources: ContentSource[] = [
    {
      id: 'source1',
      url: 'https://example.com/doc1',
      title: 'Introduction to Machine Learning',
      content: 'Machine learning is a subset of artificial intelligence that involves training algorithms to make predictions or decisions based on data. It has applications in various fields including healthcare, finance, and technology.',
      type: 'scraped_page',
      relevance: 0.9,
      usageWeight: 0.8,
      metadata: {
        author: 'Dr. Smith',
        publishDate: '2024-01-01',
        wordCount: 250
      }
    },
    {
      id: 'source2',
      url: 'https://example.com/doc2',
      title: 'Deep Learning Fundamentals',
      content: 'Deep learning is a specialized branch of machine learning that uses neural networks with multiple layers to learn complex patterns. It has been particularly successful in computer vision and natural language processing.',
      type: 'scraped_page',
      relevance: 0.8,
      usageWeight: 0.7,
      metadata: {
        author: 'Prof. Johnson',
        publishDate: '2024-01-02',
        wordCount: 180
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockLLMService = new LLMService({} as any) as jest.Mocked<LLMService>;
    summaryGenerator = new SummaryGenerator(mockLLMService, mockConfig);
  });

  describe('generateSummary', () => {
    const query = 'What is machine learning?';

    beforeEach(() => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: 'Machine learning is a branch of AI that enables computers to learn and make decisions from data without explicit programming.',
        usage: { totalTokens: 50 }
      });
    });

    it('should generate a summary successfully', async () => {
      const result = await summaryGenerator.generateSummary(
        query,
        mockContentSources,
        'medium'
      );

      expect(result).toBe('Machine learning is a branch of AI that enables computers to learn and make decisions from data without explicit programming.');
      expect(mockLLMService.generateCompletion).toHaveBeenCalledWith(
        expect.stringContaining('Query: "What is machine learning?"'),
        expect.any(String),
        'openai',
        0.2
      );
    });

    it('should handle different summary lengths', async () => {
      // Test brief summary
      await summaryGenerator.generateSummary(
        query,
        mockContentSources,
        'brief'
      );

      expect(mockLLMService.generateCompletion).toHaveBeenCalled();

      // Test comprehensive summary
      await summaryGenerator.generateSummary(
        query,
        mockContentSources,
        'comprehensive'
      );

      expect(mockLLMService.generateCompletion).toHaveBeenCalled();
    });

    it('should handle empty content sources', async () => {
      await expect(summaryGenerator.generateSummary(
        query,
        [],
        'medium'
      )).rejects.toThrow();
    });

    it('should handle LLM service errors', async () => {
      mockLLMService.generateCompletion.mockRejectedValue(new Error('LLM API error'));

      await expect(summaryGenerator.generateSummary(
        query,
        mockContentSources,
        'medium'
      )).rejects.toThrow('Failed to generate summary: LLM API error');
    });

    it('should include source content in prompt', async () => {
      await summaryGenerator.generateSummary(
        query,
        mockContentSources,
        'medium'
      );

      const callArgs = mockLLMService.generateCompletion.mock.calls[0];
      const prompt = callArgs[0];
      
      // Check that source content is included
      expect(prompt).toContain('Introduction to Machine Learning');
      expect(prompt).toContain('Deep Learning Fundamentals');
    });

    it('should handle sources without metadata gracefully', async () => {
      const sourcesWithoutMetadata: ContentSource[] = [
        {
          id: 'source1',
          url: 'https://example.com/doc1',
          title: 'Test Document',
          content: 'Test content without metadata.',
          type: 'scraped_page',
          relevance: 0.8,
          usageWeight: 0.5,
          metadata: {}
        }
      ];

      const result = await summaryGenerator.generateSummary(
        query,
        sourcesWithoutMetadata,
        'medium'
      );

      expect(result).toBeDefined();
      expect(mockLLMService.generateCompletion).toHaveBeenCalled();
    });
  });

  describe('generateAnswer', () => {
    const question = 'How does machine learning work?';

    beforeEach(() => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify({
          answer: 'Machine learning works by training algorithms on data to make predictions.',
          confidence: 0.9,
          keyPoints: ['Training', 'Algorithms', 'Predictions'],
          followUpQuestions: ['What types of ML exist?'],
          caveats: ['Requires quality data'],
          alternativePhrasings: ['How do ML algorithms function?']
        }),
        usage: { totalTokens: 100 }
      });
    });

    it('should generate answers successfully', async () => {
      const result = await summaryGenerator.generateAnswer(
        question,
        mockContentSources,
        'explanation'
      );

      expect(result).toMatchObject({
        answer: expect.any(String),
        confidence: expect.any(Number),
        keyPoints: expect.any(Array),
        followUpQuestions: expect.any(Array)
      });

      expect(mockLLMService.generateCompletion).toHaveBeenCalledWith(
        expect.stringContaining(question),
        expect.any(String),
        'openai',
        0.3
      );
    });

    it('should handle different answer types', async () => {
      await summaryGenerator.generateAnswer(
        question,
        mockContentSources,
        'definition'
      );

      expect(mockLLMService.generateCompletion).toHaveBeenCalled();

      await summaryGenerator.generateAnswer(
        question,
        mockContentSources,
        'step_by_step'
      );

      expect(mockLLMService.generateCompletion).toHaveBeenCalled();
    });
  });

  describe('generateKeyPointsSummary', () => {
    beforeEach(() => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: '• Machine learning trains algorithms on data\n• Used in healthcare, finance, and technology\n• Deep learning uses neural networks',
        usage: { totalTokens: 75 }
      });
    });

    it('should generate key points summary', async () => {
      const result = await summaryGenerator.generateKeyPointsSummary(mockContentSources);

      expect(result).toContain('Machine learning');
      expect(result).toContain('neural networks');
      expect(mockLLMService.generateCompletion).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle malformed LLM responses for answers', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: 'Invalid JSON response',
        usage: { totalTokens: 50 }
      });

      await expect(summaryGenerator.generateAnswer(
        'test question',
        mockContentSources,
        'explanation'
      )).rejects.toThrow();
    });

    it('should handle network timeouts', async () => {
      mockLLMService.generateCompletion.mockRejectedValue(new Error('Request timeout'));

      await expect(summaryGenerator.generateSummary(
        'test query',
        mockContentSources,
        'medium'
      )).rejects.toThrow('Failed to generate summary: Request timeout');
    });
  });

  describe('private methods integration', () => {
    it('should format sources correctly for prompts', async () => {
      await summaryGenerator.generateSummary(
        'test query',
        mockContentSources,
        'medium'
      );

      const callArgs = mockLLMService.generateCompletion.mock.calls[0];
      const prompt = callArgs[0];
      
      // Verify source formatting
      expect(prompt).toContain('Sources:');
      expect(prompt).toContain('Introduction to Machine Learning');
      expect(prompt).toContain('Deep Learning Fundamentals');
    });

    it('should clean summary content properly', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: '   Machine learning is important.   \n\n',
        usage: { totalTokens: 30 }
      });

      const result = await summaryGenerator.generateSummary(
        'test query',
        mockContentSources,
        'medium'
      );

      expect(result).toBe('Machine learning is important.');
      expect(result).not.toContain('\n');
      expect(result.trim()).toBe(result);
    });
  });
});