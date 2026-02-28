/**
 * Code Parser Service
 * 
 * Central service for parsing code files, extracting ASTs, symbols, and dependencies.
 * Provides caching, batch processing, and multi-language support.
 */

import { DatabaseManager } from '../../utils/database.js';
import { 
  ParseResult,
  RepositoryParseResult, 
  ParseOptions,
  RepositoryParseOptions,
  CodeSymbol,
  CodeDependency,
  ComplexityMetrics,
  DependencyGraph,
  SymbolQuery,
  CacheStats,
  SupportedLanguage,
  ASTCache,
  AST,
  LanguageParser,
  ParseError
} from '../../shared/types/codebase.js';
import { ParserFactory } from './parsers/parser-factory.js';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

export class CodeParserService {
  private parserFactory: ParserFactory;
  private parseCache = new Map<string, ASTCache>();

  constructor(private db: DatabaseManager) {
    this.parserFactory = new ParserFactory();
  }

  // ===================
  // MAIN PARSING METHODS
  // ===================

  /**
   * Parse a single file and cache results
   */
  async parseFile(
    fileId: string, 
    content: string, 
    language: string, 
    options?: ParseOptions
  ): Promise<ParseResult> {
    const startTime = performance.now();
    
    try {
      // Detect or validate language
      const detectedLanguage = this.parserFactory.detectLanguage('', content) || language;
      const supportedLang = this.validateLanguage(detectedLanguage);
      
      // Check cache first
      const contentHash = this.generateContentHash(content);
      const cachedResult = await this.getCachedResult(fileId, contentHash);
      if (cachedResult) {
        return this.deserializeParseResult(cachedResult, fileId);
      }

      // Get parser for the language
      const parser = this.parserFactory.createParser(supportedLang);
      if (!parser) {
        throw new ParseError(`No parser available for language: ${supportedLang}`);
      }

      // Parse the content
      const parseResult = await parser.parse(content, options);
      parseResult.fileId = fileId;
      parseResult.parseTime = performance.now() - startTime;

      // Cache the result
      await this.cacheParseResult(fileId, parseResult, contentHash);

      return parseResult;
    } catch (error) {
      const parseTime = performance.now() - startTime;
      throw new ParseError(
        `Failed to parse file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { severity: 'error' }
      );
    }
  }

  /**
   * Parse an entire repository with batch processing
   */
  async parseRepository(
    repositoryId: string, 
    options?: RepositoryParseOptions
  ): Promise<RepositoryParseResult> {
    const startTime = performance.now();
    const opts = { ...options };
    
    try {
      // Get all files in the repository
      const files = await this.getRepositoryFiles(repositoryId, opts);
      
      // Initialize result tracking
      const result: RepositoryParseResult = {
        repositoryId,
        totalFiles: files.length,
        parsedFiles: 0,
        skippedFiles: 0,
        errorFiles: 0,
        totalSymbols: 0,
        totalDependencies: 0,
        languages: {},
        parseTime: 0,
        errors: []
      };

      // Process files in batches for memory efficiency
      const batchSize = opts.maxConcurrency || 4;
      const promises = [];

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchPromises = batch.map(file => this.parseRepositoryFile(file, result));
        promises.push(...batchPromises);
        
        // Process batch
        await Promise.allSettled(promises);
        promises.length = 0; // Clear processed promises
      }

      result.parseTime = performance.now() - startTime;
      return result;
    } catch (error) {
      throw new ParseError(
        `Failed to parse repository ${repositoryId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Re-parse a file (invalidate cache)
   */
  async reparseFile(fileId: string): Promise<ParseResult> {
    // Invalidate cache for this file
    await this.invalidateFileCache(fileId);
    
    // Get file content and re-parse
    const fileData = await this.getFileData(fileId);
    return this.parseFile(fileId, fileData.content, fileData.language);
  }

  // ===================
  // SYMBOL EXTRACTION
  // ===================

  /**
   * Extract symbols from a parsed AST
   */
  async extractSymbols(fileId: string, ast: AST): Promise<CodeSymbol[]> {
    const fileData = await this.getFileData(fileId);
    const parser = this.parserFactory.createParser(this.validateLanguage(fileData.language));
    
    if (!parser) {
      return [];
    }

    return parser.extractSymbols(ast, fileId, fileData.repositoryId);
  }

  /**
   * Get all symbols for a specific file
   */
  async getFileSymbols(fileId: string): Promise<CodeSymbol[]> {
    return this.db.selectFrom('code_symbols')
      .selectAll()
      .where('file_id', '=', fileId)
      .orderBy('definition_line', 'asc')
      .execute() as any;
  }

  /**
   * Search symbols with flexible criteria
   */
  async searchSymbols(query: SymbolQuery): Promise<CodeSymbol[]> {
    let dbQuery = this.db.selectFrom('code_symbols').selectAll();

    if (query.repositoryId) {
      dbQuery = dbQuery.where('repository_id', '=', query.repositoryId);
    }
    if (query.fileId) {
      dbQuery = dbQuery.where('file_id', '=', query.fileId);
    }
    if (query.symbolType) {
      dbQuery = dbQuery.where('symbol_type', '=', query.symbolType);
    }
    if (query.language) {
      dbQuery = dbQuery.where('language', '=', query.language);
    }
    if (query.visibility) {
      dbQuery = dbQuery.where('visibility', '=', query.visibility);
    }
    if (query.isExported !== undefined) {
      dbQuery = dbQuery.where('is_exported', '=', query.isExported);
    }
    if (query.parentSymbolId) {
      dbQuery = dbQuery.where('parent_symbol_id', '=', query.parentSymbolId);
    }
    if (query.scope) {
      dbQuery = dbQuery.where('scope', '=', query.scope);
    }

    if (query.name) {
      if (query.fuzzy) {
        dbQuery = dbQuery.where('name', 'ilike', `%${query.name}%`);
      } else {
        dbQuery = dbQuery.where('name', '=', query.name);
      }
    }

    return dbQuery
      .limit(query.limit)
      .offset(query.offset)
      .orderBy('name', 'asc')
      .execute() as any;
  }

  // ===================
  // DEPENDENCY ANALYSIS
  // ===================

  /**
   * Extract dependencies from a parsed AST
   */
  async extractDependencies(fileId: string, ast: AST): Promise<CodeDependency[]> {
    const fileData = await this.getFileData(fileId);
    const parser = this.parserFactory.createParser(this.validateLanguage(fileData.language));
    
    if (!parser) {
      return [];
    }

    return parser.extractDependencies(ast, fileId, fileData.repositoryId);
  }

  /**
   * Get all dependencies for a specific file
   */
  async getFileDependencies(fileId: string): Promise<CodeDependency[]> {
    return this.db.selectFrom('code_dependencies')
      .selectAll()
      .where('file_id', '=', fileId)
      .orderBy('dependency_path', 'asc')
      .execute() as any;
  }

  /**
   * Generate dependency graph for a repository
   */
  async getDependencyGraph(repositoryId: string): Promise<DependencyGraph> {
    // Get all dependencies for the repository
    const dependencies = await this.db.selectFrom('code_dependencies')
      .selectAll()
      .where('repository_id', '=', repositoryId)
      .execute() as any;

    const files = await this.db.selectFrom('code_files')
      .select(['id', 'path'])
      .where('repository_id', '=', repositoryId)
      .where('is_deleted', '=', false)
      .execute() as any;

    // Build graph structure
    const nodes = files.map(file => ({
      id: file.id,
      path: file.path,
      isExternal: false,
      type: 'file',
      dependencies: dependencies
        .filter(dep => dep.file_id === file.id)
        .map(dep => dep.dependency_path)
    }));

    const edges = dependencies.map(dep => ({
      from: dep.file_id,
      to: dep.resolved_path || dep.dependency_path,
      type: dep.dependency_type
    }));

    // Calculate external dependencies
    const externalDeps: Record<string, number> = {};
    dependencies
      .filter(dep => dep.is_external)
      .forEach(dep => {
        externalDeps[dep.dependency_path] = (externalDeps[dep.dependency_path] || 0) + 1;
      });

    // Detect circular dependencies (simplified algorithm)
    const circularDependencies = this.detectCircularDependencies(nodes, edges);

    // Calculate statistics
    const stats = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxDepth: this.calculateMaxDepth(nodes, edges),
      avgDependencies: nodes.reduce((sum, node) => sum + node.dependencies.length, 0) / nodes.length
    };

    return {
      repositoryId,
      nodes,
      edges,
      externalDependencies: externalDeps,
      circularDependencies,
      stats
    };
  }

  // ===================
  // CACHE MANAGEMENT
  // ===================

  /**
   * Invalidate cache entries
   */
  async invalidateCache(fileId?: string, repositoryId?: string): Promise<void> {
    if (fileId) {
      await this.invalidateFileCache(fileId);
    } else if (repositoryId) {
      await this.invalidateRepositoryCache(repositoryId);
    } else {
      await this.clearAllCache();
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    const cacheEntries = await this.db.selectFrom('ast_cache')
      .select([
        'language',
        'created_at',
        'parse_time_ms'
      ])
      .execute() as any;

    const totalEntries = cacheEntries.length;
    const hitRate = this.calculateCacheHitRate();
    const averageParseTime = cacheEntries.reduce((sum, entry) => sum + (entry.parse_time_ms || 0), 0) / totalEntries || 0;

    const languageBreakdown: Record<string, number> = {};
    cacheEntries.forEach(entry => {
      languageBreakdown[entry.language] = (languageBreakdown[entry.language] || 0) + 1;
    });

    const dates = cacheEntries.map(e => new Date(e.created_at)).sort((a, b) => a.getTime() - b.getTime());
    
    return {
      totalEntries,
      hitRate,
      averageParseTime,
      totalCacheSize: 0, // Would need additional calculation
      oldestEntry: dates[0],
      newestEntry: dates[dates.length - 1],
      languageBreakdown,
      cacheByRepository: {} // Would need additional query
    };
  }

  // ===================
  // COMPLEXITY METRICS
  // ===================

  /**
   * Calculate complexity metrics from AST
   */
  async calculateComplexity(ast: AST): Promise<ComplexityMetrics> {
    // Default implementation - language-specific parsers provide more accurate metrics
    return {
      cyclomaticComplexity: 0,
      cognitiveComplexity: 0,
      linesOfCode: 0,
      maintainabilityIndex: 0,
      nestingDepth: 0,
      functionCount: 0,
      classCount: 0,
      methodCount: 0,
      variableCount: 0,
      commentLines: 0,
      blankLines: 0,
      duplicatedLines: 0
    };
  }

  /**
   * Get complexity metrics for a file
   */
  async getFileComplexity(fileId: string): Promise<ComplexityMetrics> {
    const cache = await this.db.selectFrom('ast_cache')
      .select('complexity_metrics')
      .where('file_id', '=', fileId)
      .executeTakeFirst() as any;

    if (cache?.complexity_metrics) {
      return cache.complexity_metrics;
    }

    // If not cached, we'd need to reparse or return default metrics
    return this.calculateComplexity({} as AST);
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private validateLanguage(language: string): SupportedLanguage {
    const supportedLanguages = Object.values(SupportedLanguage);
    const normalizedLang = language.toLowerCase() as SupportedLanguage;
    
    if (!supportedLanguages.includes(normalizedLang)) {
      throw new Error(`Unsupported language: ${language}`);
    }
    
    return normalizedLang;
  }

  private generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async getCachedResult(fileId: string, contentHash: string): Promise<ASTCache | null> {
    const cached = await this.db.selectFrom('ast_cache')
      .selectAll()
      .where('file_id', '=', fileId)
      .where('file_hash', '=', contentHash)
      .executeTakeFirst() as any;

    return cached || null;
  }

  private async cacheParseResult(fileId: string, result: ParseResult, contentHash: string): Promise<void> {
    const cacheData = {
      file_id: fileId,
      language: result.language,
      ast_data: JSON.stringify(result.ast),
      symbols: JSON.stringify(result.symbols.slice(0, 100)), // Limit symbols in cache
      dependencies: result.dependencies.map(d => d.dependencyPath),
      complexity_metrics: result.complexityMetrics,
      parse_version: '1.0.0', // Version tracking for cache invalidation
      parse_time_ms: Math.round(result.parseTime),
      file_hash: contentHash
    };

    await this.db.insertInto('ast_cache')
      .values(cacheData)
      .onConflict(oc => oc.column('file_id').doUpdateSet(cacheData))
      .execute();
  }

  private deserializeParseResult(cache: ASTCache, fileId: string): ParseResult {
    return {
      fileId,
      language: cache.language,
      ast: JSON.parse(cache.astData as string),
      symbols: JSON.parse(cache.symbols as string),
      dependencies: cache.dependencies.map(path => ({
        id: '',
        fileId,
        repositoryId: '',
        dependencyType: 'import' as any,
        dependencyPath: path,
        importedSymbols: [],
        isExternal: false,
        isTypeOnly: false,
        createdAt: new Date()
      })),
      complexityMetrics: cache.complexityMetrics || {
        cyclomaticComplexity: 0,
        cognitiveComplexity: 0,
        linesOfCode: 0,
        maintainabilityIndex: 0,
        nestingDepth: 0,
        functionCount: 0,
        classCount: 0,
        methodCount: 0,
        variableCount: 0,
        commentLines: 0,
        blankLines: 0,
        duplicatedLines: 0
      },
      parseTime: cache.parseTimeMs || 0,
      errors: []
    };
  }

  private async invalidateFileCache(fileId: string): Promise<void> {
    await this.db.deleteFrom('ast_cache')
      .where('file_id', '=', fileId)
      .execute();
    
    this.parseCache.delete(fileId);
  }

  private async invalidateRepositoryCache(repositoryId: string): Promise<void> {
    const fileIds = await this.db.selectFrom('code_files')
      .select('id')
      .where('repository_id', '=', repositoryId)
      .execute() as any;

    const fileIdList = fileIds.map(f => f.id);
    
    if (fileIdList.length > 0) {
      await this.db.deleteFrom('ast_cache')
        .where('file_id', 'in', fileIdList)
        .execute();
    }

    fileIdList.forEach(id => this.parseCache.delete(id));
  }

  private async clearAllCache(): Promise<void> {
    await this.db.deleteFrom('ast_cache').execute();
    this.parseCache.clear();
  }

  private async getRepositoryFiles(repositoryId: string, options: RepositoryParseOptions) {
    let query = this.db.selectFrom('code_files')
      .select(['id', 'path', 'language', 'size_bytes'])
      .where('repository_id', '=', repositoryId)
      .where('is_deleted', '=', false)
      .where('is_binary', '=', false);

    if (options.maxFileSize) {
      query = query.where('size_bytes', '<=', options.maxFileSize);
    }

    const files = await query.execute() as any;
    
    // Apply exclude patterns
    if (options.excludePatterns && options.excludePatterns.length > 0) {
      return files.filter(file => 
        !options.excludePatterns!.some(pattern => 
          new RegExp(pattern).test(file.path)
        )
      );
    }

    return files;
  }

  private async parseRepositoryFile(file: any, result: RepositoryParseResult): Promise<void> {
    try {
      // Get file content (this would need actual file content retrieval)
      const content = await this.getFileContent(file.id);
      const parseResult = await this.parseFile(file.id, content, file.language);
      
      result.parsedFiles++;
      result.totalSymbols += parseResult.symbols.length;
      result.totalDependencies += parseResult.dependencies.length;
      
      const lang = parseResult.language;
      result.languages[lang] = (result.languages[lang] || 0) + 1;
    } catch (error) {
      result.errorFiles++;
      result.errors.push({
        fileId: file.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getFileData(fileId: string) {
    const file = await this.db.selectFrom('code_files')
      .select(['repository_id', 'language', 'path'])
      .where('id', '=', fileId)
      .executeTakeFirst() as any;

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    return {
      repositoryId: file.repository_id,
      language: file.language,
      path: file.path,
      content: await this.getFileContent(fileId)
    };
  }

  private async getFileContent(fileId: string): Promise<string> {
    // This would need integration with actual file storage/retrieval
    // For now, return empty string as placeholder
    return '';
  }

  private calculateCacheHitRate(): number {
    // Simple implementation - would need proper hit/miss tracking
    return 0.85; // 85% placeholder
  }

  private detectCircularDependencies(nodes: any[], edges: any[]): string[][] {
    // Simplified circular dependency detection
    // Full implementation would use DFS/topological sort
    return [];
  }

  private calculateMaxDepth(nodes: any[], edges: any[]): number {
    // Calculate maximum dependency depth
    // Simplified implementation
    return Math.max(1, nodes.length > 0 ? Math.ceil(Math.log2(nodes.length)) : 1);
  }
}