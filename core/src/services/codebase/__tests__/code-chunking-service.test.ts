/**
 * Code Chunking Service Tests
 * 
 * Comprehensive test suite for the code chunking functionality,
 * covering different languages, strategies, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CodeChunkingService, LanguageChunker } from '../code-chunking-service.js';
import { CodeParserService } from '../code-parser-service.js';
import { DatabaseManager } from '../../../utils/database.js';
import {
  ChunkingStrategy,
  ChunkType,
  SupportedLanguage,
  CodeChunk,
  ChunkingOptions,
  ParseResult
} from '../../../shared/types/codebase.js';

// Mock dependencies
jest.mock('../../../utils/database.js');
jest.mock('../code-parser-service.js');

describe('CodeChunkingService', () => {
  let chunkingService: CodeChunkingService;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockParser: jest.Mocked<CodeParserService>;

  beforeEach(() => {
    mockDb = new DatabaseManager({} as any) as jest.Mocked<DatabaseManager>;
    mockParser = new CodeParserService(mockDb) as jest.Mocked<CodeParserService>;
    chunkingService = new CodeChunkingService(mockDb, mockParser);

    // Setup common mocks
    mockDb.selectFrom = jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockResolvedValue({
            id: 'test-file-id',
            repository_id: 'test-repo-id',
            content: 'test content',
            language: SupportedLanguage.TYPESCRIPT
          })
        }),
        execute: jest.fn().mockResolvedValue([])
      })
    });

    mockDb.insertInto = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue(undefined)
        })
      })
    });

    mockDb.deleteFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue({ numDeletedRows: 0n })
      })
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('chunkFile', () => {
    it('should chunk a TypeScript file by functions', async () => {
      const typeScriptContent = `
        /**
         * A simple function
         */
        function testFunction() {
          return 'test';
        }

        const arrowFunction = () => {
          return 'arrow';
        };
      `;

      const mockParseResult: ParseResult = {
        fileId: 'test-file-id',
        language: SupportedLanguage.TYPESCRIPT,
        ast: { type: 'Program', children: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 1,
          linesOfCode: 10,
          maintainabilityIndex: 80,
          nestingDepth: 1,
          functionCount: 2,
          classCount: 0,
          methodCount: 0,
          variableCount: 1,
          commentLines: 3,
          blankLines: 2,
          duplicatedLines: 0
        },
        parseTime: 100,
        errors: []
      };

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockResolvedValue({
              id: 'test-file-id',
              repository_id: 'test-repo-id',
              content: typeScriptContent,
              language: SupportedLanguage.TYPESCRIPT
            })
          })
        })
      });

      mockParser.parseFile = jest.fn().mockResolvedValue(mockParseResult);

      const options: ChunkingOptions = {
        strategy: ChunkingStrategy.FUNCTION_BASED,
        maxChunkSize: 2000,
        minChunkSize: 50,
        overlapLines: 5,
        contextLines: 3,
        includeComments: true,
        includeImports: true,
        preserveStructure: true,
        respectLanguageRules: true,
        generateEmbeddings: false
      };

      const chunks = await chunkingService.chunkFile('test-file-id', options);

      expect(chunks).toHaveLength(2); // Two functions should be detected
      expect(chunks[0].chunkType).toBe(ChunkType.FUNCTION);
      expect(chunks[0].symbolName).toBe('testFunction');
      expect(chunks[1].symbolName).toBe('arrowFunction');
      expect(chunks[0].content).toContain('/**');
      expect(chunks[0].content).toContain('A simple function');
    });

    it('should handle Python function chunking with decorators', async () => {
      const pythonContent = `
        @decorator
        def test_function():
            """
            A test function with decorator and docstring
            """
            return "test"

        class TestClass:
            def method(self):
                pass
      `;

      const mockParseResult: ParseResult = {
        fileId: 'test-file-id',
        language: SupportedLanguage.PYTHON,
        ast: { type: 'Module', children: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 1,
          linesOfCode: 12,
          maintainabilityIndex: 85,
          nestingDepth: 2,
          functionCount: 2,
          classCount: 1,
          methodCount: 1,
          variableCount: 0,
          commentLines: 3,
          blankLines: 2,
          duplicatedLines: 0
        },
        parseTime: 120,
        errors: []
      };

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockResolvedValue({
              id: 'test-file-id',
              repository_id: 'test-repo-id',
              content: pythonContent,
              language: SupportedLanguage.PYTHON
            })
          })
        })
      });

      mockParser.parseFile = jest.fn().mockResolvedValue(mockParseResult);

      const options: ChunkingOptions = {
        strategy: ChunkingStrategy.FUNCTION_BASED,
        maxChunkSize: 2000,
        minChunkSize: 50,
        overlapLines: 5,
        contextLines: 3,
        includeComments: true,
        includeImports: true,
        preserveStructure: true,
        respectLanguageRules: true,
        generateEmbeddings: false
      };

      const chunks = await chunkingService.chunkFile('test-file-id', options);

      expect(chunks.length).toBeGreaterThan(0);
      const functionChunk = chunks.find(c => c.symbolName === 'test_function');
      expect(functionChunk).toBeDefined();
      expect(functionChunk?.content).toContain('@decorator');
      expect(functionChunk?.metadata).toHaveProperty('decorators');
    });

    it('should handle size-based chunking', async () => {
      const longContent = 'const line = "test";\n'.repeat(100); // 100 lines of content

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockResolvedValue({
              id: 'test-file-id',
              repository_id: 'test-repo-id',
              content: longContent,
              language: SupportedLanguage.JAVASCRIPT
            })
          })
        })
      });

      mockParser.parseFile = jest.fn().mockResolvedValue({
        fileId: 'test-file-id',
        language: SupportedLanguage.JAVASCRIPT,
        ast: { type: 'Program', children: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 1,
          linesOfCode: 100,
          maintainabilityIndex: 90,
          nestingDepth: 1,
          functionCount: 0,
          classCount: 0,
          methodCount: 0,
          variableCount: 100,
          commentLines: 0,
          blankLines: 0,
          duplicatedLines: 95
        },
        parseTime: 50,
        errors: []
      });

      const options: ChunkingOptions = {
        strategy: ChunkingStrategy.SIZE_BASED,
        maxChunkSize: 500, // Small chunks to force multiple chunks
        minChunkSize: 50,
        overlapLines: 5,
        contextLines: 0,
        includeComments: true,
        includeImports: true,
        preserveStructure: true,
        respectLanguageRules: true,
        generateEmbeddings: false
      };

      const chunks = await chunkingService.chunkFile('test-file-id', options);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every(chunk => chunk.chunkType === ChunkType.BLOCK)).toBe(true);
      expect(chunks.every(chunk => chunk.metadata.isSizeBased)).toBe(true);
    });

    it('should handle empty files gracefully', async () => {
      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockResolvedValue({
              id: 'test-file-id',
              repository_id: 'test-repo-id',
              content: '',
              language: SupportedLanguage.TYPESCRIPT
            })
          })
        })
      });

      mockParser.parseFile = jest.fn().mockResolvedValue({
        fileId: 'test-file-id',
        language: SupportedLanguage.TYPESCRIPT,
        ast: { type: 'Program', children: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 0,
          cognitiveComplexity: 0,
          linesOfCode: 0,
          maintainabilityIndex: 100,
          nestingDepth: 0,
          functionCount: 0,
          classCount: 0,
          methodCount: 0,
          variableCount: 0,
          commentLines: 0,
          blankLines: 0,
          duplicatedLines: 0
        },
        parseTime: 10,
        errors: []
      });

      const chunks = await chunkingService.chunkFile('test-file-id');

      expect(chunks).toHaveLength(0);
    });

    it('should handle file not found error', async () => {
      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            executeTakeFirst: jest.fn().mockResolvedValue(null)
          })
        })
      });

      await expect(chunkingService.chunkFile('nonexistent-file-id'))
        .rejects.toThrow('File not found: nonexistent-file-id');
    });
  });

  describe('chunkRepository', () => {
    it('should chunk all files in a repository', async () => {
      const mockFiles = [
        {
          id: 'file1',
          repository_id: 'test-repo-id',
          content: 'function test1() { return 1; }',
          language: SupportedLanguage.TYPESCRIPT
        },
        {
          id: 'file2',
          repository_id: 'test-repo-id',
          content: 'function test2() { return 2; }',
          language: SupportedLanguage.TYPESCRIPT
        }
      ];

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue(mockFiles),
            executeTakeFirst: jest.fn().mockImplementation((_, fileId) => {
              const file = mockFiles.find(f => f.id === fileId);
              return Promise.resolve(file || null);
            })
          })
        })
      });

      // Mock parseFile to return minimal results
      mockParser.parseFile = jest.fn().mockImplementation((fileId) => {
        const file = mockFiles.find(f => f.id === fileId);
        return Promise.resolve({
          fileId,
          language: file?.language || SupportedLanguage.TYPESCRIPT,
          ast: { type: 'Program', children: [] },
          symbols: [],
          dependencies: [],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            linesOfCode: 1,
            maintainabilityIndex: 90,
            nestingDepth: 1,
            functionCount: 1,
            classCount: 0,
            methodCount: 0,
            variableCount: 0,
            commentLines: 0,
            blankLines: 0,
            duplicatedLines: 0
          },
          parseTime: 50,
          errors: []
        } as ParseResult);
      });

      const result = await chunkingService.chunkRepository('test-repo-id');

      expect(result.repositoryId).toBe('test-repo-id');
      expect(result.totalFiles).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.chunksPerFile).toHaveProperty('file1');
      expect(result.chunksPerFile).toHaveProperty('file2');
    });

    it('should handle errors in individual files', async () => {
      const mockFiles = [
        {
          id: 'file1',
          repository_id: 'test-repo-id',
          content: 'function test1() { return 1; }',
          language: SupportedLanguage.TYPESCRIPT
        },
        {
          id: 'file2',
          repository_id: 'test-repo-id',
          content: 'invalid syntax here',
          language: SupportedLanguage.TYPESCRIPT
        }
      ];

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue(mockFiles),
            executeTakeFirst: jest.fn().mockImplementation((_, fileId) => {
              const file = mockFiles.find(f => f.id === fileId);
              return Promise.resolve(file || null);
            })
          })
        })
      });

      // Mock parseFile to throw error for file2
      mockParser.parseFile = jest.fn().mockImplementation((fileId) => {
        if (fileId === 'file2') {
          return Promise.reject(new Error('Parse error'));
        }
        
        return Promise.resolve({
          fileId,
          language: SupportedLanguage.TYPESCRIPT,
          ast: { type: 'Program', children: [] },
          symbols: [],
          dependencies: [],
          complexityMetrics: {
            cyclomaticComplexity: 1,
            cognitiveComplexity: 1,
            linesOfCode: 1,
            maintainabilityIndex: 90,
            nestingDepth: 1,
            functionCount: 1,
            classCount: 0,
            methodCount: 0,
            variableCount: 0,
            commentLines: 0,
            blankLines: 0,
            duplicatedLines: 0
          },
          parseTime: 50,
          errors: []
        } as ParseResult);
      });

      const result = await chunkingService.chunkRepository('test-repo-id');

      expect(result.repositoryId).toBe('test-repo-id');
      expect(result.totalFiles).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fileId).toBe('file2');
      expect(result.errors[0].error).toBe('Parse error');
    });
  });

  describe('searchChunks', () => {
    beforeEach(() => {
      const mockChunks = [
        {
          id: 'chunk1',
          file_id: 'file1',
          repository_id: 'repo1',
          chunk_type: 'function',
          chunk_index: 0,
          start_line: 1,
          end_line: 5,
          content: 'function test() { return "hello"; }',
          content_hash: 'hash1',
          language: 'typescript',
          symbol_name: 'test',
          symbol_type: 'function',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue(mockChunks)
        })
      });
    });

    it('should search chunks by content', async () => {
      const searchQuery = {
        query: 'test',
        includeContent: true,
        caseSensitive: false,
        limit: 20,
        offset: 0
      };

      const result = await chunkingService.searchChunks(searchQuery);

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].symbolName).toBe('test');
      expect(result.totalResults).toBe(1);
      expect(result.query).toBe('test');
    });

    it('should filter search by repository', async () => {
      const searchQuery = {
        query: 'test',
        repositoryId: 'repo1',
        includeContent: true,
        caseSensitive: false,
        limit: 20,
        offset: 0
      };

      await chunkingService.searchChunks(searchQuery);

      expect(mockDb.selectFrom).toHaveBeenCalledWith('code_chunks');
    });
  });

  describe('getChunkingStats', () => {
    beforeEach(() => {
      const mockChunks = [
        {
          id: 'chunk1',
          file_id: 'file1',
          repository_id: 'repo1',
          chunk_type: 'function',
          start_line: 1,
          end_line: 10,
          content: 'function test() {}',
          language: 'typescript'
        },
        {
          id: 'chunk2',
          file_id: 'file1',
          repository_id: 'repo1',
          chunk_type: 'class',
          start_line: 11,
          end_line: 20,
          content: 'class Test {}',
          language: 'typescript'
        }
      ];

      const mockRelationships = [
        {
          id: 'rel1',
          source_chunk_id: 'chunk1',
          target_chunk_id: 'chunk2',
          relationship_type: 'calls',
          strength: 0.8
        }
      ];

      mockDb.selectFrom = jest.fn().mockImplementation((table) => ({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue(
              table === 'code_chunks' ? mockChunks : mockRelationships
            )
          }),
          execute: jest.fn().mockResolvedValue(
            table === 'code_chunks' ? mockChunks : mockRelationships
          )
        })
      }));
    });

    it('should calculate comprehensive chunking statistics', async () => {
      const stats = await chunkingService.getChunkingStats('repo1');

      expect(stats.totalChunks).toBe(2);
      expect(stats.chunksByType.function).toBe(1);
      expect(stats.chunksByType.class).toBe(1);
      expect(stats.chunksByLanguage.typescript).toBe(2);
      expect(stats.relationshipStats.totalRelationships).toBe(1);
      expect(stats.relationshipStats.relationshipsByType.calls).toBe(1);
      expect(stats.qualityMetrics).toHaveProperty('chunkCohesion');
      expect(stats.qualityMetrics).toHaveProperty('contextPreservation');
      expect(stats.qualityMetrics).toHaveProperty('deduplicationRate');
    });
  });

  describe('optimizeChunking', () => {
    it('should optimize chunking and return improvement metrics', async () => {
      // Mock initial stats
      const mockChunks = [
        {
          id: 'chunk1',
          file_id: 'file1',
          repository_id: 'repo1',
          chunk_type: 'function',
          start_line: 1,
          end_line: 5,
          content: 'function test() {}',
          content_hash: 'hash1',
          language: 'typescript'
        },
        {
          id: 'chunk2',
          file_id: 'file1',
          repository_id: 'repo1',
          chunk_type: 'function',
          start_line: 1,
          end_line: 5,
          content: 'function test() {}', // Duplicate content
          content_hash: 'hash1', // Same hash as chunk1
          language: 'typescript'
        }
      ];

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue(mockChunks)
          }),
          execute: jest.fn().mockResolvedValue(mockChunks)
        })
      });

      // Mock deletion of duplicates
      mockDb.with = jest.fn().mockReturnValue({
        deleteFrom: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          executeTakeFirst: jest.fn().mockResolvedValue({ numDeletedRows: 1n })
        })
      });

      const result = await chunkingService.optimizeChunking('repo1');

      expect(result.repositoryId).toBe('repo1');
      expect(result.originalChunkCount).toBe(2);
      expect(result.duplicatesRemoved).toBe(1);
      expect(result.optimizationTime).toBeGreaterThan(0);
      expect(result.recommendations).toBeInstanceOf(Array);
    });
  });
});