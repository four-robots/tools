import { IntentClassifier } from '../intent-classifier.js';
import { LLMService } from '../llm-service.js';
import { DatabaseManager } from '../../../utils/database.js';
import {
  QueryIntent,
  IntentClassification,
  IntentFeedback,
  IntentTrainingData
} from '../../../shared/types/nlp.js';

// Mock dependencies
jest.mock('../llm-service.js');
jest.mock('../../../utils/database.js');

describe('IntentClassifier', () => {
  let classifier: IntentClassifier;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockDb: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    mockLLMService = {
      classifySearchIntent: jest.fn(),
      generateCompletion: jest.fn()
    } as any;

    classifier = new IntentClassifier(mockLLMService, mockDb);
  });

  describe('Rule-based Classification', () => {
    it('should classify search queries correctly', async () => {
      const result = await classifier.classifyIntent('find React documentation');

      expect(result.intent).toBe('search');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasoning).toContain('navigation');
    });

    it('should classify question queries correctly', async () => {
      const result = await classifier.classifyIntent('What is React?');

      expect(result.intent).toBe('question');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.reasoning).toContain('question');
      expect(result.features?.hasQuestionWords).toBe(true);
    });

    it('should classify tutorial queries correctly', async () => {
      const queries = [
        'How to use React hooks',
        'Tutorial for JavaScript async/await',
        'Step by step guide for Docker setup',
        'Learn Python programming'
      ];

      for (const query of queries) {
        const result = await classifier.classifyIntent(query);
        expect(result.intent).toBe('tutorial');
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('should classify definition queries correctly', async () => {
      const queries = [
        'What is Docker?',
        'Define microservices',
        'Explain REST API',
        'What does JWT mean?'
      ];

      for (const query of queries) {
        const result = await classifier.classifyIntent(query);
        expect(result.intent).toBe('definition');
        expect(result.confidence).toBeGreaterThan(0.7);
      }
    });

    it('should classify comparison queries correctly', async () => {
      const queries = [
        'React vs Vue comparison',
        'Difference between SQL and NoSQL',
        'Compare Docker vs Kubernetes',
        'Which is better: Python or JavaScript?'
      ];

      for (const query of queries) {
        const result = await classifier.classifyIntent(query);
        expect(result.intent).toBe('comparison');
        expect(result.confidence).toBeGreaterThan(0.8);
      }
    });

    it('should classify troubleshooting queries correctly', async () => {
      const queries = [
        'Fix React build error',
        'Debug Node.js memory leak',
        'Solve Docker container not starting',
        'Resolve database connection problem'
      ];

      for (const query of queries) {
        const result = await classifier.classifyIntent(query);
        expect(result.intent).toBe('troubleshoot');
        expect(result.confidence).toBeGreaterThan(0.85);
      }
    });

    it('should classify navigation queries correctly', async () => {
      const queries = [
        'Go to user settings',
        'Show me the dashboard',
        'Open project configuration',
        'Display API documentation'
      ];

      for (const query of queries) {
        const result = await classifier.classifyIntent(query);
        expect(result.intent).toBe('navigation');
        expect(result.confidence).toBeGreaterThan(0.6);
      }
    });
  });

  describe('LLM-Enhanced Classification', () => {
    it('should use LLM for low-confidence rule-based results', async () => {
      // Mock low-confidence rule-based result
      mockLLMService.classifySearchIntent.mockResolvedValue({
        intent: 'tutorial',
        confidence: 0.9,
        alternatives: [],
        reasoning: 'LLM detected tutorial intent',
        features: {}
      });

      const result = await classifier.classifyIntent('complex ambiguous query');

      expect(mockLLMService.classifySearchIntent).toHaveBeenCalled();
      expect(result.intent).toBe('tutorial');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toContain('LLM override');
    });

    it('should combine rule-based and LLM results when they agree', async () => {
      mockLLMService.classifySearchIntent.mockResolvedValue({
        intent: 'question',
        confidence: 0.85,
        alternatives: [],
        reasoning: 'LLM agrees',
        features: {}
      });

      const result = await classifier.classifyIntent('What is Docker?');

      expect(result.intent).toBe('question'); // Both methods should agree
      expect(result.confidence).toBeGreaterThan(0.8); // Should use higher confidence
      expect(result.reasoning).toContain('agree');
    });

    it('should handle LLM failures gracefully', async () => {
      mockLLMService.classifySearchIntent.mockRejectedValue(new Error('LLM API failed'));

      const result = await classifier.classifyIntent('What is React?');

      // Should still work with rule-based classification
      expect(result.intent).toBe('definition'); // or 'question'
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Feature Extraction', () => {
    it('should detect question words', async () => {
      const result = await classifier.classifyIntent('What is the difference between React and Vue?');

      expect(result.features?.hasQuestionWords).toBe(true);
      expect(result.features?.hasComparisonWords).toBe(true);
    });

    it('should detect technical terms', async () => {
      const result = await classifier.classifyIntent('JavaScript API development');

      expect(result.features?.hasCodeTerms).toBe(true);
      expect(result.features?.hasTechnicalTerms).toBe(true);
    });

    it('should count words correctly', async () => {
      const result = await classifier.classifyIntent('How to implement React hooks');

      expect(result.features?.wordCount).toBe(5);
    });

    it('should detect how-to patterns', async () => {
      const result = await classifier.classifyIntent('How to deploy Docker containers');

      expect(result.features?.hasHowToWords).toBe(true);
    });

    it('should detect troubleshooting patterns', async () => {
      const result = await classifier.classifyIntent('Fix database connection error');

      expect(result.features?.hasTroubleshootingWords).toBe(true);
    });
  });

  describe('Intent Confidence', () => {
    it('should return intent confidence for specific intent', async () => {
      const confidence = await classifier.getIntentConfidence('What is Docker?', 'definition');

      expect(confidence).toBeGreaterThan(0.7);
    });

    it('should return low confidence for mismatched intent', async () => {
      const confidence = await classifier.getIntentConfidence('What is Docker?', 'navigation');

      expect(confidence).toBeLessThan(0.3);
    });

    it('should check alternative intents', async () => {
      // Mock classification with alternatives
      jest.spyOn(classifier, 'classifyIntent').mockResolvedValue({
        intent: 'definition',
        confidence: 0.8,
        alternatives: [{ intent: 'question', confidence: 0.6 }],
        reasoning: 'Test',
        features: {}
      });

      const confidence = await classifier.getIntentConfidence('test query', 'question');

      expect(confidence).toBe(0.6); // Should find in alternatives
    });
  });

  describe('Alternative Suggestions', () => {
    it('should suggest alternative intents', async () => {
      jest.spyOn(classifier, 'classifyIntent').mockResolvedValue({
        intent: 'question',
        confidence: 0.7,
        alternatives: [
          { intent: 'definition', confidence: 0.5 },
          { intent: 'tutorial', confidence: 0.3 }
        ],
        reasoning: 'Test',
        features: {}
      });

      const suggestions = await classifier.suggestAlternativeIntents('What is React?');

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].intent).toBe('definition');
      expect(suggestions[0].suggestedQuery).toContain('Define');
    });

    it('should generate appropriate query suggestions', async () => {
      jest.spyOn(classifier, 'classifyIntent').mockResolvedValue({
        intent: 'search',
        confidence: 0.6,
        alternatives: [{ intent: 'tutorial', confidence: 0.4 }],
        reasoning: 'Test',
        features: {}
      });

      const suggestions = await classifier.suggestAlternativeIntents('React components');

      expect(suggestions[0].suggestedQuery).toContain('How to');
    });
  });

  describe('Learning and Feedback', () => {
    it('should store feedback in database', async () => {
      const feedback: IntentFeedback[] = [
        {
          queryHash: 'hash123',
          predictedIntent: 'search',
          actualIntent: 'question',
          confidence: 0.7,
          userId: 'user123',
          feedbackType: 'correction',
          timestamp: new Date()
        }
      ];

      await classifier.learnFromFeedback(feedback);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO query_intent_history'),
        expect.arrayContaining(['hash123', 'search', 'question', 0.7, '1.0.0'])
      );
    });

    it('should handle database errors gracefully during feedback', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      const feedback: IntentFeedback[] = [{
        queryHash: 'hash123',
        predictedIntent: 'search',
        actualIntent: 'question',
        confidence: 0.7,
        feedbackType: 'correction',
        timestamp: new Date()
      }];

      // Should not throw error
      await expect(classifier.learnFromFeedback(feedback)).resolves.toBeUndefined();
    });

    it('should update classification model with training data', async () => {
      const trainingData: IntentTrainingData[] = [
        {
          query: 'How to use React?',
          intent: 'tutorial',
          confidence: 0.9,
          entities: [],
          source: 'expert_annotation',
          timestamp: new Date()
        }
      ];

      await classifier.updateClassificationModel(trainingData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO query_intent_history'),
        expect.arrayContaining([expect.any(String), 'tutorial', 0.9, '1.0.0'])
      );
    });
  });

  describe('Classification Metrics', () => {
    it('should calculate classification metrics', async () => {
      // Mock database responses
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: 1000 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ correct: 850 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ total_feedback: 1000 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ avg_confidence: 0.78 }], rowCount: 1 })
        .mockResolvedValueOnce({ 
          rows: [
            { predicted_intent: 'search', count: 400 },
            { predicted_intent: 'question', count: 300 },
            { predicted_intent: 'tutorial', count: 200 },
            { predicted_intent: 'troubleshoot', count: 100 }
          ],
          rowCount: 4 
        });

      const metrics = await classifier.getClassificationMetrics();

      expect(metrics.totalClassifications).toBe(1000);
      expect(metrics.accuracyRate).toBe(0.85);
      expect(metrics.averageConfidence).toBe(0.78);
      expect(metrics.intentDistribution.search).toBe(400);
      expect(metrics.intentDistribution.question).toBe(300);
    });

    it('should handle missing database gracefully', async () => {
      const classifierWithoutDb = new IntentClassifier(mockLLMService);

      const metrics = await classifierWithoutDb.getClassificationMetrics();

      expect(metrics.totalClassifications).toBe(0);
      expect(metrics.accuracyRate).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queries', async () => {
      const result = await classifier.classifyIntent('');

      expect(result.intent).toBe('search'); // Default fallback
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should handle very short queries', async () => {
      const result = await classifier.classifyIntent('fix');

      expect(result.intent).toBe('troubleshoot');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle queries with special characters', async () => {
      const result = await classifier.classifyIntent('How to use React.js? @help #tutorial');

      expect(result.intent).toBe('tutorial');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should handle mixed language queries', async () => {
      const result = await classifier.classifyIntent('¿Qué es React? What is it?');

      expect(result.intent).toBe('definition'); // Should detect definition pattern
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle technical jargon', async () => {
      const result = await classifier.classifyIntent('kubectl apply -f deployment.yaml not working');

      expect(result.intent).toBe('troubleshoot');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Performance', () => {
    it('should classify intents quickly for simple queries', async () => {
      const start = Date.now();
      
      await classifier.classifyIntent('What is Docker?');
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Rule-based should be very fast
    });

    it('should handle batch classification efficiently', async () => {
      const queries = [
        'What is React?',
        'How to use Docker?',
        'Fix Node.js error',
        'Compare Python vs JavaScript',
        'Go to settings'
      ];

      const start = Date.now();
      
      const results = await Promise.all(
        queries.map(query => classifier.classifyIntent(query))
      );
      
      const duration = Date.now() - start;
      
      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(500); // Should handle batch efficiently
      
      // Verify correct classifications
      expect(results[0].intent).toBe('definition');
      expect(results[1].intent).toBe('tutorial');
      expect(results[2].intent).toBe('troubleshoot');
      expect(results[3].intent).toBe('comparison');
      expect(results[4].intent).toBe('navigation');
    });
  });
});