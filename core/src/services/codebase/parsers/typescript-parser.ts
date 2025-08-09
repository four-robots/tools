/**
 * TypeScript/JavaScript Parser
 * 
 * Parser implementation for TypeScript and JavaScript using @typescript-eslint/parser
 * and @babel/parser for comprehensive AST analysis and symbol extraction.
 */

import { parse } from '@babel/parser';
import { parse as tsParser } from '@typescript-eslint/parser';
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
import { performance } from 'perf_hooks';

export class TypeScriptParser implements LanguageParser {
  readonly language = SupportedLanguage.TYPESCRIPT;
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];

  /**
   * Parse TypeScript/JavaScript source code
   */
  async parse(content: string, options?: ParseOptions): Promise<ParseResult> {
    const startTime = performance.now();
    const opts = { ...options };
    
    try {
      // Determine if this is TypeScript or JavaScript based on content
      const isTypeScript = this.isTypeScriptContent(content);
      const language = isTypeScript ? SupportedLanguage.TYPESCRIPT : SupportedLanguage.JAVASCRIPT;

      // Parse with appropriate parser
      let ast: AST;
      if (isTypeScript) {
        ast = this.parseTypeScript(content, opts);
      } else {
        ast = this.parseJavaScript(content, opts);
      }

      // Extract symbols and dependencies
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
        parseTime: performance.now() - startTime,
        errors: []
      };
    } catch (error) {
      throw new ParseError(
        `TypeScript/JavaScript parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { severity: 'error' }
      );
    }
  }

  /**
   * Extract symbols from AST
   */
  async extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]> {
    const symbols: CodeSymbol[] = [];
    
    this.walkAST(ast, (node, parent) => {
      const symbol = this.extractSymbolFromNode(node, parent, fileId, repositoryId);
      if (symbol) {
        symbols.push(symbol);
      }
    });

    return symbols;
  }

  /**
   * Extract dependencies from AST
   */
  async extractDependencies(ast: AST, fileId: string, repositoryId: string): Promise<CodeDependency[]> {
    const dependencies: CodeDependency[] = [];
    
    this.walkAST(ast, (node) => {
      const dependency = this.extractDependencyFromNode(node, fileId, repositoryId);
      if (dependency) {
        dependencies.push(dependency);
      }
    });

    return dependencies;
  }

  /**
   * Calculate complexity metrics
   */
  async calculateComplexity(ast: AST): Promise<ComplexityMetrics> {
    let cyclomaticComplexity = 1; // Start with 1 for the main execution path
    let cognitiveComplexity = 0;
    let nestingDepth = 0;
    let maxNesting = 0;
    let functionCount = 0;
    let classCount = 0;
    let methodCount = 0;
    let variableCount = 0;

    this.walkASTWithDepth(ast, (node, depth) => {
      nestingDepth = Math.max(nestingDepth, depth);
      
      switch (node.type) {
        // Decision points that increase cyclomatic complexity
        case 'IfStatement':
        case 'ConditionalExpression':
        case 'WhileStatement':
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement':
        case 'DoWhileStatement':
        case 'SwitchCase':
          cyclomaticComplexity++;
          cognitiveComplexity += depth; // Nested conditions are harder to understand
          break;

        case 'CatchClause':
        case 'LogicalExpression':
          cyclomaticComplexity++;
          break;

        // Symbol counts
        case 'FunctionDeclaration':
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
          functionCount++;
          break;

        case 'ClassDeclaration':
        case 'ClassExpression':
          classCount++;
          break;

        case 'MethodDefinition':
          methodCount++;
          break;

        case 'VariableDeclaration':
          if (node.declarations) {
            variableCount += (node.declarations as any[]).length;
          }
          break;
      }
    });

    // Calculate maintainability index (simplified version)
    const linesOfCode = this.countLines(ast);
    const commentLines = this.countCommentLines(ast);
    const maintainabilityIndex = Math.max(0, 
      171 - 5.2 * Math.log(linesOfCode) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(linesOfCode - commentLines)
    );

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      linesOfCode,
      maintainabilityIndex,
      nestingDepth: maxNesting,
      functionCount,
      classCount,
      methodCount,
      variableCount,
      commentLines,
      blankLines: 0, // Would need source analysis
      duplicatedLines: 0 // Would need additional analysis
    };
  }

  /**
   * Validate if content can be parsed
   */
  canParse(content: string): boolean {
    try {
      if (this.isTypeScriptContent(content)) {
        this.parseTypeScript(content, {});
      } else {
        this.parseJavaScript(content, {});
      }
      return true;
    } catch {
      return false;
    }
  }

  // ===================
  // PRIVATE PARSING METHODS
  // ===================

  private parseTypeScript(content: string, options: ParseOptions): AST {
    return tsParser(content, {
      ecmaVersion: options.ecmaVersion === 'latest' ? 2022 : options.ecmaVersion,
      sourceType: options.sourceType || 'module',
      ecmaFeatures: {
        jsx: options.parseJSX || false,
        globalReturn: options.sourceType === 'script'
      },
      loc: options.includeLocations,
      range: options.includeRange,
      tokens: false,
      comments: options.includeComments || false
    }) as AST;
  }

  private parseJavaScript(content: string, options: ParseOptions): AST {
    const babelPlugins = [
      'jsx',
      'objectRestSpread',
      'functionBind',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'decorators-legacy',
      'classProperties',
      'asyncGenerators',
      'functionSent',
      'dynamicImport',
      ...(options.plugins || [])
    ];

    return parse(content, {
      sourceType: options.sourceType || 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: options.sourceType === 'script',
      plugins: babelPlugins,
      ranges: options.includeRange || false,
      tokens: false,
      attachComments: options.includeComments || false
    }) as AST;
  }

  private isTypeScriptContent(content: string): boolean {
    // Look for TypeScript-specific patterns
    const tsPatterns = [
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /:\s*\w+(\[\]|\<.*\>)?/,
      /enum\s+\w+/,
      /namespace\s+\w+/,
      /declare\s+/,
      /as\s+\w+/,
      /<.*>/,
      /implements\s+/,
      /readonly\s+/
    ];

    return tsPatterns.some(pattern => pattern.test(content));
  }

  // ===================
  // SYMBOL EXTRACTION
  // ===================

  private extractSymbolFromNode(node: AST, parent: AST | null, fileId: string, repositoryId: string): CodeSymbol | null {
    let symbol: Partial<CodeSymbol> = {
      id: this.generateUUID(),
      fileId,
      repositoryId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isExported: this.isExported(node, parent),
      isAsync: this.isAsync(node),
      isGenerator: this.isGenerator(node),
      isStatic: this.isStatic(node)
    };

    switch (node.type) {
      case 'FunctionDeclaration':
        symbol = {
          ...symbol,
          name: (node as any).id?.name || '<anonymous>',
          symbolType: SymbolType.FUNCTION,
          visibility: Visibility.PUBLIC,
          scope: SymbolScope.MODULE,
          parameters: this.extractParameters(node),
          returnType: this.extractReturnType(node),
          definitionLine: node.loc?.start?.line,
          definitionColumn: node.loc?.start?.column,
          endLine: node.loc?.end?.line,
          endColumn: node.loc?.end?.column
        };
        break;

      case 'ClassDeclaration':
        symbol = {
          ...symbol,
          name: (node as any).id?.name || '<anonymous>',
          symbolType: SymbolType.CLASS,
          visibility: Visibility.PUBLIC,
          scope: SymbolScope.MODULE,
          definitionLine: node.loc?.start?.line,
          definitionColumn: node.loc?.start?.column,
          endLine: node.loc?.end?.line,
          endColumn: node.loc?.end?.column
        };
        break;

      case 'MethodDefinition':
        const methodKind = (node as any).kind;
        symbol = {
          ...symbol,
          name: this.getPropertyName((node as any).key),
          symbolType: methodKind === 'constructor' ? SymbolType.CONSTRUCTOR :
                     methodKind === 'get' ? SymbolType.GETTER :
                     methodKind === 'set' ? SymbolType.SETTER :
                     SymbolType.METHOD,
          visibility: this.getMethodVisibility(node),
          scope: SymbolScope.CLASS,
          parameters: this.extractParameters(node),
          definitionLine: node.loc?.start?.line,
          definitionColumn: node.loc?.start?.column
        };
        break;

      case 'VariableDeclarator':
        if ((node as any).id?.name) {
          symbol = {
            ...symbol,
            name: (node as any).id.name,
            symbolType: this.isConstant(parent) ? SymbolType.CONSTANT : SymbolType.VARIABLE,
            visibility: Visibility.PUBLIC,
            scope: this.getVariableScope(parent),
            definitionLine: node.loc?.start?.line,
            definitionColumn: node.loc?.start?.column
          };
        } else {
          return null;
        }
        break;

      case 'TSInterfaceDeclaration':
        symbol = {
          ...symbol,
          name: (node as any).id?.name || '<anonymous>',
          symbolType: SymbolType.INTERFACE,
          visibility: Visibility.PUBLIC,
          scope: SymbolScope.MODULE,
          genericParameters: this.extractGenericParameters(node),
          definitionLine: node.loc?.start?.line,
          definitionColumn: node.loc?.start?.column
        };
        break;

      case 'TSTypeAliasDeclaration':
        symbol = {
          ...symbol,
          name: (node as any).id?.name || '<anonymous>',
          symbolType: SymbolType.TYPE_ALIAS,
          visibility: Visibility.PUBLIC,
          scope: SymbolScope.MODULE,
          definitionLine: node.loc?.start?.line,
          definitionColumn: node.loc?.start?.column
        };
        break;

      case 'TSEnumDeclaration':
        symbol = {
          ...symbol,
          name: (node as any).id?.name || '<anonymous>',
          symbolType: SymbolType.ENUM,
          visibility: Visibility.PUBLIC,
          scope: SymbolScope.MODULE,
          definitionLine: node.loc?.start?.line,
          definitionColumn: node.loc?.start?.column
        };
        break;

      default:
        return null;
    }

    return symbol as CodeSymbol;
  }

  // ===================
  // DEPENDENCY EXTRACTION
  // ===================

  private extractDependencyFromNode(node: AST, fileId: string, repositoryId: string): CodeDependency | null {
    let dependency: Partial<CodeDependency> = {
      id: this.generateUUID(),
      fileId,
      repositoryId,
      createdAt: new Date(),
      lineNumber: node.loc?.start?.line,
      columnNumber: node.loc?.start?.column
    };

    switch (node.type) {
      case 'ImportDeclaration':
        const importPath = (node as any).source?.value;
        if (importPath) {
          dependency = {
            ...dependency,
            dependencyType: CodeDependencyType.IMPORT,
            dependencyPath: importPath,
            importedSymbols: this.extractImportedSymbols(node),
            isExternal: this.isExternalDependency(importPath),
            isTypeOnly: (node as any).importKind === 'type'
          };
        } else {
          return null;
        }
        break;

      case 'CallExpression':
        if ((node as any).callee?.name === 'require') {
          const requirePath = (node as any).arguments?.[0]?.value;
          if (requirePath) {
            dependency = {
              ...dependency,
              dependencyType: CodeDependencyType.REQUIRE,
              dependencyPath: requirePath,
              isExternal: this.isExternalDependency(requirePath)
            };
          } else {
            return null;
          }
        } else {
          return null;
        }
        break;

      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
        const exportSource = (node as any).source?.value;
        if (exportSource) {
          dependency = {
            ...dependency,
            dependencyType: CodeDependencyType.FROM,
            dependencyPath: exportSource,
            isExternal: this.isExternalDependency(exportSource)
          };
        } else {
          return null;
        }
        break;

      default:
        return null;
    }

    return dependency as CodeDependency;
  }

  // ===================
  // HELPER METHODS
  // ===================

  private walkAST(node: AST, callback: (node: AST, parent: AST | null) => void, parent: AST | null = null): void {
    callback(node, parent);
    
    if (node.children) {
      for (const child of node.children) {
        this.walkAST(child, callback, node);
      }
    }

    // Handle common AST node properties
    const nodeObj = node as any;
    if (nodeObj.body) {
      if (Array.isArray(nodeObj.body)) {
        nodeObj.body.forEach((child: AST) => this.walkAST(child, callback, node));
      } else {
        this.walkAST(nodeObj.body, callback, node);
      }
    }

    if (nodeObj.declarations) {
      nodeObj.declarations.forEach((child: AST) => this.walkAST(child, callback, node));
    }

    if (nodeObj.properties) {
      nodeObj.properties.forEach((child: AST) => this.walkAST(child, callback, node));
    }
  }

  private walkASTWithDepth(node: AST, callback: (node: AST, depth: number) => void, depth: number = 0): void {
    callback(node, depth);
    
    if (node.children) {
      for (const child of node.children) {
        this.walkASTWithDepth(child, callback, depth + 1);
      }
    }

    // Handle nested structures
    const nodeObj = node as any;
    if (nodeObj.body) {
      if (Array.isArray(nodeObj.body)) {
        nodeObj.body.forEach((child: AST) => this.walkASTWithDepth(child, callback, depth + 1));
      } else {
        this.walkASTWithDepth(nodeObj.body, callback, depth + 1);
      }
    }
  }

  private extractParameters(node: AST): any[] {
    const params = (node as any).params || (node as any).value?.params;
    if (!params) return [];

    return params.map((param: any) => ({
      name: param.name || this.getPatternName(param),
      type: this.extractTypeAnnotation(param),
      isOptional: param.optional || false,
      isRestParameter: param.type === 'RestElement',
      defaultValue: param.default ? this.extractDefaultValue(param.default) : undefined
    }));
  }

  private extractImportedSymbols(node: AST): string[] {
    const specifiers = (node as any).specifiers;
    if (!specifiers) return [];

    return specifiers.map((spec: any) => {
      if (spec.type === 'ImportDefaultSpecifier') return 'default';
      if (spec.type === 'ImportNamespaceSpecifier') return '*';
      return spec.imported?.name || spec.local?.name || '';
    }).filter(Boolean);
  }

  private isExported(node: AST, parent: AST | null): boolean {
    if (!parent) return false;
    return parent.type === 'ExportNamedDeclaration' || 
           parent.type === 'ExportDefaultDeclaration';
  }

  private isAsync(node: AST): boolean {
    return (node as any).async === true;
  }

  private isGenerator(node: AST): boolean {
    return (node as any).generator === true;
  }

  private isStatic(node: AST): boolean {
    return (node as any).static === true;
  }

  private isConstant(node: AST | null): boolean {
    return node?.type === 'VariableDeclaration' && (node as any).kind === 'const';
  }

  private isExternalDependency(path: string): boolean {
    return !path.startsWith('.') && !path.startsWith('/');
  }

  private getMethodVisibility(node: AST): Visibility {
    // In JavaScript/TypeScript, determine visibility from naming conventions
    const methodName = this.getPropertyName((node as any).key);
    if (methodName.startsWith('_')) {
      return Visibility.PRIVATE;
    }
    return Visibility.PUBLIC;
  }

  private getVariableScope(parent: AST | null): SymbolScope {
    if (!parent) return SymbolScope.GLOBAL;
    
    switch (parent.type) {
      case 'Program': return SymbolScope.MODULE;
      case 'ClassBody': return SymbolScope.CLASS;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': return SymbolScope.FUNCTION;
      default: return SymbolScope.BLOCK;
    }
  }

  private getPropertyName(key: any): string {
    if (key.name) return key.name;
    if (key.value) return key.value;
    if (key.raw) return key.raw;
    return '<computed>';
  }

  private getPatternName(pattern: any): string {
    if (pattern.name) return pattern.name;
    if (pattern.type === 'ObjectPattern') return '<destructured>';
    if (pattern.type === 'ArrayPattern') return '<destructured>';
    return '<unknown>';
  }

  private extractTypeAnnotation(param: any): string | undefined {
    if (param.typeAnnotation?.typeAnnotation?.type) {
      return this.typeAnnotationToString(param.typeAnnotation.typeAnnotation);
    }
    return undefined;
  }

  private extractReturnType(node: AST): string | undefined {
    const returnType = (node as any).returnType?.typeAnnotation;
    if (returnType) {
      return this.typeAnnotationToString(returnType);
    }
    return undefined;
  }

  private extractGenericParameters(node: AST): any[] {
    const typeParams = (node as any).typeParameters?.params;
    if (!typeParams) return [];

    return typeParams.map((param: any) => ({
      name: param.name?.name || param.name,
      constraint: param.constraint ? this.typeAnnotationToString(param.constraint) : undefined,
      defaultType: param.default ? this.typeAnnotationToString(param.default) : undefined
    }));
  }

  private extractDefaultValue(defaultNode: any): string {
    if (defaultNode.type === 'Literal') return String(defaultNode.value);
    if (defaultNode.type === 'Identifier') return defaultNode.name;
    return '<complex>';
  }

  private typeAnnotationToString(typeNode: any): string {
    switch (typeNode.type) {
      case 'TSStringKeyword': return 'string';
      case 'TSNumberKeyword': return 'number';
      case 'TSBooleanKeyword': return 'boolean';
      case 'TSVoidKeyword': return 'void';
      case 'TSAnyKeyword': return 'any';
      case 'TSUnknownKeyword': return 'unknown';
      case 'TSNeverKeyword': return 'never';
      case 'TSTypeReference':
        return typeNode.typeName?.name || '<reference>';
      case 'TSArrayType':
        return `${this.typeAnnotationToString(typeNode.elementType)}[]`;
      case 'TSUnionType':
        return typeNode.types.map((t: any) => this.typeAnnotationToString(t)).join(' | ');
      default:
        return '<complex>';
    }
  }

  private countLines(ast: AST): number {
    // Simple line counting - would need actual source for accuracy
    return ast.loc?.end?.line || 0;
  }

  private countCommentLines(ast: AST): number {
    // Would need comment tracking during parsing for accuracy
    return 0;
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }
}