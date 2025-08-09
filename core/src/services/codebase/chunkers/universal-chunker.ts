/**
 * Universal Chunker
 * 
 * Fallback chunker for unsupported languages or when language-specific
 * chunking is not available. Provides basic size-based and structure-aware
 * chunking that works across different programming languages.
 */

import {
  CodeChunk,
  ChunkRelationship,
  ChunkType,
  RelationshipType,
  SupportedLanguage,
  AST
} from '../../../shared/types/codebase.js';
import { BaseChunker } from './base-chunker.js';

export class UniversalChunker extends BaseChunker {
  readonly language: SupportedLanguage;

  constructor(language: SupportedLanguage) {
    super();
    this.language = language;
  }

  /**
   * Generic function chunking using simple patterns
   */
  async chunkByFunctions(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Generic function patterns that work across languages
    const functionPatterns = [
      /^(\s*)(def|function|func|fn)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm, // Python, JS, Go, Rust
      /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*{/gm, // C-style functions
      /^(\s*)(public|private|protected)?\s*(static\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm // Java/C# methods
    ];

    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;
        const functionName = match[3] || match[4] || 'unknown';
        
        // Find end by looking for balanced braces or indentation
        const endLine = this.findGenericFunctionEnd(lines, startLine - 1);
        
        if (endLine > startLine) {
          const functionContent = this.extractLines(content, startLine, endLine);
          
          chunks.push(this.createChunk(
            functionContent,
            fileId,
            repositoryId,
            ChunkType.FUNCTION,
            chunkIndex++,
            startLine,
            endLine,
            match[1].length,
            undefined,
            functionName,
            'function',
            undefined,
            {
              detectionPattern: pattern.source,
              complexity: this.calculateComplexity(functionContent),
              calls: this.findFunctionCalls(functionContent)
            }
          ));
        }
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Generic class/struct chunking
   */
  async chunkByClasses(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Generic class/struct patterns
    const classPatterns = [
      /^(\s*)(class|struct|type)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm,
      /^(\s*)(public|private)?\s*(class|struct)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm
    ];

    for (const pattern of classPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;
        const className = match[3] || match[4] || 'unknown';
        
        const endLine = this.findGenericClassEnd(lines, startLine - 1);
        
        if (endLine > startLine) {
          const classContent = this.extractLines(content, startLine, endLine);
          
          chunks.push(this.createChunk(
            classContent,
            fileId,
            repositoryId,
            ChunkType.CLASS,
            chunkIndex++,
            startLine,
            endLine,
            match[1].length,
            undefined,
            className,
            'class',
            undefined,
            {
              detectionPattern: pattern.source,
              complexity: this.calculateComplexity(classContent)
            }
          ));
        }
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Generic logical block chunking
   */
  async chunkByLogicalBlocks(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Generic control flow patterns
    const blockPatterns = [
      /^(\s*)(if|else|for|while|switch|try|catch|match)\b/gm,
      /^(\s*)(with|begin|loop)\b/gm // Some other language constructs
    ];

    for (const pattern of blockPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;
        
        const endLine = this.findGenericBlockEnd(lines, startLine - 1);
        
        if (endLine > startLine) {
          const blockContent = this.extractLines(content, startLine, endLine);
          
          chunks.push(this.createChunk(
            blockContent,
            fileId,
            repositoryId,
            ChunkType.BLOCK,
            chunkIndex++,
            startLine,
            endLine,
            match[1].length,
            undefined,
            undefined,
            'block',
            undefined,
            {
              blockType: match[2],
              complexity: this.calculateComplexity(blockContent),
              detectionPattern: pattern.source
            }
          ));
        }
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Size-based chunking with intelligent break points
   */
  async chunkBySize(
    content: string,
    maxSize: number,
    overlap: number,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;
    let currentStart = 0;

    while (currentStart < lines.length) {
      let chunkEnd = Math.min(currentStart + Math.floor(maxSize / 50), lines.length); // Assume ~50 chars per line
      
      // Find intelligent break points
      if (chunkEnd < lines.length) {
        const breakPoint = this.findIntelligentBreakPoint(lines, currentStart, chunkEnd);
        if (breakPoint > currentStart) {
          chunkEnd = breakPoint;
        }
      }
      
      const chunkContent = lines.slice(currentStart, chunkEnd).join('\n');
      
      if (chunkContent.trim()) {
        chunks.push(this.createChunk(
          chunkContent,
          fileId,
          repositoryId,
          ChunkType.BLOCK,
          chunkIndex++,
          currentStart + 1,
          chunkEnd,
          0,
          undefined,
          undefined,
          'block',
          undefined,
          {
            isSizeBased: true,
            actualSize: chunkContent.length,
            overlap: Math.min(overlap, chunkEnd - currentStart),
            breakPointType: this.detectBreakPointType(lines, chunkEnd - 1)
          }
        ));
      }
      
      const overlapLines = Math.floor(overlap / 50); // Convert overlap size to lines
      currentStart = Math.max(currentStart + 1, chunkEnd - overlapLines);
    }

    return chunks;
  }

  /**
   * Extract basic relationships
   */
  async extractRelationships(chunks: CodeChunk[]): Promise<ChunkRelationship[]> {
    const relationships: ChunkRelationship[] = [];
    
    // Simple relationship detection based on content similarity and calls
    for (let i = 0; i < chunks.length; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const chunk1 = chunks[i];
        const chunk2 = chunks[j];
        
        // Check for function calls
        const calls1 = this.findFunctionCalls(chunk1.content);
        const calls2 = this.findFunctionCalls(chunk2.content);
        
        if (chunk2.symbolName && calls1.includes(chunk2.symbolName)) {
          relationships.push(this.createRelationship(
            chunk1.id,
            chunk2.id,
            RelationshipType.CALLS,
            0.7
          ));
        }
        
        if (chunk1.symbolName && calls2.includes(chunk1.symbolName)) {
          relationships.push(this.createRelationship(
            chunk2.id,
            chunk1.id,
            RelationshipType.CALLS,
            0.7
          ));
        }
        
        // Check for structural relationships (same parent, similar context)
        if (chunk1.parentChunkId === chunk2.parentChunkId && chunk1.parentChunkId) {
          relationships.push(this.createRelationship(
            chunk1.id,
            chunk2.id,
            RelationshipType.SIMILAR,
            0.5
          ));
        }
      }
    }

    return relationships;
  }

  // Helper methods

  private findGenericFunctionEnd(lines: string[], startLine: number): number {
    // Try brace matching first
    let braceCount = 0;
    let foundOpenBrace = false;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            return i + 1;
          }
        }
      }
    }
    
    // If no braces found, try indentation-based detection (Python-style)
    if (!foundOpenBrace) {
      const startIndent = this.getIndentLevel(lines[startLine]);
      
      for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Empty line, continue
        if (!line) continue;
        
        // If we find a line with equal or less indentation, function ends
        if (this.getIndentLevel(lines[i]) <= startIndent) {
          return i;
        }
      }
    }
    
    return Math.min(startLine + 50, lines.length); // Fallback: assume reasonable function length
  }

  private findGenericClassEnd(lines: string[], startLine: number): number {
    // Similar to function end, but classes tend to be longer
    let braceCount = 0;
    let foundOpenBrace = false;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpenBrace && braceCount === 0) {
            return i + 1;
          }
        }
      }
    }
    
    // Indentation-based fallback
    if (!foundOpenBrace) {
      const startIndent = this.getIndentLevel(lines[startLine]);
      
      for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        if (this.getIndentLevel(lines[i]) <= startIndent) {
          return i;
        }
      }
    }
    
    return Math.min(startLine + 200, lines.length); // Classes can be longer
  }

  private findGenericBlockEnd(lines: string[], startLine: number): number {
    return this.findGenericFunctionEnd(lines, startLine);
  }

  private findIntelligentBreakPoint(lines: string[], start: number, end: number): number {
    // Look for good break points in reverse order from the end
    for (let i = end - 1; i > start + Math.floor((end - start) * 0.8); i--) {
      const line = lines[i].trim();
      
      // Empty line is a great break point
      if (!line) {
        return i + 1;
      }
      
      // End of function/class/block
      if (line === '}' || line.endsWith('};')) {
        return i + 1;
      }
      
      // End of statement
      if (line.endsWith(';')) {
        return i + 1;
      }
      
      // Comment lines are good break points
      if (line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) {
        return i + 1;
      }
    }
    
    return end; // No good break point found
  }

  private detectBreakPointType(lines: string[], lineIndex: number): string {
    if (lineIndex >= lines.length) return 'end_of_file';
    
    const line = lines[lineIndex].trim();
    
    if (!line) return 'empty_line';
    if (line === '}') return 'block_end';
    if (line.endsWith(';')) return 'statement_end';
    if (line.startsWith('//') || line.startsWith('#')) return 'comment';
    
    return 'arbitrary';
  }

  private getIndentLevel(line: string): number {
    let indent = 0;
    for (const char of line) {
      if (char === ' ') {
        indent++;
      } else if (char === '\t') {
        indent += 4; // Assume 4 spaces per tab
      } else {
        break;
      }
    }
    return indent;
  }
}