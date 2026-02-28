/**
 * Source Attribution Service
 * 
 * Handles source attribution, citation management, and source tracking
 * for AI-generated summaries.
 */

import crypto from 'crypto';
import type { SearchResult } from '../../shared/types/search.js';
import type {
  ContentSource,
  Citation,
  SourceAttribution
} from '../../shared/types/ai-summaries.js';

/**
 * Configuration for source attribution
 */
interface SourceAttributionConfig {
  minRelevanceScore: number;
  maxSourcesPerSummary: number;
  enableCitationParsing: boolean;
}

export class SourceAttributionService {
  constructor(private config: SourceAttributionConfig) {}

  /**
   * Convert search results to content sources
   */
  async convertToContentSources(searchResults: any[]): Promise<ContentSource[]> {
    const sources: ContentSource[] = [];

    for (let i = 0; i < Math.min(searchResults.length, this.config.maxSourcesPerSummary); i++) {
      const result = searchResults[i];
      
      try {
        const source: ContentSource = {
          id: result.id || crypto.randomUUID(),
          type: this.mapContentType(result.type || 'scraped_page'),
          title: result.title || `Source ${i + 1}`,
          url: result.url,
          relevance: result.score?.relevance || 0.5,
          usageWeight: 0.0, // Will be calculated during summary generation
          content: this.extractContent(result),
          metadata: result.metadata || {}
        };

        // Only include sources above minimum relevance threshold
        if (source.relevance >= this.config.minRelevanceScore) {
          sources.push(source);
        }

      } catch (error) {
        console.warn(`Failed to convert search result to source: ${error}`);
        // Continue with other sources
      }
    }

    return sources;
  }

  /**
   * Build source attribution from sources and generated content
   */
  buildAttribution(sources: ContentSource[], generatedContent: string): SourceAttribution {
    // Update usage weights based on content analysis
    const sourcesWithWeights = this.calculateUsageWeights(sources, generatedContent);

    // Extract citations from content
    const citations = this.extractCitations(generatedContent, sourcesWithWeights);

    // Identify primary sources (highest usage weight)
    const primarySources = sourcesWithWeights
      .filter(source => source.usageWeight > 0.3)
      .sort((a, b) => b.usageWeight - a.usageWeight)
      .slice(0, 5)
      .map(source => source.id);

    // Calculate source diversity
    const diversityScore = this.calculateDiversityScore(sourcesWithWeights);

    return {
      sources: sourcesWithWeights,
      citations,
      totalSources: sourcesWithWeights.length,
      primarySources,
      diversityScore
    };
  }

  /**
   * Calculate usage weights for sources based on content analysis
   */
  private calculateUsageWeights(sources: ContentSource[], content: string): ContentSource[] {
    const contentWords = this.extractKeyWords(content.toLowerCase());
    
    return sources.map(source => {
      const sourceWords = this.extractKeyWords(source.content.toLowerCase());
      
      // Calculate overlap between content and source
      const commonWords = contentWords.filter(word => sourceWords.includes(word));
      const overlapScore = commonWords.length / Math.max(contentWords.length, 1);
      
      // Calculate citation frequency
      const citationCount = this.countSourceCitations(content, source.id);
      const citationScore = Math.min(citationCount / 3, 1.0); // Normalize to 0-1
      
      // Combine relevance, overlap, and citation frequency
      const usageWeight = (source.relevance * 0.4) + (overlapScore * 0.4) + (citationScore * 0.2);

      return {
        ...source,
        usageWeight: Math.min(usageWeight, 1.0)
      };
    });
  }

  /**
   * Extract citations from generated content
   */
  private extractCitations(content: string, sources: ContentSource[]): Citation[] {
    if (!this.config.enableCitationParsing) {
      return [];
    }

    const citations: Citation[] = [];
    
    // Pattern to match citations like [Source 1], [Source 2], etc.
    const citationPattern = /\[Source (\d+)\]/g;
    let match;

    while ((match = citationPattern.exec(content)) !== null) {
      const sourceIndex = parseInt(match[1]) - 1; // Convert to 0-based index
      const source = sources[sourceIndex];
      
      if (source) {
        // Find the text surrounding the citation
        const citedText = this.extractCitedText(content, match.index);
        
        citations.push({
          sourceId: source.id,
          citedText,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          format: 'inline'
        });
      }
    }

    return citations;
  }

  /**
   * Extract text that is being cited
   */
  private extractCitedText(content: string, citationIndex: number): string {
    // Extract sentence containing the citation
    const beforeCitation = content.substring(0, citationIndex);
    const afterCitation = content.substring(citationIndex);
    
    // Find sentence boundaries
    const sentenceStart = Math.max(
      beforeCitation.lastIndexOf('.'),
      beforeCitation.lastIndexOf('!'),
      beforeCitation.lastIndexOf('?')
    );
    
    const sentenceEnd = Math.min(
      afterCitation.indexOf('.') !== -1 ? afterCitation.indexOf('.') + citationIndex : content.length,
      afterCitation.indexOf('!') !== -1 ? afterCitation.indexOf('!') + citationIndex : content.length,
      afterCitation.indexOf('?') !== -1 ? afterCitation.indexOf('?') + citationIndex : content.length
    );

    const startIndex = sentenceStart > 0 ? sentenceStart + 1 : 0;
    const sentence = content.substring(startIndex, sentenceEnd).trim();
    
    // Remove the citation marker from the sentence
    return sentence.replace(/\[Source \d+\]/g, '').trim();
  }

  /**
   * Count how many times a source is cited in content
   */
  private countSourceCitations(content: string, sourceId: string): number {
    // This is a simplified implementation - in practice, we'd need to maintain
    // a mapping between source indices and source IDs
    const citationPattern = /\[Source \d+\]/g;
    const matches = content.match(citationPattern) || [];
    return matches.length; // Simplified - would need to match specific source
  }

  /**
   * Calculate diversity score based on source types and domains
   */
  private calculateDiversityScore(sources: ContentSource[]): number {
    if (sources.length === 0) return 0;

    // Type diversity
    const uniqueTypes = new Set(sources.map(s => s.type));
    const typeDiversity = uniqueTypes.size / sources.length;

    // Domain diversity (for sources with URLs)
    const domains = sources
      .map(s => s.url ? new URL(s.url).hostname : null)
      .filter(domain => domain !== null);
    const uniqueDomains = new Set(domains);
    const domainDiversity = domains.length > 0 ? uniqueDomains.size / domains.length : 0.5;

    // Usage weight distribution (avoid over-reliance on single source)
    const usageWeights = sources.map(s => s.usageWeight).sort((a, b) => b - a);
    const maxWeight = usageWeights[0] || 0;
    const distributionScore = maxWeight < 0.8 ? 1.0 : (1.0 - maxWeight) / 0.2;

    // Combined diversity score
    return (typeDiversity * 0.3) + (domainDiversity * 0.3) + (distributionScore * 0.4);
  }

  /**
   * Extract key words from text (removes stop words and short words)
   */
  private extractKeyWords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'must',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    ]);

    return text
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
      .map(word => word.toLowerCase());
  }

  /**
   * Map search result content type to content source type
   */
  private mapContentType(searchResultType: string): ContentSource['type'] {
    const typeMap: Record<string, ContentSource['type']> = {
      'scraped_page': 'scraped_page',
      'scraped_content_chunk': 'scraped_page',
      'wiki_page': 'wiki_page',
      'kanban_card': 'kanban_card',
      'memory_thought': 'memory_thought',
      'code_file': 'code_file',
      'code_chunk': 'code_chunk'
    };

    return typeMap[searchResultType] || 'scraped_page';
  }

  /**
   * Extract content text from search result
   */
  private extractContent(result: any): string {
    // Try different possible content fields
    if (result.preview?.text) {
      return result.preview.text;
    }
    
    if (result.content) {
      return result.content;
    }
    
    if (result.description) {
      return result.description;
    }
    
    if (result.excerpt) {
      return result.excerpt;
    }
    
    // Fallback to title if no content available
    return result.title || 'No content available';
  }

  /**
   * Validate source attribution
   */
  validateAttribution(attribution: SourceAttribution): boolean {
    try {
      // Check that all citations reference valid sources
      const sourceIds = new Set(attribution.sources.map(s => s.id));
      const invalidCitations = attribution.citations.filter(c => !sourceIds.has(c.sourceId));
      
      if (invalidCitations.length > 0) {
        console.warn(`Found ${invalidCitations.length} invalid citations`);
        return false;
      }

      // Check that primary sources exist
      const invalidPrimarySources = attribution.primarySources.filter(id => !sourceIds.has(id));
      
      if (invalidPrimarySources.length > 0) {
        console.warn(`Found ${invalidPrimarySources.length} invalid primary sources`);
        return false;
      }

      // Check diversity score is reasonable
      if (attribution.diversityScore < 0 || attribution.diversityScore > 1) {
        console.warn(`Invalid diversity score: ${attribution.diversityScore}`);
        return false;
      }

      return true;

    } catch (error) {
      console.error('Attribution validation failed:', error);
      return false;
    }
  }

  /**
   * Format citations for display
   */
  formatCitationsForDisplay(
    citations: Citation[],
    sources: ContentSource[],
    format: 'inline' | 'footnote' | 'reference_list' = 'inline'
  ): string {
    if (citations.length === 0) {
      return '';
    }

    const sourceMap = new Map(sources.map(s => [s.id, s]));

    switch (format) {
      case 'inline':
        return this.formatInlineCitations(citations, sourceMap);
      
      case 'footnote':
        return this.formatFootnoteCitations(citations, sourceMap);
      
      case 'reference_list':
        return this.formatReferenceList(citations, sourceMap);
      
      default:
        return '';
    }
  }

  private formatInlineCitations(citations: Citation[], sourceMap: Map<string, ContentSource>): string {
    const uniqueSources = Array.from(new Set(citations.map(c => c.sourceId)));
    
    return uniqueSources
      .map(sourceId => {
        const source = sourceMap.get(sourceId);
        if (!source) return '';
        
        return `${source.title}${source.url ? ` (${source.url})` : ''}`;
      })
      .filter(citation => citation.length > 0)
      .join('; ');
  }

  private formatFootnoteCitations(citations: Citation[], sourceMap: Map<string, ContentSource>): string {
    return citations
      .map((citation, index) => {
        const source = sourceMap.get(citation.sourceId);
        if (!source) return '';
        
        return `${index + 1}. ${source.title}${source.url ? ` - ${source.url}` : ''}`;
      })
      .filter(footnote => footnote.length > 0)
      .join('\n');
  }

  private formatReferenceList(citations: Citation[], sourceMap: Map<string, ContentSource>): string {
    const uniqueSources = Array.from(new Set(citations.map(c => c.sourceId)))
      .map(sourceId => sourceMap.get(sourceId))
      .filter((source): source is ContentSource => source !== undefined);

    return uniqueSources
      .map(source => {
        const typeLabel = source.type.replace('_', ' ').toUpperCase();
        return `- [${typeLabel}] ${source.title}${source.url ? ` - ${source.url}` : ''}`;
      })
      .join('\n');
  }

  /**
   * Get attribution statistics
   */
  getAttributionStats(attribution: SourceAttribution) {
    return {
      totalSources: attribution.totalSources,
      primarySources: attribution.primarySources.length,
      totalCitations: attribution.citations.length,
      diversityScore: attribution.diversityScore,
      sourceTypes: this.getSourceTypeBreakdown(attribution.sources),
      averageRelevance: attribution.sources.length > 0 ? attribution.sources.reduce((sum, s) => sum + s.relevance, 0) / attribution.sources.length : 0,
      averageUsageWeight: attribution.sources.length > 0 ? attribution.sources.reduce((sum, s) => sum + s.usageWeight, 0) / attribution.sources.length : 0
    };
  }

  private getSourceTypeBreakdown(sources: ContentSource[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    sources.forEach(source => {
      breakdown[source.type] = (breakdown[source.type] || 0) + 1;
    });

    return breakdown;
  }
}