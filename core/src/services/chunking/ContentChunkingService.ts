/**
 * Content Chunking Service
 * 
 * Intelligent content chunking system that selects optimal strategies based on
 * content analysis and provides semantic preservation with configurable overlap.
 */

import { ChunkingOptions, ContentChunk, ChunkingStrategy as ChunkingStrategyType } from '../../shared/types/content';
import { ChunkingStrategy, ParagraphStrategy, SentenceStrategy, FixedSizeStrategy } from './strategies';
import { randomUUID } from 'node:crypto';

export class ContentChunkingService {
  private strategies: Map<ChunkingStrategyType, ChunkingStrategy>;

  constructor() {
    this.strategies = new Map();
    this.strategies.set('paragraph', new ParagraphStrategy());
    this.strategies.set('sentence', new SentenceStrategy());
    this.strategies.set('fixed_size', new FixedSizeStrategy());
  }

  /**
   * Chunk content using intelligent strategy selection and overlap processing
   */
  async chunkContent(
    content: string,
    options: ChunkingOptions,
    parentId?: string,
    parentType?: 'scraped_page' | 'code_file' | 'wiki_page' | 'document'
  ): Promise<ContentChunk[]> {
    if (!content || content.trim().length === 0) {
      return [];
    }

    // Validate options
    const validatedOptions = this.validateAndDefaultOptions(options);
    
    // Select optimal strategy
    const strategy = this.selectStrategy(content, validatedOptions);
    
    // Apply chunking strategy
    let chunks = await strategy.chunk(content, validatedOptions);
    
    // Set parent information
    if (parentId && parentType) {
      chunks = chunks.map(chunk => ({
        ...chunk,
        parent_id: parentId,
        parent_type: parentType
      }));
    }
    
    // Apply overlap if specified
    if (validatedOptions.overlap_size > 0) {
      chunks = this.addOverlap(chunks, content, validatedOptions.overlap_size);
    }
    
    // Validate and clean chunks
    chunks = this.validateChunks(chunks, validatedOptions);
    
    return chunks;
  }

  /**
   * Analyze content to recommend optimal chunking strategy
   */
  analyzeContent(content: string): {
    recommendedStrategy: ChunkingStrategyType;
    analysis: {
      length: number;
      paragraphCount: number;
      sentenceCount: number;
      averageParagraphLength: number;
      averageSentenceLength: number;
      hasCodePatterns: boolean;
      hasListStructures: boolean;
      contentType: 'prose' | 'code' | 'structured' | 'mixed';
    };
    reasons: string[];
  } {
    const length = content.length;
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    const paragraphCount = paragraphs.length;
    const sentenceCount = sentences.length;
    const averageParagraphLength = paragraphCount > 0 ? paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphCount : 0;
    const averageSentenceLength = sentenceCount > 0 ? sentences.reduce((sum, s) => sum + s.length, 0) / sentenceCount : 0;
    
    const hasCodePatterns = /[{}();]/.test(content) && /\b(function|class|if|for|while|return|import|export)\b/.test(content);
    const hasListStructures = /^[\s]*[-*+•]\s/m.test(content) || /^[\s]*\d+[.)]\s/m.test(content);
    
    let contentType: 'prose' | 'code' | 'structured' | 'mixed' = 'prose';
    if (hasCodePatterns) {
      contentType = hasListStructures || paragraphCount > 3 ? 'mixed' : 'code';
    } else if (hasListStructures || /^#+\s/m.test(content)) {
      contentType = 'structured';
    }

    const analysis = {
      length,
      paragraphCount,
      sentenceCount,
      averageParagraphLength,
      averageSentenceLength,
      hasCodePatterns,
      hasListStructures,
      contentType
    };

    const reasons: string[] = [];
    let recommendedStrategy: ChunkingStrategyType = 'fixed_size';

    // Strategy selection logic
    if (paragraphCount >= 3 && averageParagraphLength >= 100 && averageParagraphLength <= 800) {
      recommendedStrategy = 'paragraph';
      reasons.push('Content has well-formed paragraphs of appropriate length');
      reasons.push(`${paragraphCount} paragraphs with average length ${Math.round(averageParagraphLength)} characters`);
    } else if (sentenceCount >= 5 && averageSentenceLength >= 50 && averageSentenceLength <= 200) {
      recommendedStrategy = 'sentence';
      reasons.push('Content has well-formed sentences suitable for sentence-based chunking');
      reasons.push(`${sentenceCount} sentences with average length ${Math.round(averageSentenceLength)} characters`);
    } else {
      reasons.push('Content structure does not favor paragraph or sentence chunking');
      if (paragraphCount < 3) reasons.push('Too few paragraphs for paragraph-based chunking');
      if (averageParagraphLength > 800) reasons.push('Paragraphs are too long for paragraph-based chunking');
      if (sentenceCount < 5) reasons.push('Too few sentences for sentence-based chunking');
      reasons.push('Fixed-size chunking will preserve word boundaries');
    }

    return { recommendedStrategy, analysis, reasons };
  }

  /**
   * Get available chunking strategies
   */
  getAvailableStrategies(): ChunkingStrategyType[] {
    return Array.from(this.strategies.keys());
  }

  private selectStrategy(content: string, options: ChunkingOptions): ChunkingStrategy {
    // If strategy is explicitly specified and available, use it
    if (options.strategy && this.strategies.has(options.strategy)) {
      const strategy = this.strategies.get(options.strategy)!;
      if (strategy.canHandle(content)) {
        return strategy;
      }
    }

    // Analyze content and select best strategy
    const analysis = this.analyzeContent(content);
    const recommendedStrategy = this.strategies.get(analysis.recommendedStrategy);
    
    if (recommendedStrategy && recommendedStrategy.canHandle(content)) {
      return recommendedStrategy;
    }

    // Fallback to strategies in order of preference
    for (const strategyType of ['paragraph', 'sentence', 'fixed_size'] as ChunkingStrategyType[]) {
      const strategy = this.strategies.get(strategyType);
      if (strategy && strategy.canHandle(content)) {
        return strategy;
      }
    }

    // Ultimate fallback
    return this.strategies.get('fixed_size')!;
  }

  private validateAndDefaultOptions(options: ChunkingOptions): ChunkingOptions {
    return {
      strategy: options.strategy || 'fixed_size',
      target_size: Math.max(100, Math.min(8000, options.target_size || 1000)),
      max_size: Math.max(100, Math.min(10000, options.max_size || 1500)),
      min_size: Math.max(50, Math.min(1000, options.min_size || 200)),
      overlap_size: Math.max(0, Math.min(500, options.overlap_size || 0)),
      preserve_boundaries: {
        sentences: options.preserve_boundaries?.sentences ?? true,
        paragraphs: options.preserve_boundaries?.paragraphs ?? true,
        code_blocks: options.preserve_boundaries?.code_blocks ?? true,
        list_items: options.preserve_boundaries?.list_items ?? true
      },
      language_options: options.language_options
    };
  }

  private addOverlap(chunks: ContentChunk[], originalContent: string, overlapSize: number): ContentChunk[] {
    if (chunks.length <= 1 || overlapSize <= 0) {
      return chunks;
    }

    const overlappedChunks: ContentChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      let modifiedContent = chunk.content;
      let startPosition = chunk.start_position;

      // Add overlap from previous chunk
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlapStart = Math.max(0, prevChunk.content.length - overlapSize);
        const overlapContent = prevChunk.content.substring(overlapStart);
        
        // Find a good boundary for the overlap
        const boundaryMatch = overlapContent.match(/[.!?]\s+/);
        const cleanOverlap = boundaryMatch ? 
          overlapContent.substring(overlapContent.indexOf(boundaryMatch[0]) + boundaryMatch[0].length) :
          overlapContent;

        if (cleanOverlap.length > 10) {
          modifiedContent = cleanOverlap + ' ' + modifiedContent;
          startPosition = prevChunk.start_position + overlapStart + (overlapContent.length - cleanOverlap.length);
        }
      }

      overlappedChunks.push({
        ...chunk,
        content: modifiedContent,
        start_position: startPosition,
        metadata: {
          ...chunk.metadata,
          word_count: this.countWords(modifiedContent)
        }
      });
    }

    return overlappedChunks;
  }

  private validateChunks(chunks: ContentChunk[], options: ChunkingOptions): ContentChunk[] {
    const validChunks: ContentChunk[] = [];

    for (const chunk of chunks) {
      // Filter out chunks that are too short
      if (chunk.content.trim().length < options.min_size) {
        continue;
      }

      // Ensure chunk doesn't exceed max size
      if (chunk.content.length > options.max_size) {
        // This shouldn't happen with proper strategy implementation, but handle it
        const truncated = chunk.content.substring(0, options.max_size);
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        const finalContent = lastSpaceIndex > options.max_size * 0.8 ? 
          truncated.substring(0, lastSpaceIndex) : truncated;

        validChunks.push({
          ...chunk,
          content: finalContent,
          end_position: chunk.start_position + finalContent.length - 1,
          metadata: {
            ...chunk.metadata,
            word_count: this.countWords(finalContent),
            quality_score: Math.max(0, (chunk.metadata.quality_score || 0.5) - 0.1) // Slight penalty for truncation
          }
        });
      } else {
        validChunks.push(chunk);
      }
    }

    return validChunks;
  }

  private countWords(content: string): number {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
}