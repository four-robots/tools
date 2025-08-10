/**
 * KeyPointsExtractor Unit Tests
 */

import { KeyPointsExtractor } from '../key-points-extractor';
import { LLMService } from '../../nlp/llm-service';
import { ContentSource, KeyPoint } from '../../../shared/types/ai-summaries';

// Mock LLMService
jest.mock('../../nlp/llm-service');

describe('KeyPointsExtractor', () => {
  let keyPointsExtractor: KeyPointsExtractor;
  let mockLLMService: jest.Mocked<LLMService>;

  const mockContentSources: ContentSource[] = [
    {
      id: 'source1',
      url: 'https://example.com/ai-article',
      title: 'The Future of Artificial Intelligence',
      content: 'Artificial intelligence is transforming industries through automation, improved decision-making, and enhanced user experiences. Key applications include healthcare diagnostics, autonomous vehicles, and natural language processing.',
      type: 'web_page',
      lastModified: new Date('2024-01-01'),
      metadata: {
        author: 'Tech Researcher',
        publishDate: '2024-01-01',
        wordCount: 400
      }
    },
    {
      id: 'source2',
      url: 'https://example.com/ml-paper',
      title: 'Machine Learning in Healthcare',
      content: 'Machine learning algorithms are revolutionizing medical diagnosis by analyzing medical images, predicting patient outcomes, and personalizing treatment plans. The accuracy of AI-assisted diagnosis now exceeds human doctors in several specialties.',
      type: 'document',
      lastModified: new Date('2024-01-02'),
      metadata: {
        author: 'Dr. Medical AI',
        publishDate: '2024-01-02',
        wordCount: 300
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockLLMService = new LLMService({} as any) as jest.Mocked<LLMService>;
    keyPointsExtractor = new KeyPointsExtractor(mockLLMService);
  });

  describe('extractKeyPoints', () => {
    const summary = 'AI is transforming healthcare through improved diagnostics and personalized treatment. Machine learning algorithms now outperform human doctors in several medical specialties, offering more accurate diagnoses and better patient outcomes.';

    beforeEach(() => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'AI is transforming healthcare through improved diagnostics',
            importance: 0.95,
            source: 'source2',
            category: 'healthcare',
            evidence: 'Directly supported by source discussing ML in medical diagnosis'
          },
          {
            text: 'Machine learning algorithms outperform human doctors in several specialties',
            importance: 0.90,
            source: 'source2',
            category: 'performance',
            evidence: 'Source states accuracy exceeds human doctors in several specialties'
          },
          {
            text: 'AI enables personalized treatment plans',
            importance: 0.85,
            source: 'source2',
            category: 'treatment',
            evidence: 'Source mentions personalizing treatment plans as key application'
          }
        ]),
        usage: { totalTokens: 200 }
      });
    });

    it('should extract key points successfully', async () => {
      const result = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);

      expect(result).toHaveLength(3);
      
      expect(result[0]).toMatchObject({
        text: 'AI is transforming healthcare through improved diagnostics',
        importance: 0.95,
        source: 'source2',
        category: 'healthcare',
        evidence: expect.stringContaining('supported by source')
      });

      expect(result[1]).toMatchObject({
        text: 'Machine learning algorithms outperform human doctors in several specialties',
        importance: 0.90,
        source: 'source2',
        category: 'performance'
      });

      expect(result[2]).toMatchObject({
        text: 'AI enables personalized treatment plans',
        importance: 0.85,
        source: 'source2',
        category: 'treatment'
      });
    });

    it('should sort key points by importance in descending order', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'Low importance point',
            importance: 0.3,
            source: 'source1',
            category: 'misc',
            evidence: 'test'
          },
          {
            text: 'High importance point',
            importance: 0.9,
            source: 'source1',
            category: 'main',
            evidence: 'test'
          },
          {
            text: 'Medium importance point',
            importance: 0.6,
            source: 'source1',
            category: 'secondary',
            evidence: 'test'
          }
        ]),
        usage: { totalTokens: 150 }
      });

      const result = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);

      expect(result[0].importance).toBe(0.9);
      expect(result[0].text).toBe('High importance point');
      expect(result[1].importance).toBe(0.6);
      expect(result[1].text).toBe('Medium importance point');
      expect(result[2].importance).toBe(0.3);
      expect(result[2].text).toBe('Low importance point');
    });

    it('should handle different point limits', async () => {
      const manyPoints = Array.from({ length: 15 }, (_, i) => ({
        text: `Point ${i + 1}`,
        importance: 0.9 - (i * 0.05),
        source: 'source1',
        category: 'test',
        evidence: 'test evidence'
      }));

      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify(manyPoints),
        usage: { totalTokens: 300 }
      });

      // Test default limit (10)
      const result = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);
      expect(result).toHaveLength(10);

      // Test custom limit
      const limitedResult = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources, 5);
      expect(limitedResult).toHaveLength(5);
    });

    it('should include source information in the prompt', async () => {
      await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);

      const callArgs = mockLLMService.generateCompletion.mock.calls[0];
      const prompt = callArgs[0];

      // Verify source content is included in prompt
      expect(prompt).toContain('The Future of Artificial Intelligence');
      expect(prompt).toContain('Machine Learning in Healthcare');
      expect(prompt).toContain('transforming industries through automation');
      expect(prompt).toContain('revolutionizing medical diagnosis');
    });

    it('should handle malformed LLM responses', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: 'Invalid JSON response',
        usage: { totalTokens: 50 }
      });

      await expect(keyPointsExtractor.extractKeyPoints(summary, mockContentSources))
        .rejects.toThrow('Failed to parse key points extraction results');
    });

    it('should handle LLM service errors', async () => {
      mockLLMService.generateCompletion.mockRejectedValue(new Error('LLM API error'));

      await expect(keyPointsExtractor.extractKeyPoints(summary, mockContentSources))
        .rejects.toThrow('Failed to extract key points: LLM API error');
    });

    it('should handle empty or minimal responses', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([]),
        usage: { totalTokens: 30 }
      });

      const result = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);
      expect(result).toHaveLength(0);
    });

    it('should validate key point structure', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'Valid key point',
            importance: 0.8,
            source: 'source1',
            category: 'test',
            evidence: 'test evidence'
          },
          {
            // Missing required fields
            text: 'Invalid key point',
            importance: 'not-a-number'
          }
        ]),
        usage: { totalTokens: 100 }
      });

      const result = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);
      
      // Should only return valid key points
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Valid key point');
    });

    it('should filter out key points below minimum importance threshold', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'High importance point',
            importance: 0.8,
            source: 'source1',
            category: 'important',
            evidence: 'test'
          },
          {
            text: 'Very low importance point',
            importance: 0.1,
            source: 'source1',
            category: 'trivial',
            evidence: 'test'
          },
          {
            text: 'Medium importance point',
            importance: 0.5,
            source: 'source1',
            category: 'moderate',
            evidence: 'test'
          }
        ]),
        usage: { totalTokens: 150 }
      });

      const result = await keyPointsExtractor.extractKeyPoints(summary, mockContentSources);

      // Should filter out points with importance < 0.3 (or whatever threshold is set)
      const highImportancePoints = result.filter(point => point.importance >= 0.3);
      expect(highImportancePoints.length).toBe(result.length);
      
      // All returned points should have reasonable importance
      result.forEach(point => {
        expect(point.importance).toBeGreaterThanOrEqual(0.3);
      });
    });
  });

  describe('error handling', () => {
    it('should handle empty summary input', async () => {
      await expect(keyPointsExtractor.extractKeyPoints('', mockContentSources))
        .rejects.toThrow('Summary cannot be empty');
    });

    it('should handle empty content sources', async () => {
      await expect(keyPointsExtractor.extractKeyPoints('test summary', []))
        .rejects.toThrow('No content sources provided for key points extraction');
    });

    it('should handle invalid maxPoints parameter', async () => {
      await expect(keyPointsExtractor.extractKeyPoints('test summary', mockContentSources, 0))
        .rejects.toThrow('maxPoints must be a positive integer');

      await expect(keyPointsExtractor.extractKeyPoints('test summary', mockContentSources, -1))
        .rejects.toThrow('maxPoints must be a positive integer');
    });
  });

  describe('categorization', () => {
    it('should group key points by category', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'Healthcare application',
            importance: 0.9,
            source: 'source1',
            category: 'healthcare',
            evidence: 'test'
          },
          {
            text: 'Another healthcare point',
            importance: 0.8,
            source: 'source2',
            category: 'healthcare',
            evidence: 'test'
          },
          {
            text: 'Technology advancement',
            importance: 0.85,
            source: 'source1',
            category: 'technology',
            evidence: 'test'
          }
        ]),
        usage: { totalTokens: 180 }
      });

      const result = await keyPointsExtractor.extractKeyPoints('test summary', mockContentSources);

      const healthcarePoints = result.filter(point => point.category === 'healthcare');
      const technologyPoints = result.filter(point => point.category === 'technology');

      expect(healthcarePoints).toHaveLength(2);
      expect(technologyPoints).toHaveLength(1);
    });
  });
});