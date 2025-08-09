import { DatabaseManager } from '../../utils/database.js';
import { LLMService } from './llm-service.js';
import {
  IntentClassification,
  QueryIntent,
  IntentSuggestion,
  IntentFeedback,
  IntentTrainingData,
  QueryContext,
  LLMProvider
} from '../../shared/types/nlp.js';
import * as natural from 'natural';

export interface IntentFeatures {
  hasQuestionWords: boolean;
  hasComparisonWords: boolean;
  hasNavigationWords: boolean;
  hasHowToWords: boolean;
  hasDefinitionWords: boolean;
  hasTroubleshootingWords: boolean;
  wordCount: number;
  hasCodeTerms: boolean;
  hasTechnicalTerms: boolean;
  sentimentScore: number;
}

export class IntentClassifier {
  private readonly questionWords = [
    'what', 'how', 'why', 'when', 'where', 'which', 'who', 'can', 'could', 'should', 'would', 'is', 'are', 'do', 'does', 'will'
  ];

  private readonly comparisonWords = [
    'vs', 'versus', 'compare', 'comparison', 'difference', 'between', 'better', 'best', 'worse', 'worst', 'alternative', 'instead'
  ];

  private readonly navigationWords = [
    'go', 'navigate', 'show', 'open', 'find', 'search', 'look', 'browse', 'view', 'display', 'list', 'get'
  ];

  private readonly howToWords = [
    'how to', 'tutorial', 'guide', 'step', 'instructions', 'learn', 'teach', 'explain', 'demonstrate', 'walkthrough', 'setup', 'install'
  ];

  private readonly definitionWords = [
    'what is', 'define', 'definition', 'meaning', 'explain', 'describe', 'overview', 'introduction', 'about', 'concept'
  ];

  private readonly troubleshootingWords = [
    'fix', 'error', 'problem', 'issue', 'bug', 'trouble', 'debug', 'solve', 'resolve', 'broken', 'not working', 'fails', 'crash'
  ];

  private readonly codeTerms = [
    'code', 'function', 'method', 'class', 'variable', 'api', 'library', 'framework', 'database', 'server', 'client', 'syntax', 'algorithm'
  ];

  private readonly technicalTerms = [
    'docker', 'kubernetes', 'react', 'javascript', 'typescript', 'python', 'java', 'node', 'express', 'mongodb', 'sql', 'git', 'aws'
  ];

  constructor(
    private llmService: LLMService,
    private db?: DatabaseManager
  ) {}

  // Main intent classification method
  async classifyIntent(query: string, context?: QueryContext): Promise<IntentClassification> {
    const startTime = Date.now();
    
    try {
      // Extract features from the query
      const features = this.extractFeatures(query);
      
      // Try rule-based classification first (fast)
      const ruleBasedResult = this.classifyWithRules(query, features);
      
      // Use LLM for more sophisticated classification if needed
      let llmResult: IntentClassification | null = null;
      
      if (ruleBasedResult.confidence < 0.8) {
        try {
          llmResult = await this.llmService.classifySearchIntent(query);
        } catch (error) {
          console.warn('LLM intent classification failed, falling back to rule-based:', error);
        }
      }

      // Combine results or use the most confident one
      const finalResult = this.combineClassificationResults(ruleBasedResult, llmResult, features);
      
      // Store classification for learning
      if (this.db) {
        await this.storeClassificationResult(query, finalResult, Date.now() - startTime);
      }

      return finalResult;
    } catch (error) {
      console.error('Intent classification failed:', error);
      
      // Return fallback classification
      return {
        intent: 'search',
        confidence: 0.3,
        alternatives: [],
        reasoning: 'Fallback due to classification error',
        features: this.extractFeatures(query)
      };
    }
  }

  // Get confidence for specific intent
  async getIntentConfidence(query: string, intent: QueryIntent): Promise<number> {
    const classification = await this.classifyIntent(query);
    
    if (classification.intent === intent) {
      return classification.confidence;
    }
    
    // Check alternatives
    const alternative = classification.alternatives.find(alt => alt.intent === intent);
    return alternative ? alternative.confidence : 0.0;
  }

  // Suggest alternative intents
  async suggestAlternativeIntents(query: string): Promise<IntentSuggestion[]> {
    const classification = await this.classifyIntent(query);
    
    const suggestions: IntentSuggestion[] = [];
    
    // Convert alternatives to suggestions
    for (const alternative of classification.alternatives) {
      const suggestedQuery = await this.generateQueryForIntent(query, alternative.intent);
      
      suggestions.push({
        intent: alternative.intent,
        confidence: alternative.confidence,
        suggestedQuery,
        reasoning: `Query might be better phrased as a ${alternative.intent} query`
      });
    }

    return suggestions;
  }

  // Learn from feedback
  async learnFromFeedback(feedback: IntentFeedback[]): Promise<void> {
    if (!this.db) {
      console.warn('No database available for learning from feedback');
      return;
    }

    try {
      for (const fb of feedback) {
        // Store feedback in database
        await this.db.query(`
          INSERT INTO query_intent_history (query_hash, predicted_intent, actual_intent, confidence_score, model_version, feedback_provided)
          VALUES ($1, $2, $3, $4, $5, true)
          ON CONFLICT (query_hash) 
          DO UPDATE SET actual_intent = $3, feedback_provided = true
        `, [
          fb.queryHash,
          fb.predictedIntent,
          fb.actualIntent,
          fb.confidence,
          '1.0.0'
        ]);
      }

      console.log(`Learned from ${feedback.length} feedback entries`);
    } catch (error) {
      console.error('Failed to learn from feedback:', error);
    }
  }

  // Update classification model
  async updateClassificationModel(trainingData: IntentTrainingData[]): Promise<void> {
    console.log(`Received ${trainingData.length} training examples for model update`);
    
    // In a production system, this would trigger model retraining
    // For now, we log the data for future use
    
    if (this.db) {
      try {
        for (const data of trainingData) {
          await this.db.query(`
            INSERT INTO query_intent_history (query_hash, predicted_intent, confidence_score, model_version)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (query_hash) DO NOTHING
          `, [
            this.createQueryHash(data.query),
            data.intent,
            data.confidence,
            '1.0.0'
          ]);
        }
      } catch (error) {
        console.error('Failed to store training data:', error);
      }
    }
  }

  // Extract features from query
  private extractFeatures(query: string): IntentFeatures {
    const lowerQuery = query.toLowerCase();
    const tokenizer = new natural.WordTokenizer();
    const words = tokenizer.tokenize(lowerQuery) || [];
    
    return {
      hasQuestionWords: this.containsAny(lowerQuery, this.questionWords),
      hasComparisonWords: this.containsAny(lowerQuery, this.comparisonWords),
      hasNavigationWords: this.containsAny(lowerQuery, this.navigationWords),
      hasHowToWords: this.containsAny(lowerQuery, this.howToWords),
      hasDefinitionWords: this.containsAny(lowerQuery, this.definitionWords),
      hasTroubleshootingWords: this.containsAny(lowerQuery, this.troubleshootingWords),
      wordCount: words.length,
      hasCodeTerms: this.containsAny(lowerQuery, this.codeTerms),
      hasTechnicalTerms: this.containsAny(lowerQuery, this.technicalTerms),
      sentimentScore: this.calculateSentiment(query)
    };
  }

  // Rule-based classification
  private classifyWithRules(query: string, features: IntentFeatures): IntentClassification {
    const alternatives: { intent: QueryIntent; confidence: number }[] = [];
    let primaryIntent: QueryIntent = 'search';
    let primaryConfidence = 0.5;
    let reasoning = 'Default classification';

    // Troubleshooting patterns (highest priority)
    if (features.hasTroubleshootingWords) {
      primaryIntent = 'troubleshoot';
      primaryConfidence = 0.9;
      reasoning = 'Contains troubleshooting keywords';
      alternatives.push({ intent: 'question', confidence: 0.3 });
    }
    // How-to/tutorial patterns
    else if (features.hasHowToWords || query.toLowerCase().includes('how to')) {
      primaryIntent = 'tutorial';
      primaryConfidence = 0.85;
      reasoning = 'Contains tutorial/how-to keywords';
      alternatives.push({ intent: 'question', confidence: 0.4 });
    }
    // Definition patterns
    else if (features.hasDefinitionWords) {
      primaryIntent = 'definition';
      primaryConfidence = 0.8;
      reasoning = 'Contains definition keywords';
      alternatives.push({ intent: 'question', confidence: 0.5 });
    }
    // Comparison patterns
    else if (features.hasComparisonWords) {
      primaryIntent = 'comparison';
      primaryConfidence = 0.85;
      reasoning = 'Contains comparison keywords';
      alternatives.push({ intent: 'search', confidence: 0.4 });
    }
    // Question patterns
    else if (features.hasQuestionWords && (query.includes('?') || features.hasQuestionWords)) {
      primaryIntent = 'question';
      primaryConfidence = 0.75;
      reasoning = 'Contains question words or question mark';
      alternatives.push({ intent: 'search', confidence: 0.4 });
    }
    // Navigation patterns
    else if (features.hasNavigationWords && !features.hasQuestionWords) {
      primaryIntent = 'navigation';
      primaryConfidence = 0.7;
      reasoning = 'Contains navigation keywords';
      alternatives.push({ intent: 'search', confidence: 0.5 });
    }
    // Default to search
    else {
      primaryIntent = 'search';
      primaryConfidence = 0.6;
      reasoning = 'Default search classification';
      alternatives.push({ intent: 'question', confidence: 0.3 });
    }

    // Boost confidence for technical queries
    if (features.hasCodeTerms || features.hasTechnicalTerms) {
      primaryConfidence = Math.min(1.0, primaryConfidence + 0.1);
    }

    return {
      intent: primaryIntent,
      confidence: primaryConfidence,
      alternatives,
      reasoning,
      features
    };
  }

  // Combine rule-based and LLM results
  private combineClassificationResults(
    rulesBased: IntentClassification,
    llmBased: IntentClassification | null,
    features: IntentFeatures
  ): IntentClassification {
    if (!llmBased || llmBased.confidence < 0.5) {
      return rulesBased;
    }

    // If both have high confidence and agree, use higher confidence
    if (rulesBased.intent === llmBased.intent) {
      return {
        intent: rulesBased.intent,
        confidence: Math.max(rulesBased.confidence, llmBased.confidence),
        alternatives: this.mergeAlternatives(rulesBased.alternatives, llmBased.alternatives),
        reasoning: `Rule-based and LLM agree: ${rulesBased.reasoning}`,
        features
      };
    }

    // If they disagree, use the one with higher confidence
    if (llmBased.confidence > rulesBased.confidence + 0.1) {
      return {
        ...llmBased,
        features,
        reasoning: `LLM override: ${llmBased.reasoning}`
      };
    }

    // Default to rules-based if close
    return {
      ...rulesBased,
      alternatives: [
        ...rulesBased.alternatives,
        { intent: llmBased.intent, confidence: llmBased.confidence }
      ].slice(0, 3) // Keep top 3 alternatives
    };
  }

  // Helper methods
  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  private calculateSentiment(query: string): number {
    // Simple sentiment analysis using natural
    try {
      const tokenizer = new natural.WordTokenizer();
      const tokens = tokenizer.tokenize(query.toLowerCase()) || [];
      const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
      const result = analyzer.getSentiment(tokens);
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      return 0;
    }
  }

  private mergeAlternatives(
    alternatives1: { intent: QueryIntent; confidence: number }[],
    alternatives2: { intent: QueryIntent; confidence: number }[]
  ): { intent: QueryIntent; confidence: number }[] {
    const merged = new Map<QueryIntent, number>();
    
    // Add from first set
    alternatives1.forEach(alt => {
      merged.set(alt.intent, Math.max(merged.get(alt.intent) || 0, alt.confidence));
    });
    
    // Add from second set
    alternatives2.forEach(alt => {
      merged.set(alt.intent, Math.max(merged.get(alt.intent) || 0, alt.confidence));
    });
    
    // Convert back to array and sort by confidence
    return Array.from(merged.entries())
      .map(([intent, confidence]) => ({ intent, confidence }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  private async generateQueryForIntent(originalQuery: string, intent: QueryIntent): Promise<string> {
    // Transform query to better match the intent
    switch (intent) {
      case 'question':
        if (!originalQuery.includes('?') && !this.containsAny(originalQuery.toLowerCase(), this.questionWords)) {
          return `What is ${originalQuery}?`;
        }
        break;
      case 'tutorial':
        if (!this.containsAny(originalQuery.toLowerCase(), this.howToWords)) {
          return `How to ${originalQuery}`;
        }
        break;
      case 'definition':
        if (!this.containsAny(originalQuery.toLowerCase(), this.definitionWords)) {
          return `Define ${originalQuery}`;
        }
        break;
      case 'troubleshoot':
        if (!this.containsAny(originalQuery.toLowerCase(), this.troubleshootingWords)) {
          return `Fix ${originalQuery} error`;
        }
        break;
      case 'comparison':
        if (!this.containsAny(originalQuery.toLowerCase(), this.comparisonWords)) {
          return `Compare ${originalQuery}`;
        }
        break;
    }
    
    return originalQuery;
  }

  private async storeClassificationResult(
    query: string,
    result: IntentClassification,
    processingTime: number
  ): Promise<void> {
    if (!this.db) return;

    try {
      const queryHash = this.createQueryHash(query);
      
      await this.db.query(`
        INSERT INTO query_intent_history (query_hash, predicted_intent, confidence_score, model_version, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (query_hash) 
        DO UPDATE SET 
          predicted_intent = $2, 
          confidence_score = $3,
          created_at = NOW()
      `, [queryHash, result.intent, result.confidence, '1.0.0']);
    } catch (error) {
      console.error('Failed to store classification result:', error);
    }
  }

  private createQueryHash(query: string): string {
    return require('crypto').createHash('sha256').update(query.toLowerCase().trim()).digest('hex').substring(0, 16);
  }

  // Performance metrics
  async getClassificationMetrics(): Promise<{
    totalClassifications: number;
    accuracyRate: number;
    averageConfidence: number;
    intentDistribution: Record<QueryIntent, number>;
  }> {
    if (!this.db) {
      return {
        totalClassifications: 0,
        accuracyRate: 0,
        averageConfidence: 0,
        intentDistribution: {} as Record<QueryIntent, number>
      };
    }

    try {
      // Get total classifications
      const totalResult = await this.db.query(`
        SELECT COUNT(*) as total FROM query_intent_history
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      
      const total = parseInt(totalResult.rows[0].total);

      // Get accuracy (where feedback was provided and matches)
      const accuracyResult = await this.db.query(`
        SELECT COUNT(*) as correct FROM query_intent_history
        WHERE feedback_provided = true 
        AND predicted_intent = actual_intent
        AND created_at > NOW() - INTERVAL '30 days'
      `);
      
      const feedbackResult = await this.db.query(`
        SELECT COUNT(*) as total_feedback FROM query_intent_history
        WHERE feedback_provided = true
        AND created_at > NOW() - INTERVAL '30 days'
      `);

      const correct = parseInt(accuracyResult.rows[0].correct);
      const totalWithFeedback = parseInt(feedbackResult.rows[0].total_feedback);
      const accuracyRate = totalWithFeedback > 0 ? correct / totalWithFeedback : 0;

      // Get average confidence
      const confidenceResult = await this.db.query(`
        SELECT AVG(confidence_score) as avg_confidence FROM query_intent_history
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);
      
      const averageConfidence = parseFloat(confidenceResult.rows[0].avg_confidence) || 0;

      // Get intent distribution
      const distributionResult = await this.db.query(`
        SELECT predicted_intent, COUNT(*) as count 
        FROM query_intent_history
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY predicted_intent
      `);

      const intentDistribution: Record<QueryIntent, number> = {} as Record<QueryIntent, number>;
      distributionResult.rows.forEach(row => {
        intentDistribution[row.predicted_intent as QueryIntent] = parseInt(row.count);
      });

      return {
        totalClassifications: total,
        accuracyRate,
        averageConfidence,
        intentDistribution
      };
    } catch (error) {
      console.error('Failed to get classification metrics:', error);
      return {
        totalClassifications: 0,
        accuracyRate: 0,
        averageConfidence: 0,
        intentDistribution: {} as Record<QueryIntent, number>
      };
    }
  }
}