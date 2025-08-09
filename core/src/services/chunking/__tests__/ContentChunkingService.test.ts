/**
 * Content Chunking Service Tests
 * 
 * Comprehensive test suite for the content chunking system covering
 * all strategies, edge cases, and performance requirements.
 */

import { ContentChunkingService } from '../ContentChunkingService';
import { ChunkingOptions } from '../../../shared/types/content';

describe('ContentChunkingService', () => {
  let service: ContentChunkingService;

  beforeEach(() => {
    service = new ContentChunkingService();
  });

  describe('Basic Functionality', () => {
    it('should create service instance', () => {
      expect(service).toBeInstanceOf(ContentChunkingService);
    });

    it('should return available strategies', () => {
      const strategies = service.getAvailableStrategies();
      expect(strategies).toContain('paragraph');
      expect(strategies).toContain('sentence');
      expect(strategies).toContain('fixed_size');
    });

    it('should handle empty content', async () => {
      const options: ChunkingOptions = { strategy: 'fixed_size', target_size: 1000, max_size: 1500, min_size: 200, overlap_size: 0, preserve_boundaries: {} };
      const result = await service.chunkContent('', options);
      expect(result).toEqual([]);
    });

    it('should handle whitespace-only content', async () => {
      const options: ChunkingOptions = { strategy: 'fixed_size', target_size: 1000, max_size: 1500, min_size: 200, overlap_size: 0, preserve_boundaries: {} };
      const result = await service.chunkContent('   \n\n\t  ', options);
      expect(result).toEqual([]);
    });
  });

  describe('Content Analysis', () => {
    it('should analyze prose content correctly', () => {
      const content = `This is the first paragraph. It contains multiple sentences that form a coherent thought.

This is the second paragraph. It also contains multiple sentences. These sentences help establish the paragraph structure.

This is the third paragraph. It continues the pattern of well-formed paragraphs with multiple sentences each.`;

      const analysis = service.analyzeContent(content);
      expect(analysis.recommendedStrategy).toBe('paragraph');
      expect(analysis.analysis.paragraphCount).toBe(3);
      expect(analysis.analysis.sentenceCount).toBeGreaterThan(5);
      expect(analysis.analysis.contentType).toBe('prose');
      expect(analysis.reasons).toContain('Content has well-formed paragraphs of appropriate length');
    });

    it('should analyze code content correctly', () => {
      const content = `function calculateSum(a, b) {
  return a + b;
}

class Calculator {
  constructor() {
    this.value = 0;
  }

  add(number) {
    this.value += number;
    return this;
  }
}`;

      const analysis = service.analyzeContent(content);
      expect(analysis.analysis.hasCodePatterns).toBe(true);
      expect(analysis.analysis.contentType).toBe('code');
    });

    it('should analyze structured content correctly', () => {
      const content = `# Main Title

Here are some important points:

- First item in the list
- Second item in the list
- Third item in the list

## Subsection

1. Numbered first item
2. Numbered second item
3. Numbered third item`;

      const analysis = service.analyzeContent(content);
      expect(analysis.analysis.hasListStructures).toBe(true);
      expect(analysis.analysis.contentType).toBe('structured');
    });
  });

  describe('Paragraph Strategy', () => {
    it('should chunk well-formed paragraphs', async () => {
      const content = `This is the first paragraph. It contains multiple sentences that form a coherent thought. The sentences work together to present a complete idea.

This is the second paragraph. It also contains multiple sentences that build upon each other. These sentences help establish the overall structure of the document.

This is the third paragraph. It continues the pattern of well-formed paragraphs. Each paragraph maintains its semantic integrity while contributing to the whole.`;

      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 200,
        max_size: 300,
        min_size: 100,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options, 'test-parent', 'document');
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThanOrEqual(100);
        expect(chunk.content.length).toBeLessThanOrEqual(300);
        expect(chunk.parent_id).toBe('test-parent');
        expect(chunk.parent_type).toBe('document');
        expect(chunk.metadata.type).toBeDefined();
        expect(chunk.metadata.word_count).toBeGreaterThan(0);
        expect(chunk.metadata.quality_score).toBeGreaterThanOrEqual(0);
        expect(chunk.metadata.quality_score).toBeLessThanOrEqual(1);
      });
    });

    it('should handle large paragraphs by splitting them', async () => {
      const largeContent = 'This is a very long sentence that goes on and on. '.repeat(50);
      
      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 500,
        max_size: 800,
        min_size: 200,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(largeContent, options);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(800);
      });
    });
  });

  describe('Sentence Strategy', () => {
    it('should chunk based on sentence boundaries', async () => {
      const content = `First sentence here. Second sentence follows. Third sentence continues the thought. Fourth sentence adds more detail. Fifth sentence concludes the first group. Sixth sentence starts a new group. Seventh sentence continues. Eighth sentence adds context. Ninth sentence provides examples. Tenth sentence wraps up the content.`;

      const options: ChunkingOptions = {
        strategy: 'sentence',
        target_size: 200,
        max_size: 300,
        min_size: 100,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThanOrEqual(100);
        expect(chunk.content.length).toBeLessThanOrEqual(300);
        expect(chunk.metadata.complete_sentences).toBe(true);
      });
    });

    it('should handle different sentence types', async () => {
      const content = `What is the meaning of life? This is a profound question! You should think deeply about it. Please consider all possibilities. Let's explore this together. Don't give up easily. How interesting this topic is!`;

      const options: ChunkingOptions = {
        strategy: 'sentence',
        target_size: 150,
        max_size: 200,
        min_size: 50,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        // Should contain various sentence endings
        expect(/[.!?]/.test(chunk.content)).toBe(true);
      });
    });
  });

  describe('Fixed Size Strategy', () => {
    it('should chunk at fixed sizes with word boundaries', async () => {
      const content = 'The quick brown fox jumps over the lazy dog. '.repeat(100);

      const options: ChunkingOptions = {
        strategy: 'fixed_size',
        target_size: 300,
        max_size: 400,
        min_size: 200,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThanOrEqual(200);
        expect(chunk.content.length).toBeLessThanOrEqual(400);
        // Should not cut words in the middle
        expect(/^\w/.test(chunk.content)).toBe(true);
        expect(/\w$/.test(chunk.content.trim())).toBe(true);
      });
    });

    it('should preserve code boundaries', async () => {
      const content = `function example() {
    const x = 1;
    const y = 2;
    return x + y;
}

function another() {
    const a = 3;
    const b = 4;
    return a * b;
}`;

      const options: ChunkingOptions = {
        strategy: 'fixed_size',
        target_size: 100,
        max_size: 150,
        min_size: 50,
        overlap_size: 0,
        preserve_boundaries: {
          sentences: true,
          paragraphs: true,
          code_blocks: true,
          list_items: true
        }
      };

      const chunks = await service.chunkContent(content, options);
      
      // Should try to keep functions intact or break at logical boundaries
      chunks.forEach(chunk => {
        expect(chunk.metadata.type).toBeDefined();
      });
    });
  });

  describe('Overlap Functionality', () => {
    it('should add overlap between chunks', async () => {
      const content = 'Sentence one here. Sentence two follows. Sentence three continues. Sentence four adds more. Sentence five concludes first part. Sentence six starts second part. Sentence seven continues. Sentence eight ends it.';

      const options: ChunkingOptions = {
        strategy: 'sentence',
        target_size: 80,
        max_size: 120,
        min_size: 40,
        overlap_size: 30,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      
      expect(chunks.length).toBeGreaterThan(2);
      
      // Check that overlaps exist (second chunk should start with content from first)
      for (let i = 1; i < chunks.length; i++) {
        const prevChunk = chunks[i - 1];
        const currentChunk = chunks[i];
        
        // There should be some overlap in content
        const overlapExists = prevChunk.content.split(' ').some(word => 
          currentChunk.content.includes(word) && word.length > 3
        );
        expect(overlapExists).toBe(true);
      }
    });

    it('should handle overlap with clean boundaries', async () => {
      const content = `First paragraph with multiple sentences. This paragraph establishes context. It provides background information.

Second paragraph continues the story. This paragraph builds on the first. It adds more detail and depth.

Third paragraph concludes everything. This paragraph wraps up nicely. It provides final thoughts.`;

      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 200,
        max_size: 300,
        min_size: 100,
        overlap_size: 50,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      expect(chunks.length).toBeGreaterThan(1);
      
      // Overlaps should be clean (complete sentences)
      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const sentences = chunk.content.split(/[.!?]+/).filter(s => s.trim());
        expect(sentences.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very short content', async () => {
      const content = 'Short text here.';
      
      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 1000,
        max_size: 1500,
        min_size: 10,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Short text here.');
    });

    it('should handle content with only special characters', async () => {
      const content = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const options: ChunkingOptions = {
        strategy: 'fixed_size',
        target_size: 10,
        max_size: 15,
        min_size: 5,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle mixed newlines and whitespace', async () => {
      const content = 'Line one\n\n\nLine two\r\n\r\nLine three\n\n\n\nLine four';
      
      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 20,
        max_size: 30,
        min_size: 10,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      chunks.forEach(chunk => {
        expect(chunk.content.trim().length).toBeGreaterThan(0);
      });
    });

    it('should fallback to fixed_size when other strategies fail', async () => {
      // Content that doesn't work well with paragraph or sentence strategies
      const content = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
      
      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 20,
        max_size: 30,
        min_size: 10,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThanOrEqual(10);
        expect(chunk.content.length).toBeLessThanOrEqual(30);
      });
    });
  });

  describe('Performance Requirements', () => {
    it('should handle medium documents efficiently', async () => {
      // Create a smaller document for faster testing
      const mediumContent = 'This is a sentence that will be repeated many times to create a medium document. '.repeat(100);
      
      const options: ChunkingOptions = {
        strategy: 'sentence',
        target_size: 1000,
        max_size: 1500,
        min_size: 500,
        overlap_size: 100,
        preserve_boundaries: {}
      };

      const startTime = Date.now();
      const chunks = await service.chunkContent(mediumContent, options);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(chunks.length).toBeGreaterThan(3);
      
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThanOrEqual(500);
        expect(chunk.content.length).toBeLessThanOrEqual(1500);
      });
    }, 5000);
  });

  describe('Quality Metrics', () => {
    it('should provide quality scores for chunks', async () => {
      const content = `This is a well-structured paragraph with multiple sentences. Each sentence contributes meaningfully to the overall content. The paragraph maintains coherence and readability throughout.

Another paragraph follows with similar structure. It continues the theme established in the first paragraph. The content flows naturally from one idea to the next.`;

      const options: ChunkingOptions = {
        strategy: 'paragraph',
        target_size: 300,
        max_size: 400,
        min_size: 100,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, options);
      
      chunks.forEach(chunk => {
        expect(chunk.metadata.quality_score).toBeGreaterThan(0);
        expect(chunk.metadata.quality_score).toBeLessThanOrEqual(1);
        expect(chunk.metadata.word_count).toBeGreaterThan(0);
        expect(chunk.metadata.type).toBeDefined();
        
        // Well-formed paragraphs should have good quality scores
        if (chunk.metadata.complete_sentences) {
          expect(chunk.metadata.quality_score).toBeGreaterThan(0.5);
        }
      });
    });

    it('should detect different content types accurately', async () => {
      const codeContent = `function example(param) {
    return param * 2;
}`;

      const listContent = `Important items:
- First item
- Second item  
- Third item`;

      const quoteContent = `> This is a quoted text
> that spans multiple lines
> and maintains quote structure`;

      const options: ChunkingOptions = {
        strategy: 'fixed_size',
        target_size: 200,
        max_size: 300,
        min_size: 50,
        overlap_size: 0,
        preserve_boundaries: {}
      };

      const codeChunks = await service.chunkContent(codeContent, options);
      const listChunks = await service.chunkContent(listContent, options);
      const quoteChunks = await service.chunkContent(quoteContent, options);

      expect(codeChunks[0].metadata.type).toBe('code');
      expect(listChunks[0].metadata.type).toBe('list');
      expect(quoteChunks[0].metadata.type).toBe('quote');
    });
  });

  describe('Options Validation', () => {
    it('should validate and adjust invalid options', async () => {
      const content = 'Test content that needs to be chunked properly.';
      
      // Invalid options that should be corrected
      const invalidOptions: ChunkingOptions = {
        strategy: 'fixed_size',
        target_size: -100, // Invalid: negative
        max_size: 50,      // Invalid: smaller than target
        min_size: 5000,    // Invalid: larger than max
        overlap_size: -50, // Invalid: negative
        preserve_boundaries: {}
      };

      const chunks = await service.chunkContent(content, invalidOptions);
      expect(chunks.length).toBeGreaterThan(0);
      
      // Should not throw errors and should produce valid chunks
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeGreaterThan(0);
        expect(chunk.start_position).toBeGreaterThanOrEqual(0);
        expect(chunk.end_position).toBeGreaterThanOrEqual(chunk.start_position);
      });
    });
  });
});