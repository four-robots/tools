/**
 * Java Parser
 * 
 * Parser implementation for Java using simple regex-based parsing.
 * This is a simplified implementation that can be extended with more sophisticated parsing.
 */

import {
  SupportedLanguage,
  LanguageParser,
  ParseResult,
  ParseOptions,
  CodeSymbol,
  CodeDependency,
  ComplexityMetrics,
  AST,
  SymbolType,
  Visibility,
  SymbolScope,
  CodeDependencyType,
  ParseError
} from '../../../shared/types/codebase.js';

export class JavaParser implements LanguageParser {
  readonly language = SupportedLanguage.JAVA;
  readonly supportedExtensions = ['.java'];

  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    try {
      const ast = this.parseSimpleJava(content);
      
      const symbols = await this.extractSymbols(ast, '', '');
      const dependencies = await this.extractDependencies(ast, '', '');
      const complexityMetrics = await this.calculateComplexity(ast);

      return {
        fileId: '',
        language: SupportedLanguage.JAVA,
        ast,
        symbols,
        dependencies,
        complexityMetrics,
        parseTime: 0,
        errors: []
      };
    } catch (error) {
      throw new ParseError(
        `Java parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    const content = this.astToContent(ast);
    
    // Extract class definitions
    const classMatches = content.matchAll(/(public|private|protected)?\s*class\s+(\w+)/g);
    for (const match of classMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[2],
        symbolType: SymbolType.CLASS,
        language: SupportedLanguage.JAVA,
        visibility: this.parseVisibility(match[1]),
        scope: SymbolScope.MODULE,
        isExported: match[1] === 'public',
        isAsync: false,
        isGenerator: false,
        isStatic: false,
        parameters: [],
        decorators: [],
        genericParameters: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Extract method definitions
    const methodMatches = content.matchAll(/(public|private|protected)?\s*(static)?\s*(\w+)\s+(\w+)\s*\([^)]*\)/g);
    for (const match of methodMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[4],
        symbolType: SymbolType.METHOD,
        language: SupportedLanguage.JAVA,
        visibility: this.parseVisibility(match[1]),
        scope: SymbolScope.CLASS,
        isExported: match[1] === 'public',
        isAsync: false,
        isGenerator: false,
        isStatic: match[2] === 'static',
        returnType: match[3],
        parameters: [],
        decorators: [],
        genericParameters: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    return symbols;
  }

  async extractDependencies(ast: AST, fileId: string, repositoryId: string): Promise<CodeDependency[]> {
    const dependencies: CodeDependency[] = [];
    const content = this.astToContent(ast);
    
    // Extract import statements
    const importMatches = content.matchAll(/import\s+(static\s+)?([^;]+);/g);
    for (const match of importMatches) {
      dependencies.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        dependencyType: CodeDependencyType.IMPORT,
        dependencyPath: match[2].trim(),
        importedSymbols: [],
        isExternal: !match[2].startsWith('java.'),
        isTypeOnly: false,
        createdAt: new Date()
      });
    }

    return dependencies;
  }

  async calculateComplexity(ast: AST): Promise<ComplexityMetrics> {
    const content = this.astToContent(ast);
    const lines = content.split('\n');
    
    let cyclomaticComplexity = 1;
    let functionCount = 0;
    let classCount = 0;
    
    for (const line of lines) {
      if (/\b(if|else|while|for|switch|case|catch|&&|\|\|)\b/.test(line)) {
        cyclomaticComplexity++;
      }
      if (/\b(public|private|protected)?\s*(static)?\s*\w+\s+\w+\s*\(/.test(line)) {
        functionCount++;
      }
      if (/\b(class|interface|enum)\s+\w+/.test(line)) {
        classCount++;
      }
    }

    return {
      cyclomaticComplexity,
      cognitiveComplexity: cyclomaticComplexity,
      linesOfCode: lines.length,
      maintainabilityIndex: Math.max(0, 100 - cyclomaticComplexity * 2),
      nestingDepth: this.calculateNestingDepth(content),
      functionCount,
      classCount,
      methodCount: functionCount,
      variableCount: 0,
      commentLines: lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*')).length,
      blankLines: lines.filter(line => line.trim() === '').length,
      duplicatedLines: 0
    };
  }

  canParse(content: string): boolean {
    const javaKeywords = /\b(public|private|protected|class|interface|import|package|static|final|abstract|extends|implements)\b/;
    return javaKeywords.test(content);
  }

  private parseSimpleJava(content: string): AST {
    return {
      type: 'CompilationUnit',
      value: content
    };
  }

  private astToContent(ast: AST): string {
    return (ast.value as string) || '';
  }

  private parseVisibility(visibilityStr?: string): Visibility {
    switch (visibilityStr) {
      case 'private': return Visibility.PRIVATE;
      case 'protected': return Visibility.PROTECTED;
      case 'public': return Visibility.PUBLIC;
      default: return Visibility.PUBLIC;
    }
  }

  private calculateNestingDepth(content: string): number {
    let depth = 0;
    let maxDepth = 0;
    
    for (const char of content) {
      if (char === '{') {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else if (char === '}') {
        depth--;
      }
    }
    
    return maxDepth;
  }
}