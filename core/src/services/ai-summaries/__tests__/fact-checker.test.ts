/**
 * FactChecker Unit Tests
 */

import { FactChecker } from '../fact-checker';
import { LLMService } from '../../nlp/llm-service';
import { 
  ContentSource, 
  FactCheck, 
  HallucinationCheck
} from '../../../shared/types/ai-summaries';

// Mock LLMService
jest.mock('../../nlp/llm-service');

describe('FactChecker', () => {
  let factChecker: FactChecker;
  let mockLLMService: jest.Mocked<LLMService>;

  const mockContentSources: ContentSource[] = [
    {
      id: 'source1',
      url: 'https://example.com/science-article',
      title: 'Climate Change Research',
      content: 'Recent studies show that global temperatures have risen by 1.1°C since pre-industrial times. This warming is primarily caused by greenhouse gas emissions from human activities.',
      type: 'web_page',
      lastModified: new Date('2024-01-01'),
      metadata: {
        author: 'Dr. Climate Scientist',
        publishDate: '2024-01-01',
        wordCount: 500
      }
    },
    {
      id: 'source2',
      url: 'https://example.com/research-paper',
      title: 'IPCC Report Summary',
      content: 'The Intergovernmental Panel on Climate Change reports high confidence that human influence has been the dominant driver of observed warming since the mid-20th century.',
      type: 'document',
      lastModified: new Date('2024-01-02'),
      metadata: {
        author: 'IPCC',
        publishDate: '2024-01-02',
        wordCount: 300
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockLLMService = new LLMService({} as any) as jest.Mocked<LLMService>;
    factChecker = new FactChecker(mockLLMService);
  });

  describe('checkFactualAccuracy', () => {
    const summary = 'Global temperatures have increased by 1.1°C since pre-industrial times due to human greenhouse gas emissions.';

    beforeEach(() => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            claim: 'Global temperatures have increased by 1.1°C since pre-industrial times',
            isAccurate: true,
            confidence: 0.95,
            sources: ['source1'],
            context: 'This claim is directly supported by the source material which states the same temperature increase.'
          },
          {
            claim: 'Temperature increase is due to human greenhouse gas emissions',
            isAccurate: true,
            confidence: 0.90,
            sources: ['source1', 'source2'],
            context: 'Both sources confirm human activities as the primary cause of warming.'
          }
        ]),
        usage: { totalTokens: 150 }
      });
    });

    it('should check factual accuracy successfully', async () => {
      const result = await factChecker.checkFactualAccuracy(summary, mockContentSources);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        claim: 'Global temperatures have increased by 1.1°C since pre-industrial times',
        isAccurate: true,
        confidence: 0.95,
        sources: ['source1'],
        context: expect.any(String)
      });
      expect(result[1]).toMatchObject({
        claim: 'Temperature increase is due to human greenhouse gas emissions',
        isAccurate: true,
        confidence: 0.90,
        sources: ['source1', 'source2']
      });
    });

    it('should handle inaccurate claims', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            claim: 'Global temperatures have decreased in recent years',
            isAccurate: false,
            confidence: 0.85,
            sources: [],
            context: 'This claim contradicts the evidence in the source material which shows temperature increases.'
          }
        ]),
        usage: { totalTokens: 100 }
      });

      const inaccurateSummary = 'Global temperatures have decreased in recent years.';
      const result = await factChecker.checkFactualAccuracy(inaccurateSummary, mockContentSources);

      expect(result).toHaveLength(1);
      expect(result[0].isAccurate).toBe(false);
      expect(result[0].confidence).toBe(0.85);
    });

    it('should handle malformed LLM responses', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: 'Invalid JSON response',
        usage: { totalTokens: 50 }
      });

      await expect(factChecker.checkFactualAccuracy(summary, mockContentSources))
        .rejects.toThrow('Failed to parse fact-check results');
    });

    it('should handle LLM service errors', async () => {
      mockLLMService.generateCompletion.mockRejectedValue(new Error('LLM API error'));

      await expect(factChecker.checkFactualAccuracy(summary, mockContentSources))
        .rejects.toThrow('Failed to perform fact checking: LLM API error');
    });

    it('should include source content in fact-check prompt', async () => {
      await factChecker.checkFactualAccuracy(summary, mockContentSources);

      const callArgs = mockLLMService.generateCompletion.mock.calls[0];
      const prompt = callArgs[0];

      expect(prompt).toContain('Climate Change Research');
      expect(prompt).toContain('global temperatures have risen by 1.1°C');
      expect(prompt).toContain('IPCC Report Summary');
    });
  });

  describe('detectHallucinations', () => {
    const summary = 'Global temperatures have increased by 1.1°C since pre-industrial times. Additionally, unicorns have been spotted in Antarctica due to climate change.';

    beforeEach(() => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'unicorns have been spotted in Antarctica',
            riskLevel: 'high',
            confidence: 0.95,
            reasoning: 'This claim has no basis in reality and is clearly a hallucination with no supporting evidence.',
            suggestedCorrection: 'Remove this unsupported claim about unicorns.'
          }
        ]),
        usage: { totalTokens: 120 }
      });
    });

    it('should detect hallucinations successfully', async () => {
      const result = await factChecker.detectHallucinations(summary, mockContentSources);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        text: 'unicorns have been spotted in Antarctica',
        riskLevel: 'high',
        confidence: 0.95,
        reasoning: expect.stringContaining('hallucination'),
        suggestedCorrection: expect.stringContaining('Remove this unsupported claim')
      });
    });

    it('should handle content with no hallucinations', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([]),
        usage: { totalTokens: 80 }
      });

      const accurateSummary = 'Global temperatures have increased by 1.1°C since pre-industrial times.';
      const result = await factChecker.detectHallucinations(accurateSummary, mockContentSources);

      expect(result).toHaveLength(0);
    });

    it('should handle different risk levels', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'approximately 1.1°C increase',
            riskLevel: 'low',
            confidence: 0.3,
            reasoning: 'Minor imprecision in wording but substantially accurate.',
            suggestedCorrection: 'Use more precise language: exactly 1.1°C.'
          },
          {
            text: 'temperatures will increase by 10°C next year',
            riskLevel: 'critical',
            confidence: 0.99,
            reasoning: 'This prediction is completely unsupported and scientifically impossible.',
            suggestedCorrection: 'Remove this unfounded prediction.'
          }
        ]),
        usage: { totalTokens: 160 }
      });

      const result = await factChecker.detectHallucinations(summary, mockContentSources);

      expect(result).toHaveLength(2);
      expect(result[0].riskLevel).toBe('low');
      expect(result[1].riskLevel).toBe('critical');
    });

    it('should handle malformed hallucination detection responses', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: 'Not valid JSON',
        usage: { totalTokens: 50 }
      });

      await expect(factChecker.detectHallucinations(summary, mockContentSources))
        .rejects.toThrow('Failed to parse hallucination detection results');
    });
  });

  describe('calculateOverallRisk', () => {
    it('should calculate risk correctly with no hallucinations', async () => {
      mockLLMService.generateCompletion
        .mockResolvedValueOnce({
          content: JSON.stringify([
            { claim: 'test', isAccurate: true, confidence: 0.9, sources: [], context: '' }
          ]),
          usage: { totalTokens: 100 }
        })
        .mockResolvedValueOnce({
          content: JSON.stringify([]),
          usage: { totalTokens: 50 }
        });

      const summary = 'Test summary';
      const factChecks = await factChecker.checkFactualAccuracy(summary, mockContentSources);
      const hallucinations = await factChecker.detectHallucinations(summary, mockContentSources);

      const risk = factChecker.calculateOverallRisk(factChecks, hallucinations);
      expect(risk).toBe('low');
    });

    it('should calculate risk correctly with high-risk hallucinations', async () => {
      const factChecks: FactCheck[] = [
        { claim: 'test', isAccurate: true, confidence: 0.9, sources: [], context: '' }
      ];
      const hallucinations: HallucinationCheck[] = [
        {
          text: 'fake info',
          riskLevel: 'critical',
          confidence: 0.95,
          reasoning: 'test',
          suggestedCorrection: 'test'
        }
      ];

      const risk = factChecker.calculateOverallRisk(factChecks, hallucinations);
      expect(risk).toBe('critical');
    });

    it('should calculate risk correctly with mixed accuracy', async () => {
      const factChecks: FactCheck[] = [
        { claim: 'accurate', isAccurate: true, confidence: 0.9, sources: [], context: '' },
        { claim: 'inaccurate', isAccurate: false, confidence: 0.8, sources: [], context: '' }
      ];
      const hallucinations: HallucinationCheck[] = [
        {
          text: 'minor issue',
          riskLevel: 'low',
          confidence: 0.4,
          reasoning: 'test',
          suggestedCorrection: 'test'
        }
      ];

      const risk = factChecker.calculateOverallRisk(factChecks, hallucinations);
      expect(risk).toBe('medium');
    });
  });

  describe('error handling', () => {
    it('should handle empty summary input', async () => {
      await expect(factChecker.checkFactualAccuracy('', mockContentSources))
        .rejects.toThrow('Summary cannot be empty');

      await expect(factChecker.detectHallucinations('', mockContentSources))
        .rejects.toThrow('Summary cannot be empty');
    });

    it('should handle empty content sources', async () => {
      await expect(factChecker.checkFactualAccuracy('test summary', []))
        .rejects.toThrow('No content sources provided for fact checking');

      await expect(factChecker.detectHallucinations('test summary', []))
        .rejects.toThrow('No content sources provided for hallucination detection');
    });
  });
});