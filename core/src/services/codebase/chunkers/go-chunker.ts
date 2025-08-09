/**
 * Go Chunker
 * 
 * Intelligent chunking for Go files with support for:
 * - Function definitions
 * - Method definitions (receivers)
 * - Struct definitions
 * - Interface definitions
 */

import {
  CodeChunk,
  ChunkType,
  SupportedLanguage,
  SymbolType,
  AST
} from '../../../shared/types/codebase.js';
import { UniversalChunker } from './universal-chunker.js';

export class GoChunker extends UniversalChunker {
  readonly language = SupportedLanguage.GO;

  constructor() {
    super(SupportedLanguage.GO);
  }

  async chunkByFunctions(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    let chunkIndex = 0;

    // Go function pattern (with optional receiver for methods)
    const functionPattern = /^(\s*)func\s+(?:\(([^)]*)\)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)/gm;
    
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      const functionName = match[3];
      const receiver = match[2];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      const lines = content.split('\n');
      const endLine = this.findGenericFunctionEnd(lines, startLine - 1);
      
      if (endLine > startLine) {
        const functionContent = this.extractLines(content, startLine, endLine);
        
        chunks.push(this.createChunk(
          functionContent,
          fileId,
          repositoryId,
          receiver ? ChunkType.METHOD : ChunkType.FUNCTION,
          chunkIndex++,
          startLine,
          endLine,
          match[1].length,
          undefined,
          functionName,
          receiver ? SymbolType.METHOD : SymbolType.FUNCTION,
          undefined,
          {
            receiver: receiver || undefined,
            isMethod: !!receiver,
            complexity: this.calculateComplexity(functionContent)
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
    let chunkIndex = 0;

    // Go struct and interface patterns
    const structPattern = /^(\s*)type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+struct\s*{/gm;
    const interfacePattern = /^(\s*)type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+interface\s*{/gm;
    
    // Process structs
    let match;
    while ((match = structPattern.exec(content)) !== null) {
      const structName = match[2];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      const lines = content.split('\n');
      const endLine = this.findGenericClassEnd(lines, startLine - 1);
      
      if (endLine > startLine) {
        const structContent = this.extractLines(content, startLine, endLine);
        
        chunks.push(this.createChunk(
          structContent,
          fileId,
          repositoryId,
          ChunkType.CLASS, // Go structs are similar to classes
          chunkIndex++,
          startLine,
          endLine,
          match[1].length,
          undefined,
          structName,
          SymbolType.CLASS,
          undefined,
          {
            type: 'struct',
            fields: this.extractGoStructFields(structContent)
          }
        ));
      }
    }

    // Process interfaces
    while ((match = interfacePattern.exec(content)) !== null) {
      const interfaceName = match[2];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      const lines = content.split('\n');
      const endLine = this.findGenericClassEnd(lines, startLine - 1);
      
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
            type: 'interface',
            methods: this.extractGoInterfaceMethods(interfaceContent)
          }
        ));
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  private extractGoStructFields(content: string): string[] {
    const fieldPattern = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+/gm;
    const fields: string[] = [];
    let match;
    
    while ((match = fieldPattern.exec(content)) !== null) {
      if (!['type', 'struct'].includes(match[1])) {
        fields.push(match[1]);
      }
    }
    
    return fields;
  }

  private extractGoInterfaceMethods(content: string): string[] {
    const methodPattern = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm;
    const methods: string[] = [];
    let match;
    
    while ((match = methodPattern.exec(content)) !== null) {
      if (!['type', 'interface'].includes(match[1])) {
        methods.push(match[1]);
      }
    }
    
    return methods;
  }
}