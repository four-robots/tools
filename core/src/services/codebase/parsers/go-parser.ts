/**
 * Go Parser
 * 
 * Parser implementation for Go using simple regex-based parsing.
 * This is a simplified implementation that can be extended with tree-sitter-go.
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

export class GoParser implements LanguageParser {
  readonly language = SupportedLanguage.GO;
  readonly supportedExtensions = ['.go'];

  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    try {
      const ast = this.parseSimpleGo(content);
      
      const symbols = await this.extractSymbols(ast, '', '');
      const dependencies = await this.extractDependencies(ast, '', '');
      const complexityMetrics = await this.calculateComplexity(ast);

      return {
        fileId: '',
        language: SupportedLanguage.GO,
        ast,
        symbols,
        dependencies,
        complexityMetrics,
        parseTime: 0,
        errors: []
      };
    } catch (error) {
      throw new ParseError(
        `Go parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    const content = this.astToContent(ast);
    
    // Extract function definitions
    const funcMatches = content.matchAll(/func\s+(\w+)\s*\([^)]*\)/g);
    for (const match of funcMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.FUNCTION,
        language: SupportedLanguage.GO,
        visibility: this.isExported(match[1]) ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: this.isExported(match[1]),
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

    // Extract struct definitions
    const structMatches = content.matchAll(/type\s+(\w+)\s+struct/g);
    for (const match of structMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.CLASS, // Structs are similar to classes
        language: SupportedLanguage.GO,
        visibility: this.isExported(match[1]) ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: this.isExported(match[1]),
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

    // Extract interface definitions
    const interfaceMatches = content.matchAll(/type\s+(\w+)\s+interface/g);
    for (const match of interfaceMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.INTERFACE,
        language: SupportedLanguage.GO,
        visibility: this.isExported(match[1]) ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: this.isExported(match[1]),
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

    return symbols;
  }

  async extractDependencies(ast: AST, fileId: string, repositoryId: string): Promise<CodeDependency[]> {
    const dependencies: CodeDependency[] = [];
    const content = this.astToContent(ast);
    
    // Extract single import
    const singleImportMatches = content.matchAll(/import\s+"([^"]+)"/g);
    for (const match of singleImportMatches) {
      dependencies.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        dependencyType: CodeDependencyType.IMPORT,
        dependencyPath: match[1],
        importedSymbols: [],
        isExternal: !match[1].startsWith('.'),
        isTypeOnly: false,
        createdAt: new Date()
      });
    }

    // Extract multi-line imports
    const multiImportMatch = content.match(/import\s*\(([\s\S]*?)\)/);
    if (multiImportMatch) {
      const imports = multiImportMatch[1].match(/"([^"]+)"/g);
      if (imports) {
        for (const imp of imports) {
          const path = imp.replace(/"/g, '');
          dependencies.push({
            id: crypto.randomUUID(),
            fileId,
            repositoryId,
            dependencyType: CodeDependencyType.IMPORT,
            dependencyPath: path,
            importedSymbols: [],
            isExternal: !path.startsWith('.'),
            isTypeOnly: false,
            createdAt: new Date()
          });
        }
      }
    }

    return dependencies;
  }

  async calculateComplexity(ast: AST): Promise<ComplexityMetrics> {
    const content = this.astToContent(ast);
    const lines = content.split('\n');
    
    let cyclomaticComplexity = 1;
    let functionCount = 0;
    let classCount = 0; // structs + interfaces
    
    for (const line of lines) {
      if (/\b(if|else|for|switch|case|&&|\|\|)\b/.test(line)) {
        cyclomaticComplexity++;
      }
      if (/func\s+\w+/.test(line)) {
        functionCount++;
      }
      if (/type\s+\w+\s+(struct|interface)/.test(line)) {
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
      commentLines: lines.filter(line => line.trim().startsWith('//')).length,
      blankLines: lines.filter(line => line.trim() === '').length,
      duplicatedLines: 0
    };
  }

  canParse(content: string): boolean {
    const goKeywords = /\b(package|import|func|type|struct|interface|var|const|if|else|for|switch|case|return|go|defer|chan|map|make)\b/;
    return goKeywords.test(content);
  }

  private parseSimpleGo(content: string): AST {
    return {
      type: 'SourceFile',
      value: content
    };
  }

  private astToContent(ast: AST): string {
    return (ast.value as string) || '';
  }

  private isExported(name: string): boolean {
    // In Go, exported names start with capital letters
    return /^[A-Z]/.test(name);
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