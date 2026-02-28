/**
 * Key Points Extractor
 * 
 * Extracts and organizes key information points from content sources
 * using LLM-powered analysis and content processing techniques.
 */

import { LLMService } from '../nlp/llm-service.js';
import type {
  ContentSource,
  KeyPoint,
  KeyPointCategory
} from '../../shared/types/ai-summaries.js';

/**
 * Configuration for key points extraction
 */
interface KeyPointsExtractorConfig {
  defaultLLMProvider: string;
  maxKeyPoints: number;
  minImportanceScore: number;
  minConfidenceScore: number;
}

/**
 * Key points extraction prompts
 */
class KeyPointsPrompts {
  static getExtractionPrompt(): string {
    return `You are an expert at extracting key information from technical content.
    Your task is to identify the most important points that would help someone understand the topic.

    For each key point, determine:
    1. The core information or insight
    2. Its importance (how critical it is to understanding)
    3. Your confidence in this assessment
    4. The category it belongs to
    5. Related concepts that connect to this point

    Categories:
    - "definition": What something is or means
    - "example": Concrete examples or use cases
    - "process": How something works or is done
    - "benefit": Advantages or positive aspects
    - "drawback": Limitations or negative aspects
    - "requirement": Prerequisites or necessary conditions
    - "implementation": How to put into practice
    - "comparison": How it relates to alternatives
    - "best_practice": Recommended approaches
    - "warning": Important caveats or risks

    Respond in JSON format with an array of key points:
    [
      {
        "text": "Clear, concise statement of the key point",
        "importance": 0.95,
        "confidence": 0.90,
        "category": "definition",
        "supportingSources": ["source identifiers that support this point"],
        "relatedConcepts": ["related terms or concepts"],
        "position": 1
      }
    ]

    Focus on:
    - Information that is essential for understanding
    - Points that are well-supported by the source material
    - Insights that provide practical value
    - Concepts that help build comprehensive understanding`;
  }

  static getContentAnalysisPrompt(): string {
    return `You are analyzing content to understand its structure and key themes.
    Identify the main topics, concepts, and information patterns in the provided content.

    Look for:
    - Core concepts and definitions
    - Important processes or procedures
    - Key benefits and limitations
    - Critical requirements or prerequisites
    - Practical examples and use cases
    - Important warnings or caveats
    - Best practices and recommendations

    Respond in JSON format:
    {
      "mainTopics": ["topic1", "topic2"],
      "concepts": ["concept1", "concept2"],
      "processes": ["process1", "process2"],
      "examples": ["example1", "example2"],
      "requirements": ["req1", "req2"],
      "warnings": ["warning1", "warning2"]
    }`;
  }

  static getOrganizationPrompt(): string {
    return `You are organizing key points into a logical structure.
    Arrange the provided key points in order of importance and logical flow.

    Consider:
    - Foundational concepts should come first
    - Build complexity gradually
    - Group related concepts together
    - End with practical applications

    Return the reorganized list with position numbers updated.`;
  }
}

export class KeyPointsExtractor {
  constructor(
    private llmService: LLMService,
    private config: KeyPointsExtractorConfig
  ) {}

  /**
   * Extract key points from content sources
   */
  async extractFromSources(sources: ContentSource[]): Promise<KeyPoint[]> {
    try {
      console.log(`📝 Extracting key points from ${sources.length} sources`);

      if (sources.length === 0) {
        return [];
      }

      // Analyze content structure first
      const contentAnalysis = await this.analyzeContentStructure(sources);

      // Extract key points using LLM
      const rawKeyPoints = await this.extractKeyPointsWithLLM(sources, contentAnalysis);

      // Process and validate key points
      const processedPoints = this.processKeyPoints(rawKeyPoints, sources);

      // Organize and prioritize key points
      const organizedPoints = await this.organizeKeyPoints(processedPoints);

      // Filter by quality thresholds
      const filteredPoints = this.filterKeyPoints(organizedPoints);

      console.log(`✅ Extracted ${filteredPoints.length} key points`);
      return filteredPoints;

    } catch (error) {
      console.error('❌ Key points extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract key points from raw content strings
   */
  async extractFromContent(contentArray: string[]): Promise<KeyPoint[]> {
    // Convert content strings to content sources
    const sources: ContentSource[] = contentArray.map((content, index) => ({
      id: `content-${index}`,
      type: 'scraped_page' as const,
      title: `Content ${index + 1}`,
      relevance: 1.0,
      usageWeight: 1.0,
      content,
      metadata: {}
    }));

    return this.extractFromSources(sources);
  }

  /**
   * Extract key points from a single source with detailed analysis
   */
  async extractFromSingleSource(
    source: ContentSource,
    maxPoints: number = 10
  ): Promise<KeyPoint[]> {
    try {
      // Analyze the source content
      const analysis = await this.analyzeSingleSource(source);

      // Extract key points based on analysis
      const keyPoints = await this.extractKeyPointsFromAnalysis(source, analysis, maxPoints);

      return keyPoints;

    } catch (error) {
      console.error('Single source extraction failed:', error);
      return [];
    }
  }

  /**
   * Analyze content structure and themes
   */
  private async analyzeContentStructure(sources: ContentSource[]): Promise<any> {
    try {
      const combinedContent = sources
        .map(source => `[${source.title}] ${source.content.substring(0, 1000)}`)
        .join('\n\n');

      const prompt = `Content to analyze:
${combinedContent}

Please analyze the structure and themes of this content.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        KeyPointsPrompts.getContentAnalysisPrompt(),
        this.config.defaultLLMProvider as any,
        0.2
      );

      return JSON.parse(response.content);

    } catch (error) {
      console.error('Content structure analysis failed:', error);
      return {
        mainTopics: [],
        concepts: [],
        processes: [],
        examples: [],
        requirements: [],
        warnings: []
      };
    }
  }

  /**
   * Extract key points using LLM analysis
   */
  private async extractKeyPointsWithLLM(
    sources: ContentSource[],
    contentAnalysis: any
  ): Promise<any[]> {
    try {
      const sourcesText = this.formatSourcesForExtraction(sources);
      const analysisText = JSON.stringify(contentAnalysis, null, 2);

      const prompt = `Content Analysis:
${analysisText}

Source Material:
${sourcesText}

Extract the most important key points from this content.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        KeyPointsPrompts.getExtractionPrompt(),
        this.config.defaultLLMProvider as any,
        0.2
      );

      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
      console.error('LLM key points extraction failed:', error);
      return [];
    }
  }

  /**
   * Process and validate extracted key points
   */
  private processKeyPoints(rawKeyPoints: any[], sources: ContentSource[]): KeyPoint[] {
    return rawKeyPoints
      .map(raw => this.parseKeyPoint(raw, sources))
      .filter(point => point !== null) as KeyPoint[];
  }

  /**
   * Parse raw key point data into KeyPoint object
   */
  private parseKeyPoint(raw: any, sources: ContentSource[]): KeyPoint | null {
    try {
      // Validate required fields
      if (!raw.text || typeof raw.text !== 'string') {
        return null;
      }

      // Find supporting sources
      const supportingSources = this.findSupportingSources(raw.text, sources, raw.supportingSources);

      return {
        text: raw.text.trim(),
        importance: Math.min(Math.max(raw.importance || 0.5, 0), 1),
        confidence: Math.min(Math.max(raw.confidence || 0.5, 0), 1),
        category: this.validateCategory(raw.category),
        supportingSources,
        relatedConcepts: Array.isArray(raw.relatedConcepts) ? 
          raw.relatedConcepts.filter((c: any) => typeof c === 'string') : [],
        position: raw.position || 0
      };

    } catch (error) {
      console.error('Failed to parse key point:', error);
      return null;
    }
  }

  /**
   * Find sources that support a key point
   */
  private findSupportingSources(
    keyPointText: string,
    sources: ContentSource[],
    suggestedSources?: string[]
  ): string[] {
    const supportingSources: string[] = [];
    const keyWords = this.extractKeyWords(keyPointText.toLowerCase());

    sources.forEach(source => {
      const sourceWords = this.extractKeyWords(source.content.toLowerCase());
      
      // Calculate word overlap
      const commonWords = keyWords.filter(word => sourceWords.includes(word));
      const overlapRatio = keyWords.length > 0 ? commonWords.length / keyWords.length : 0;
      
      // If significant overlap or explicitly suggested, include as supporting source
      if (overlapRatio > 0.3 || (suggestedSources && suggestedSources.includes(source.id))) {
        supportingSources.push(source.id);
      }
    });

    return supportingSources.slice(0, 5); // Limit to 5 supporting sources
  }

  /**
   * Organize key points in logical order
   */
  private async organizeKeyPoints(keyPoints: KeyPoint[]): Promise<KeyPoint[]> {
    if (keyPoints.length <= 1) {
      return keyPoints;
    }

    try {
      // Group by category for better organization
      const grouped = this.groupByCategory(keyPoints);
      
      // Order categories logically
      const orderedCategories: KeyPointCategory[] = [
        'definition', 'requirement', 'process', 'implementation', 
        'example', 'benefit', 'drawback', 'comparison', 'best_practice', 'warning'
      ];

      let position = 1;
      const organized: KeyPoint[] = [];

      // Process categories in order
      orderedCategories.forEach(category => {
        if (grouped[category]) {
          // Sort points within category by importance
          const categoryPoints = grouped[category]
            .sort((a, b) => b.importance - a.importance)
            .map(point => ({ ...point, position: position++ }));
          
          organized.push(...categoryPoints);
        }
      });

      // Add any points not in standard categories
      Object.keys(grouped).forEach(category => {
        if (!orderedCategories.includes(category as KeyPointCategory)) {
          const categoryPoints = grouped[category as KeyPointCategory] || [];
          const sortedPoints = categoryPoints
            .sort((a, b) => b.importance - a.importance)
            .map(point => ({ ...point, position: position++ }));
          
          organized.push(...sortedPoints);
        }
      });

      return organized;

    } catch (error) {
      console.error('Key points organization failed:', error);
      // Return points sorted by importance as fallback
      return keyPoints
        .sort((a, b) => b.importance - a.importance)
        .map((point, index) => ({ ...point, position: index + 1 }));
    }
  }

  /**
   * Group key points by category
   */
  private groupByCategory(keyPoints: KeyPoint[]): Record<KeyPointCategory, KeyPoint[]> {
    const grouped: Record<string, KeyPoint[]> = {};

    keyPoints.forEach(point => {
      const category = point.category || 'definition';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(point);
    });

    return grouped as Record<KeyPointCategory, KeyPoint[]>;
  }

  /**
   * Filter key points by quality thresholds
   */
  private filterKeyPoints(keyPoints: KeyPoint[]): KeyPoint[] {
    return keyPoints
      .filter(point => 
        point.importance >= this.config.minImportanceScore &&
        point.confidence >= this.config.minConfidenceScore
      )
      .slice(0, this.config.maxKeyPoints);
  }

  /**
   * Analyze a single source in detail
   */
  private async analyzeSingleSource(source: ContentSource): Promise<any> {
    try {
      const prompt = `Content to analyze in detail:
Title: ${source.title}
Type: ${source.type}
Content: ${source.content}

Please provide detailed analysis of this content.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        KeyPointsPrompts.getContentAnalysisPrompt(),
        this.config.defaultLLMProvider as any,
        0.2
      );

      return JSON.parse(response.content);

    } catch (error) {
      console.error('Single source analysis failed:', error);
      return { mainTopics: [], concepts: [], processes: [], examples: [], requirements: [], warnings: [] };
    }
  }

  /**
   * Extract key points from single source analysis
   */
  private async extractKeyPointsFromAnalysis(
    source: ContentSource,
    analysis: any,
    maxPoints: number
  ): Promise<KeyPoint[]> {
    try {
      const prompt = `Source: ${source.title}
Analysis: ${JSON.stringify(analysis, null, 2)}
Content: ${source.content.substring(0, 2000)}

Extract up to ${maxPoints} key points from this source.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        KeyPointsPrompts.getExtractionPrompt(),
        this.config.defaultLLMProvider as any,
        0.2
      );

      const parsed = JSON.parse(response.content);
      const rawPoints = Array.isArray(parsed) ? parsed : [];

      return this.processKeyPoints(rawPoints, [source]).slice(0, maxPoints);

    } catch (error) {
      console.error('Key points extraction from analysis failed:', error);
      return [];
    }
  }

  /**
   * Utility methods
   */

  private formatSourcesForExtraction(sources: ContentSource[]): string {
    return sources
      .map((source, index) => `[Source ${index + 1}] ${source.title}
Type: ${source.type}
Relevance: ${source.relevance.toFixed(2)}
Content: ${source.content.substring(0, 1500)}${source.content.length > 1500 ? '...' : ''}
---`)
      .join('\n\n');
  }

  private validateCategory(category: string): KeyPointCategory | undefined {
    const validCategories: KeyPointCategory[] = [
      'definition', 'example', 'process', 'benefit', 'drawback',
      'requirement', 'implementation', 'comparison', 'best_practice', 'warning'
    ];

    return validCategories.includes(category as KeyPointCategory) ? 
      category as KeyPointCategory : undefined;
  }

  private extractKeyWords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'must',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
      .map(word => word.toLowerCase());
  }

  /**
   * Get key points statistics
   */
  getExtractionStats(keyPoints: KeyPoint[]): {
    totalPoints: number;
    categoryBreakdown: Record<string, number>;
    averageImportance: number;
    averageConfidence: number;
    topCategories: Array<{ category: string; count: number }>;
  } {
    const categoryBreakdown: Record<string, number> = {};

    keyPoints.forEach(point => {
      const category = point.category || 'other';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    });

    const averageImportance = keyPoints.length > 0 ?
      keyPoints.reduce((sum, point) => sum + point.importance, 0) / keyPoints.length : 0;

    const averageConfidence = keyPoints.length > 0 ?
      keyPoints.reduce((sum, point) => sum + point.confidence, 0) / keyPoints.length : 0;

    const topCategories = Object.entries(categoryBreakdown)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalPoints: keyPoints.length,
      categoryBreakdown,
      averageImportance,
      averageConfidence,
      topCategories
    };
  }

  /**
   * Merge key points from multiple extractions
   */
  mergeKeyPoints(keyPointsArrays: KeyPoint[][]): KeyPoint[] {
    const allPoints = keyPointsArrays.flat();
    
    // Remove duplicates based on text similarity
    const uniquePoints = this.removeDuplicateKeyPoints(allPoints);

    // Re-organize and prioritize
    const sorted = uniquePoints.sort((a, b) => {
      // Prioritize by importance, then confidence
      if (Math.abs(a.importance - b.importance) > 0.1) {
        return b.importance - a.importance;
      }
      return b.confidence - a.confidence;
    });

    // Update positions
    return sorted
      .slice(0, this.config.maxKeyPoints)
      .map((point, index) => ({ ...point, position: index + 1 }));
  }

  /**
   * Remove duplicate key points based on text similarity
   */
  private removeDuplicateKeyPoints(keyPoints: KeyPoint[]): KeyPoint[] {
    const unique: KeyPoint[] = [];
    
    keyPoints.forEach(point => {
      const isDuplicate = unique.some(existing => 
        this.calculateTextSimilarity(point.text, existing.text) > 0.8
      );
      
      if (!isDuplicate) {
        unique.push(point);
      }
    });

    return unique;
  }

  /**
   * Calculate text similarity between two strings
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = this.extractKeyWords(text1);
    const words2 = this.extractKeyWords(text2);
    
    if (words1.length === 0 && words2.length === 0) return 1;
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const commonWords = words1.filter(word => words2.includes(word));
    return (2 * commonWords.length) / (words1.length + words2.length);
  }
}