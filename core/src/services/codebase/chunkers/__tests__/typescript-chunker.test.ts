/**
 * TypeScript Chunker Tests
 * 
 * Tests for TypeScript/JavaScript specific chunking functionality.
 */

import { describe, it, expect } from '@jest/globals';
import { TypeScriptChunker } from '../typescript-chunker.js';
import { ChunkType, SymbolType, AST } from '../../../../shared/types/codebase.js';

describe('TypeScriptChunker', () => {
  let chunker: TypeScriptChunker;
  const fileId = 'test-file-id';
  const repositoryId = 'test-repo-id';
  const mockAst: AST = { type: 'Program', children: [] };

  beforeEach(() => {
    chunker = new TypeScriptChunker();
  });

  describe('chunkByFunctions', () => {
    it('should chunk regular function declarations', async () => {
      const content = `
        /**
         * A test function
         */
        function testFunction(param: string): string {
          return param;
        }

        export function exportedFunction(): void {
          console.log('exported');
        }
      `;

      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);

      expect(chunks).toHaveLength(2);
      
      const testFunction = chunks.find(c => c.symbolName === 'testFunction');
      expect(testFunction).toBeDefined();
      expect(testFunction?.chunkType).toBe(ChunkType.FUNCTION);
      expect(testFunction?.symbolType).toBe(SymbolType.FUNCTION);
      expect(testFunction?.content).toContain('/**');
      expect(testFunction?.content).toContain('A test function');
      expect(testFunction?.metadata.isExported).toBe(false);

      const exportedFunction = chunks.find(c => c.symbolName === 'exportedFunction');
      expect(exportedFunction).toBeDefined();
      expect(exportedFunction?.metadata.isExported).toBe(true);
    });

    it('should chunk arrow functions', async () => {
      const content = `
        const arrowFunction = (x: number) => {
          return x * 2;
        };

        export const exportedArrow = async (data: any) => {
          await processData(data);
        };
      `;

      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);

      expect(chunks).toHaveLength(2);
      
      const arrowFunction = chunks.find(c => c.symbolName === 'arrowFunction');
      expect(arrowFunction).toBeDefined();
      expect(arrowFunction?.metadata.isArrowFunction).toBe(true);
      expect(arrowFunction?.metadata.variableType).toBe('const');

      const asyncArrow = chunks.find(c => c.symbolName === 'exportedArrow');
      expect(asyncArrow).toBeDefined();
      expect(asyncArrow?.metadata.isAsync).toBe(true);
      expect(asyncArrow?.metadata.isExported).toBe(true);
    });

    it('should calculate complexity for functions', async () => {
      const content = `
        function complexFunction(input: string): boolean {
          if (input.length > 0) {
            for (let i = 0; i < input.length; i++) {
              if (input[i] === 'x') {
                return true;
              }
            }
          }
          return false;
        }
      `;

      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].metadata.complexity).toBeGreaterThan(0);
    });
  });

  describe('chunkByClasses', () => {
    it('should chunk class declarations', async () => {
      const content = `
        /**
         * A test class
         */
        export class TestClass {
          private property: string;

          constructor(value: string) {
            this.property = value;
          }

          public method(): string {
            return this.property;
          }
        }

        abstract class AbstractClass {
          abstract abstractMethod(): void;
        }
      `;

      const chunks = await chunker.chunkByClasses(content, mockAst, fileId, repositoryId);

      expect(chunks).toHaveLength(2);
      
      const testClass = chunks.find(c => c.symbolName === 'TestClass');
      expect(testClass).toBeDefined();
      expect(testClass?.chunkType).toBe(ChunkType.CLASS);
      expect(testClass?.symbolType).toBe(SymbolType.CLASS);
      expect(testClass?.metadata.isExported).toBe(true);
      expect(testClass?.metadata.isAbstract).toBe(false);
      expect(testClass?.metadata.methods).toContain('method');

      const abstractClass = chunks.find(c => c.symbolName === 'AbstractClass');
      expect(abstractClass).toBeDefined();
      expect(abstractClass?.metadata.isAbstract).toBe(true);
    });

    it('should chunk interfaces', async () => {
      const content = `
        interface User {
          id: number;
          name: string;
          email?: string;
        }

        export interface ApiResponse<T> {
          data: T;
          status: number;
        }
      `;

      const chunks = await chunker.chunkByClasses(content, mockAst, fileId, repositoryId);

      expect(chunks).toHaveLength(2);
      
      const userInterface = chunks.find(c => c.symbolName === 'User');
      expect(userInterface).toBeDefined();
      expect(userInterface?.chunkType).toBe(ChunkType.INTERFACE);
      expect(userInterface?.symbolType).toBe(SymbolType.INTERFACE);
      expect(userInterface?.metadata.properties).toContain('id');
      expect(userInterface?.metadata.properties).toContain('name');

      const apiInterface = chunks.find(c => c.symbolName === 'ApiResponse');
      expect(apiInterface).toBeDefined();
      expect(apiInterface?.metadata.isExported).toBe(true);
    });

    it('should chunk type aliases', async () => {
      const content = `
        type Status = 'pending' | 'completed' | 'failed';
        
        export type UserRole = 'admin' | 'user' | 'guest';

        type ComplexType = {
          id: number;
          nested: {
            value: string;
          };
        };
      `;

      const chunks = await chunker.chunkByClasses(content, mockAst, fileId, repositoryId);

      expect(chunks).toHaveLength(3);
      
      const statusType = chunks.find(c => c.symbolName === 'Status');
      expect(statusType).toBeDefined();
      expect(statusType?.chunkType).toBe(ChunkType.TYPE);
      expect(statusType?.symbolType).toBe(SymbolType.TYPE_ALIAS);

      const userRoleType = chunks.find(c => c.symbolName === 'UserRole');
      expect(userRoleType).toBeDefined();
      expect(userRoleType?.metadata.isExported).toBe(true);
    });
  });

  describe('chunkByLogicalBlocks', () => {
    it('should chunk control flow blocks', async () => {
      const content = `
        function processData(data: any[]) {
          if (data.length === 0) {
            return [];
          }

          for (const item of data) {
            try {
              processItem(item);
            } catch (error) {
              console.error('Error processing item:', error);
            }
          }

          switch (data.length) {
            case 1:
              return 'single';
            default:
              return 'multiple';
          }
        }
      `;

      const chunks = await chunker.chunkByLogicalBlocks(content, mockAst, fileId, repositoryId);

      expect(chunks.length).toBeGreaterThan(0);
      
      const blocks = chunks.map(c => c.metadata.blockType);
      expect(blocks).toContain('if');
      expect(blocks).toContain('for');
      expect(blocks).toContain('try');
      expect(blocks).toContain('switch');
    });
  });

  describe('chunkBySize', () => {
    it('should chunk by size with overlap', async () => {
      const longContent = 'const line = "test content";\n'.repeat(100);

      const chunks = await chunker.chunkBySize(longContent, 500, 5, fileId, repositoryId);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.every(c => c.chunkType === ChunkType.BLOCK)).toBe(true);
      expect(chunks.every(c => c.metadata.isSizeBased)).toBe(true);
      
      // Check that chunks are ordered by line number
      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].startLine).toBeGreaterThan(chunks[i-1].startLine);
      }
    });

    it('should respect natural break points', async () => {
      const content = `
        function first() {
          return 1;
        }

        function second() {
          return 2;
        }

        function third() {
          return 3;
        }
      `;

      const chunks = await chunker.chunkBySize(content, 100, 2, fileId, repositoryId);

      // Should break at natural boundaries (end of functions)
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('extractRelationships', () => {
    it('should extract function call relationships', async () => {
      const chunks = [
        {
          id: 'chunk1',
          content: 'function caller() { return helper(); }',
          symbolName: 'caller',
          chunkType: ChunkType.FUNCTION,
          startLine: 1
        },
        {
          id: 'chunk2', 
          content: 'function helper() { return "help"; }',
          symbolName: 'helper',
          chunkType: ChunkType.FUNCTION,
          startLine: 5
        }
      ] as any[];

      const relationships = await chunker.extractRelationships(chunks);

      expect(relationships).toHaveLength(1);
      expect(relationships[0].sourceChunkId).toBe('chunk1');
      expect(relationships[0].targetChunkId).toBe('chunk2');
      expect(relationships[0].relationshipType).toBe('calls');
      expect(relationships[0].strength).toBe(0.8);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', async () => {
      const content = '';
      
      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);
      expect(chunks).toHaveLength(0);
    });

    it('should handle malformed functions', async () => {
      const content = `
        function incomplete(
        // Missing closing parenthesis and body
      `;
      
      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);
      // Should not crash, might return 0 or partial chunks
      expect(Array.isArray(chunks)).toBe(true);
    });

    it('should handle nested functions', async () => {
      const content = `
        function outer() {
          function inner() {
            return 'inner';
          }
          return inner();
        }
      `;

      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      
      const outerFunction = chunks.find(c => c.symbolName === 'outer');
      expect(outerFunction).toBeDefined();
      // Inner function should be included in outer function's content
      expect(outerFunction?.content).toContain('function inner');
    });

    it('should handle React components', async () => {
      const content = `
        const MyComponent: React.FC = () => {
          return <div>Hello World</div>;
        };

        export default function AnotherComponent() {
          return <MyComponent />;
        }
      `;

      const chunks = await chunker.chunkByFunctions(content, mockAst, fileId, repositoryId);
      
      expect(chunks).toHaveLength(2);
      
      const arrowComponent = chunks.find(c => c.symbolName === 'MyComponent');
      expect(arrowComponent).toBeDefined();
      expect(arrowComponent?.metadata.isArrowFunction).toBe(true);

      const functionComponent = chunks.find(c => c.symbolName === 'AnotherComponent');
      expect(functionComponent).toBeDefined();
      expect(functionComponent?.metadata.isExported).toBe(true);
    });
  });
});