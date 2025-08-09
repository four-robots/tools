/**
 * Result Merger for Unified Search
 * 
 * Handles intelligent merging, ranking, and deduplication of search results
 * from multiple content sources to provide the best unified experience.
 */

import crypto from 'crypto';
import type { 
  SearchResult, 
  SearchScore, 
  ContentType,
  SearchAggregations 
} from '../../shared/types/search.js';
import type { ProcessedQuery } from './QueryProcessor.js';

/**
 * Source-specific search results
 */
export interface SearchSourceResult {
  /** Source identifier */
  source: 'memory' | 'kanban' | 'wiki' | 'scraper';
  /** Results from this source */
  results: SearchResult[];
  /** Processing time for this source */
  processingTimeMs: number;
  /** Error if search failed */
  error?: Error;
}

/**
 * Result similarity calculation
 */
interface ResultSimilarity {
  /** First result */
  result1: SearchResult;
  /** Second result */
  result2: SearchResult;
  /** Similarity score (0.0 to 1.0) */
  similarity: number;
  /** Similarity type */
  type: 'content' | 'title' | 'metadata';
}

/**
 * Ranking factors configuration
 */
export interface RankingConfig {
  /** Weight for semantic similarity score */
  semanticWeight: number;
  /** Weight for text matching score */
  textMatchWeight: number;
  /** Weight for recency (newer is better) */
  recencyWeight: number;
  /** Weight for content quality */
  qualityWeight: number;
  /** Weight for source reliability */
  sourceReliabilityWeight: number;
  /** Weight for user interaction history */
  userHistoryWeight: number;
  /** Boost for exact title matches */
  titleMatchBoost: number;
  /** Boost for query intent matching */
  intentMatchBoost: number;
}

/**
 * Content source reliability scores
 */
const SOURCE_RELIABILITY: Record<string, number> = {
  'wiki': 0.9,      // High reliability - curated content
  'memory': 0.8,    // Good reliability - personal notes
  'kanban': 0.7,    // Moderate reliability - task tracking
  'scraper': 0.6    // Lower reliability - external content
};

/**
 * Content type importance scores
 */
const CONTENT_TYPE_IMPORTANCE: Record<ContentType, number> = {
  'wiki_page': 0.9,
  'memory_thought': 0.8,
  'kanban_card': 0.7,
  'scraped_page': 0.6,
  'scraped_content_chunk': 0.5,
  'code_file': 0.8,
  'code_chunk': 0.7
};

export class ResultMerger {
  private readonly defaultRankingConfig: RankingConfig = {
    semanticWeight: 0.35,
    textMatchWeight: 0.25,
    recencyWeight: 0.15,
    qualityWeight: 0.10,
    sourceReliabilityWeight: 0.08,
    userHistoryWeight: 0.05,
    titleMatchBoost: 0.2,
    intentMatchBoost: 0.15
  };

  constructor(
    private rankingConfig: Partial<RankingConfig> = {}
  ) {
    this.rankingConfig = { ...this.defaultRankingConfig, ...rankingConfig };
  }

  /**
   * Merge and rank results from multiple sources
   */
  async mergeAndRank(
    sourceResults: SearchSourceResult[],
    processedQuery: ProcessedQuery,
    similarityThreshold: number = 0.8
  ): Promise<SearchResult[]> {
    // Step 1: Extract all successful results
    const allResults = this.extractSuccessfulResults(sourceResults);
    
    if (allResults.length === 0) {
      return [];
    }

    // Step 2: Remove duplicates based on content similarity
    const deduplicatedResults = await this.deduplicateResults(
      allResults, 
      similarityThreshold
    );

    // Step 3: Apply advanced ranking algorithm
    const rankedResults = this.rankResults(deduplicatedResults, processedQuery);

    // Step 4: Apply final filters and limits
    return this.applyFinalFilters(rankedResults, processedQuery);
  }

  /**
   * Generate aggregations from merged results
   */
  generateAggregations(results: SearchResult[]): SearchAggregations {
    // Count by content type
    const byType: Record<string, number> = {};
    for (const result of results) {
      byType[result.type] = (byType[result.type] || 0) + 1;
    }

    // Count by date ranges
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let lastDay = 0, lastWeek = 0, lastMonth = 0, older = 0;

    for (const result of results) {
      const createdAt = new Date(result.metadata.created_at);
      if (createdAt >= oneDayAgo) {
        lastDay++;
      } else if (createdAt >= oneWeekAgo) {
        lastWeek++;
      } else if (createdAt >= oneMonthAgo) {
        lastMonth++;
      } else {
        older++;
      }
    }

    // Top tags
    const tagCounts: Record<string, number> = {};
    for (const result of results) {
      if (result.metadata.tags) {
        for (const tag of result.metadata.tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Languages for code content
    const languageCounts: Record<string, number> = {};
    const repositoryCounts: Record<string, number> = {};

    for (const result of results) {
      if (result.metadata.language) {
        languageCounts[result.metadata.language] = 
          (languageCounts[result.metadata.language] || 0) + 1;
      }
      if (result.metadata.repository) {
        repositoryCounts[result.metadata.repository] = 
          (repositoryCounts[result.metadata.repository] || 0) + 1;
      }
    }

    const languages = Object.entries(languageCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([language, count]) => ({ language, count }));

    const repositories = Object.entries(repositoryCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([repository, count]) => ({ repository, count }));

    return {
      by_type: byType as Record<ContentType, number>,
      by_date: {
        last_day: lastDay,
        last_week: lastWeek,
        last_month: lastMonth,
        older
      },
      top_tags: topTags,
      languages: languages.length > 0 ? languages : undefined,
      repositories: repositories.length > 0 ? repositories : undefined
    };
  }

  /**
   * Extract successful results from all sources
   */
  private extractSuccessfulResults(sourceResults: SearchSourceResult[]): SearchResult[] {
    const allResults: SearchResult[] = [];

    for (const sourceResult of sourceResults) {
      if (!sourceResult.error && sourceResult.results.length > 0) {
        // Add source information to each result for tracking
        const resultsWithSource = sourceResult.results.map(result => ({
          ...result,
          metadata: {
            ...result.metadata,
            source: sourceResult.source
          }
        }));
        allResults.push(...resultsWithSource);
      }
    }

    return allResults;
  }

  /**
   * Remove duplicate results based on content similarity
   */
  private async deduplicateResults(
    results: SearchResult[],
    threshold: number
  ): Promise<SearchResult[]> {
    if (results.length <= 1) {
      return results;
    }

    // Calculate similarities between all pairs
    const similarities: ResultSimilarity[] = [];
    
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const similarity = this.calculateSimilarity(results[i], results[j]);
        if (similarity.similarity >= threshold) {
          similarities.push(similarity);
        }
      }
    }

    // Group similar results
    const groups: Set<SearchResult>[] = [];
    const processed = new Set<string>();

    for (const similarity of similarities) {
      if (processed.has(similarity.result1.id) || processed.has(similarity.result2.id)) {
        continue;
      }

      // Find if either result belongs to existing group
      let foundGroup = false;
      for (const group of groups) {
        if (group.has(similarity.result1) || group.has(similarity.result2)) {
          group.add(similarity.result1);
          group.add(similarity.result2);
          foundGroup = true;
          break;
        }
      }

      if (!foundGroup) {
        groups.push(new Set([similarity.result1, similarity.result2]));
      }

      processed.add(similarity.result1.id);
      processed.add(similarity.result2.id);
    }

    // Keep best result from each group
    const deduplicatedResults: SearchResult[] = [];
    
    // Add non-duplicate results
    for (const result of results) {
      if (!processed.has(result.id)) {
        deduplicatedResults.push(result);
      }
    }

    // Add best result from each duplicate group
    for (const group of groups) {
      const groupResults = Array.from(group);
      // Choose result with highest overall relevance score
      const bestResult = groupResults.reduce((best, current) => 
        current.score.relevance > best.score.relevance ? current : best
      );
      deduplicatedResults.push(bestResult);
    }

    return deduplicatedResults;
  }

  /**
   * Calculate similarity between two results
   */
  private calculateSimilarity(result1: SearchResult, result2: SearchResult): ResultSimilarity {
    let maxSimilarity = 0;
    let similarityType: 'content' | 'title' | 'metadata' = 'content';

    // Title similarity
    const titleSim = this.calculateTextSimilarity(result1.title, result2.title);
    if (titleSim > maxSimilarity) {
      maxSimilarity = titleSim;
      similarityType = 'title';
    }

    // Content similarity (if previews available)
    if (result1.preview?.text && result2.preview?.text) {
      const contentSim = this.calculateTextSimilarity(
        result1.preview.text,
        result2.preview.text
      );
      if (contentSim > maxSimilarity) {
        maxSimilarity = contentSim;
        similarityType = 'content';
      }
    }

    // URL similarity (exact match for web content)
    if (result1.url && result2.url && result1.url === result2.url) {
      maxSimilarity = 1.0;
      similarityType = 'metadata';
    }

    // File path similarity (for code content)
    if (result1.metadata.file_path && result2.metadata.file_path) {
      const pathSim = this.calculateTextSimilarity(
        result1.metadata.file_path,
        result2.metadata.file_path
      );
      if (pathSim > maxSimilarity) {
        maxSimilarity = pathSim;
        similarityType = 'metadata';
      }
    }

    return {
      result1,
      result2,
      similarity: maxSimilarity,
      type: similarityType
    };
  }

  /**
   * Calculate text similarity using simple metrics
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;

    // Normalize texts
    const norm1 = text1.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const norm2 = text2.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Calculate Jaccard similarity
    const set1 = new Set(norm1.split(' '));
    const set2 = new Set(norm2.split(' '));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Apply advanced ranking algorithm
   */
  private rankResults(results: SearchResult[], processedQuery: ProcessedQuery): SearchResult[] {
    const config = this.rankingConfig as RankingConfig;

    return results
      .map(result => this.calculateFinalScore(result, processedQuery, config))
      .sort((a, b) => b.score.relevance - a.score.relevance);
  }

  /**
   * Calculate final relevance score for a result
   */
  private calculateFinalScore(
    result: SearchResult,
    processedQuery: ProcessedQuery,
    config: RankingConfig
  ): SearchResult {
    let finalScore = 0;

    // Base semantic similarity score
    if (result.score.semantic_similarity) {
      finalScore += result.score.semantic_similarity * config.semanticWeight;
    }

    // Text matching score
    if (result.score.text_match) {
      finalScore += result.score.text_match * config.textMatchWeight;
    }

    // Recency boost
    if (result.score.recency_boost) {
      finalScore += result.score.recency_boost * config.recencyWeight;
    }

    // Quality score
    if (result.score.quality_score) {
      finalScore += result.score.quality_score * config.qualityWeight;
    }

    // Source reliability
    const source = (result.metadata as any).source || 'unknown';
    const reliabilityScore = SOURCE_RELIABILITY[source] || 0.5;
    finalScore += reliabilityScore * config.sourceReliabilityWeight;

    // Content type importance
    const typeImportance = CONTENT_TYPE_IMPORTANCE[result.type] || 0.5;
    finalScore += typeImportance * 0.05; // Small additional weight

    // Title match boost
    const titleMatch = this.calculateTitleMatch(result.title, processedQuery.original);
    if (titleMatch > 0.7) {
      finalScore += config.titleMatchBoost;
    }

    // Intent match boost
    const intentMatch = this.calculateIntentMatch(result, processedQuery);
    if (intentMatch > 0.7) {
      finalScore += config.intentMatchBoost;
    }

    // Normalize final score to [0, 1]
    finalScore = Math.min(Math.max(finalScore, 0), 1);

    // Update the result's score
    const updatedScore: SearchScore = {
      ...result.score,
      relevance: finalScore
    };

    return {
      ...result,
      score: updatedScore
    };
  }

  /**
   * Calculate title match score
   */
  private calculateTitleMatch(title: string, query: string): number {
    return this.calculateTextSimilarity(title, query);
  }

  /**
   * Calculate intent match score
   */
  private calculateIntentMatch(result: SearchResult, processedQuery: ProcessedQuery): number {
    // This is a simplified implementation
    // In a real system, you'd have more sophisticated intent matching
    
    const intentKeywords: Record<typeof processedQuery.intent, string[]> = {
      informational: ['overview', 'definition', 'explanation', 'what', 'about'],
      navigational: ['page', 'dashboard', 'settings', 'go', 'find'],
      procedural: ['how', 'steps', 'process', 'guide', 'tutorial'],
      analytical: ['analysis', 'report', 'statistics', 'data', 'metrics'],
      creative: ['ideas', 'examples', 'design', 'inspiration', 'creative'],
      troubleshooting: ['fix', 'solve', 'error', 'problem', 'debug']
    };

    const keywords = intentKeywords[processedQuery.intent] || [];
    const titleLower = result.title.toLowerCase();
    const previewLower = result.preview?.text?.toLowerCase() || '';

    let matches = 0;
    for (const keyword of keywords) {
      if (titleLower.includes(keyword) || previewLower.includes(keyword)) {
        matches++;
      }
    }

    return keywords.length > 0 ? matches / keywords.length : 0;
  }

  /**
   * Apply final filters and limits
   */
  private applyFinalFilters(results: SearchResult[], processedQuery: ProcessedQuery): SearchResult[] {
    let filteredResults = [...results];

    // Filter by minimum relevance threshold
    filteredResults = filteredResults.filter(result => result.score.relevance >= 0.1);

    // If query has expected result types, boost those types
    if (processedQuery.metadata.expectedResultTypes?.length) {
      const expectedTypes = new Set(processedQuery.metadata.expectedResultTypes);
      
      // Separate expected and other results
      const expectedResults = filteredResults.filter(r => expectedTypes.has(r.type));
      const otherResults = filteredResults.filter(r => !expectedTypes.has(r.type));
      
      // Combine with expected results first
      filteredResults = [...expectedResults, ...otherResults];
    }

    return filteredResults;
  }
}