/**
 * Codebase Analysis Services
 * 
 * Comprehensive codebase analysis and management system with support for
 * multiple Git providers, webhook integration, and automated synchronization.
 */

// Core repository management
export { RepositoryService } from './repository-service.js';
export type { RepositorySearchOptions } from './repository-service.js';

// Git provider implementations
export { GitProviderFactory } from './git-providers/index.js';
export { GitHubProvider } from './git-providers/github-provider.js';
export { GitLabProvider } from './git-providers/gitlab-provider.js';
export { BitbucketProvider } from './git-providers/bitbucket-provider.js';
export { LocalGitProvider } from './git-providers/local-git-provider.js';

// Git provider interface and utilities
export type { GitProvider } from './git-providers/index.js';
export {
  parseGitHubUrl,
  parseGitLabUrl,
  parseBitbucketUrl,
  normalizeRepositoryUrl,
  detectLanguageFromExtension,
  isBinaryFile
} from './git-providers/index.js';

// Webhook management
export { WebhookManager } from './webhook-manager.js';
export type {
  WebhookDelivery,
  WebhookConfig,
  WebhookProcessingResult
} from './webhook-manager.js';

// File scanning and processing
export { FileScanService } from './file-scan-service.js';
export type {
  FileProcessingOptions,
  FileAnalysis,
  RepositoryTreeFile
} from './file-scan-service.js';

// API Documentation Discovery (existing)
export { ApiDocumentationDiscoveryService } from './api-documentation-discovery.js';
export type { 
  ApiEndpoint,
  ApiDocumentationSource,
  FrameworkAnalysisResult,
  ApiDiscoveryResult
} from './api-documentation-discovery.js';

// Dependency Analysis (existing)
export { DependencyAnalysisService } from './dependency-analysis-service.js';
export type {
  DependencyInfo,
  SecurityVulnerability,
  DependencyAnalysisResult,
  DependencyGraph,
  DependencyNode,
  DependencyEdge
} from './dependency-analysis-service.js';

// Documentation Fetchers (existing)
export { 
  DocumentationFetcher,
  GitHubDocsFetcher,
  NpmDocsFetcher,
  ReadmeDocsFetcher 
} from './documentation-fetchers.js';
export type {
  DocumentationResult,
  DocumentationMetadata
} from './documentation-fetchers.js';

// Code Parser & AST Service
export { CodeParserService } from './code-parser-service.js';

// Code Chunking Service
export { CodeChunkingService } from './code-chunking-service.js';
export type { LanguageChunker } from './code-chunking-service.js';

// Language Parsers
export { 
  ParserFactory,
  TypeScriptParser,
  PythonParser,
  JavaParser,
  GoParser,
  CppParser,
  RustParser 
} from './parsers/index.js';

// Language Chunkers
export {
  ChunkerFactory,
  TypeScriptChunker,
  PythonChunker,
  JavaChunker,
  GoChunker,
  CppChunker,
  RustChunker,
  UniversalChunker
} from './chunkers/index.js';

// Repository types (re-exported from shared types)
export type {
  Repository,
  RepositoryConfig,
  Branch,
  CodeFile,
  SyncLog,
  RepositoryWebhook,
  SyncOptions,
  SyncResult,
  RepositoryInfo,
  RepositoryTree,
  BranchInfo,
  ChangeSet,
  FileChange,
  ProcessedFilesResult,
  RepositoryStats,
  CreateRepositoryRequest,
  UpdateRepositoryRequest,
  RepositoryListResponse,
  GitProvider as GitProviderEnum,
  SyncStatus,
  SyncType,
  SyncOperationStatus
} from '../../shared/types/repository.js';

// Codebase analysis types (re-exported from shared types)
export type {
  SupportedLanguage,
  SymbolType,
  Visibility,
  SymbolScope,
  DependencyType,
  AST,
  ParseResult,
  ParseOptions,
  Parameter,
  GenericParameter,
  Decorator,
  CodeSymbol,
  CodeDependency,
  ComplexityMetrics,
  ASTCache,
  RepositoryParseOptions,
  RepositoryParseResult,
  SymbolQuery,
  DependencyGraphNode,
  DependencyGraph,
  CacheStats,
  LanguageParser,
  ParseError,
  UnsupportedLanguageError,
  // Code chunking types
  ChunkType,
  ChunkingStrategy,
  RelationshipType,
  CodeChunk,
  ChunkRelationship,
  ChunkingOptions,
  ChunkingResult,
  RelatedChunk,
  ChunkQuery,
  ChunkSearchQuery,
  ChunkSearchResult,
  ChunkingStats,
  OptimizationResult,
  ChunkingStrategyConfig
} from '../../shared/types/codebase.js';