/**
 * TypeScript/JavaScript Chunker
 * 
 * Intelligent chunking for TypeScript and JavaScript files with support for:
 * - Function declarations and expressions
 * - Arrow functions and methods
 * - Classes and interfaces
 * - ES6 modules and imports
 * - JSDoc preservation
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

export class TypeScriptChunker extends BaseChunker {
  readonly language = SupportedLanguage.TYPESCRIPT;

  /**
   * Chunk by function declarations, expressions, and arrow functions
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

    // Function declaration pattern
    const functionPattern = /^(\s*)(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)/gm;
    
    // Arrow function pattern
    const arrowFunctionPattern = /^(\s*)(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\([^)]*\)\s*=>/gm;
    
    // Method pattern (inside classes)
    const methodPattern = /^(\s*)(public|private|protected)?\s*(static\s+)?(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/gm;

    // Process function declarations
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      const functionName = match[4];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      // Find JSDoc comment if present
      let jsDocStart = startLine;
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === '/**' || line.startsWith('/**')) {
          jsDocStart = i + 1;
          break;
        } else if (line && !line.startsWith('*') && !line.startsWith('*/')) {
          break;
        }
      }
      
      // Find end of function by matching braces
      const endLine = this.findFunctionEnd(lines, startLine - 1);
      
      if (endLine > startLine) {
        const functionContent = this.extractLines(content, jsDocStart, endLine);
        
        chunks.push(this.createChunk(
          functionContent,
          fileId,
          repositoryId,
          ChunkType.FUNCTION,
          chunkIndex++,
          jsDocStart,
          endLine,
          match[1].length, // start column (indentation)
          undefined,
          functionName,
          SymbolType.FUNCTION,
          undefined,
          {
            isAsync: match[3] ? true : false,
            isExported: match[2] ? true : false,
            complexity: this.calculateComplexity(functionContent),
            calls: this.findFunctionCalls(functionContent)
          }
        ));
      }
    }

    // Process arrow functions
    while ((match = arrowFunctionPattern.exec(content)) !== null) {
      const functionName = match[4];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      // Find end of arrow function
      const endLine = this.findArrowFunctionEnd(lines, startLine - 1);
      
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
          SymbolType.FUNCTION,
          undefined,
          {
            isAsync: match[5] ? true : false,
            isExported: match[2] ? true : false,
            isArrowFunction: true,
            variableType: match[3],
            complexity: this.calculateComplexity(functionContent),
            calls: this.findFunctionCalls(functionContent)
          }
        ));
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Chunk by class declarations and interfaces
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

    // Class pattern
    const classPattern = /^(\s*)(export\s+)?(abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
    
    // Interface pattern
    const interfacePattern = /^(\s*)(export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
    
    // Type pattern
    const typePattern = /^(\s*)(export\s+)?type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;

    // Process classes
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[4];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      // Find JSDoc comment if present
      let jsDocStart = startLine;
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === '/**' || line.startsWith('/**')) {
          jsDocStart = i + 1;
          break;
        } else if (line && !line.startsWith('*') && !line.startsWith('*/')) {
          break;
        }
      }
      
      const endLine = this.findClassEnd(lines, startLine - 1);
      
      if (endLine > startLine) {
        const classContent = this.extractLines(content, jsDocStart, endLine);
        
        chunks.push(this.createChunk(
          classContent,
          fileId,
          repositoryId,
          ChunkType.CLASS,
          chunkIndex++,
          jsDocStart,
          endLine,
          match[1].length,
          undefined,
          className,
          SymbolType.CLASS,
          undefined,
          {
            isAbstract: match[3] ? true : false,
            isExported: match[2] ? true : false,
            methods: this.extractMethods(classContent),
            complexity: this.calculateComplexity(classContent)
          }
        ));
      }
    }

    // Process interfaces
    while ((match = interfacePattern.exec(content)) !== null) {
      const interfaceName = match[3];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      const endLine = this.findInterfaceEnd(lines, startLine - 1);
      
      if (endLine > startLine) {
        const interfaceContent = this.extractLines(content, startLine, endLine);
        
        chunks.push(this.createChunk(
          interfaceContent,
          fileId,
          repositoryId,
          ChunkType.INTERFACE,
          chunkIndex++,
          startLine,
          endLine,
          match[1].length,
          undefined,
          interfaceName,
          SymbolType.INTERFACE,
          undefined,
          {
            isExported: match[2] ? true : false,
            properties: this.extractInterfaceProperties(interfaceContent)
          }
        ));
      }
    }

    // Process type aliases
    while ((match = typePattern.exec(content)) !== null) {
      const typeName = match[3];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      // Types are usually single-line or few lines
      const endLine = this.findTypeEnd(lines, startLine - 1);
      
      if (endLine >= startLine) {
        const typeContent = this.extractLines(content, startLine, endLine);
        
        chunks.push(this.createChunk(
          typeContent,
          fileId,
          repositoryId,
          ChunkType.TYPE,
          chunkIndex++,
          startLine,
          endLine,
          match[1].length,
          undefined,
          typeName,
          SymbolType.TYPE_ALIAS,
          undefined,
          {
            isExported: match[2] ? true : false
          }
        ));
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Chunk by logical blocks (if/for/while/try blocks)
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

    // Control flow patterns
    const controlFlowPatterns = [
      /^(\s*)(if\s*\([^)]+\))/gm,
      /^(\s*)(for\s*\([^)]*\))/gm,
      /^(\s*)(while\s*\([^)]+\))/gm,
      /^(\s*)(try\s*{)/gm,
      /^(\s*)(switch\s*\([^)]+\))/gm
    ];

    controlFlowPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const startIndex = match.index;
        const startLine = content.substring(0, startIndex).split('\n').length;
        const endLine = this.findBlockEnd(lines, startLine - 1);
        
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
              blockType: match[2].split(/\s|\(/)[0],
              complexity: this.calculateComplexity(blockContent),
              nesting: this.calculateNesting(blockContent)
            }
          ));
        }
      }
    });

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Chunk by size with overlap
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
      let chunkEnd = Math.min(currentStart + maxSize, lines.length);
      
      // Try to find a natural break point (empty line or end of statement)
      if (chunkEnd < lines.length) {
        for (let i = chunkEnd; i > currentStart + maxSize * 0.8; i--) {
          const line = lines[i].trim();
          if (!line || line.endsWith(';') || line.endsWith('}') || line.endsWith('{')) {
            chunkEnd = i + 1;
            break;
          }
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
          undefined,
          undefined,
          {
            isSizeBased: true,
            actualSize: chunkContent.length,
            overlap: Math.min(overlap, chunkEnd - currentStart)
          }
        ));
      }
      
      currentStart = Math.max(currentStart + 1, chunkEnd - overlap);
    }

    return chunks;
  }

  /**
   * Extract relationships between chunks
   */
  async extractRelationships(chunks: CodeChunk[]): Promise<ChunkRelationship[]> {
    const relationships: ChunkRelationship[] = [];
    
    // Create maps for quick lookup
    const functionChunks = chunks.filter(c => c.chunkType === ChunkType.FUNCTION);
    const classChunks = chunks.filter(c => c.chunkType === ChunkType.CLASS);
    
    // Find function calls between chunks
    for (const chunk of chunks) {
      const calls = this.findFunctionCalls(chunk.content);
      
      for (const call of calls) {
        const targetChunk = functionChunks.find(f => f.symbolName === call);
        if (targetChunk && targetChunk.id !== chunk.id) {
          relationships.push(this.createRelationship(
            chunk.id,
            targetChunk.id,
            RelationshipType.CALLS,
            0.8,
            [chunk.startLine.toString()]
          ));
        }
      }
      
      // Find import relationships
      const imports = this.findImports(chunk.content);
      for (const importPath of imports) {
        // This would need more sophisticated logic to map imports to chunks
        // For now, create a placeholder relationship
      }
    }

    return relationships;
  }

  // Helper methods

  private findFunctionEnd(lines: string[], startLine: number): number {
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
    
    return lines.length;
  }

  private findArrowFunctionEnd(lines: string[], startLine: number): number {
    const line = lines[startLine];
    
    // Single line arrow function
    if (line.includes('=>') && !line.trim().endsWith('{')) {
      // Check if it continues with a statement or ends with semicolon
      if (line.trim().endsWith(';')) {
        return startLine + 1;
      }
      
      // Multi-line expression
      for (let i = startLine + 1; i < lines.length; i++) {
        if (lines[i].trim().endsWith(';') || !lines[i].trim()) {
          return i + 1;
        }
      }
    }
    
    // Multi-line arrow function with braces
    return this.findFunctionEnd(lines, startLine);
  }

  private findClassEnd(lines: string[], startLine: number): number {
    return this.findFunctionEnd(lines, startLine);
  }

  private findInterfaceEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpenBrace = false;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('{')) {
        braceCount++;
        foundOpenBrace = true;
      }
      
      if (line.includes('}')) {
        braceCount--;
        if (foundOpenBrace && braceCount === 0) {
          return i + 1;
        }
      }
    }
    
    return lines.length;
  }

  private findTypeEnd(lines: string[], startLine: number): number {
    const startingLine = lines[startLine];
    
    // Single line type
    if (startingLine.includes('=') && startingLine.trim().endsWith(';')) {
      return startLine + 1;
    }
    
    // Multi-line type
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].trim().endsWith(';')) {
        return i + 1;
      }
    }
    
    return startLine + 1;
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    return this.findFunctionEnd(lines, startLine);
  }

  private extractMethods(classContent: string): string[] {
    const methodPattern = /^\s*(public|private|protected)?\s*(static\s+)?(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
    const methods: string[] = [];
    let match;
    
    while ((match = methodPattern.exec(classContent)) !== null) {
      methods.push(match[4]);
    }
    
    return methods;
  }

  private extractInterfaceProperties(interfaceContent: string): string[] {
    const propertyPattern = /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[?:]?\s*:/gm;
    const properties: string[] = [];
    let match;
    
    while ((match = propertyPattern.exec(interfaceContent)) !== null) {
      properties.push(match[1]);
    }
    
    return properties;
  }

  private calculateNesting(content: string): number {
    let maxNesting = 0;
    let currentNesting = 0;
    
    for (const char of content) {
      if (char === '{' || char === '(' || char === '[') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}' || char === ')' || char === ']') {
        currentNesting = Math.max(0, currentNesting - 1);
      }
    }
    
    return maxNesting;
  }
}