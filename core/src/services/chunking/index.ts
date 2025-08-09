/**
 * Content Chunking Service
 * 
 * Main export for the comprehensive content chunking system that provides
 * intelligent document splitting with multiple strategies and semantic preservation.
 */

export { ContentChunkingService } from './ContentChunkingService';
export * from './strategies';

// Re-export types for convenience
export type {
  ChunkingOptions,
  ChunkingStrategy,
  ContentChunk,
  ChunkMetadata
} from '../../shared/types/content';