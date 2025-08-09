/**
 * Simple test for debugging purposes
 */

import { ContentChunkingService } from '../ContentChunkingService';

describe('ContentChunkingService Simple Test', () => {
  it('should create service instance', () => {
    const service = new ContentChunkingService();
    expect(service).toBeInstanceOf(ContentChunkingService);
  });

  it('should handle basic chunking', async () => {
    const service = new ContentChunkingService();
    const content = 'This is a simple test content for chunking.';
    const options = {
      strategy: 'fixed_size' as const,
      target_size: 1000,
      max_size: 1500,
      min_size: 200,
      overlap_size: 0,
      preserve_boundaries: {}
    };

    const chunks = await service.chunkContent(content, options);
    expect(chunks).toHaveLength(0); // Should be too short to chunk
  });
});