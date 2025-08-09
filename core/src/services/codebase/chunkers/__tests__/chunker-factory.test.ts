/**
 * Chunker Factory Tests
 * 
 * Tests for the ChunkerFactory class covering language detection,
 * strategy selection, and chunker creation.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { ChunkerFactory } from '../chunker-factory.js';
import {
  SupportedLanguage,
  ChunkingStrategy,
  AST
} from '../../../../shared/types/codebase.js';
import { TypeScriptChunker } from '../typescript-chunker.js';
import { PythonChunker } from '../python-chunker.js';
import { UniversalChunker } from '../universal-chunker.js';

describe('ChunkerFactory', () => {
  afterEach(() => {
    ChunkerFactory.clearCache();
  });

  describe('createChunker', () => {
    it('should create TypeScript chunker for TypeScript language', () => {
      const chunker = ChunkerFactory.createChunker(SupportedLanguage.TYPESCRIPT);
      expect(chunker).toBeInstanceOf(TypeScriptChunker);
      expect(chunker.language).toBe(SupportedLanguage.TYPESCRIPT);
    });

    it('should create Python chunker for Python language', () => {
      const chunker = ChunkerFactory.createChunker(SupportedLanguage.PYTHON);
      expect(chunker).toBeInstanceOf(PythonChunker);
      expect(chunker.language).toBe(SupportedLanguage.PYTHON);
    });

    it('should create Universal chunker for unsupported language', () => {
      // Cast to SupportedLanguage for testing purposes
      const unsupportedLang = 'unknown' as SupportedLanguage;
      const chunker = ChunkerFactory.createChunker(unsupportedLang);
      expect(chunker).toBeInstanceOf(UniversalChunker);
    });

    it('should cache created chunkers', () => {
      const chunker1 = ChunkerFactory.createChunker(SupportedLanguage.TYPESCRIPT);
      const chunker2 = ChunkerFactory.createChunker(SupportedLanguage.TYPESCRIPT);
      
      expect(chunker1).toBe(chunker2); // Same instance due to caching
    });

    it('should create different instances for different languages', () => {
      const tsChunker = ChunkerFactory.createChunker(SupportedLanguage.TYPESCRIPT);
      const pyChunker = ChunkerFactory.createChunker(SupportedLanguage.PYTHON);
      
      expect(tsChunker).not.toBe(pyChunker);
      expect(tsChunker.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(pyChunker.language).toBe(SupportedLanguage.PYTHON);
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return list of all supported languages', () => {
      const languages = ChunkerFactory.getSupportedLanguages();
      
      expect(languages).toContain(SupportedLanguage.TYPESCRIPT);
      expect(languages).toContain(SupportedLanguage.JAVASCRIPT);
      expect(languages).toContain(SupportedLanguage.PYTHON);
      expect(languages).toContain(SupportedLanguage.JAVA);
      expect(languages).toContain(SupportedLanguage.GO);
      expect(languages).toContain(SupportedLanguage.CPP);
      expect(languages).toContain(SupportedLanguage.RUST);
    });
  });

  describe('getOptimalChunkingStrategy', () => {
    const mockAst: AST = { type: 'Program', children: [] };

    it('should return intelligent strategy for small files', () => {
      const strategy = ChunkerFactory.getOptimalChunkingStrategy(
        mockAst,
        500, // Small file size
        SupportedLanguage.TYPESCRIPT
      );
      
      expect(strategy).toBe(ChunkingStrategy.INTELLIGENT);
    });

    it('should return size-based strategy for large files', () => {
      const strategy = ChunkerFactory.getOptimalChunkingStrategy(
        mockAst,
        60000, // Large file size
        SupportedLanguage.TYPESCRIPT
      );
      
      expect(strategy).toBe(ChunkingStrategy.SIZE_BASED);
    });

    it('should return function-based strategy for Go', () => {
      const strategy = ChunkerFactory.getOptimalChunkingStrategy(
        mockAst,
        5000,
        SupportedLanguage.GO
      );
      
      expect(strategy).toBe(ChunkingStrategy.FUNCTION_BASED);
    });

    it('should return hybrid strategy for unknown languages', () => {
      const strategy = ChunkerFactory.getOptimalChunkingStrategy(
        mockAst,
        5000,
        'unknown' as SupportedLanguage
      );
      
      expect(strategy).toBe(ChunkingStrategy.HYBRID);
    });
  });

  describe('getChunkingRecommendations', () => {
    it('should return TypeScript-specific recommendations', () => {
      const recommendations = ChunkerFactory.getChunkingRecommendations(SupportedLanguage.TYPESCRIPT);
      
      expect(recommendations.strategies).toContain(ChunkingStrategy.INTELLIGENT);
      expect(recommendations.strategies).toContain(ChunkingStrategy.FUNCTION_BASED);
      expect(recommendations.defaultOptions.maxChunkSize).toBe(2000);
      expect(recommendations.bestPractices).toContain('Preserve JSDoc comments with functions');
      expect(recommendations.bestPractices).toContain('Include import statements for context');
    });

    it('should return Python-specific recommendations', () => {
      const recommendations = ChunkerFactory.getChunkingRecommendations(SupportedLanguage.PYTHON);
      
      expect(recommendations.strategies).toContain(ChunkingStrategy.FUNCTION_BASED);
      expect(recommendations.strategies).toContain(ChunkingStrategy.CLASS_BASED);
      expect(recommendations.bestPractices).toContain('Respect indentation boundaries');
      expect(recommendations.bestPractices).toContain('Include decorators with functions');
    });

    it('should return Java-specific recommendations', () => {
      const recommendations = ChunkerFactory.getChunkingRecommendations(SupportedLanguage.JAVA);
      
      expect(recommendations.strategies).toContain(ChunkingStrategy.CLASS_BASED);
      expect(recommendations.defaultOptions.maxChunkSize).toBe(2500);
      expect(recommendations.bestPractices).toContain('Keep methods with their classes');
      expect(recommendations.bestPractices).toContain('Include annotations and JavaDoc');
    });

    it('should return Go-specific recommendations', () => {
      const recommendations = ChunkerFactory.getChunkingRecommendations(SupportedLanguage.GO);
      
      expect(recommendations.strategies).toContain(ChunkingStrategy.FUNCTION_BASED);
      expect(recommendations.defaultOptions.maxChunkSize).toBe(1800);
      expect(recommendations.bestPractices).toContain('Separate functions from methods (receivers)');
    });

    it('should return generic recommendations for unsupported languages', () => {
      const recommendations = ChunkerFactory.getChunkingRecommendations('unknown' as SupportedLanguage);
      
      expect(recommendations.strategies).toContain(ChunkingStrategy.HYBRID);
      expect(recommendations.strategies).toContain(ChunkingStrategy.SIZE_BASED);
      expect(recommendations.bestPractices).toContain('Use size-based chunking for unknown languages');
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', () => {
      expect(ChunkerFactory.isLanguageSupported('typescript')).toBe(true);
      expect(ChunkerFactory.isLanguageSupported('python')).toBe(true);
      expect(ChunkerFactory.isLanguageSupported('java')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(ChunkerFactory.isLanguageSupported('cobol')).toBe(false);
      expect(ChunkerFactory.isLanguageSupported('fortran')).toBe(false);
      expect(ChunkerFactory.isLanguageSupported('assembly')).toBe(false);
    });
  });

  describe('getLanguageFromExtension', () => {
    it('should map TypeScript extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.ts')).toBe(SupportedLanguage.TYPESCRIPT);
      expect(ChunkerFactory.getLanguageFromExtension('.tsx')).toBe(SupportedLanguage.TYPESCRIPT);
    });

    it('should map JavaScript extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.js')).toBe(SupportedLanguage.JAVASCRIPT);
      expect(ChunkerFactory.getLanguageFromExtension('.jsx')).toBe(SupportedLanguage.JAVASCRIPT);
    });

    it('should map Python extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.py')).toBe(SupportedLanguage.PYTHON);
      expect(ChunkerFactory.getLanguageFromExtension('.pyw')).toBe(SupportedLanguage.PYTHON);
    });

    it('should map Java extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.java')).toBe(SupportedLanguage.JAVA);
    });

    it('should map Go extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.go')).toBe(SupportedLanguage.GO);
    });

    it('should map C++ extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.cpp')).toBe(SupportedLanguage.CPP);
      expect(ChunkerFactory.getLanguageFromExtension('.cc')).toBe(SupportedLanguage.CPP);
      expect(ChunkerFactory.getLanguageFromExtension('.cxx')).toBe(SupportedLanguage.CPP);
      expect(ChunkerFactory.getLanguageFromExtension('.hpp')).toBe(SupportedLanguage.CPP);
    });

    it('should map C extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.c')).toBe(SupportedLanguage.C);
      expect(ChunkerFactory.getLanguageFromExtension('.h')).toBe(SupportedLanguage.C);
    });

    it('should map Rust extensions correctly', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.rs')).toBe(SupportedLanguage.RUST);
    });

    it('should handle case insensitive extensions', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.TS')).toBe(SupportedLanguage.TYPESCRIPT);
      expect(ChunkerFactory.getLanguageFromExtension('.PY')).toBe(SupportedLanguage.PYTHON);
    });

    it('should return null for unknown extensions', () => {
      expect(ChunkerFactory.getLanguageFromExtension('.unknown')).toBe(null);
      expect(ChunkerFactory.getLanguageFromExtension('.xyz')).toBe(null);
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      ChunkerFactory.createChunker(SupportedLanguage.TYPESCRIPT);
      ChunkerFactory.createChunker(SupportedLanguage.PYTHON);
      
      let stats = ChunkerFactory.getCacheStats();
      expect(stats.size).toBe(2);
      
      ChunkerFactory.clearCache();
      
      stats = ChunkerFactory.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache statistics', () => {
      ChunkerFactory.createChunker(SupportedLanguage.TYPESCRIPT);
      ChunkerFactory.createChunker(SupportedLanguage.PYTHON);
      ChunkerFactory.createChunker(SupportedLanguage.JAVA);
      
      const stats = ChunkerFactory.getCacheStats();
      expect(stats.size).toBe(3);
      expect(stats.languages).toContain(SupportedLanguage.TYPESCRIPT);
      expect(stats.languages).toContain(SupportedLanguage.PYTHON);
      expect(stats.languages).toContain(SupportedLanguage.JAVA);
    });
  });
});