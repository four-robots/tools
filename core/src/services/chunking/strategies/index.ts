/**
 * Chunking Strategies
 * 
 * Export all available content chunking strategies for intelligent
 * document processing and semantic preservation.
 */

export { ParagraphStrategy } from './ParagraphStrategy';
export { SentenceStrategy } from './SentenceStrategy';
export { FixedSizeStrategy } from './FixedSizeStrategy';

import type { ChunkingOptions, ContentChunk } from '../../../shared/types/content';

export interface ChunkingStrategy {
  /**
   * Chunk content using this strategy
   */
  chunk(content: string, options: ChunkingOptions): Promise<ContentChunk[]>;
  
  /**
   * Determine if this strategy can handle the given content
   */
  canHandle(content: string): boolean;
  
  /**
   * Get the strategy name for identification
   */
  getName(): string;
}