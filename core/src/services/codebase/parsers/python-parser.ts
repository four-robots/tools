/**
 * Python Parser
 * 
 * Parser implementation for Python using Tree-sitter for AST analysis.
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

export class PythonParser implements LanguageParser {
  readonly language = SupportedLanguage.PYTHON;
  readonly supportedExtensions = ['.py', '.pyx', '.pyi', '.pyw'];

  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    try {
      // Simplified Python parsing - in a full implementation, this would use tree-sitter-python
      const ast = this.parseSimplePython(content);
      
      const symbols = await this.extractSymbols(ast, '', '');
      const dependencies = await this.extractDependencies(ast, '', '');
      const complexityMetrics = await this.calculateComplexity(ast);

      return {
        fileId: '',
        language: SupportedLanguage.PYTHON,
        ast,
        symbols,
        dependencies,
        complexityMetrics,
        parseTime: 0,
        errors: []
      };
    } catch (error) {
      throw new ParseError(
        `Python parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    
    // Simple regex-based symbol extraction for demonstration
    const content = this.astToContent(ast);
    
    // Extract function definitions
    const functionMatches = content.matchAll(/def\s+(\w+)\s*\([^)]*\):/g);
    for (const match of functionMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.FUNCTION,
        language: SupportedLanguage.PYTHON,
        visibility: match[1].startsWith('_') ? Visibility.PRIVATE : Visibility.PUBLIC,
        scope: SymbolScope.MODULE,
        isExported: !match[1].startsWith('_'),
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

    // Extract class definitions
    const classMatches = content.matchAll(/class\s+(\w+).*?:/g);
    for (const match of classMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.CLASS,
        language: SupportedLanguage.PYTHON,
        visibility: Visibility.PUBLIC,
        scope: SymbolScope.MODULE,
        isExported: true,
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
    
    // Extract import statements
    const importMatches = content.matchAll(/import\s+([^\s\n]+)/g);
    for (const match of importMatches) {
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

    // Extract from imports
    const fromImportMatches = content.matchAll(/from\s+([^\s]+)\s+import\s+([^\n]+)/g);
    for (const match of fromImportMatches) {
      const symbols = match[2].split(',').map(s => s.trim());
      dependencies.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        dependencyType: CodeDependencyType.FROM,
        dependencyPath: match[1],
        importedSymbols: symbols,
        isExternal: !match[1].startsWith('.'),
        isTypeOnly: false,
        createdAt: new Date()
      });
    }

    return dependencies;
  }

  async calculateComplexity(ast: AST): Promise<ComplexityMetrics> {
    const content = this.astToContent(ast);
    const lines = content.split('\n');
    
    // Simple complexity calculation
    let cyclomaticComplexity = 1;
    let functionCount = 0;
    let classCount = 0;
    
    for (const line of lines) {
      if (/\b(if|elif|while|for|except|and|or|lambda)\b/.test(line)) {
        cyclomaticComplexity++;
      }
      if (/def\s+\w+/.test(line)) {
        functionCount++;
      }
      if (/class\s+\w+/.test(line)) {
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
      methodCount: 0,
      variableCount: 0,
      commentLines: lines.filter(line => line.trim().startsWith('#')).length,
      blankLines: lines.filter(line => line.trim() === '').length,
      duplicatedLines: 0
    };
  }

  canParse(content: string): boolean {
    // Simple validation - check for Python keywords
    const pythonKeywords = /\b(def|class|import|from|if|else|elif|while|for|try|except|finally|with|yield|return|pass|break|continue)\b/;
    return pythonKeywords.test(content);
  }

  private parseSimplePython(content: string): AST {
    return {
      type: 'Module',
      value: content
    };
  }

  private astToContent(ast: AST): string {
    return (ast.value as string) || '';
  }

  private calculateNestingDepth(content: string): number {
    const lines = content.split('\n');
    let maxDepth = 0;
    let currentDepth = 0;
    
    for (const line of lines) {
      const indentation = line.match(/^\s*/)?.[0]?.length || 0;
      const depth = Math.floor(indentation / 4); // Assuming 4-space indentation
      currentDepth = depth;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    
    return maxDepth;
  }
}