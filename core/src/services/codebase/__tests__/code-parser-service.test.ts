/**
 * Code Parser Service Tests
 * 
 * Comprehensive tests for the code parser service including AST generation,
 * symbol extraction, dependency analysis, and caching functionality.
 */

import { CodeParserService } from '../code-parser-service.js';
import { DatabaseManager } from '../../../utils/database.js';
import { 
  SupportedLanguage,
  SymbolType,
  DependencyType,
  ParseError
} from '../../../shared/types/codebase.js';

// Mock DatabaseManager
jest.mock('../../../utils/database.js');
const MockedDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;

describe('CodeParserService', () => {
  let codeParserService: CodeParserService;
  let mockDb: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    mockDb = new MockedDatabaseManager() as jest.Mocked<DatabaseManager>;
    codeParserService = new CodeParserService(mockDb);
    
    // Mock database methods
    mockDb.selectFrom = jest.fn().mockReturnValue({
      selectAll: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue([])
        })
      }),
      select: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          executeTakeFirst: jest.fn().mockResolvedValue(null)
        })
      })
    }) as any;
    
    mockDb.insertInto = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflict: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({})
        })
      })
    }) as any;
    
    mockDb.deleteFrom = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue({})
      }),
      execute: jest.fn().mockResolvedValue({})
    }) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseFile', () => {
    it('should parse TypeScript file successfully', async () => {
      const typescriptCode = `
        export interface User {
          id: string;
          name: string;
        }

        export class UserService {
          async getUser(id: string): Promise<User> {
            return { id, name: 'Test User' };
          }
        }

        import { Database } from './database';
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        typescriptCode,
        'typescript'
      );

      expect(result.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(result.symbols).toHaveLength(3); // interface, class, method
      expect(result.dependencies).toHaveLength(1); // import
      expect(result.parseTime).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse JavaScript file successfully', async () => {
      const javascriptCode = `
        const express = require('express');
        const app = express();

        function createUser(name) {
          return { id: Date.now(), name };
        }

        class ApiController {
          handleRequest(req, res) {
            res.json({ success: true });
          }
        }

        module.exports = { createUser, ApiController };
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        javascriptCode,
        'javascript'
      );

      expect(result.language).toBe(SupportedLanguage.JAVASCRIPT);
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('should parse Python file successfully', async () => {
      const pythonCode = `
        import os
        from typing import List, Dict

        class UserManager:
            def __init__(self):
                self.users = {}

            def add_user(self, name: str) -> Dict:
                user_id = len(self.users) + 1
                user = {"id": user_id, "name": name}
                self.users[user_id] = user
                return user

        def get_all_users() -> List[Dict]:
            return list(UserManager().users.values())
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        pythonCode,
        'python'
      );

      expect(result.language).toBe(SupportedLanguage.PYTHON);
      expect(result.symbols.length).toBeGreaterThan(0);
      expect(result.dependencies.length).toBeGreaterThan(0);
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidCode = `
        this is not valid code in any language
        {{{{{ broken syntax
      `;

      await expect(codeParserService.parseFile(
        'test-file-id',
        invalidCode,
        'typescript'
      )).rejects.toThrow(ParseError);
    });

    it('should throw error for unsupported language', async () => {
      const code = 'print("Hello World")';

      await expect(codeParserService.parseFile(
        'test-file-id',
        code,
        'unsupported-language'
      )).rejects.toThrow();
    });
  });

  describe('extractSymbols', () => {
    it('should extract TypeScript symbols correctly', async () => {
      const typescriptCode = `
        export interface APIResponse<T> {
          data: T;
          error?: string;
        }

        export class DataService {
          private baseUrl: string;

          constructor(baseUrl: string) {
            this.baseUrl = baseUrl;
          }

          async fetchData<T>(endpoint: string): Promise<APIResponse<T>> {
            // implementation
          }

          private handleError(error: Error): void {
            console.error(error);
          }
        }
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        typescriptCode,
        'typescript'
      );

      const symbols = result.symbols;
      expect(symbols.length).toBeGreaterThan(0);

      // Check interface symbol
      const interfaceSymbol = symbols.find(s => s.symbolType === SymbolType.INTERFACE);
      expect(interfaceSymbol).toBeDefined();
      expect(interfaceSymbol?.name).toBe('APIResponse');
      expect(interfaceSymbol?.isExported).toBe(true);

      // Check class symbol
      const classSymbol = symbols.find(s => s.symbolType === SymbolType.CLASS);
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.name).toBe('DataService');
      expect(classSymbol?.isExported).toBe(true);

      // Check method symbols
      const methods = symbols.filter(s => s.symbolType === SymbolType.METHOD);
      expect(methods.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract Python symbols correctly', async () => {
      const pythonCode = `
        class Calculator:
            def __init__(self):
                self.history = []

            def add(self, a, b):
                result = a + b
                self.history.append(f"{a} + {b} = {result}")
                return result

            def _clear_history(self):
                self.history.clear()

        def multiply(x, y):
            return x * y
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        pythonCode,
        'python'
      );

      const symbols = result.symbols;
      
      // Check class symbol
      const classSymbol = symbols.find(s => s.symbolType === SymbolType.CLASS);
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.name).toBe('Calculator');

      // Check function symbol
      const functionSymbol = symbols.find(s => s.symbolType === SymbolType.FUNCTION && s.name === 'multiply');
      expect(functionSymbol).toBeDefined();
    });
  });

  describe('extractDependencies', () => {
    it('should extract TypeScript dependencies correctly', async () => {
      const typescriptCode = `
        import { Router } from 'express';
        import type { User } from './types';
        import * as utils from '../utils';
        import db from './database';
        
        const router = Router();
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        typescriptCode,
        'typescript'
      );

      const dependencies = result.dependencies;
      expect(dependencies.length).toBe(4);

      // Check external dependency
      const expressDep = dependencies.find(d => d.dependencyPath === 'express');
      expect(expressDep).toBeDefined();
      expect(expressDep?.isExternal).toBe(true);
      expect(expressDep?.importedSymbols).toContain('Router');

      // Check internal dependency
      const typesDep = dependencies.find(d => d.dependencyPath === './types');
      expect(typesDep).toBeDefined();
      expect(typesDep?.isExternal).toBe(false);
      expect(typesDep?.isTypeOnly).toBe(true);
    });

    it('should extract Python dependencies correctly', async () => {
      const pythonCode = `
        import os
        import sys
        from typing import List, Dict
        from .models import User
        import requests
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        pythonCode,
        'python'
      );

      const dependencies = result.dependencies;
      expect(dependencies.length).toBeGreaterThan(0);

      // Check standard library import
      const osDep = dependencies.find(d => d.dependencyPath === 'os');
      expect(osDep).toBeDefined();

      // Check from import with symbols
      const typingDep = dependencies.find(d => d.dependencyPath === 'typing');
      expect(typingDep).toBeDefined();
      expect(typingDep?.importedSymbols).toContain('List');
      expect(typingDep?.importedSymbols).toContain('Dict');
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate complexity metrics for TypeScript', async () => {
      const complexCode = `
        function complexFunction(data: any[]): number {
          let result = 0;
          
          for (const item of data) {
            if (item.active) {
              if (item.value > 0) {
                result += item.value;
              } else if (item.value < 0) {
                result -= Math.abs(item.value);
              }
            }
            
            while (item.children && item.children.length > 0) {
              const child = item.children.pop();
              if (child.valid) {
                result += child.score || 0;
              }
            }
          }
          
          return result;
        }

        class DataProcessor {
          process(input: string): boolean {
            if (!input) return false;
            
            try {
              const parsed = JSON.parse(input);
              return parsed.valid === true;
            } catch (error) {
              return false;
            }
          }
        }
      `;

      const result = await codeParserService.parseFile(
        'test-file-id',
        complexCode,
        'typescript'
      );

      const metrics = result.complexityMetrics;
      expect(metrics.cyclomaticComplexity).toBeGreaterThan(1);
      expect(metrics.functionCount).toBe(2); // function + method
      expect(metrics.classCount).toBe(1);
      expect(metrics.linesOfCode).toBeGreaterThan(20);
      expect(metrics.maintainabilityIndex).toBeGreaterThan(0);
    });
  });

  describe('parseRepository', () => {
    beforeEach(() => {
      // Mock file retrieval
      (codeParserService as any).getRepositoryFiles = jest.fn().mockResolvedValue([
        { id: 'file1', path: 'src/index.ts', language: 'typescript', size_bytes: 1000 },
        { id: 'file2', path: 'src/utils.js', language: 'javascript', size_bytes: 500 },
        { id: 'file3', path: 'tests/test.py', language: 'python', size_bytes: 800 }
      ]);

      (codeParserService as any).getFileContent = jest.fn().mockResolvedValue('// mock content');
    });

    it('should parse entire repository', async () => {
      const result = await codeParserService.parseRepository('test-repo-id');

      expect(result.repositoryId).toBe('test-repo-id');
      expect(result.totalFiles).toBe(3);
      expect(result.languages).toHaveProperty('typescript');
      expect(result.languages).toHaveProperty('javascript');
      expect(result.languages).toHaveProperty('python');
    });

    it('should handle repository parsing with options', async () => {
      const options = {
        maxFileSize: 2000,
        excludePatterns: ['*.test.*'],
        maxConcurrency: 2
      };

      const result = await codeParserService.parseRepository('test-repo-id', options);

      expect(result.repositoryId).toBe('test-repo-id');
      expect(result.parseTime).toBeGreaterThan(0);
    });
  });

  describe('searchSymbols', () => {
    beforeEach(() => {
      const mockSymbols = [
        {
          id: '1',
          name: 'User',
          symbolType: 'class',
          language: 'typescript',
          isExported: true,
          repositoryId: 'repo1',
          fileId: 'file1'
        },
        {
          id: '2',
          name: 'getUser',
          symbolType: 'function',
          language: 'typescript',
          isExported: true,
          repositoryId: 'repo1',
          fileId: 'file1'
        }
      ];

      mockDb.selectFrom = jest.fn().mockReturnValue({
        selectAll: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue(mockSymbols)
        })
      }) as any;
    });

    it('should search symbols by name', async () => {
      const query = {
        name: 'User',
        repositoryId: 'repo1',
        limit: 10,
        offset: 0
      };

      const results = await codeParserService.searchSymbols(query);
      expect(results).toHaveLength(2);
    });

    it('should search symbols with fuzzy matching', async () => {
      const query = {
        name: 'user',
        fuzzy: true,
        repositoryId: 'repo1',
        limit: 10,
        offset: 0
      };

      const results = await codeParserService.searchSymbols(query);
      expect(results).toHaveLength(2);
    });
  });

  describe('cache management', () => {
    it('should cache parse results', async () => {
      const code = 'const test = "hello";';
      
      // First parse - should hit database
      await codeParserService.parseFile('test-file', code, 'javascript');
      
      expect(mockDb.insertInto).toHaveBeenCalled();
    });

    it('should invalidate cache for specific file', async () => {
      await codeParserService.invalidateCache('test-file');
      
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('ast_cache');
    });

    it('should get cache statistics', async () => {
      const mockCacheEntries = [
        { language: 'typescript', created_at: new Date(), parse_time_ms: 100 },
        { language: 'javascript', created_at: new Date(), parse_time_ms: 80 }
      ];

      mockDb.selectFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue(mockCacheEntries)
        })
      }) as any;

      const stats = await codeParserService.getCacheStats();
      
      expect(stats.totalEntries).toBe(2);
      expect(stats.languageBreakdown).toHaveProperty('typescript', 1);
      expect(stats.languageBreakdown).toHaveProperty('javascript', 1);
    });
  });

  describe('getDependencyGraph', () => {
    beforeEach(() => {
      const mockDependencies = [
        {
          file_id: 'file1',
          dependency_path: './utils',
          dependency_type: 'import',
          is_external: false
        },
        {
          file_id: 'file1',
          dependency_path: 'lodash',
          dependency_type: 'import',
          is_external: true
        }
      ];

      const mockFiles = [
        { id: 'file1', path: 'src/index.ts' },
        { id: 'file2', path: 'src/utils.ts' }
      ];

      mockDb.selectFrom = jest.fn().mockImplementation((table) => {
        if (table === 'code_dependencies') {
          return {
            selectAll: () => ({
              where: () => ({ execute: () => Promise.resolve(mockDependencies) })
            })
          };
        } else if (table === 'code_files') {
          return {
            select: () => ({
              where: () => ({ execute: () => Promise.resolve(mockFiles) })
            })
          };
        }
        return { execute: () => Promise.resolve([]) };
      }) as any;
    });

    it('should generate dependency graph', async () => {
      const graph = await codeParserService.getDependencyGraph('test-repo');

      expect(graph.repositoryId).toBe('test-repo');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(2);
      expect(graph.externalDependencies).toHaveProperty('lodash', 1);
      expect(graph.stats.totalNodes).toBe(2);
      expect(graph.stats.totalEdges).toBe(2);
    });
  });
});