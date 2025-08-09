/**
 * Rust Parser
 * 
 * Parser implementation for Rust using simple regex-based parsing.
 * This is a simplified implementation that can be extended with tree-sitter-rust.
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

export class RustParser implements LanguageParser {
  readonly language = SupportedLanguage.RUST;
  readonly supportedExtensions = ['.rs'];

  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    try {
      const ast = this.parseSimpleRust(content);
      
      const symbols = await this.extractSymbols(ast, '', '');
      const dependencies = await this.extractDependencies(ast, '', '');
      const complexityMetrics = await this.calculateComplexity(ast);

      return {
        fileId: '',
        language: SupportedLanguage.RUST,
        ast,
        symbols,
        dependencies,
        complexityMetrics,
        parseTime: 0,
        errors: []
      };
    } catch (error) {
      throw new ParseError(
        `Rust parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    const content = this.astToContent(ast);
    
    // Extract function definitions
    const funcMatches = content.matchAll(/(pub\s+)?fn\s+(\w+)\s*\([^)]*\)/g);
    for (const match of funcMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[2],
        symbolType: SymbolType.FUNCTION,
        language: SupportedLanguage.RUST,
        visibility: match[1] ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: Boolean(match[1]),
        isAsync: content.includes(`async fn ${match[2]}`),
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
    const structMatches = content.matchAll(/(pub\s+)?struct\s+(\w+)/g);
    for (const match of structMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[2],
        symbolType: SymbolType.CLASS,
        language: SupportedLanguage.RUST,
        visibility: match[1] ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: Boolean(match[1]),
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

    // Extract enum definitions
    const enumMatches = content.matchAll(/(pub\s+)?enum\s+(\w+)/g);
    for (const match of enumMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[2],
        symbolType: SymbolType.ENUM,
        language: SupportedLanguage.RUST,
        visibility: match[1] ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: Boolean(match[1]),
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

    // Extract trait definitions
    const traitMatches = content.matchAll(/(pub\s+)?trait\s+(\w+)/g);
    for (const match of traitMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[2],
        symbolType: SymbolType.INTERFACE,
        language: SupportedLanguage.RUST,
        visibility: match[1] ? Visibility.PUBLIC : Visibility.PRIVATE,
        scope: SymbolScope.MODULE,
        isExported: Boolean(match[1]),
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

    // Extract impl blocks (methods)
    const implMatches = content.matchAll(/impl(?:\s+<[^>]+>)?\s+(\w+)(?:\s+for\s+(\w+))?\s*{([^}]+)}/g);
    for (const match of implMatches) {
      const implBody = match[3];
      const methodMatches = implBody.matchAll(/(pub\s+)?fn\s+(\w+)\s*\([^)]*\)/g);
      
      for (const methodMatch of methodMatches) {
        symbols.push({
          id: crypto.randomUUID(),
          fileId,
          repositoryId,
          name: methodMatch[2],
          symbolType: SymbolType.METHOD,
          language: SupportedLanguage.RUST,
          visibility: methodMatch[1] ? Visibility.PUBLIC : Visibility.PRIVATE,
          scope: SymbolScope.CLASS,
          isExported: Boolean(methodMatch[1]),
          isAsync: implBody.includes(`async fn ${methodMatch[2]}`),
          isGenerator: false,
          isStatic: !implBody.includes(`&self`) && !implBody.includes(`&mut self`),
          parameters: [],
          decorators: [],
          genericParameters: [],
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    return symbols;
  }

  async extractDependencies(ast: AST, fileId: string, repositoryId: string): Promise<CodeDependency[]> {
    const dependencies: CodeDependency[] = [];
    const content = this.astToContent(ast);
    
    // Extract use statements
    const useMatches = content.matchAll(/use\s+([^;]+);/g);
    for (const match of useMatches) {
      const usePath = match[1].trim();
      
      // Parse use statement to extract imported symbols
      const importedSymbols: string[] = [];
      if (usePath.includes('{') && usePath.includes('}')) {
        const symbolsMatch = usePath.match(/\{([^}]+)\}/);
        if (symbolsMatch) {
          importedSymbols.push(...symbolsMatch[1].split(',').map(s => s.trim()));
        }
      } else if (usePath.includes('::')) {
        const parts = usePath.split('::');
        importedSymbols.push(parts[parts.length - 1]);
      }
      
      // Extract base path (without imported symbols)
      const basePath = usePath.replace(/\{[^}]+\}/, '').replace(/::$/, '');
      
      dependencies.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        dependencyType: CodeDependencyType.USING,
        dependencyPath: basePath,
        importedSymbols,
        isExternal: this.isExternalCrate(basePath),
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
    let classCount = 0; // structs + enums + traits
    
    for (const line of lines) {
      if (/\b(if|else|while|for|loop|match|&&|\|\||\.and_then|\.or_else)\b/.test(line)) {
        cyclomaticComplexity++;
      }
      if (/fn\s+\w+/.test(line)) {
        functionCount++;
      }
      if (/\b(struct|enum|trait)\s+\w+/.test(line)) {
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
    const rustKeywords = /\b(fn|struct|enum|trait|impl|use|mod|pub|let|mut|match|if|else|while|for|loop|return|async|await)\b/;
    const rustSyntax = /\b(println!|vec!|format!|panic!)\b|->|::|&mut|&self/;
    
    return rustKeywords.test(content) || rustSyntax.test(content);
  }

  private parseSimpleRust(content: string): AST {
    return {
      type: 'SourceFile',
      value: content
    };
  }

  private astToContent(ast: AST): string {
    return (ast.value as string) || '';
  }

  private isExternalCrate(path: string): boolean {
    // Standard library and common external crates
    const stdLibPrefixes = ['std::', 'core::', 'alloc::'];
    const isStdLib = stdLibPrefixes.some(prefix => path.startsWith(prefix));
    
    // If it doesn't start with crate:: or super:: or self::, it's likely external
    const isInternal = path.startsWith('crate::') || path.startsWith('super::') || path.startsWith('self::');
    
    return !isInternal || isStdLib;
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