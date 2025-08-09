/**
 * Chunker Factory
 * 
 * Factory class for creating language-specific chunkers and determining
 * optimal chunking strategies based on file characteristics.
 */

import {
  SupportedLanguage,
  ChunkingStrategy,
  AST
} from '../../../shared/types/codebase.js';
import { LanguageChunker } from '../code-chunking-service.js';
import { TypeScriptChunker } from './typescript-chunker.js';
import { PythonChunker } from './python-chunker.js';
import { JavaChunker } from './java-chunker.js';
import { GoChunker } from './go-chunker.js';
import { CppChunker } from './cpp-chunker.js';
import { RustChunker } from './rust-chunker.js';
import { UniversalChunker } from './universal-chunker.js';

export class ChunkerFactory {
  private static chunkerCache = new Map<SupportedLanguage, LanguageChunker>();

  /**
   * Create a language-specific chunker
   */
  static createChunker(language: SupportedLanguage): LanguageChunker {
    // Check cache first
    if (this.chunkerCache.has(language)) {
      return this.chunkerCache.get(language)!;
    }

    let chunker: LanguageChunker;

    switch (language) {
      case SupportedLanguage.TYPESCRIPT:
      case SupportedLanguage.JAVASCRIPT:
        chunker = new TypeScriptChunker();
        break;
      
      case SupportedLanguage.PYTHON:
        chunker = new PythonChunker();
        break;
      
      case SupportedLanguage.JAVA:
        chunker = new JavaChunker();
        break;
      
      case SupportedLanguage.GO:
        chunker = new GoChunker();
        break;
      
      case SupportedLanguage.CPP:
      case SupportedLanguage.C:
        chunker = new CppChunker();
        break;
      
      case SupportedLanguage.RUST:
        chunker = new RustChunker();
        break;
      
      default:
        chunker = new UniversalChunker(language);
        break;
    }

    // Cache the chunker for reuse
    this.chunkerCache.set(language, chunker);
    return chunker;
  }

  /**
   * Get list of supported languages
   */
  static getSupportedLanguages(): SupportedLanguage[] {
    return Object.values(SupportedLanguage);
  }

  /**
   * Determine optimal chunking strategy based on file characteristics
   */
  static getOptimalChunkingStrategy(
    ast: AST, 
    fileSize: number,
    language: SupportedLanguage
  ): ChunkingStrategy {
    // Very small files - use intelligent chunking
    if (fileSize < 1000) {
      return ChunkingStrategy.INTELLIGENT;
    }

    // Large files - use size-based chunking with overlap
    if (fileSize > 50000) {
      return ChunkingStrategy.SIZE_BASED;
    }

    // Language-specific optimizations
    switch (language) {
      case SupportedLanguage.TYPESCRIPT:
      case SupportedLanguage.JAVASCRIPT:
        return this.getTypeScriptOptimalStrategy(ast, fileSize);
      
      case SupportedLanguage.PYTHON:
        return this.getPythonOptimalStrategy(ast, fileSize);
      
      case SupportedLanguage.JAVA:
        return this.getJavaOptimalStrategy(ast, fileSize);
      
      case SupportedLanguage.GO:
        return ChunkingStrategy.FUNCTION_BASED; // Go functions are well-defined
      
      default:
        return ChunkingStrategy.HYBRID;
    }
  }

  /**
   * Get chunking recommendations for a language
   */
  static getChunkingRecommendations(language: SupportedLanguage): {
    strategies: ChunkingStrategy[];
    defaultOptions: {
      maxChunkSize: number;
      minChunkSize: number;
      overlapLines: number;
      contextLines: number;
    };
    bestPractices: string[];
  } {
    const recommendations = {
      [SupportedLanguage.TYPESCRIPT]: {
        strategies: [ChunkingStrategy.INTELLIGENT, ChunkingStrategy.FUNCTION_BASED, ChunkingStrategy.CLASS_BASED],
        defaultOptions: {
          maxChunkSize: 2000,
          minChunkSize: 50,
          overlapLines: 5,
          contextLines: 3
        },
        bestPractices: [
          'Preserve JSDoc comments with functions',
          'Include import statements for context',
          'Keep React components as single chunks',
          'Separate interfaces and type definitions'
        ]
      },
      [SupportedLanguage.PYTHON]: {
        strategies: [ChunkingStrategy.FUNCTION_BASED, ChunkingStrategy.CLASS_BASED, ChunkingStrategy.INTELLIGENT],
        defaultOptions: {
          maxChunkSize: 2000,
          minChunkSize: 50,
          overlapLines: 5,
          contextLines: 3
        },
        bestPractices: [
          'Respect indentation boundaries',
          'Include decorators with functions',
          'Preserve docstrings',
          'Keep class methods together with class definition'
        ]
      },
      [SupportedLanguage.JAVA]: {
        strategies: [ChunkingStrategy.CLASS_BASED, ChunkingStrategy.FUNCTION_BASED, ChunkingStrategy.INTELLIGENT],
        defaultOptions: {
          maxChunkSize: 2500,
          minChunkSize: 100,
          overlapLines: 5,
          contextLines: 3
        },
        bestPractices: [
          'Keep methods with their classes',
          'Include annotations and JavaDoc',
          'Separate interfaces from implementations',
          'Preserve package declarations'
        ]
      },
      [SupportedLanguage.GO]: {
        strategies: [ChunkingStrategy.FUNCTION_BASED, ChunkingStrategy.INTELLIGENT],
        defaultOptions: {
          maxChunkSize: 1800,
          minChunkSize: 50,
          overlapLines: 3,
          contextLines: 2
        },
        bestPractices: [
          'Separate functions from methods (receivers)',
          'Keep struct definitions together',
          'Include package declarations',
          'Group related functions'
        ]
      }
    };

    return recommendations[language] || {
      strategies: [ChunkingStrategy.HYBRID, ChunkingStrategy.SIZE_BASED],
      defaultOptions: {
        maxChunkSize: 1500,
        minChunkSize: 100,
        overlapLines: 10,
        contextLines: 3
      },
      bestPractices: [
        'Use size-based chunking for unknown languages',
        'Respect line boundaries and indentation',
        'Include surrounding context',
        'Avoid breaking in middle of expressions'
      ]
    };
  }

  /**
   * Validate if a language is supported for intelligent chunking
   */
  static isLanguageSupported(language: string): language is SupportedLanguage {
    return Object.values(SupportedLanguage).includes(language as SupportedLanguage);
  }

  /**
   * Get file extension mappings to languages
   */
  static getLanguageFromExtension(extension: string): SupportedLanguage | null {
    const extensionMap: Record<string, SupportedLanguage> = {
      '.ts': SupportedLanguage.TYPESCRIPT,
      '.tsx': SupportedLanguage.TYPESCRIPT,
      '.js': SupportedLanguage.JAVASCRIPT,
      '.jsx': SupportedLanguage.JAVASCRIPT,
      '.py': SupportedLanguage.PYTHON,
      '.pyw': SupportedLanguage.PYTHON,
      '.java': SupportedLanguage.JAVA,
      '.go': SupportedLanguage.GO,
      '.cpp': SupportedLanguage.CPP,
      '.cc': SupportedLanguage.CPP,
      '.cxx': SupportedLanguage.CPP,
      '.c': SupportedLanguage.C,
      '.h': SupportedLanguage.C,
      '.hpp': SupportedLanguage.CPP,
      '.rs': SupportedLanguage.RUST
    };

    return extensionMap[extension.toLowerCase()] || null;
  }

  // Private helper methods for language-specific strategy selection

  private static getTypeScriptOptimalStrategy(ast: AST, fileSize: number): ChunkingStrategy {
    // Analyze AST structure to determine best strategy
    if (fileSize > 10000) {
      return ChunkingStrategy.HYBRID; // Mix of functions and classes
    }
    
    // For typical TypeScript files with functions and classes
    return ChunkingStrategy.INTELLIGENT;
  }

  private static getPythonOptimalStrategy(ast: AST, fileSize: number): ChunkingStrategy {
    // Python benefits from function-based chunking due to clear indentation
    if (fileSize > 15000) {
      return ChunkingStrategy.HYBRID;
    }
    
    return ChunkingStrategy.FUNCTION_BASED;
  }

  private static getJavaOptimalStrategy(ast: AST, fileSize: number): ChunkingStrategy {
    // Java typically has one class per file, so class-based chunking works well
    if (fileSize > 20000) {
      return ChunkingStrategy.HYBRID;
    }
    
    return ChunkingStrategy.CLASS_BASED;
  }

  /**
   * Clear the chunker cache (useful for testing or memory management)
   */
  static clearCache(): void {
    this.chunkerCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    size: number;
    languages: SupportedLanguage[];
  } {
    return {
      size: this.chunkerCache.size,
      languages: Array.from(this.chunkerCache.keys())
    };
  }
}