/**
 * SourceAttributionService Unit Tests
 */

import { SourceAttributionService } from '../source-attribution-service';
import { ContentSource, SourceAttribution } from '../../../shared/types/ai-summaries';

describe('SourceAttributionService', () => {
  let sourceAttributionService: SourceAttributionService;

  const mockConfig = {
    minRelevanceScore: 0.3,
    maxSourcesPerSummary: 10,
    enableCitationParsing: true
  };

  const mockSearchResults = [
    {
      id: 'result1',
      title: 'Latest Tech Developments',
      url: 'https://example.com/tech-news',
      type: 'scraped_page',
      content: 'Technology companies are investing heavily in artificial intelligence research.',
      score: { relevance: 0.9 },
      metadata: {
        author: 'Tech Reporter',
        publishDate: '2024-01-01'
      }
    },
    {
      id: 'result2',
      title: 'AI Research Paper',
      url: 'https://example.com/research-paper',
      type: 'scraped_page',
      content: 'Our study demonstrates significant improvements in neural network efficiency.',
      score: { relevance: 0.8 },
      metadata: {
        author: 'Dr. Research Team',
        publishDate: '2024-01-02'
      }
    }
  ];

  beforeEach(() => {
    sourceAttributionService = new SourceAttributionService(mockConfig);
  });

  describe('convertToContentSources', () => {
    it('should convert search results to content sources', async () => {
      const result = await sourceAttributionService.convertToContentSources(mockSearchResults);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'result1',
        type: 'scraped_page',
        title: 'Latest Tech Developments',
        url: 'https://example.com/tech-news',
        relevance: 0.9,
        content: 'Technology companies are investing heavily in artificial intelligence research.'
      });
    });

    it('should filter sources below minimum relevance', async () => {
      const lowRelevanceResults = [
        ...mockSearchResults,
        {
          id: 'result3',
          title: 'Low Relevance',
          url: 'https://example.com/low',
          type: 'scraped_page',
          content: 'Irrelevant content',
          score: { relevance: 0.1 }
        }
      ];

      const result = await sourceAttributionService.convertToContentSources(lowRelevanceResults);

      expect(result).toHaveLength(2); // Only the first 2 should pass the relevance filter
      expect(result.every(source => source.relevance >= 0.3)).toBe(true);
    });

    it('should limit number of sources', async () => {
      const manyResults = Array.from({ length: 20 }, (_, i) => ({
        ...mockSearchResults[0],
        id: `result${i}`,
        title: `Source ${i}`,
        score: { relevance: 0.8 }
      }));

      const result = await sourceAttributionService.convertToContentSources(manyResults);

      expect(result.length).toBeLessThanOrEqual(mockConfig.maxSourcesPerSummary);
    });
  });

  describe('buildAttribution', () => {
    const mockSources: ContentSource[] = [
      {
        id: 'source1',
        type: 'scraped_page',
        title: 'Tech News',
        url: 'https://example.com/tech',
        relevance: 0.9,
        usageWeight: 0.0,
        content: 'Artificial intelligence machine learning technology',
        metadata: {}
      },
      {
        id: 'source2',
        type: 'scraped_page',
        title: 'Research Paper',
        url: 'https://example.com/research',
        relevance: 0.8,
        usageWeight: 0.0,
        content: 'Neural networks deep learning algorithms',
        metadata: {}
      }
    ];

    it('should build source attribution from sources and content', () => {
      const generatedContent = 'Artificial intelligence and machine learning are transforming technology through neural networks.';

      const result = sourceAttributionService.buildAttribution(mockSources, generatedContent);

      expect(result).toMatchObject({
        totalSources: expect.any(Number),
        primarySources: expect.any(Array),
        diversityScore: expect.any(Number),
        sources: expect.any(Array),
        citations: expect.any(Array)
      });

      expect(result.diversityScore).toBeGreaterThanOrEqual(0);
      expect(result.diversityScore).toBeLessThanOrEqual(1);
    });

    it('should calculate usage weights correctly', () => {
      const generatedContent = 'This summary talks about artificial intelligence and machine learning extensively.';

      const result = sourceAttributionService.buildAttribution(mockSources, generatedContent);

      // Sources should have updated usage weights
      result.sources.forEach(source => {
        expect(source.usageWeight).toBeGreaterThanOrEqual(0);
        expect(source.usageWeight).toBeLessThanOrEqual(1);
      });
    });

    it('should identify primary sources', () => {
      const generatedContent = 'Artificial intelligence research shows [Source 1] significant progress.';

      const result = sourceAttributionService.buildAttribution(mockSources, generatedContent);

      expect(result.primarySources).toBeInstanceOf(Array);
      expect(result.primarySources.length).toBeLessThanOrEqual(5);
    });

    it('should extract citations when enabled', () => {
      const generatedContent = 'Recent research [Source 1] shows that AI [Source 2] is advancing rapidly.';

      const result = sourceAttributionService.buildAttribution(mockSources, generatedContent);

      if (mockConfig.enableCitationParsing) {
        expect(result.citations.length).toBeGreaterThan(0);
        result.citations.forEach(citation => {
          expect(citation.sourceId).toBeDefined();
          expect(citation.citedText).toBeDefined();
          expect(citation.startIndex).toBeGreaterThanOrEqual(0);
        });
      }
    });
  });

  describe('validateAttribution', () => {
    it('should validate correct attribution', () => {
      const validAttribution: SourceAttribution = {
        sources: [
          {
            id: 'source1',
            type: 'scraped_page',
            title: 'Test',
            relevance: 0.8,
            usageWeight: 0.5,
            content: 'test content',
            metadata: {}
          }
        ],
        citations: [
          {
            sourceId: 'source1',
            citedText: 'test citation',
            startIndex: 0,
            endIndex: 10,
            format: 'inline'
          }
        ],
        totalSources: 1,
        primarySources: ['source1'],
        diversityScore: 0.5
      };

      const result = sourceAttributionService.validateAttribution(validAttribution);
      expect(result).toBe(true);
    });

    it('should reject attribution with invalid citations', () => {
      const invalidAttribution: SourceAttribution = {
        sources: [
          {
            id: 'source1',
            type: 'scraped_page',
            title: 'Test',
            relevance: 0.8,
            usageWeight: 0.5,
            content: 'test content',
            metadata: {}
          }
        ],
        citations: [
          {
            sourceId: 'nonexistent-source',
            citedText: 'test citation',
            startIndex: 0,
            endIndex: 10,
            format: 'inline'
          }
        ],
        totalSources: 1,
        primarySources: ['source1'],
        diversityScore: 0.5
      };

      const result = sourceAttributionService.validateAttribution(invalidAttribution);
      expect(result).toBe(false);
    });
  });

  describe('formatCitationsForDisplay', () => {
    const mockCitations = [
      {
        sourceId: 'source1',
        citedText: 'test citation',
        startIndex: 0,
        endIndex: 10,
        format: 'inline' as const
      }
    ];

    const mockSources: ContentSource[] = [
      {
        id: 'source1',
        type: 'scraped_page',
        title: 'Test Source',
        url: 'https://example.com/test',
        relevance: 0.8,
        usageWeight: 0.5,
        content: 'test content',
        metadata: {}
      }
    ];

    it('should format inline citations', () => {
      const result = sourceAttributionService.formatCitationsForDisplay(
        mockCitations,
        mockSources,
        'inline'
      );

      expect(result).toContain('Test Source');
      expect(result).toContain('https://example.com/test');
    });

    it('should format footnote citations', () => {
      const result = sourceAttributionService.formatCitationsForDisplay(
        mockCitations,
        mockSources,
        'footnote'
      );

      expect(result).toContain('1.');
      expect(result).toContain('Test Source');
    });

    it('should format reference list', () => {
      const result = sourceAttributionService.formatCitationsForDisplay(
        mockCitations,
        mockSources,
        'reference_list'
      );

      expect(result).toContain('SCRAPED PAGE');
      expect(result).toContain('Test Source');
    });
  });

  describe('getAttributionStats', () => {
    it('should calculate attribution statistics', () => {
      const mockAttribution: SourceAttribution = {
        sources: [
          {
            id: 'source1',
            type: 'scraped_page',
            title: 'Test',
            relevance: 0.8,
            usageWeight: 0.6,
            content: 'test',
            metadata: {}
          },
          {
            id: 'source2',
            type: 'wiki_page',
            title: 'Test 2',
            relevance: 0.7,
            usageWeight: 0.4,
            content: 'test',
            metadata: {}
          }
        ],
        citations: [],
        totalSources: 2,
        primarySources: ['source1'],
        diversityScore: 0.8
      };

      const stats = sourceAttributionService.getAttributionStats(mockAttribution);

      expect(stats).toMatchObject({
        totalSources: 2,
        primarySources: 1,
        totalCitations: 0,
        diversityScore: 0.8,
        sourceTypes: { 'scraped_page': 1, 'wiki_page': 1 },
        averageRelevance: 0.75,
        averageUsageWeight: 0.5
      });
    });
  });

  describe('error handling', () => {
    it('should handle malformed search results', async () => {
      const malformedResults = [
        { id: 'test' }, // Missing required fields
        null,
        undefined
      ];

      const result = await sourceAttributionService.convertToContentSources(malformedResults);

      // Should handle errors gracefully and continue processing
      expect(result).toBeInstanceOf(Array);
    });
  });
});