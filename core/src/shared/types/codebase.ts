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
// CODE CHUNKING TYPES
// ===================

/**
 * Dependency types for code analysis
 */
export enum DependencyType {
  IMPORT = 'import',
  REQUIRE = 'require',
  INCLUDE = 'include',
  USING = 'using',
  FROM = 'from'
}

/**
 * Supported chunk types for code segmentation
 */
export enum ChunkType {
  FUNCTION = 'function',
  CLASS = 'class',
  METHOD = 'method',
  VARIABLE = 'variable',
  BLOCK = 'block',
  COMMENT = 'comment',
  IMPORT = 'import',
  INTERFACE = 'interface',
  TYPE = 'type',
  NAMESPACE = 'namespace',
  PROPERTY = 'property',
  CONSTRUCTOR = 'constructor',
  MODULE = 'module'
}

/**
 * Chunking strategy types
 */
export enum ChunkingStrategy {
  FUNCTION_BASED = 'function_based',
  CLASS_BASED = 'class_based',
  LOGICAL_BLOCK = 'logical_block',
  SIZE_BASED = 'size_based',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
  INTELLIGENT = 'intelligent'
}

/**
 * Relationship types between code chunks
 */
export enum RelationshipType {
  CALLS = 'calls',
  IMPORTS = 'imports',
  EXTENDS = 'extends',
  IMPLEMENTS = 'implements',
  REFERENCES = 'references',
  CONTAINS = 'contains',
  SIMILAR = 'similar',
  DEPENDS_ON = 'depends_on',
  USED_BY = 'used_by'
}

// ===================
// CODE CHUNKING SCHEMAS
// ===================

/**
 * Code chunk schema
 */
export const codeChunkSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  chunkType: z.nativeEnum(ChunkType),
  chunkIndex: z.number().int().min(0),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  startColumn: z.number().int().optional(),
  endColumn: z.number().int().optional(),
  content: z.string(),
  contentHash: z.string().length(64), // SHA-256 hash
  language: z.nativeEnum(SupportedLanguage),
  symbolName: z.string().optional(),
  symbolType: z.nativeEnum(SymbolType).optional(),
  parentChunkId: z.string().uuid().optional(),
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Chunk relationship schema
 */
export const chunkRelationshipSchema = z.object({
  id: z.string().uuid(),
  sourceChunkId: z.string().uuid(),
  targetChunkId: z.string().uuid(),
  relationshipType: z.nativeEnum(RelationshipType),
  strength: z.number().min(0).max(1).default(0.0),
  lineReferences: z.array(z.string()).default([]),
  createdAt: z.date()
});

/**
 * Chunking options schema
 */
export const chunkingOptionsSchema = z.object({
  strategy: z.nativeEnum(ChunkingStrategy),
  maxChunkSize: z.number().int().min(50).default(2000),
  minChunkSize: z.number().int().min(10).default(50),
  overlapLines: z.number().int().min(0).default(5),
  contextLines: z.number().int().min(0).default(3),
  includeComments: z.boolean().default(true),
  includeImports: z.boolean().default(true),
  preserveStructure: z.boolean().default(true),
  respectLanguageRules: z.boolean().default(true),
  generateEmbeddings: z.boolean().default(false)
});

/**
 * Chunking result schema
 */
export const chunkingResultSchema = z.object({
  repositoryId: z.string().uuid(),
  totalFiles: z.number().int().min(0),
  totalChunks: z.number().int().min(0),
  chunksPerFile: z.record(z.number().int()),
  averageChunkSize: z.number().min(0),
  processingTime: z.number().min(0),
  errors: z.array(z.object({
    fileId: z.string().uuid(),
    error: z.string(),
    details: z.string().optional()
  })).default([]),
  strategies: z.record(z.number().int()).default({}) // strategy -> chunk count
});

/**
 * Related chunk schema
 */
export const relatedChunkSchema = z.object({
  chunk: codeChunkSchema,
  relationshipType: z.nativeEnum(RelationshipType),
  strength: z.number().min(0).max(1),
  distance: z.number().int().min(0)
});

/**
 * Chunk query options schema
 */
export const chunkQuerySchema = z.object({
  repositoryId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
  chunkType: z.nativeEnum(ChunkType).optional(),
  language: z.nativeEnum(SupportedLanguage).optional(),
  symbolName: z.string().optional(),
  symbolType: z.nativeEnum(SymbolType).optional(),
  parentChunkId: z.string().uuid().optional(),
  contentHash: z.string().optional(),
  minSize: z.number().int().optional(),
  maxSize: z.number().int().optional(),
  startLine: z.number().int().optional(),
  endLine: z.number().int().optional(),
  includeContext: z.boolean().default(false),
  includeRelationships: z.boolean().default(false),
  limit: z.number().int().min(1).max(1000).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['created_at', 'updated_at', 'start_line', 'chunk_index', 'size']).default('chunk_index'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

/**
 * Chunk search query schema
 */
export const chunkSearchQuerySchema = z.object({
  query: z.string(),
  repositoryId: z.string().uuid().optional(),
  fileId: z.string().uuid().optional(),
  chunkTypes: z.array(z.nativeEnum(ChunkType)).optional(),
  languages: z.array(z.nativeEnum(SupportedLanguage)).optional(),
  symbolTypes: z.array(z.nativeEnum(SymbolType)).optional(),
  fuzzy: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  includeContent: z.boolean().default(true),
  includeContext: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

/**
 * Chunk search result schema
 */
export const chunkSearchResultSchema = z.object({
  chunks: z.array(codeChunkSchema),
  totalResults: z.number().int().min(0),
  searchTime: z.number().min(0),
  query: z.string(),
  suggestions: z.array(z.string()).default([])
});

/**
 * Chunking statistics schema
 */
export const chunkingStatsSchema = z.object({
  repositoryId: z.string().uuid().optional(),
  totalChunks: z.number().int().min(0),
  chunksByType: z.record(z.number().int()),
  chunksByLanguage: z.record(z.number().int()),
  chunksByFile: z.record(z.number().int()),
  averageChunkSize: z.number().min(0),
  medianChunkSize: z.number().min(0),
  totalLinesChunked: z.number().int().min(0),
  relationshipStats: z.object({
    totalRelationships: z.number().int().min(0),
    relationshipsByType: z.record(z.number().int()),
    averageRelationshipsPerChunk: z.number().min(0)
  }),
  qualityMetrics: z.object({
    chunkCohesion: z.number().min(0).max(1), // How well chunks represent logical units
    contextPreservation: z.number().min(0).max(1), // How well context is preserved
    deduplicationRate: z.number().min(0).max(1) // Rate of duplicate chunk detection
  })
});

/**
 * Optimization result schema
 */
export const optimizationResultSchema = z.object({
  repositoryId: z.string().uuid(),
  originalChunkCount: z.number().int().min(0),
  optimizedChunkCount: z.number().int().min(0),
  duplicatesRemoved: z.number().int().min(0),
  relationshipsAdded: z.number().int().min(0),
  qualityImprovements: z.record(z.number()),
  optimizationTime: z.number().min(0),
  recommendations: z.array(z.string()).default([])
});

// ===================
// CHUNKING STRATEGY SCHEMAS
// ===================

/**
 * Chunking strategy configuration schema
 */
export const chunkingStrategyConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  language: z.nativeEnum(SupportedLanguage).optional(),
  chunkByFunctions: z.boolean().default(true),
  chunkByClasses: z.boolean().default(true),
  chunkByMethods: z.boolean().default(true),
  chunkByInterfaces: z.boolean().default(false),
  chunkByVariables: z.boolean().default(false),
  includeJSDoc: z.boolean().default(true),
  includeDocstrings: z.boolean().default(true),
  includeAnnotations: z.boolean().default(true),
  preserveImports: z.boolean().default(true),
  preservePackages: z.boolean().default(true),
  maxChunkSize: z.number().int().min(50).default(2000),
  minChunkSize: z.number().int().min(10).default(50),
  overlapLines: z.number().int().min(0).default(5),
  contextLines: z.number().int().min(0).default(3),
  respectIndentation: z.boolean().default(true),
  customPatterns: z.array(z.string()).default([])
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

// Code chunking types
export type CodeChunk = z.infer<typeof codeChunkSchema>;
export type ChunkRelationship = z.infer<typeof chunkRelationshipSchema>;
export type ChunkingOptions = z.infer<typeof chunkingOptionsSchema>;
export type ChunkingResult = z.infer<typeof chunkingResultSchema>;
export type RelatedChunk = z.infer<typeof relatedChunkSchema>;
export type ChunkQuery = z.infer<typeof chunkQuerySchema>;
export type ChunkSearchQuery = z.infer<typeof chunkSearchQuerySchema>;
export type ChunkSearchResult = z.infer<typeof chunkSearchResultSchema>;
export type ChunkingStats = z.infer<typeof chunkingStatsSchema>;
export type OptimizationResult = z.infer<typeof optimizationResultSchema>;
export type ChunkingStrategyConfig = z.infer<typeof chunkingStrategyConfigSchema>;

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

// ===================
// CODE EMBEDDINGS & SEMANTIC SEARCH TYPES
// ===================

/**
 * Query types for semantic search
 */
export enum QueryType {
  CODE = 'code',
  NATURAL_LANGUAGE = 'natural_language', 
  STRUCTURAL = 'structural',
  INTENT = 'intent',
  PATTERN = 'pattern',
  CROSS_LANGUAGE = 'cross_language'
}

/**
 * Embedding model types
 */
export enum EmbeddingModelType {
  CODEBERT = 'codebert',
  GRAPHCODEBERT = 'graphcodebert',
  UNIXCODER = 'unixcoder',
  OPENAI = 'openai',
  CUSTOM = 'custom'
}

/**
 * Cross-language mapping types
 */
export enum CrossLanguageMappingType {
  EQUIVALENT = 'equivalent',
  SIMILAR = 'similar',
  TRANSLATED = 'translated'
}

/**
 * Confidence levels for mappings
 */
export enum ConfidenceLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// ===================
// CODE EMBEDDINGS SCHEMAS
// ===================

/**
 * Enhanced code embedding schema with confidence and metadata
 */
export const codeEmbeddingSchema = z.object({
  id: z.string().uuid(),
  chunkId: z.string().uuid(),
  modelName: z.string(),
  modelVersion: z.string(),
  embeddingVector: z.array(z.number()),
  embeddingMetadata: z.record(z.unknown()).default({}),
  confidenceScore: z.number().min(0).max(1).default(0.0),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Embedding model configuration schema
 */
export const embeddingModelSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  modelType: z.nativeEnum(EmbeddingModelType),
  embeddingDimension: z.number().int().positive(),
  supportedLanguages: z.array(z.nativeEnum(SupportedLanguage)),
  modelConfig: z.record(z.unknown()).default({}),
  apiEndpoint: z.string().optional(),
  localPath: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  performanceMetrics: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Code search query schema
 */
export const codeSearchQuerySchema = z.object({
  query: z.string(),
  queryType: z.nativeEnum(QueryType),
  language: z.nativeEnum(SupportedLanguage).optional(),
  repositoryIds: z.array(z.string().uuid()).optional(),
  fileTypes: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().default(50),
  similarityThreshold: z.number().min(0).max(1).default(0.7),
  includeContext: z.boolean().default(false),
  searchFilters: z.record(z.unknown()).default({})
});

/**
 * Similar chunk result schema
 */
export const similarChunkSchema = z.object({
  chunk: codeChunkSchema,
  similarity: z.number().min(0).max(1),
  explanation: z.string().optional(),
  highlightedContent: z.string().optional(),
  contextChunks: z.array(codeChunkSchema).optional()
});

/**
 * Semantic search result schema
 */
export const semanticSearchResultSchema = z.object({
  results: z.array(similarChunkSchema),
  totalResults: z.number().int().min(0),
  searchTime: z.number().min(0),
  modelUsed: z.string(),
  queryProcessed: z.string(),
  suggestions: z.array(z.string()).optional()
});

/**
 * Cross-language mapping schema
 */
export const crossLanguageMappingSchema = z.object({
  id: z.string().uuid(),
  sourceChunkId: z.string().uuid(),
  targetChunkId: z.string().uuid(),
  sourceLanguage: z.nativeEnum(SupportedLanguage),
  targetLanguage: z.nativeEnum(SupportedLanguage),
  similarityScore: z.number().min(0).max(1),
  mappingType: z.nativeEnum(CrossLanguageMappingType),
  confidenceLevel: z.nativeEnum(ConfidenceLevel),
  verifiedByHuman: z.boolean().default(false),
  modelUsed: z.string(),
  createdAt: z.date()
});

/**
 * Cross-language search result schema
 */
export const crossLanguageSearchResultSchema = z.object({
  sourceChunk: codeChunkSchema,
  equivalents: z.array(z.object({
    chunk: codeChunkSchema,
    mapping: crossLanguageMappingSchema,
    similarity: z.number().min(0).max(1)
  })),
  totalEquivalents: z.number().int().min(0)
});

/**
 * Embedding options schema
 */
export const embeddingOptionsSchema = z.object({
  modelName: z.string(),
  batchSize: z.number().int().positive().default(32),
  parallel: z.boolean().default(true),
  includeContext: z.boolean().default(true),
  filterLanguages: z.array(z.nativeEnum(SupportedLanguage)).optional(),
  skipExisting: z.boolean().default(true),
  forceRegenerate: z.boolean().default(false)
});

/**
 * Batch embedding result schema
 */
export const batchEmbeddingResultSchema = z.object({
  repositoryId: z.string().uuid(),
  totalChunks: z.number().int().min(0),
  embeddingsGenerated: z.number().int().min(0),
  embeddingsSkipped: z.number().int().min(0),
  errors: z.array(z.object({
    chunkId: z.string().uuid(),
    error: z.string(),
    details: z.string().optional()
  })).default([]),
  modelUsed: z.string(),
  processingTime: z.number().min(0),
  averageConfidence: z.number().min(0).max(1)
});

/**
 * Search filters schema
 */
export const searchFiltersSchema = z.object({
  languages: z.array(z.nativeEnum(SupportedLanguage)).optional(),
  chunkTypes: z.array(z.nativeEnum(ChunkType)).optional(),
  symbolTypes: z.array(z.nativeEnum(SymbolType)).optional(),
  repositories: z.array(z.string().uuid()).optional(),
  dateRange: z.object({
    start: z.date(),
    end: z.date()
  }).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  maxResults: z.number().int().positive().default(50)
});

/**
 * Natural language search query schema
 */
export const naturalLanguageSearchSchema = z.object({
  query: z.string(),
  intent: z.string().optional(),
  context: z.string().optional(),
  targetLanguages: z.array(z.nativeEnum(SupportedLanguage)).optional(),
  searchScope: z.enum(['functions', 'classes', 'all']).default('all'),
  includeExamples: z.boolean().default(true),
  maxResults: z.number().int().positive().default(20)
});

/**
 * Structural search pattern schema
 */
export const structuralSearchPatternSchema = z.object({
  pattern: z.string(),
  language: z.nativeEnum(SupportedLanguage),
  patternType: z.enum(['ast', 'regex', 'semantic']).default('ast'),
  variables: z.record(z.string()).default({}),
  constraints: z.array(z.string()).default([])
});

/**
 * Intent search schema
 */
export const intentSearchSchema = z.object({
  intent: z.string(),
  context: z.string().optional(),
  domain: z.string().optional(),
  targetLanguages: z.array(z.nativeEnum(SupportedLanguage)).optional(),
  includeDocumentation: z.boolean().default(true),
  confidenceThreshold: z.number().min(0).max(1).default(0.6)
});

/**
 * Hybrid search query schema combining multiple search types
 */
export const hybridSearchQuerySchema = z.object({
  codeQuery: z.string().optional(),
  naturalLanguageQuery: z.string().optional(),
  structuralPattern: structuralSearchPatternSchema.optional(),
  intent: z.string().optional(),
  weights: z.object({
    semantic: z.number().min(0).max(1).default(0.4),
    structural: z.number().min(0).max(1).default(0.3),
    textual: z.number().min(0).max(1).default(0.3)
  }),
  combineMethod: z.enum(['weighted_average', 'rank_fusion', 'cascade']).default('weighted_average'),
  filters: searchFiltersSchema.optional()
});

/**
 * Search analytics schema
 */
export const searchAnalyticsSchema = z.object({
  id: z.string().uuid(),
  searchSession: z.string().uuid(),
  queryText: z.string(),
  queryType: z.nativeEnum(QueryType),
  modelUsed: z.string(),
  resultCount: z.number().int().min(0),
  searchTimeMs: z.number().int().min(0),
  userId: z.string().uuid().optional(),
  repositoryId: z.string().uuid().optional(),
  filtersApplied: z.record(z.unknown()).default({}),
  clickedResults: z.array(z.string().uuid()).default([]),
  searchSuccess: z.boolean().default(true),
  createdAt: z.date()
});

/**
 * Embedding stats schema
 */
export const embeddingStatsSchema = z.object({
  repositoryId: z.string().uuid().optional(),
  totalEmbeddings: z.number().int().min(0),
  embeddingsByModel: z.record(z.number().int()),
  embeddingsByLanguage: z.record(z.number().int()),
  averageConfidence: z.number().min(0).max(1),
  latestEmbedding: z.date().optional(),
  storageSize: z.number().min(0), // in bytes
  indexingStatus: z.enum(['pending', 'in_progress', 'completed', 'failed'])
});

/**
 * Search optimization result schema
 */
export const searchOptimizationResultSchema = z.object({
  indexesOptimized: z.number().int().min(0),
  cacheHitRateImprovement: z.number().min(0),
  averageSearchTimeImprovement: z.number(),
  memoryUsageReduction: z.number().min(0),
  recommendations: z.array(z.string()).default([])
});

// ===================
// TYPESCRIPT INFERENCE TYPES
// ===================

export type CodeEmbedding = z.infer<typeof codeEmbeddingSchema>;
export type EmbeddingModel = z.infer<typeof embeddingModelSchema>;
export type CodeSearchQuery = z.infer<typeof codeSearchQuerySchema>;
export type SimilarChunk = z.infer<typeof similarChunkSchema>;
export type SemanticSearchResult = z.infer<typeof semanticSearchResultSchema>;
export type CrossLanguageMapping = z.infer<typeof crossLanguageMappingSchema>;
export type CrossLanguageSearchResult = z.infer<typeof crossLanguageSearchResultSchema>;
export type EmbeddingOptions = z.infer<typeof embeddingOptionsSchema>;
export type BatchEmbeddingResult = z.infer<typeof batchEmbeddingResultSchema>;
export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type NaturalLanguageSearch = z.infer<typeof naturalLanguageSearchSchema>;
export type StructuralSearchPattern = z.infer<typeof structuralSearchPatternSchema>;
export type IntentSearch = z.infer<typeof intentSearchSchema>;
export type HybridSearchQuery = z.infer<typeof hybridSearchQuerySchema>;
export type SearchAnalytics = z.infer<typeof searchAnalyticsSchema>;
export type EmbeddingStats = z.infer<typeof embeddingStatsSchema>;
export type SearchOptimizationResult = z.infer<typeof searchOptimizationResultSchema>;

// ===================
// DEPENDENCY ANALYSIS TYPES
// ===================

/**
 * Dependency relationship types for analysis
 */
export enum DependencyRelationType {
  DIRECT = 'direct',
  TRANSITIVE = 'transitive', 
  DEV = 'dev',
  PEER = 'peer',
  OPTIONAL = 'optional'
}

/**
 * Vulnerability severity levels
 */
export enum VulnerabilitySeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium', 
  LOW = 'low',
  INFO = 'info'
}

/**
 * Risk levels for various assessments
 */
export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown'
}

/**
 * License copyleft scope types
 */
export enum CopyleftScope {
  NONE = 'none',
  WEAK = 'weak', 
  STRONG = 'strong',
  NETWORK = 'network'
}

/**
 * Impact scope for dependency changes
 */
export enum ImpactScope {
  FILE = 'file',
  MODULE = 'module',
  PACKAGE = 'package', 
  GLOBAL = 'global'
}

/**
 * Impact type assessment
 */
export enum ImpactType {
  BREAKING = 'breaking',
  COMPATIBLE = 'compatible',
  UNKNOWN = 'unknown'
}

/**
 * Update types for dependencies
 */
export enum UpdateType {
  MAJOR = 'major',
  MINOR = 'minor',
  PATCH = 'patch'
}

/**
 * Analysis session status
 */
export enum AnalysisStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// ===================
// DEPENDENCY ANALYSIS SCHEMAS
// ===================

/**
 * Dependency graph node schema
 */
export const dependencyNodeSchema = z.object({
  packageName: z.string(),
  version: z.string(), 
  language: z.nativeEnum(SupportedLanguage),
  dependencyType: z.nativeEnum(DependencyRelationType),
  depth: z.number().int().min(0),
  vulnerabilityCount: z.number().int().min(0).default(0),
  licenseRisk: z.nativeEnum(RiskLevel).default('unknown')
});

/**
 * Dependency graph edge schema  
 */
export const dependencyEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.nativeEnum(DependencyRelationType)
});

/**
 * Circular dependency schema
 */
export const circularDependencySchema = z.object({
  id: z.string().uuid(),
  packages: z.array(z.string()),
  severity: z.enum(['warning', 'error']),
  affectedFiles: z.array(z.string()),
  suggestedFix: z.string().optional()
});

/**
 * Dependency graph analysis schema
 */
export const dependencyGraphAnalysisSchema = z.object({
  repositoryId: z.string().uuid(),
  nodes: z.array(dependencyNodeSchema), 
  edges: z.array(dependencyEdgeSchema),
  circularDependencies: z.array(circularDependencySchema),
  depth: z.number().int().min(0),
  totalPackages: z.number().int().min(0),
  stats: z.object({
    directDependencies: z.number().int().min(0),
    transitiveDependencies: z.number().int().min(0),
    devDependencies: z.number().int().min(0),
    peerDependencies: z.number().int().min(0),
    optionalDependencies: z.number().int().min(0),
    circularCount: z.number().int().min(0),
    vulnerabilityCount: z.number().int().min(0),
    licenseIssueCount: z.number().int().min(0)
  })
});

/**
 * Vulnerability schema
 */
export const vulnerabilitySchema = z.object({
  id: z.string().uuid(),
  cveId: z.string().optional(),
  packageName: z.string(),
  affectedVersions: z.array(z.string()),
  fixedVersion: z.string().optional(),
  severity: z.nativeEnum(VulnerabilitySeverity),
  title: z.string(),
  description: z.string(),
  references: z.array(z.string()),
  publishedDate: z.date(),
  modifiedDate: z.date().optional(),
  cvssScore: z.number().min(0).max(10).optional()
});

/**
 * License info schema  
 */
export const licenseInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  spdxId: z.string().optional(),
  osiApproved: z.boolean(),
  fsfApproved: z.boolean(), 
  commercialUseAllowed: z.boolean().optional(),
  attributionRequired: z.boolean().optional(),
  copyleftScope: z.nativeEnum(CopyleftScope),
  riskLevel: z.nativeEnum(RiskLevel)
});

/**
 * Dependency change schema
 */
export const dependencyChangeSchema = z.object({
  packageName: z.string(),
  fromVersion: z.string().optional(),
  toVersion: z.string(),
  changeType: z.nativeEnum(UpdateType),
  isBreaking: z.boolean().default(false)
});

/**
 * Affected file schema
 */
export const affectedFileSchema = z.object({
  filePath: z.string(),
  functionNames: z.array(z.string()).default([]),
  classNames: z.array(z.string()).default([]),
  importStatements: z.array(z.string()).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.0)
});

/**
 * Impact analysis schema
 */
export const impactAnalysisSchema = z.object({
  repositoryId: z.string().uuid(),
  changes: z.array(dependencyChangeSchema),
  affectedFiles: z.array(affectedFileSchema),
  impactScope: z.nativeEnum(ImpactScope),
  riskAssessment: z.nativeEnum(RiskLevel),
  recommendations: z.array(z.string()),
  confidenceScore: z.number().min(0).max(1).default(0.0)
});

/**
 * Security score schema
 */
export const securityScoreSchema = z.object({
  repositoryId: z.string().uuid(),
  overallScore: z.number().min(0).max(1),
  vulnerabilityScore: z.number().min(0).max(1),
  licenseRiskScore: z.number().min(0).max(1), 
  supplyChainScore: z.number().min(0).max(1),
  maintenanceScore: z.number().min(0).max(1),
  popularityScore: z.number().min(0).max(1),
  breakdown: z.object({
    criticalVulns: z.number().int().min(0),
    highVulns: z.number().int().min(0),
    mediumVulns: z.number().int().min(0),
    lowVulns: z.number().int().min(0),
    licenseIssues: z.number().int().min(0),
    outdatedPackages: z.number().int().min(0)
  }),
  calculatedAt: z.date()
});

/**
 * Vulnerability scan result schema
 */
export const vulnerabilityScanResultSchema = z.object({
  repositoryId: z.string().uuid(),
  vulnerabilities: z.array(vulnerabilitySchema),
  summary: z.object({
    totalVulnerabilities: z.number().int().min(0),
    criticalCount: z.number().int().min(0),
    highCount: z.number().int().min(0),
    mediumCount: z.number().int().min(0), 
    lowCount: z.number().int().min(0),
    packagesAffected: z.number().int().min(0)
  }),
  scanTime: z.number().min(0),
  lastScan: z.date(),
  sources: z.array(z.string())
});

/**
 * License analysis result schema
 */
export const licenseAnalysisResultSchema = z.object({
  repositoryId: z.string().uuid(),
  licenses: z.array(licenseInfoSchema),
  compatibility: z.object({
    issues: z.array(z.object({
      license1: z.string(),
      license2: z.string(),
      conflictType: z.string(),
      severity: z.nativeEnum(RiskLevel)
    })),
    overallCompatible: z.boolean()
  }),
  complianceScore: z.number().min(0).max(1),
  riskAssessment: z.nativeEnum(RiskLevel),
  analyzedAt: z.date()
});

/**
 * Dependency update suggestion schema
 */
export const updateSuggestionSchema = z.object({
  packageName: z.string(),
  currentVersion: z.string(),
  suggestedVersion: z.string(),
  updateType: z.nativeEnum(UpdateType),
  priority: z.nativeEnum(RiskLevel),
  hasBreakingChanges: z.boolean(),
  hasSecurityFixes: z.boolean(),
  changelogUrl: z.string().optional(),
  compatibilityScore: z.number().min(0).max(1),
  effort: z.enum(['low', 'medium', 'high'])
});

/**
 * Optimization suggestion schema
 */
export const optimizationSuggestionSchema = z.object({
  type: z.enum(['remove_unused', 'update_version', 'replace_package', 'consolidate_duplicates']),
  packageName: z.string(),
  description: z.string(),
  impact: z.nativeEnum(RiskLevel),
  effort: z.enum(['low', 'medium', 'high']),
  potentialSavings: z.object({
    bundleSize: z.number().optional(), // in bytes
    securityIssues: z.number().int().min(0).optional(),
    maintenanceBurden: z.number().min(0).max(1).optional()
  })
});

/**
 * Analysis session schema
 */
export const analysisSessionSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  analysisType: z.enum(['graph', 'vulnerability', 'license', 'impact']),
  status: z.nativeEnum(AnalysisStatus),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  duration: z.number().min(0).optional(),
  packagesAnalyzed: z.number().int().min(0),
  errorsEncountered: z.number().int().min(0),
  configuration: z.record(z.unknown()).default({}),
  resultsSummary: z.record(z.unknown()).default({}),
  errorDetails: z.string().optional()
});

// ===================
// DEPENDENCY ANALYSIS TYPESCRIPT TYPES
// ===================

export type DependencyNode = z.infer<typeof dependencyNodeSchema>;
export type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;
export type CircularDependency = z.infer<typeof circularDependencySchema>;
export type DependencyGraphAnalysis = z.infer<typeof dependencyGraphAnalysisSchema>;
export type Vulnerability = z.infer<typeof vulnerabilitySchema>;
export type LicenseInfo = z.infer<typeof licenseInfoSchema>;
export type DependencyChange = z.infer<typeof dependencyChangeSchema>;
export type AffectedFile = z.infer<typeof affectedFileSchema>;
export type ImpactAnalysis = z.infer<typeof impactAnalysisSchema>;
export type SecurityScore = z.infer<typeof securityScoreSchema>;
export type VulnerabilityScanResult = z.infer<typeof vulnerabilityScanResultSchema>;
export type LicenseAnalysisResult = z.infer<typeof licenseAnalysisResultSchema>;
export type UpdateSuggestion = z.infer<typeof updateSuggestionSchema>;
export type OptimizationSuggestion = z.infer<typeof optimizationSuggestionSchema>;
export type AnalysisSession = z.infer<typeof analysisSessionSchema>;

// ===================
// ADVANCED SEARCH INTERFACES
// ===================

/**
 * Interface for embedding model implementations
 */
export interface EmbeddingModelInterface {
  readonly name: string;
  readonly modelType: EmbeddingModelType;
  readonly dimension: number;
  readonly supportedLanguages: SupportedLanguage[];
  
  /**
   * Generate embedding for code content
   */
  generateEmbedding(content: string, metadata?: Record<string, any>): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple code contents in batch
   */
  batchGenerateEmbeddings(contents: string[], metadata?: Record<string, any>[]): Promise<number[][]>;
  
  /**
   * Initialize the model (load from disk, connect to API, etc.)
   */
  initialize(): Promise<void>;
  
  /**
   * Cleanup model resources
   */
  cleanup(): Promise<void>;
  
  /**
   * Check if model is ready for inference
   */
  isReady(): boolean;
  
  /**
   * Get model information and capabilities
   */
  getModelInfo(): {
    name: string;
    version: string;
    dimension: number;
    maxTokens: number;
    supportedLanguages: SupportedLanguage[];
  };
}

/**
 * Interface for semantic search implementations
 */
export interface SemanticSearchInterface {
  /**
   * Search for similar code chunks
   */
  searchSimilarChunks(query: CodeSearchQuery): Promise<SemanticSearchResult>;
  
  /**
   * Find cross-language equivalents
   */
  findCrossLanguageEquivalents(chunkId: string): Promise<CrossLanguageSearchResult>;
  
  /**
   * Natural language to code search
   */
  naturalLanguageSearch(query: NaturalLanguageSearch): Promise<SemanticSearchResult>;
  
  /**
   * Structural pattern search
   */
  structuralSearch(pattern: StructuralSearchPattern): Promise<SemanticSearchResult>;
  
  /**
   * Intent-based search
   */
  intentSearch(intent: IntentSearch): Promise<SemanticSearchResult>;
  
  /**
   * Hybrid search combining multiple approaches
   */
  hybridSearch(query: HybridSearchQuery): Promise<SemanticSearchResult>;
}

/**
 * AST pattern for structural search
 */
export interface ASTPattern {
  nodeType: string;
  properties: Record<string, any>;
  children?: ASTPattern[];
  constraints?: string[];
  variables?: Record<string, string>;
}

/**
 * Search context for intent-based search
 */
export interface SearchContext {
  domain?: string;
  previousQueries?: string[];
  userPreferences?: Record<string, any>;
  currentFile?: string;
  projectContext?: string;
}

// ===================
// CODE QUALITY METRICS TYPES
// ===================

/**
 * Code smell types for quality analysis
 */
export enum CodeSmellType {
  LONG_METHOD = 'long_method',
  LARGE_CLASS = 'large_class',
  DUPLICATE_CODE = 'duplicate_code',
  COMPLEX_CONDITION = 'complex_condition',
  MAGIC_NUMBER = 'magic_number',
  DEAD_CODE = 'dead_code',
  GOD_CLASS = 'god_class',
  FEATURE_ENVY = 'feature_envy',
  LONG_PARAMETER_LIST = 'long_parameter_list',
  PRIMITIVE_OBSESSION = 'primitive_obsession',
  DATA_CLUMPS = 'data_clumps',
  SWITCH_STATEMENTS = 'switch_statements',
  LAZY_CLASS = 'lazy_class',
  SPECULATIVE_GENERALITY = 'speculative_generality',
  TEMPORARY_FIELD = 'temporary_field',
  MESSAGE_CHAINS = 'message_chains',
  MIDDLE_MAN = 'middle_man',
  INAPPROPRIATE_INTIMACY = 'inappropriate_intimacy',
  ALTERNATIVE_CLASSES = 'alternative_classes',
  INCOMPLETE_LIBRARY_CLASS = 'incomplete_library_class',
  DATA_CLASS = 'data_class',
  REFUSED_BEQUEST = 'refused_bequest',
  COMMENTS = 'comments'
}

/**
 * Quality rating levels (A-E scale)
 */
export enum QualityRating {
  A = 'A', // Excellent (90-100%)
  B = 'B', // Good (75-89%)
  C = 'C', // Average (60-74%)
  D = 'D', // Poor (40-59%)
  E = 'E'  // Very Poor (0-39%)
}

/**
 * Severity levels for issues
 */
export enum Severity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor',
  INFO = 'info'
}

/**
 * Comparison operators for quality gates
 */
export enum ComparisonOperator {
  GT = 'gt',          // Greater than
  LT = 'lt',          // Less than
  GTE = 'gte',        // Greater than or equal
  LTE = 'lte',        // Less than or equal
  EQ = 'eq',          // Equal
  NE = 'ne'           // Not equal
}

/**
 * Refactoring types
 */
export enum RefactoringType {
  EXTRACT_METHOD = 'extract_method',
  EXTRACT_CLASS = 'extract_class',
  INLINE_METHOD = 'inline_method',
  MOVE_METHOD = 'move_method',
  MOVE_FIELD = 'move_field',
  RENAME = 'rename',
  SIMPLIFY_CONDITION = 'simplify_condition',
  CONSOLIDATE_CONDITIONAL = 'consolidate_conditional',
  DECOMPOSE_CONDITIONAL = 'decompose_conditional',
  REPLACE_MAGIC_NUMBER = 'replace_magic_number',
  REMOVE_DUPLICATE = 'remove_duplicate',
  OPTIMIZE_IMPORTS = 'optimize_imports',
  INTRODUCE_PARAMETER_OBJECT = 'introduce_parameter_object',
  PRESERVE_WHOLE_OBJECT = 'preserve_whole_object',
  REPLACE_PARAMETER_WITH_QUERY = 'replace_parameter_with_query',
  SEPARATE_QUERY_FROM_MODIFIER = 'separate_query_from_modifier',
  PARAMETERIZE_METHOD = 'parameterize_method',
  REPLACE_CONSTRUCTOR_WITH_FACTORY = 'replace_constructor_with_factory',
  ENCAPSULATE_FIELD = 'encapsulate_field',
  REPLACE_DATA_VALUE_WITH_OBJECT = 'replace_data_value_with_object',
  CHANGE_VALUE_TO_REFERENCE = 'change_value_to_reference',
  CHANGE_REFERENCE_TO_VALUE = 'change_reference_to_value',
  REPLACE_ARRAY_WITH_OBJECT = 'replace_array_with_object',
  DUPLICATE_OBSERVED_DATA = 'duplicate_observed_data',
  CHANGE_UNIDIRECTIONAL_TO_BIDIRECTIONAL = 'change_unidirectional_to_bidirectional',
  CHANGE_BIDIRECTIONAL_TO_UNIDIRECTIONAL = 'change_bidirectional_to_unidirectional',
  REPLACE_TYPE_CODE_WITH_CLASS = 'replace_type_code_with_class',
  REPLACE_TYPE_CODE_WITH_SUBCLASSES = 'replace_type_code_with_subclasses',
  REPLACE_TYPE_CODE_WITH_STATE_STRATEGY = 'replace_type_code_with_state_strategy',
  REPLACE_SUBCLASS_WITH_FIELDS = 'replace_subclass_with_fields'
}

/**
 * Refactoring impact levels
 */
export enum RefactoringImpact {
  LOW = 'low',         // Minimal change, safe refactoring
  MEDIUM = 'medium',   // Moderate change, some testing required
  HIGH = 'high',       // Significant change, extensive testing required
  CRITICAL = 'critical' // Major architectural change
}

/**
 * Priority levels
 */
export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Time range specifications
 */
export enum TimeRange {
  LAST_DAY = 'last_day',
  LAST_WEEK = 'last_week',
  LAST_MONTH = 'last_month',
  LAST_QUARTER = 'last_quarter',
  LAST_YEAR = 'last_year',
  ALL_TIME = 'all_time'
}

// ===================
// CODE QUALITY SCHEMAS
// ===================

/**
 * Enhanced quality metrics schema
 */
export const qualityMetricsSchema = z.object({
  // Complexity metrics
  cyclomaticComplexity: z.number().min(0).default(0),
  cognitiveComplexity: z.number().min(0).default(0),
  structuralComplexity: z.number().min(0).default(0),
  nestingDepth: z.number().int().min(0).default(0),
  
  // Size metrics
  linesOfCode: z.number().int().min(0).default(0),
  logicalLines: z.number().int().min(0).default(0),
  commentLines: z.number().int().min(0).default(0),
  blankLines: z.number().int().min(0).default(0),
  
  // Quality metrics
  maintainabilityIndex: z.number().min(0).max(171).default(0),
  technicalDebtMinutes: z.number().min(0).default(0),
  codeSmellsCount: z.number().int().min(0).default(0),
  
  // Security & performance
  securityHotspots: z.number().int().min(0).default(0),
  performanceIssues: z.number().int().min(0).default(0),
  
  // Coverage metrics
  testCoverage: z.number().min(0).max(100).default(0),
  branchCoverage: z.number().min(0).max(100).default(0),
  
  // Composite scores
  overallQualityScore: z.number().min(0).max(100).default(0),
  reliabilityRating: z.nativeEnum(QualityRating).default(QualityRating.D),
  maintainabilityRating: z.nativeEnum(QualityRating).default(QualityRating.D),
  securityRating: z.nativeEnum(QualityRating).default(QualityRating.D),
  
  // Additional metrics
  duplicatedLines: z.number().int().min(0).default(0),
  bugs: z.number().int().min(0).default(0),
  codeSmellsDebt: z.number().min(0).default(0), // Technical debt from code smells
  vulnerabilities: z.number().int().min(0).default(0),
  
  // Halstead metrics
  halsteadVolume: z.number().min(0).default(0).optional(),
  halsteadDifficulty: z.number().min(0).default(0).optional(),
  halsteadEffort: z.number().min(0).default(0).optional(),
  
  language: z.nativeEnum(SupportedLanguage)
});

/**
 * Code smell schema
 */
export const codeSmellSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  smellType: z.nativeEnum(CodeSmellType),
  severity: z.nativeEnum(Severity),
  title: z.string(),
  description: z.string(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1).optional(),
  startColumn: z.number().int().min(0).optional(),
  endColumn: z.number().int().min(0).optional(),
  effortMinutes: z.number().int().min(0).default(0),
  suggestedFix: z.string().optional(),
  ruleKey: z.string().optional(),
  isResolved: z.boolean().default(false),
  resolvedBy: z.string().optional(),
  resolvedAt: z.date().optional(),
  detectedAt: z.date().default(() => new Date()),
  
  // Additional metadata
  messageArguments: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  component: z.string().optional(),
  project: z.string().optional(),
  author: z.string().optional(),
  assignee: z.string().optional(),
  status: z.enum(['OPEN', 'CONFIRMED', 'REOPENED', 'RESOLVED', 'CLOSED']).default('OPEN'),
  resolution: z.string().optional(),
  creationDate: z.date().default(() => new Date()),
  updateDate: z.date().default(() => new Date())
});

/**
 * Quality gate schema
 */
export const qualityGateSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  gateName: z.string(),
  metricName: z.string(),
  operator: z.nativeEnum(ComparisonOperator),
  thresholdValue: z.number(),
  isBlocking: z.boolean().default(false),
  severity: z.nativeEnum(Severity).default(Severity.MAJOR),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

/**
 * Quality gate result schema
 */
export const qualityGateResultSchema = z.object({
  gateId: z.string().uuid(),
  gateName: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'NO_VALUE']),
  metricName: z.string(),
  actualValue: z.number(),
  expectedOperator: z.nativeEnum(ComparisonOperator),
  expectedValue: z.number(),
  message: z.string().optional(),
  evaluatedAt: z.date().default(() => new Date())
});

/**
 * Quality gate evaluation result schema
 */
export const qualityGateEvaluationSchema = z.object({
  repositoryId: z.string().uuid(),
  overallStatus: z.enum(['PASSED', 'FAILED', 'ERROR']),
  gateResults: z.array(qualityGateResultSchema),
  blockerIssues: z.number().int().min(0).default(0),
  criticalIssues: z.number().int().min(0).default(0),
  majorIssues: z.number().int().min(0).default(0),
  minorIssues: z.number().int().min(0).default(0),
  evaluatedAt: z.date().default(() => new Date()),
  processingTime: z.number().min(0),
  canDeploy: z.boolean()
});

/**
 * Refactoring suggestion schema
 */
export const refactoringSuggestionSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(RefactoringType),
  title: z.string(),
  description: z.string(),
  fileId: z.string().uuid(),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  startColumn: z.number().int().min(0).optional(),
  endColumn: z.number().int().min(0).optional(),
  estimatedEffort: z.number().int().min(0), // minutes
  impact: z.nativeEnum(RefactoringImpact),
  priority: z.nativeEnum(Priority),
  potentialBenefit: z.string().optional(),
  riskAssessment: z.string().optional(),
  automationLevel: z.enum(['MANUAL', 'SEMI_AUTOMATED', 'AUTOMATED']).default('MANUAL'),
  prerequisites: z.array(z.string()).default([]),
  affectedFiles: z.array(z.string()).default([]),
  confidenceScore: z.number().min(0).max(1).default(0.5),
  createdAt: z.date().default(() => new Date())
});

/**
 * Code example schema for refactoring suggestions
 */
export const codeExampleSchema = z.object({
  title: z.string(),
  before: z.string(),
  after: z.string(),
  explanation: z.string().optional()
});

/**
 * Enhanced refactoring suggestion with examples
 */
export const enhancedRefactoringSuggestionSchema = refactoringSuggestionSchema.extend({
  examples: z.array(codeExampleSchema).default([])
});

/**
 * Quality trend data point schema
 */
export const qualityTrendDataPointSchema = z.object({
  timestamp: z.date(),
  metricName: z.string(),
  value: z.number(),
  repositoryId: z.string().uuid(),
  fileCount: z.number().int().min(0).optional(),
  totalLoc: z.number().int().min(0).optional()
});

/**
 * Quality trend schema
 */
export const qualityTrendSchema = z.object({
  repositoryId: z.string().uuid(),
  metricName: z.string(),
  dataPoints: z.array(qualityTrendDataPointSchema),
  trend: z.enum(['IMPROVING', 'STABLE', 'DEGRADING']),
  changeRate: z.number(), // Rate of change per unit time
  confidence: z.number().min(0).max(1),
  startDate: z.date(),
  endDate: z.date()
});

/**
 * Quality prediction schema
 */
export const qualityPredictionSchema = z.object({
  repositoryId: z.string().uuid(),
  metricName: z.string(),
  currentValue: z.number(),
  predictedValues: z.array(z.object({
    timestamp: z.date(),
    value: z.number(),
    confidence: z.number().min(0).max(1)
  })),
  model: z.string(),
  accuracy: z.number().min(0).max(1),
  predictionHorizon: z.string(), // e.g., "30_days", "3_months"
  generatedAt: z.date().default(() => new Date())
});

/**
 * Quality analysis options schema
 */
export const qualityAnalysisOptionsSchema = z.object({
  includeTests: z.boolean().default(true),
  includeDependencies: z.boolean().default(false),
  complexityThreshold: z.number().min(1).default(10),
  duplicateThreshold: z.number().min(0).max(1).default(0.9),
  languages: z.array(z.nativeEnum(SupportedLanguage)).optional(),
  customRules: z.array(z.string()).default([]),
  skipFiles: z.array(z.string()).default([]),
  parallel: z.boolean().default(true),
  maxConcurrency: z.number().int().min(1).max(16).default(4)
});

/**
 * Quality analysis result schema
 */
export const qualityAnalysisResultSchema = z.object({
  fileId: z.string().uuid(),
  repositoryId: z.string().uuid(),
  language: z.nativeEnum(SupportedLanguage),
  metrics: qualityMetricsSchema,
  codeSmells: z.array(codeSmellSchema).default([]),
  refactoringSuggestions: z.array(enhancedRefactoringSuggestionSchema).default([]),
  analysisTime: z.number().min(0),
  analysisDate: z.date().default(() => new Date()),
  version: z.string().default('1.0'),
  errors: z.array(z.object({
    type: z.string(),
    message: z.string(),
    line: z.number().int().optional(),
    column: z.number().int().optional()
  })).default([])
});

/**
 * Repository quality result schema
 */
export const repositoryQualityResultSchema = z.object({
  repositoryId: z.string().uuid(),
  overallMetrics: qualityMetricsSchema,
  fileResults: z.array(qualityAnalysisResultSchema),
  aggregateMetrics: z.object({
    totalFiles: z.number().int().min(0),
    totalLines: z.number().int().min(0),
    averageComplexity: z.number().min(0),
    totalCodeSmells: z.number().int().min(0),
    totalTechnicalDebt: z.number().min(0),
    languageBreakdown: z.record(z.number().int())
  }),
  qualityGateStatus: qualityGateEvaluationSchema.optional(),
  analysisDate: z.date().default(() => new Date()),
  processingTime: z.number().min(0),
  version: z.string().default('1.0')
});

/**
 * Quality delta (change comparison) schema
 */
export const qualityDeltaSchema = z.object({
  repositoryId: z.string().uuid(),
  changedFiles: z.array(z.string()),
  before: z.object({
    overallQualityScore: z.number().min(0).max(100),
    codeSmellsCount: z.number().int().min(0),
    technicalDebtMinutes: z.number().min(0),
    testCoverage: z.number().min(0).max(100)
  }),
  after: z.object({
    overallQualityScore: z.number().min(0).max(100),
    codeSmellsCount: z.number().int().min(0),
    technicalDebtMinutes: z.number().min(0),
    testCoverage: z.number().min(0).max(100)
  }),
  delta: z.object({
    qualityScoreChange: z.number(),
    codeSmellsChange: z.number().int(),
    technicalDebtChange: z.number(),
    coverageChange: z.number()
  }),
  impact: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  newIssues: z.array(codeSmellSchema).default([]),
  resolvedIssues: z.array(codeSmellSchema).default([]),
  comparedAt: z.date().default(() => new Date())
});

/**
 * Technical debt metrics schema
 */
export const technicalDebtMetricsSchema = z.object({
  totalDebtMinutes: z.number().min(0),
  debtRatio: z.number().min(0).max(1), // Debt / (Debt + Development cost)
  sqaleRating: z.nativeEnum(QualityRating),
  breakdown: z.object({
    reliabilityDebt: z.number().min(0),
    securityDebt: z.number().min(0),
    maintainabilityDebt: z.number().min(0)
  }),
  remediationCost: z.number().min(0), // in developer days
  interestRate: z.number().min(0), // How much debt increases over time
  principalDebt: z.number().min(0), // Core debt amount
  interestDebt: z.number().min(0), // Accumulated interest
  calculatedAt: z.date().default(() => new Date())
});

/**
 * Quality score calculation schema
 */
export const qualityScoreSchema = z.object({
  overallScore: z.number().min(0).max(100),
  components: z.object({
    reliability: z.number().min(0).max(100),
    security: z.number().min(0).max(100),
    maintainability: z.number().min(0).max(100),
    coverage: z.number().min(0).max(100),
    duplication: z.number().min(0).max(100)
  }),
  weights: z.object({
    reliability: z.number().min(0).max(1).default(0.25),
    security: z.number().min(0).max(1).default(0.25),
    maintainability: z.number().min(0).max(1).default(0.25),
    coverage: z.number().min(0).max(1).default(0.15),
    duplication: z.number().min(0).max(1).default(0.10)
  }),
  rating: z.nativeEnum(QualityRating),
  calculationMethod: z.string().default('weighted_average'),
  calculatedAt: z.date().default(() => new Date())
});

/**
 * Quality comparison schema
 */
export const qualityComparisonSchema = z.object({
  repositoryId: z.string().uuid(),
  baselineScore: qualityScoreSchema,
  currentScore: qualityScoreSchema,
  improvement: z.number(),
  degradation: z.number(),
  netChange: z.number(),
  significantChanges: z.array(z.object({
    metric: z.string(),
    oldValue: z.number(),
    newValue: z.number(),
    change: z.number(),
    isImprovement: z.boolean()
  })),
  comparisonDate: z.date().default(() => new Date()),
  baseReference: z.string().optional() // Git ref or timestamp
});

/**
 * Effort estimate schema for refactoring
 */
export const effortEstimateSchema = z.object({
  totalMinutes: z.number().int().min(0),
  breakdown: z.object({
    analysis: z.number().int().min(0),
    implementation: z.number().int().min(0),
    testing: z.number().int().min(0),
    review: z.number().int().min(0)
  }),
  confidence: z.number().min(0).max(1),
  riskMultiplier: z.number().min(1),
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
  assumptions: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  estimatedBy: z.string().optional(),
  estimatedAt: z.date().default(() => new Date())
});

/**
 * Refactoring priority schema
 */
export const refactoringPrioritySchema = z.object({
  suggestionId: z.string().uuid(),
  priority: z.nativeEnum(Priority),
  score: z.number().min(0).max(100),
  factors: z.object({
    businessValue: z.number().min(0).max(10),
    technicalImpact: z.number().min(0).max(10),
    riskLevel: z.number().min(0).max(10),
    effortRequired: z.number().min(0).max(10),
    urgency: z.number().min(0).max(10)
  }),
  reasoning: z.string(),
  calculatedAt: z.date().default(() => new Date())
});

/**
 * Quality gate status schema
 */
export const qualityGateStatusSchema = z.object({
  repositoryId: z.string().uuid(),
  status: z.enum(['PASSED', 'FAILED', 'PENDING', 'ERROR']),
  gates: z.array(qualityGateResultSchema),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
  canProceed: z.boolean(),
  message: z.string().optional(),
  lastEvaluation: z.date().default(() => new Date())
});

// ===================
// TYPESCRIPT INFERENCE TYPES
// ===================

export type QualityMetrics = z.infer<typeof qualityMetricsSchema>;
export type CodeSmell = z.infer<typeof codeSmellSchema>;
export type QualityGate = z.infer<typeof qualityGateSchema>;
export type QualityGateResult = z.infer<typeof qualityGateResultSchema>;
export type QualityGateEvaluation = z.infer<typeof qualityGateEvaluationSchema>;
export type RefactoringSuggestion = z.infer<typeof refactoringSuggestionSchema>;
export type EnhancedRefactoringSuggestion = z.infer<typeof enhancedRefactoringSuggestionSchema>;
export type CodeExample = z.infer<typeof codeExampleSchema>;
export type QualityTrendDataPoint = z.infer<typeof qualityTrendDataPointSchema>;
export type QualityTrend = z.infer<typeof qualityTrendSchema>;
export type QualityPrediction = z.infer<typeof qualityPredictionSchema>;
export type QualityAnalysisOptions = z.infer<typeof qualityAnalysisOptionsSchema>;
export type QualityAnalysisResult = z.infer<typeof qualityAnalysisResultSchema>;
export type RepositoryQualityResult = z.infer<typeof repositoryQualityResultSchema>;
export type QualityDelta = z.infer<typeof qualityDeltaSchema>;
export type TechnicalDebtMetrics = z.infer<typeof technicalDebtMetricsSchema>;
export type QualityScore = z.infer<typeof qualityScoreSchema>;
export type QualityComparison = z.infer<typeof qualityComparisonSchema>;
export type EffortEstimate = z.infer<typeof effortEstimateSchema>;
export type RefactoringPriority = z.infer<typeof refactoringPrioritySchema>;
export type QualityGateStatus = z.infer<typeof qualityGateStatusSchema>;

// Additional specialized types
export type QualityGateConfig = Omit<QualityGate, 'id' | 'createdAt' | 'updatedAt'>;
export type RepositoryAnalysisOptions = QualityAnalysisOptions & {
  includeFilePatterns?: string[];
  excludeFilePatterns?: string[];
  maxFilesToAnalyze?: number;
  analysisDepth?: 'SHALLOW' | 'DEEP' | 'COMPREHENSIVE';
};

export type UsageInfo = {
  isUsed: boolean;
  usageCount: number;
  calledBy: string[];
  referencedIn: string[];
};

export type DependencyInfo = {
  imports: string[];
  exports: string[];
  internalDependencies: string[];
  externalDependencies: string[];
};

export type SizeMetrics = {
  linesOfCode: number;
  logicalLines: number;
  commentLines: number;
  blankLines: number;
};

export type HalsteadMetrics = {
  vocabulary: number;
  length: number;
  calculatedLength: number;
  volume: number;
  difficulty: number;
  effort: number;
  timeRequiredToProgram: number;
  numberOfDeliveredBugs: number;
};

export type SecurityHotspot = {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  line: number;
  column?: number;
  recommendation: string;
};

export type DuplicationReport = {
  repositoryId: string;
  duplicateBlocks: Array<{
    id: string;
    files: string[];
    lines: number;
    tokens: number;
    startLines: number[];
    endLines: number[];
    similarity: number;
  }>;
  totalDuplicatedLines: number;
  duplicationPercentage: number;
  affectedFiles: number;
};

// ===================
// QUALITY SERVICE INTERFACES
// ===================

/**
 * Interface for code quality analysis
 */
export interface QualityAnalysisInterface {
  /**
   * Analyze a single file for quality metrics and issues
   */
  analyzeFile(fileId: string, options?: QualityAnalysisOptions): Promise<QualityAnalysisResult>;
  
  /**
   * Analyze an entire repository
   */
  analyzeRepository(repositoryId: string, options?: RepositoryAnalysisOptions): Promise<RepositoryQualityResult>;
  
  /**
   * Analyze changes between versions
   */
  analyzeChanges(repositoryId: string, changedFiles: string[]): Promise<QualityDelta>;
  
  /**
   * Generate refactoring suggestions
   */
  generateRefactoringSuggestions(fileId: string): Promise<EnhancedRefactoringSuggestion[]>;
  
  /**
   * Calculate quality score
   */
  calculateQualityScore(metrics: QualityMetrics): Promise<QualityScore>;
  
  /**
   * Evaluate quality gates
   */
  evaluateQualityGates(repositoryId: string): Promise<QualityGateEvaluation>;
}