/**
 * Java Chunker
 * 
 * Intelligent chunking for Java files with support for:
 * - Method definitions
 * - Class definitions
 * - Interfaces
 * - Annotations and JavaDoc
 */

import {
  CodeChunk,
  ChunkRelationship,
  ChunkType,
  SupportedLanguage,
  SymbolType,
  AST
} from '../../../shared/types/codebase.js';
import { UniversalChunker } from './universal-chunker.js';

export class JavaChunker extends UniversalChunker {
  readonly language = SupportedLanguage.JAVA;

  constructor() {
    super(SupportedLanguage.JAVA);
  }

  async chunkByFunctions(
    content: string,
    ast: AST,
    fileId: string,
    repositoryId: string
  ): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let chunkIndex = 0;

    // Java method pattern with annotations
    const methodPattern = /^(\s*)((?:@[^\n]+\n\s*)*)((public|private|protected)\s+)?(static\s+)?(final\s+)?([a-zA-Z_<>[\]]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)/gm;
    
    let match;
    while ((match = methodPattern.exec(content)) !== null) {
      const methodName = match[7];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      // Include annotations and JavaDoc
      let actualStartLine = startLine;
      for (let i = startLine - 2; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('/**') || line.startsWith('@')) {
          actualStartLine = i + 1;
        } else if (line && !line.startsWith('*') && !line.startsWith('*/')) {
          break;
        }
      }
      
      const endLine = this.findGenericFunctionEnd(lines, startLine - 1);
      
      if (endLine > actualStartLine) {
        const methodContent = this.extractLines(content, actualStartLine, endLine);
        
        chunks.push(this.createChunk(
          methodContent,
          fileId,
          repositoryId,
          ChunkType.METHOD,
          chunkIndex++,
          actualStartLine,
          endLine,
          match[1].length,
          undefined,
          methodName,
          SymbolType.METHOD,
          undefined,
          {
            visibility: match[4] || 'package',
            isStatic: !!match[5],
            isFinal: !!match[6],
            returnType: match[6],
            annotations: this.extractJavaAnnotations(match[2] || ''),
            complexity: this.calculateComplexity(methodContent)
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

    // Java class/interface pattern
    const classPattern = /^(\s*)((?:@[^\n]+\n\s*)*)((public|private|protected)\s+)?(abstract\s+)?(final\s+)?(class|interface|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm;
    
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const className = match[8];
      const classType = match[7];
      const startIndex = match.index;
      const startLine = content.substring(0, startIndex).split('\n').length;
      
      const endLine = this.findGenericClassEnd(lines, startLine - 1);
      
      if (endLine > startLine) {
        const classContent = this.extractLines(content, startLine, endLine);
        
        chunks.push(this.createChunk(
          classContent,
          fileId,
          repositoryId,
          classType === 'interface' ? ChunkType.INTERFACE : ChunkType.CLASS,
          chunkIndex++,
          startLine,
          endLine,
          match[1].length,
          undefined,
          className,
          classType === 'interface' ? SymbolType.INTERFACE : SymbolType.CLASS,
          undefined,
          {
            visibility: match[4] || 'package',
            isAbstract: !!match[5],
            isFinal: !!match[6],
            type: classType,
            annotations: this.extractJavaAnnotations(match[2] || ''),
            complexity: this.calculateComplexity(classContent)
          }
        ));
      }
    }

    return chunks.sort((a, b) => a.startLine - b.startLine);
  }

  private extractJavaAnnotations(annotationText: string): string[] {
    if (!annotationText) return [];
    
    const annotationPattern = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const annotations: string[] = [];
    let match;
    
    while ((match = annotationPattern.exec(annotationText)) !== null) {
      annotations.push(match[1]);
    }
    
    return annotations;
  }
}