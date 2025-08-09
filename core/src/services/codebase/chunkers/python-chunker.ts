/**
 * Python Chunker
 * 
 * Intelligent chunking for Python files with support for:
 * - Function definitions (def)
 * - Class definitions
 * - Decorators and docstrings
 * - Indentation-based structure
 */

import {
  CodeChunk,
  ChunkRelationship,
  ChunkType,
  RelationshipType,
  SupportedLanguage,
  SymbolType,
  AST
} from '../../../shared/types/codebase.js';
import { BaseChunker } from './base-chunker.js';

export class PythonChunker extends BaseChunker {
  readonly language = SupportedLanguage.PYTHON;

  async chunkByFunctions(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Python function pattern with decorators
    const functionPattern = /^(\s*)((?:@[^\n]+\n\s*)*)(async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm;
    
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      const functionName = match[4];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      // Include decorators in the chunk
      const decoratorLines = (match[2] || '').split('\n').filter(l => l.trim()).length;
      const actualStartLine = startLine - decoratorLines + 1;
      
      const endLine = this.findPythonFunctionEnd(lines, startLine - 1);
      
      if (endLine > actualStartLine) {
        const functionContent = this.extractLines(content, actualStartLine, endLine);
        
        chunks.push(this.createChunk(
          functionContent,
          fileId,
          repositoryId,
          ChunkType.FUNCTION,
          chunkIndex++,
          actualStartLine,
          endLine,
          match[1].length,
          undefined,
          functionName,
          SymbolType.FUNCTION,
          undefined,
          {
            isAsync: !!match[3],
            decorators: this.extractDecorators(match[2] || ''),
            docstring: this.extractDocstring(functionContent),
            complexity: this.calculateComplexity(functionContent),
            calls: this.findFunctionCalls(functionContent)
          }
        ));
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  async chunkByClasses(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Python class pattern with decorators
    const classPattern = /^(\s*)((?:@[^\n]+\n\s*)*)(class\s+([a-zA-Z_][a-zA-Z0-9_]*)).*:/gm;
    
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[4];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      const decoratorLines = (match[2] || '').split('\n').filter(l => l.trim()).length;
      const actualStartLine = startLine - decoratorLines + 1;
      
      const endLine = this.findPythonClassEnd(lines, startLine - 1);
      
      if (endLine > actualStartLine) {
        const classContent = this.extractLines(content, actualStartLine, endLine);
        
        chunks.push(this.createChunk(
          classContent,
          fileId,
          repositoryId,
          ChunkType.CLASS,
          chunkIndex++,
          actualStartLine,
          endLine,
          match[1].length,
          undefined,
          className,
          SymbolType.CLASS,
          undefined,
          {
            decorators: this.extractDecorators(match[2] || ''),
            docstring: this.extractDocstring(classContent),
            methods: this.extractMethods(classContent),
            complexity: this.calculateComplexity(classContent)
          }
        ));
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  async chunkByLogicalBlocks(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Python control flow patterns
    const controlFlowPatterns = [
      /^(\s*)(if\s+.+:|elif\s+.+:|else\s*:)/gm,
      /^(\s*)(for\s+.+:|while\s+.+:)/gm,
      /^(\s*)(try\s*:|except.*:|finally\s*:|with\s+.+:)/gm
    ];

    controlFlowPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;
        const endLine = this.findPythonBlockEnd(lines, startLine - 1);
        
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
            undefined,
            undefined,
            {
              blockType: match[2].split(/\s|:/)[0],
              indentLevel: match[1].length,
              complexity: this.calculateComplexity(blockContent)
            }
          ));
        }
      }
    });

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

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
      let chunkEnd = Math.min(currentStart + Math.floor(maxSize / 50), lines.length);
      
      // Respect Python indentation for break points
      if (chunkEnd < lines.length) {
        chunkEnd = this.findPythonBreakPoint(lines, currentStart, chunkEnd);
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
          undefined,
          undefined,
          {
            isSizeBased: true,
            actualSize: chunkContent.length,
            respectsIndentation: true
          }
        ));
      }
      
      const overlapLines = Math.floor(overlap / 50);
      currentStart = Math.max(currentStart + 1, chunkEnd - overlapLines);
    }

    return chunks;
  }

  async extractRelationships(chunks: CodeChunk[]): Promise<ChunkRelationship[]> {
    const relationships: ChunkRelationship[] = [];
    
    const functionChunks = chunks.filter(c => c.chunkType === ChunkType.FUNCTION);
    const classChunks = chunks.filter(c => c.chunkType === ChunkType.CLASS);
    
    // Find method relationships within classes
    for (const classChunk of classChunks) {
      const methods = functionChunks.filter(f => 
        f.startLine > classChunk.startLine && f.endLine < classChunk.endLine
      );
      
      for (const method of methods) {
        relationships.push(this.createRelationship(
          classChunk.id,
          method.id,
          RelationshipType.CONTAINS,
          0.9
        ));
      }
    }
    
    // Find function calls
    for (const chunk of chunks) {
      const calls = this.findPythonFunctionCalls(chunk.content);
      
      for (const call of calls) {
        const targetChunk = functionChunks.find(f => f.symbolName === call);
        if (targetChunk && targetChunk.id !== chunk.id) {
          relationships.push(this.createRelationship(
            chunk.id,
            targetChunk.id,
            RelationshipType.CALLS,
            0.8
          ));
        }
      }
    }

    return relationships;
  }

  // Helper methods

  private findPythonFunctionEnd(lines: string[], startLine: number): number {
    const startIndent = this.getIndentLevel(lines[startLine]);
    
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }
      
      // If we find a line with equal or less indentation, function ends
      if (this.getIndentLevel(lines[i]) <= startIndent) {
        return i;
      }
    }
    
    return lines.length;
  }

  private findPythonClassEnd(lines: string[], startLine: number): number {
    return this.findPythonFunctionEnd(lines, startLine);
  }

  private findPythonBlockEnd(lines: string[], startLine: number): number {
    return this.findPythonFunctionEnd(lines, startLine);
  }

  private findPythonBreakPoint(lines: string[], start: number, end: number): number {
    const baseIndent = this.getIndentLevel(lines[start]);
    
    // Look for break points that respect indentation
    for (let i = end - 1; i > start + Math.floor((end - start) * 0.8); i--) {
      const line = lines[i].trim();
      
      // Empty line
      if (!line) {
        return i + 1;
      }
      
      // Line with same or less indentation as start
      if (this.getIndentLevel(lines[i]) <= baseIndent) {
        return i + 1;
      }
      
      // Comment
      if (line.startsWith('#')) {
        return i + 1;
      }
    }
    
    return end;
  }

  private extractDecorators(decoratorText: string): string[] {
    if (!decoratorText) return [];
    
    const decoratorPattern = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const decorators: string[] = [];
    let match;
    
    while ((match = decoratorPattern.exec(decoratorText)) !== null) {
      decorators.push(match[1]);
    }
    
    return decorators;
  }

  private extractDocstring(content: string): string | undefined {
    // Look for triple-quoted strings at the beginning
    const docstringPattern = /^\s*(?:def|class).*:\s*\n\s*(?:r?)(["']{3})([\s\S]*?)\1/;
    const match = content.match(docstringPattern);
    
    return match ? match[2].trim() : undefined;
  }

  private extractMethods(classContent: string): string[] {
    const methodPattern = /^\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
    const methods: string[] = [];
    let match;
    
    while ((match = methodPattern.exec(classContent)) !== null) {
      methods.push(match[1]);
    }
    
    return methods;
  }

  private findPythonFunctionCalls(content: string): string[] {
    // Python function call pattern
    const callPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    const calls: string[] = [];
    let match;
    
    while ((match = callPattern.exec(content)) !== null) {
      // Skip common keywords and built-ins
      const skipWords = ['if', 'for', 'while', 'def', 'class', 'with', 'try', 'except', 'print', 'len', 'str', 'int', 'float', 'bool'];
      if (!skipWords.includes(match[1])) {
        calls.push(match[1]);
      }
    }
    
    return [...new Set(calls)];
  }

  private getIndentLevel(line: string): number {
    let indent = 0;
    for (const char of line) {
      if (char === ' ') {
        indent++;
      } else if (char === '\t') {
        indent += 4; // Python standard
      } else {
        break;
      }
    }
    return indent;
  }
}