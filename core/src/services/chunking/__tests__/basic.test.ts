/**
 * Basic Content Chunking Service Tests
 */

describe('Basic Chunking Test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should import service without errors', async () => {
    const { ContentChunkingService } = await import('../ContentChunkingService');
    const service = new ContentChunkingService();
    expect(service).toBeDefined();
    
    const strategies = service.getAvailableStrategies();
    expect(strategies.length).toBe(3);
  });

  it('should chunk simple content', async () => {
    const { ContentChunkingService } = await import('../ContentChunkingService');
    const service = new ContentChunkingService();
    
    const content = 'This is a longer test content that should be properly chunked by the service. It has multiple sentences to ensure proper testing. The content should be split appropriately.';
    const options = {
      strategy: 'fixed_size' as const,
      target_size: 80,
      max_size: 120,
      min_size: 40,
      overlap_size: 0,
      preserve_boundaries: {}
    };

    const chunks = await service.chunkContent(content, options);
    expect(chunks.length).toBeGreaterThan(1);
    
    chunks.forEach(chunk => {
      expect(chunk.id).toBeDefined();
      expect(chunk.content).toBeDefined();
      expect(chunk.metadata).toBeDefined();
    });
  });
});