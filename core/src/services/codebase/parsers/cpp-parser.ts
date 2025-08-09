/**
 * C/C++ Parser
 * 
 * Parser implementation for C and C++ using simple regex-based parsing.
 * This is a simplified implementation that can be extended with tree-sitter-cpp.
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

export class CppParser implements LanguageParser {
  readonly language = SupportedLanguage.CPP;
  readonly supportedExtensions = ['.cpp', '.cxx', '.cc', '.C', '.c++', '.hpp', '.hxx', '.hh', '.H', '.h++', '.c', '.h'];

  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    try {
      const language = this.detectCOrCpp(content);
      const ast = this.parseSimpleCpp(content);
      
      const symbols = await this.extractSymbols(ast, '', '');
      const dependencies = await this.extractDependencies(ast, '', '');
      const complexityMetrics = await this.calculateComplexity(ast);

      return {
        fileId: '',
        language,
        ast,
        symbols,
        dependencies,
        complexityMetrics,
        parseTime: 0,
        errors: []
      };
    } catch (error) {
      throw new ParseError(
        `C/C++ parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    const content = this.astToContent(ast);
    
    // Extract function definitions
    const funcMatches = content.matchAll(/(\w+)\s+(\w+)\s*\([^)]*\)\s*[{;]/g);
    for (const match of funcMatches) {
      // Skip common non-function patterns
      if (this.isKeyword(match[1]) || this.isKeyword(match[2])) continue;
      
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[2],
        symbolType: SymbolType.FUNCTION,
        language: this.language,
        visibility: Visibility.PUBLIC,
        scope: SymbolScope.MODULE,
        returnType: match[1],
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

    // Extract class definitions (C++ only)
    const classMatches = content.matchAll(/class\s+(\w+)/g);
    for (const match of classMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.CLASS,
        language: SupportedLanguage.CPP,
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

    // Extract struct definitions
    const structMatches = content.matchAll(/struct\s+(\w+)/g);
    for (const match of structMatches) {
      symbols.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        name: match[1],
        symbolType: SymbolType.CLASS,
        language: this.language,
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
    
    // Extract #include statements
    const includeMatches = content.matchAll(/#include\s*[<"]([^>"]+)[>"]/g);
    for (const match of includeMatches) {
      const isSystemHeader = content.includes(`<${match[1]}>`);
      
      dependencies.push({
        id: crypto.randomUUID(),
        fileId,
        repositoryId,
        dependencyType: CodeDependencyType.INCLUDE,
        dependencyPath: match[1],
        importedSymbols: [],
        isExternal: isSystemHeader,
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
      if (/\w+\s+\w+\s*\([^)]*\)\s*[{;]/.test(line) && !this.isDeclarationOnly(line)) {
        functionCount++;
      }
      if (/\b(class|struct)\s+\w+/.test(line)) {
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
    const cppKeywords = /\b(#include|class|struct|public|private|protected|namespace|using|template|const|static|virtual|inline|extern)\b/;
    const cKeywords = /\b(#include|struct|typedef|static|extern|const|int|char|float|double|void|if|else|while|for|switch|case|return)\b/;
    
    return cppKeywords.test(content) || cKeywords.test(content);
  }

  private parseSimpleCpp(content: string): AST {
    return {
      type: 'TranslationUnit',
      value: content
    };
  }

  private astToContent(ast: AST): string {
    return (ast.value as string) || '';
  }

  private detectCOrCpp(content: string): SupportedLanguage {
    // Check for C++ specific features
    const cppFeatures = /\b(class|namespace|template|using\s+namespace|public:|private:|protected:|new\s+|delete\s+|std::)\b/;
    
    if (cppFeatures.test(content)) {
      return SupportedLanguage.CPP;
    }
    
    return SupportedLanguage.C;
  }

  private isKeyword(word: string): boolean {
    const keywords = [
      'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
      'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
      'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
      'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
      'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex', '_Imaginary',
      // C++ keywords
      'alignas', 'alignof', 'and', 'and_eq', 'asm', 'bitand', 'bitor',
      'bool', 'catch', 'class', 'compl', 'constexpr', 'const_cast',
      'decltype', 'delete', 'dynamic_cast', 'explicit', 'export', 'false',
      'friend', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
      'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public',
      'reinterpret_cast', 'static_assert', 'static_cast', 'template', 'this',
      'thread_local', 'throw', 'true', 'try', 'typeid', 'typename', 'using',
      'virtual', 'wchar_t', 'xor', 'xor_eq'
    ];
    
    return keywords.includes(word.toLowerCase());
  }

  private isDeclarationOnly(line: string): boolean {
    // Simple heuristic to distinguish declarations from definitions
    return line.trim().endsWith(';') && !line.includes('{');
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