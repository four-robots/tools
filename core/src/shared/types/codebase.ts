/**
 * Codebase Analysis Types
 * 
 * Comprehensive TypeScript types for the code parser and AST analysis system.
 * Supports multi-language parsing, symbol extraction, and dependency analysis.
 */

import { z } from 'zod';

// ===================
// CORE PARSING TYPES
// ===================

/**
 * Supported programming languages
 */
export enum SupportedLanguage {
  TYPESCRIPT = 'typescript',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  JAVA = 'java',
  GO = 'go',
  CPP = 'cpp',
  C = 'c',
  RUST = 'rust'
}

/**
 * Symbol types that can be extracted from code
 */
export enum SymbolType {
  FUNCTION = 'function',
  METHOD = 'method',
  CLASS = 'class',
  INTERFACE = 'interface',
  VARIABLE = 'variable',
  CONSTANT = 'constant',
  ENUM = 'enum',
  TYPE_ALIAS = 'type_alias',
  NAMESPACE = 'namespace',
  MODULE = 'module',
  PROPERTY = 'property',
  CONSTRUCTOR = 'constructor',
  GETTER = 'getter',
  SETTER = 'setter'
}

/**
 * Symbol visibility levels
 */
export enum Visibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  PROTECTED = 'protected',
  INTERNAL = 'internal'
}

/**
 * Symbol scopes
 */
export enum SymbolScope {
  GLOBAL = 'global',
  MODULE = 'module',
  CLASS = 'class',
  FUNCTION = 'function',
  BLOCK = 'block'
}

/**
 * Dependency types
 */
export enum CodeDependencyType {
  IMPORT = 'import',
  REQUIRE = 'require',  
  INCLUDE = 'include',
  USING = 'using',
  FROM = 'from'
}

// ===================
// AST AND PARSING SCHEMAS
// ===================

/**
 * Generic AST node structure
 */
export const astNodeSchema: z.ZodType<any> = z.object({
  type: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  loc: z.object({
    start: z.object({
      line: z.number(),
      column: z.number()
    }).optional(),
    end: z.object({
      line: z.number(), 
      column: z.number()
    }).optional()
  }).optional(),
  range: z.tuple([z.number(), z.number()]).optional(),
  children: z.lazy((): z.ZodArray<any> => z.array(astNodeSchema)).optional(),
  value: z.unknown().optional()
});

/**
 * Parse result from language-specific parsers
 */
export const parseResultSchema = z.object({
  fileId: z.string().uuid(),
  language: z.nativeEnum(SupportedLanguage),
  ast: astNodeSchema,
  symbols: z.array(z.lazy(() => codeSymbolSchema)),
  dependencies: z.array(z.lazy(() => codeDependencySchema)),
  complexityMetrics: z.lazy(() => complexityMetricsSchema),
  parseTime: z.number(),
  errors: z.array(z.object({
    message: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
    severity: z.enum(['error', 'warning', 'info'])
  })).default([])
});

/**
 * Parse options for controlling parser behavior
 */
export const parseOptionsSchema = z.object({
  includeComments: z.boolean().default(false),
  includeLocations: z.boolean().default(true),
  includeRange: z.boolean().default(false),
  parseJSX: z.boolean().default(false), // For JavaScript/TypeScript
  strictMode: z.boolean().default(true),
  sourceType: z.enum(['script', 'module']).default('module'),
  ecmaVersion: z.union([z.number(), z.literal('latest')]).default('latest'),
  plugins: z.array(z.string()).default([])
});

// ===================
// SYMBOL SCHEMAS
// ===================

/**
 * Function/method parameter
 */
export const parameterSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  defaultValue: z.string().optional(),
  isOptional: z.boolean().default(false),
  isRestParameter: z.boolean().default(false),
  description: z.string().optional()
});

/**
 * Generic type parameter
 */
export const genericParameterSchema = z.object({
  name: z.string(),
  constraint: z.string().optional(),
  defaultType: z.string().optional(),
  description: z.string().optional()
});

/**
 * Decorator/annotation
 */
export const decoratorSchema = z.object({
  name: z.string(),
  arguments: z.array(z.string()).optional(),
  expression: z.string().optional()
});

/**
 * Code symbol schema
 */
export const codeSymbolSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  name: z.string(),
  symbolType: z.nativeEnum(SymbolType),
  language: z.nativeEnum(SupportedLanguage),
  definitionLine: z.number().optional(),
  definitionColumn: z.number().optional(),
  endLine: z.number().optional(),
  endColumn: z.number().optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  parameters: z.array(parameterSchema).default([]),
  returnType: z.string().optional(),
  description: z.string().optional(),
  isExported: z.boolean().default(false),
  isAsync: z.boolean().default(false),
  isGenerator: z.boolean().default(false),
  isStatic: z.boolean().default(false),
  parentSymbolId: z.string().uuid().optional(),
  scope: z.nativeEnum(SymbolScope).optional(),
  decorators: z.array(decoratorSchema).default([]),
  genericParameters: z.array(genericParameterSchema).default([]),
  createdAt: z.date(),
  updatedAt: z.date()
});

// ===================
// DEPENDENCY SCHEMAS
// ===================

/**
 * Code dependency schema
 */
export const codeDependencySchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  dependencyType: z.nativeEnum(CodeDependencyType),
  dependencyPath: z.string(),
  importedSymbols: z.array(z.string()).default([]),
  alias: z.string().optional(),
  isExternal: z.boolean().default(false),
  isTypeOnly: z.boolean().default(false), // TypeScript type-only imports
  dependencyVersion: z.string().optional(),
  resolvedPath: z.string().optional(),
  lineNumber: z.number().optional(),
  columnNumber: z.number().optional(),
  createdAt: z.date()
});

// ===================
// COMPLEXITY METRICS SCHEMAS
// ===================

/**
 * Code complexity metrics
 */
export const complexityMetricsSchema = z.object({
  cyclomaticComplexity: z.number().default(0),
  cognitiveComplexity: z.number().default(0),
  linesOfCode: z.number().default(0),
  maintainabilityIndex: z.number().default(0),
  nestingDepth: z.number().default(0),
  functionCount: z.number().default(0),
  classCount: z.number().default(0),
  methodCount: z.number().default(0),
  variableCount: z.number().default(0),
  commentLines: z.number().default(0),
  blankLines: z.number().default(0),
  duplicatedLines: z.number().default(0)
});

// ===================
// AST CACHE SCHEMAS
// ===================

/**
 * AST cache entry
 */
export const astCacheSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  language: z.nativeEnum(SupportedLanguage),
  astData: z.record(z.unknown()), // Serialized AST
  symbols: z.record(z.unknown()), // Symbols summary
  dependencies: z.array(z.string()),
  complexityMetrics: complexityMetricsSchema.optional(),
  parseVersion: z.string(),
  parseTimeMs: z.number().optional(),
  fileHash: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// ===================
// REPOSITORY PARSING SCHEMAS
// ===================

/**
 * Repository parsing options
 */
export const repositoryParseOptionsSchema = z.object({
  includeTests: z.boolean().default(true),
  includeDocs: z.boolean().default(false),
  includeNodeModules: z.boolean().default(false),
  excludePatterns: z.array(z.string()).default([]),
  maxFileSize: z.number().default(1024 * 1024), // 1MB default
  parallel: z.boolean().default(true),
  maxConcurrency: z.number().default(4)
});

/**
 * Repository parsing result
 */
export const repositoryParseResultSchema = z.object({
  repositoryId: z.string().uuid(),
  totalFiles: z.number(),
  parsedFiles: z.number(),
  skippedFiles: z.number(),
  errorFiles: z.number(),
  totalSymbols: z.number(),
  totalDependencies: z.number(),
  languages: z.record(z.number()), // language -> file count
  parseTime: z.number(),
  errors: z.array(z.object({
    fileId: z.string().uuid(),
    error: z.string(),
    details: z.string().optional()
  }))
});

// ===================
// SEARCH AND QUERY SCHEMAS
// ===================

/**
 * Symbol search query
 */
export const symbolQuerySchema = z.object({
  repositoryId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
  name: z.string().optional(),
  symbolType: z.nativeEnum(SymbolType).optional(),
  language: z.nativeEnum(SupportedLanguage).optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  isExported: z.boolean().optional(),
  parentSymbolId: z.string().uuid().optional(),
  scope: z.nativeEnum(SymbolScope).optional(),
  fuzzy: z.boolean().default(false),
  limit: z.number().default(50),
  offset: z.number().default(0)
});

/**
 * Dependency graph node
 */
export const dependencyGraphNodeSchema = z.object({
  id: z.string(),
  path: z.string(),
  isExternal: z.boolean(),
  type: z.string(),
  dependencies: z.array(z.string())
});

/**
 * Dependency graph
 */
export const dependencyGraphSchema = z.object({
  repositoryId: z.string().uuid(),
  nodes: z.array(dependencyGraphNodeSchema),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.nativeEnum(DependencyType)
  })),
  externalDependencies: z.record(z.number()), // package -> usage count
  circularDependencies: z.array(z.array(z.string())), // cycles
  stats: z.object({
    totalNodes: z.number(),
    totalEdges: z.number(),
    maxDepth: z.number(),
    avgDependencies: z.number()
  })
});

// ===================
// CACHE MANAGEMENT SCHEMAS
// ===================

/**
 * Cache statistics
 */
export const cacheStatsSchema = z.object({
  totalEntries: z.number(),
  hitRate: z.number(),
  averageParseTime: z.number(),
  totalCacheSize: z.number(), // in bytes
  oldestEntry: z.date().optional(),
  newestEntry: z.date().optional(),
  languageBreakdown: z.record(z.number()),
  cacheByRepository: z.record(z.number())
});

// ===================
// TYPESCRIPT TYPES
// ===================

export type AST = z.infer<typeof astNodeSchema>;
export type ParseResult = z.infer<typeof parseResultSchema>;
export type ParseOptions = z.infer<typeof parseOptionsSchema>;
export type Parameter = z.infer<typeof parameterSchema>;
export type GenericParameter = z.infer<typeof genericParameterSchema>;
export type Decorator = z.infer<typeof decoratorSchema>;
export type CodeSymbol = z.infer<typeof codeSymbolSchema>;
export type CodeDependency = z.infer<typeof codeDependencySchema>;
export type ComplexityMetrics = z.infer<typeof complexityMetricsSchema>;
export type ASTCache = z.infer<typeof astCacheSchema>;
export type RepositoryParseOptions = z.infer<typeof repositoryParseOptionsSchema>;
export type RepositoryParseResult = z.infer<typeof repositoryParseResultSchema>;
export type SymbolQuery = z.infer<typeof symbolQuerySchema>;
export type DependencyGraphNode = z.infer<typeof dependencyGraphNodeSchema>;
export type DependencyGraph = z.infer<typeof dependencyGraphSchema>;
export type CacheStats = z.infer<typeof cacheStatsSchema>;

// ===================
// PARSER ERROR TYPES
// ===================

export class ParseError extends Error {
  public readonly line?: number;
  public readonly column?: number;
  public readonly severity: 'error' | 'warning' | 'info';

  constructor(
    message: string, 
    options?: { 
      line?: number; 
      column?: number; 
      severity?: 'error' | 'warning' | 'info';
    }
  ) {
    super(message);
    this.name = 'ParseError';
    this.line = options?.line;
    this.column = options?.column;
    this.severity = options?.severity || 'error';
  }
}

export class UnsupportedLanguageError extends Error {
  public readonly language: string;

  constructor(language: string) {
    super(`Unsupported language: ${language}`);
    this.name = 'UnsupportedLanguageError';
    this.language = language;
  }
}

// ===================
// LANGUAGE PARSER INTERFACE
// ===================

export interface LanguageParser {
  readonly language: SupportedLanguage;
  readonly supportedExtensions: string[];
  
  /**
   * Parse source code and return AST with symbols
   */
  parse(content: string, options?: ParseOptions): Promise<ParseResult>;
  
  /**
   * Extract symbols from AST
   */
  extractSymbols(ast: AST, fileId: string, repositoryId: string): Promise<CodeSymbol[]>;
  
  /**
   * Extract dependencies from AST
   */
  extractDependencies(ast: AST, fileId: string, repositoryId: string): Promise<CodeDependency[]>;
  
  /**
   * Calculate complexity metrics from AST
   */
  calculateComplexity(ast: AST): Promise<ComplexityMetrics>;
  
  /**
   * Validate if content can be parsed
   */
  canParse(content: string): boolean;
}