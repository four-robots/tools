/**
 * Base Chunker
 * 
 * Abstract base class for language-specific code chunkers.
 * Provides common functionality and interface for intelligent code chunking.
 */

import crypto from 'crypto';
import {
  CodeChunk,
  ChunkRelationship,
  ChunkType,
  RelationshipType,
  SupportedLanguage,
  AST
} from '../../../shared/types/codebase.js';
import { LanguageChunker } from '../code-chunking-service.js';

export abstract class BaseChunker implements LanguageChunker {
  abstract readonly language: SupportedLanguage;

  /**
   * Create a code chunk from content and metadata
   */
  protected createChunk(
    content: string,
    fileId: string,
    repositoryId: string,
    type: ChunkType,
    index: number,
    startLine: number,
    endLine: number,
    startColumn?: number,
    endColumn?: number,
    symbolName?: string,
    symbolType?: string,
    parentChunkId?: string,
    metadata: Record<string, any> = {}
  ): CodeChunk {
    return {
      id: crypto.randomUUID(),
      fileId,
      repositoryId,
      chunkType: type,
      chunkIndex: index,
      startLine,
      endLine,
      startColumn,
      endColumn,
      content: content.trim(),
      contentHash: crypto.createHash('sha256').update(content.trim()).digest('hex'),
      language: this.language,
      symbolName,
      symbolType,
      parentChunkId,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Extract lines from content based on line numbers (1-indexed)
   */
  protected extractLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    return lines.slice(startLine - 1, endLine).join('\n');
  }

  /**
   * Find function calls in content using simple regex patterns
   */
  protected findFunctionCalls(content: string): string[] {
    const functionCallPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const calls: string[] = [];
    let match;
    
    while ((match = functionCallPattern.exec(content)) !== null) {
      calls.push(match[1]);
    }
    
    return [...new Set(calls)]; // Remove duplicates
  }

  /**
   * Find import statements in content
   */
  protected findImports(content: string): string[] {
    const importPattern = /(?:import|from|require)\s+(?:.*?['"](.*?)['"]|([a-zA-Z_$][a-zA-Z0-9_$.]*))/g;
    const imports: string[] = [];
    let match;
    
    while ((match = importPattern.exec(content)) !== null) {
      const imported = match[1] || match[2];
      if (imported) {
        imports.push(imported);
      }
    }
    
    return [...new Set(imports)];
  }

  /**
   * Create a relationship between two chunks
   */
  protected createRelationship(
    sourceChunkId: string,
    targetChunkId: string,
    type: RelationshipType,
    strength: number = 0.5,
    lineReferences: string[] = []
  ): ChunkRelationship {
    return {
      id: crypto.randomUUID(),
      sourceChunkId,
      targetChunkId,
      relationshipType: type,
      strength,
      lineReferences,
      createdAt: new Date()
    };
  }

  /**
   * Calculate complexity score for a chunk based on various metrics
   */
  protected calculateComplexity(content: string): number {
    let complexity = 0;
    
    // Control flow statements
    const controlFlowPattern = /\b(if|else|for|while|switch|case|try|catch)\b/g;
    complexity += (content.match(controlFlowPattern) || []).length;
    
    // Nested structures (simplified)
    const nesting = content.split('').reduce((depth, char, index) => {
      if (char === '{') return depth + 1;
      if (char === '}') return Math.max(0, depth - 1);
      return depth;
    }, 0);
    complexity += Math.floor(nesting / 2);
    
    // Function calls
    complexity += this.findFunctionCalls(content).length * 0.1;
    
    return Math.min(complexity, 10); // Cap at 10
  }

  /**
   * Abstract methods to be implemented by language-specific chunkers
   */
  abstract chunkByFunctions(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]>;

  abstract chunkByClasses(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]>;

  abstract chunkByLogicalBlocks(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]>;

  abstract chunkBySize(
    content: string,
    maxSize: number,
    overlap: number,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]>;

  abstract extractRelationships(chunks: CodeChunk[]): Promise<ChunkRelationship[]>;
}