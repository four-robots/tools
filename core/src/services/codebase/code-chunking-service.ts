/**
 * Code Chunking Service
 * 
 * Intelligent semantic chunking for code files with context preservation.
 * Supports multiple chunking strategies and maintains relationships between chunks.
 * 
 * Features:
 * - Function-level, class-level, and logical-block chunking
 * - Size-based chunking with configurable overlap
 * - Context preservation with surrounding code
 * - Relationship mapping between chunks
 * - Language-specific intelligent chunking
 * - Performance optimization with caching
 */

import crypto from 'crypto';
import { DatabaseManager } from '../../utils/database.js';
import { CodeParserService } from './code-parser-service.js';
import {
  CodeChunk,
  ChunkingOptions,
  ChunkingResult,
  ChunkQuery,
  ChunkSearchQuery,
  ChunkSearchResult,
  ChunkRelationship,
  RelatedChunk,
  ChunkingStats,
  OptimizationResult,
  ChunkingStrategy,
  ChunkType,
  RelationshipType,
  SupportedLanguage,
  AST,
  ParseResult
} from '../../shared/types/codebase.js';

export interface ChunkingError {
  fileId: string;
  error: string;
  details?: string;
}

export interface LanguageChunker {
  readonly language: SupportedLanguage;
  chunkByFunctions(content: string, ast: AST, fileId: string, repositoryId: string): Promise<CodeChunk[]>;
  chunkByClasses(content: string, ast: AST, fileId: string, repositoryId: string): Promise<CodeChunk[]>;
  chunkByLogicalBlocks(content: string, ast: AST, fileId: string, repositoryId: string): Promise<CodeChunk[]>;
  chunkBySize(content: string, maxSize: number, overlap: number, fileId: string, repositoryId: string): Promise<CodeChunk[]>;
  extractRelationships(chunks: CodeChunk[]): Promise<ChunkRelationship[]>;
}

export class CodeChunkingService {
  private cache = new Map<string, CodeChunk[]>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
  private chunkerCache = new Map<SupportedLanguage, LanguageChunker>();

  constructor(
    private db: DatabaseManager,
    private codeParserService: CodeParserService
  ) {}

  /**
   * Chunk a single file with the specified options
   */
  async chunkFile(fileId: string, options?: ChunkingOptions): Promise<CodeChunk[]> {
    const cacheKey = `${fileId}:${JSON.stringify(options)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // Get file information
      const file = await this.db.selectFrom('code_files')
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst();

      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      // Parse the file if not already cached
      const parseResult = await this.codeParserService.parseFile(fileId);
      
      // Get language-specific chunker
      const chunker = await this.getLanguageChunker(parseResult.language);
      
      // Apply chunking strategy
      const chunks = await this.applyChunkingStrategy(
        file.content,
        parseResult,
        fileId,
        file.repository_id,
        options || this.getDefaultOptions(parseResult.language)
      );

      // Add context to chunks
      const chunksWithContext = await Promise.all(
        chunks.map(chunk => this.addContextToChunk(chunk, options?.contextLines || 3, file.content))
      );

      // Cache results
      this.cache.set(cacheKey, chunksWithContext);
      setTimeout(() => this.cache.delete(cacheKey), this.CACHE_TTL);

      // Store in database
      await this.storeChunks(chunksWithContext);

      return chunksWithContext;
    } catch (error) {
      throw new Error(`Failed to chunk file ${fileId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Chunk all files in a repository
   */
  async chunkRepository(repositoryId: string, options?: ChunkingOptions): Promise<ChunkingResult> {
    const startTime = Date.now();
    const errors: ChunkingError[] = [];
    const chunksPerFile: Record<string, number> = {};
    let totalChunks = 0;
    let totalSize = 0;

    try {
      // Get all files in repository
      const files = await this.db.selectFrom('code_files')
        .selectAll()
        .where('repository_id', '=', repositoryId)
        .execute();

      // Process files in parallel batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (file) => {
          try {
            const chunks = await this.chunkFile(file.id, options);
            chunksPerFile[file.id] = chunks.length;
            totalChunks += chunks.length;
            totalSize += chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
          } catch (error) {
            errors.push({
              fileId: file.id,
              error: error instanceof Error ? error.message : 'Unknown error',
              details: error instanceof Error ? error.stack : undefined
            });
          }
        }));
      }

      // Build relationships between chunks
      if (totalChunks > 0) {
        await this.buildRepositoryRelationships(repositoryId);
      }

      const processingTime = Date.now() - startTime;
      const averageChunkSize = totalChunks > 0 ? totalSize / totalChunks : 0;

      return {
        repositoryId,
        totalFiles: files.length,
        totalChunks,
        chunksPerFile,
        averageChunkSize,
        processingTime,
        errors,
        strategies: {} // Populated by specific strategy usage
      };
    } catch (error) {
      throw new Error(`Failed to chunk repository ${repositoryId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Re-chunk a file (useful when file content changes)
   */
  async rechunkFile(fileId: string, options?: ChunkingOptions): Promise<CodeChunk[]> {
    // Clear cache and existing chunks
    await this.invalidateChunks(fileId);
    
    // Remove existing chunks from database
    await this.db.deleteFrom('code_chunks')
      .where('file_id', '=', fileId)
      .execute();

    // Chunk again
    return this.chunkFile(fileId, options);
  }

  /**
   * Apply the appropriate chunking strategy
   */
  private async applyChunkingStrategy(
    content: string,
    parseResult: ParseResult,
    fileId: string,
    repositoryId: string,
    options: ChunkingOptions
  ): Promise<CodeChunk[]> {
    const chunker = await this.getLanguageChunker(parseResult.language);
    
    switch (options.strategy) {
      case ChunkingStrategy.FUNCTION_BASED:
        return chunker.chunkByFunctions(content, parseResult.ast, fileId, repositoryId);
      
      case ChunkingStrategy.CLASS_BASED:
        return chunker.chunkByClasses(content, parseResult.ast, fileId, repositoryId);
      
      case ChunkingStrategy.LOGICAL_BLOCK:
        return chunker.chunkByLogicalBlocks(content, parseResult.ast, fileId, repositoryId);
      
      case ChunkingStrategy.SIZE_BASED:
        return chunker.chunkBySize(content, options.maxChunkSize, options.overlapLines, fileId, repositoryId);
      
      case ChunkingStrategy.INTELLIGENT:
      case ChunkingStrategy.HYBRID:
        return this.applyIntelligentChunking(content, parseResult, fileId, repositoryId, options);
      
      default:
        return chunker.chunkByFunctions(content, parseResult.ast, fileId, repositoryId);
    }
  }

  /**
   * Apply intelligent chunking that combines multiple strategies
   */
  private async applyIntelligentChunking(
    content: string,
    parseResult: ParseResult,
    fileId: string,
    repositoryId: string,
    options: ChunkingOptions
  ): Promise<CodeChunk[]> {
    const chunker = await this.getLanguageChunker(parseResult.language);
    
    // Combine function and class chunks
    const functionChunks = await chunker.chunkByFunctions(content, parseResult.ast, fileId, repositoryId);
    const classChunks = await chunker.chunkByClasses(content, parseResult.ast, fileId, repositoryId);
    
    // Merge and deduplicate
    const allChunks = [...functionChunks, ...classChunks];
    const deduplicatedChunks = this.deduplicateChunks(allChunks);
    
    // Fill gaps with logical blocks
    const gaps = this.findChunkingGaps(deduplicatedChunks, content.split('\n').length);
    const gapChunks = await this.chunkGaps(gaps, content, fileId, repositoryId, options);
    
    return [...deduplicatedChunks, ...gapChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  /**
   * Add context lines before and after a chunk
   */
  async addContextToChunk(chunk: CodeChunk, contextLines: number, fullContent?: string): Promise<CodeChunk> {
    if (contextLines === 0 || !fullContent) {
      return chunk;
    }

    const lines = fullContent.split('\n');
    const startContext = Math.max(0, chunk.startLine - 1 - contextLines);
    const endContext = Math.min(lines.length - 1, chunk.endLine - 1 + contextLines);

    const contextBefore = lines.slice(startContext, chunk.startLine - 1).join('\n');
    const contextAfter = lines.slice(chunk.endLine, endContext + 1).join('\n');

    return {
      ...chunk,
      contextBefore: contextBefore || undefined,
      contextAfter: contextAfter || undefined
    };
  }

  /**
   * Find related chunks based on relationships
   */
  async findRelatedChunks(chunkId: string, maxDistance: number = 2): Promise<RelatedChunk[]> {
    const relationships = await this.db.selectFrom('chunk_relationships as cr')
      .innerJoin('code_chunks as target', 'target.id', 'cr.target_chunk_id')
      .selectAll('target')
      .select(['cr.relationship_type', 'cr.strength'])
      .where('cr.source_chunk_id', '=', chunkId)
      .orderBy('cr.strength', 'desc')
      .execute();

    return relationships.map((rel, index) => ({
      chunk: this.dbRowToChunk(rel),
      relationshipType: rel.relationship_type as RelationshipType,
      strength: Number(rel.strength),
      distance: Math.min(index + 1, maxDistance)
    }));
  }

  /**
   * Build relationships between chunks
   */
  async buildChunkRelationships(chunks: CodeChunk[]): Promise<ChunkRelationship[]> {
    const relationships: ChunkRelationship[] = [];

    // Build relationships using language-specific logic
    for (const chunk of chunks) {
      const chunker = await this.getLanguageChunker(chunk.language);
      const chunkRelationships = await chunker.extractRelationships([chunk]);
      relationships.push(...chunkRelationships);
    }

    return relationships;
  }

  /**
   * Get chunks for a specific file
   */
  async getFileChunks(fileId: string, options?: ChunkQuery): Promise<CodeChunk[]> {
    let query = this.db.selectFrom('code_chunks')
      .selectAll()
      .where('file_id', '=', fileId);

    if (options?.chunkType) {
      query = query.where('chunk_type', '=', options.chunkType);
    }

    if (options?.symbolName) {
      query = query.where('symbol_name', 'ilike', `%${options.symbolName}%`);
    }

    if (options?.startLine) {
      query = query.where('start_line', '>=', options.startLine);
    }

    if (options?.endLine) {
      query = query.where('end_line', '<=', options.endLine);
    }

    query = query
      .orderBy(options?.sortBy || 'chunk_index', options?.sortOrder || 'asc')
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    const results = await query.execute();
    return results.map(this.dbRowToChunk);
  }

  /**
   * Search chunks by content and metadata
   */
  async searchChunks(query: ChunkSearchQuery): Promise<ChunkSearchResult> {
    const startTime = Date.now();
    
    let dbQuery = this.db.selectFrom('code_chunks')
      .selectAll();

    // Apply filters
    if (query.repositoryId) {
      dbQuery = dbQuery.where('repository_id', '=', query.repositoryId);
    }

    if (query.fileId) {
      dbQuery = dbQuery.where('file_id', '=', query.fileId);
    }

    if (query.chunkTypes && query.chunkTypes.length > 0) {
      dbQuery = dbQuery.where('chunk_type', 'in', query.chunkTypes);
    }

    if (query.languages && query.languages.length > 0) {
      dbQuery = dbQuery.where('language', 'in', query.languages);
    }

    // Text search
    if (query.includeContent) {
      if (query.caseSensitive) {
        dbQuery = dbQuery.where('content', 'like', `%${query.query}%`);
      } else {
        dbQuery = dbQuery.where('content', 'ilike', `%${query.query}%`);
      }
    }

    // Search in symbol names
    if (query.caseSensitive) {
      dbQuery = dbQuery.orWhere('symbol_name', 'like', `%${query.query}%`);
    } else {
      dbQuery = dbQuery.orWhere('symbol_name', 'ilike', `%${query.query}%`);
    }

    // Apply pagination
    dbQuery = dbQuery
      .orderBy('created_at', 'desc')
      .limit(query.limit)
      .offset(query.offset);

    const results = await dbQuery.execute();
    const chunks = results.map(this.dbRowToChunk);

    const searchTime = Date.now() - startTime;

    return {
      chunks,
      totalResults: chunks.length,
      searchTime,
      query: query.query,
      suggestions: [] // Could be enhanced with search suggestions
    };
  }

  /**
   * Get chunks by symbol name
   */
  async getChunksBySymbol(symbolName: string, symbolType?: string): Promise<CodeChunk[]> {
    let query = this.db.selectFrom('code_chunks')
      .selectAll()
      .where('symbol_name', '=', symbolName);

    if (symbolType) {
      query = query.where('symbol_type', '=', symbolType);
    }

    const results = await query.execute();
    return results.map(this.dbRowToChunk);
  }

  /**
   * Invalidate chunk cache
   */
  async invalidateChunks(fileId?: string, repositoryId?: string): Promise<void> {
    if (fileId) {
      // Clear file-specific cache
      const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(fileId));
      keysToDelete.forEach(key => this.cache.delete(key));
    } else if (repositoryId) {
      // Clear repository-specific cache (would need file lookup)
      this.cache.clear();
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  /**
   * Optimize chunking for a repository
   */
  async optimizeChunking(repositoryId: string): Promise<OptimizationResult> {
    const startTime = Date.now();

    // Get current chunk stats
    const originalStats = await this.getChunkingStats(repositoryId);
    
    // Remove duplicate chunks
    const duplicatesRemoved = await this.removeDuplicateChunks(repositoryId);
    
    // Rebuild relationships
    const relationshipsAdded = await this.buildRepositoryRelationships(repositoryId);
    
    // Get optimized stats
    const optimizedStats = await this.getChunkingStats(repositoryId);
    
    const optimizationTime = Date.now() - startTime;

    return {
      repositoryId,
      originalChunkCount: originalStats.totalChunks,
      optimizedChunkCount: optimizedStats.totalChunks,
      duplicatesRemoved,
      relationshipsAdded,
      qualityImprovements: {
        cohesion: optimizedStats.qualityMetrics.chunkCohesion - originalStats.qualityMetrics.chunkCohesion,
        contextPreservation: optimizedStats.qualityMetrics.contextPreservation - originalStats.qualityMetrics.contextPreservation,
        deduplication: optimizedStats.qualityMetrics.deduplicationRate - originalStats.qualityMetrics.deduplicationRate
      },
      optimizationTime,
      recommendations: this.generateOptimizationRecommendations(originalStats, optimizedStats)
    };
  }

  /**
   * Get chunking statistics
   */
  async getChunkingStats(repositoryId?: string): Promise<ChunkingStats> {
    let query = this.db.selectFrom('code_chunks').selectAll();
    
    if (repositoryId) {
      query = query.where('repository_id', '=', repositoryId);
    }

    const chunks = await query.execute();
    const relationships = await this.db.selectFrom('chunk_relationships')
      .selectAll()
      .execute();

    // Calculate statistics
    const totalChunks = chunks.length;
    const chunksByType: Record<string, number> = {};
    const chunksByLanguage: Record<string, number> = {};
    const chunksByFile: Record<string, number> = {};
    const sizes = chunks.map(c => c.content.length);

    chunks.forEach(chunk => {
      chunksByType[chunk.chunk_type] = (chunksByType[chunk.chunk_type] || 0) + 1;
      chunksByLanguage[chunk.language] = (chunksByLanguage[chunk.language] || 0) + 1;
      chunksByFile[chunk.file_id] = (chunksByFile[chunk.file_id] || 0) + 1;
    });

    const averageChunkSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    const sortedSizes = sizes.sort((a, b) => a - b);
    const medianChunkSize = sortedSizes.length > 0 ? sortedSizes[Math.floor(sortedSizes.length / 2)] : 0;
    const totalLinesChunked = chunks.reduce((sum, chunk) => sum + (chunk.end_line - chunk.start_line + 1), 0);

    // Relationship statistics
    const relationshipsByType: Record<string, number> = {};
    relationships.forEach(rel => {
      relationshipsByType[rel.relationship_type] = (relationshipsByType[rel.relationship_type] || 0) + 1;
    });

    const averageRelationshipsPerChunk = totalChunks > 0 ? relationships.length / totalChunks : 0;

    // Quality metrics (simplified calculations)
    const chunkCohesion = this.calculateChunkCohesion(chunks);
    const contextPreservation = this.calculateContextPreservation(chunks);
    const deduplicationRate = this.calculateDeduplicationRate(chunks);

    return {
      repositoryId,
      totalChunks,
      chunksByType,
      chunksByLanguage,
      chunksByFile,
      averageChunkSize,
      medianChunkSize,
      totalLinesChunked,
      relationshipStats: {
        totalRelationships: relationships.length,
        relationshipsByType,
        averageRelationshipsPerChunk
      },
      qualityMetrics: {
        chunkCohesion,
        contextPreservation,
        deduplicationRate
      }
    };
  }

  // Private helper methods

  private async getLanguageChunker(language: SupportedLanguage): Promise<LanguageChunker> {
    if (this.chunkerCache.has(language)) {
      return this.chunkerCache.get(language)!;
    }

    // Dynamic import of language-specific chunker
    try {
      const { default: ChunkerClass } = await import(`./chunkers/${language}-chunker.js`);
      const chunker = new ChunkerClass();
      this.chunkerCache.set(language, chunker);
      return chunker;
    } catch (error) {
      // Fall back to universal chunker
      const { UniversalChunker } = await import('./chunkers/universal-chunker.js');
      const chunker = new UniversalChunker(language);
      this.chunkerCache.set(language, chunker);
      return chunker;
    }
  }

  private getDefaultOptions(language: SupportedLanguage): ChunkingOptions {
    return {
      strategy: ChunkingStrategy.INTELLIGENT,
      maxChunkSize: 2000,
      minChunkSize: 50,
      overlapLines: 5,
      contextLines: 3,
      includeComments: true,
      includeImports: true,
      preserveStructure: true,
      respectLanguageRules: true,
      generateEmbeddings: false
    };
  }

  private async storeChunks(chunks: CodeChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    await this.db.insertInto('code_chunks')
      .values(chunks.map(chunk => ({
        id: chunk.id,
        file_id: chunk.fileId,
        repository_id: chunk.repositoryId,
        chunk_type: chunk.chunkType,
        chunk_index: chunk.chunkIndex,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        start_column: chunk.startColumn,
        end_column: chunk.endColumn,
        content: chunk.content,
        content_hash: chunk.contentHash,
        language: chunk.language,
        symbol_name: chunk.symbolName,
        symbol_type: chunk.symbolType,
        parent_chunk_id: chunk.parentChunkId,
        context_before: chunk.contextBefore,
        context_after: chunk.contextAfter,
        metadata: JSON.stringify(chunk.metadata),
        created_at: chunk.createdAt,
        updated_at: chunk.updatedAt
      })))
      .onConflict((oc) => oc.column('id').doUpdateSet({
        content: (eb) => eb.ref('excluded.content'),
        content_hash: (eb) => eb.ref('excluded.content_hash'),
        updated_at: (eb) => eb.ref('excluded.updated_at')
      }))
      .execute();
  }

  private deduplicateChunks(chunks: CodeChunk[]): CodeChunk[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      if (seen.has(chunk.contentHash)) {
        return false;
      }
      seen.add(chunk.contentHash);
      return true;
    });
  }

  private findChunkingGaps(chunks: CodeChunk[], totalLines: number): Array<{start: number, end: number}> {
    const gaps: Array<{start: number, end: number}> = [];
    const sortedChunks = chunks.sort((a, b) => a.startLine - b.startLine);
    
    let currentLine = 1;
    for (const chunk of sortedChunks) {
      if (chunk.startLine > currentLine) {
        gaps.push({ start: currentLine, end: chunk.startLine - 1 });
      }
      currentLine = Math.max(currentLine, chunk.endLine + 1);
    }
    
    if (currentLine <= totalLines) {
      gaps.push({ start: currentLine, end: totalLines });
    }
    
    return gaps.filter(gap => gap.end - gap.start >= 5); // Only significant gaps
  }

  private async chunkGaps(
    gaps: Array<{start: number, end: number}>,
    content: string,
    fileId: string,
    repositoryId: string,
    options: ChunkingOptions
  ): Promise<CodeChunk[]> {
    const lines = content.split('\n');
    const chunks: CodeChunk[] = [];
    
    gaps.forEach((gap, index) => {
      const gapContent = lines.slice(gap.start - 1, gap.end).join('\n');
      if (gapContent.trim()) {
        chunks.push({
          id: crypto.randomUUID(),
          fileId,
          repositoryId,
          chunkType: ChunkType.BLOCK,
          chunkIndex: 1000 + index, // Ensure gaps come after main chunks
          startLine: gap.start,
          endLine: gap.end,
          content: gapContent,
          contentHash: crypto.createHash('sha256').update(gapContent).digest('hex'),
          language: SupportedLanguage.TYPESCRIPT, // Would be determined properly
          metadata: { isGapChunk: true },
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    });
    
    return chunks;
  }

  private async buildRepositoryRelationships(repositoryId: string): Promise<number> {
    // This would implement cross-chunk relationship analysis
    // For now, return 0 as placeholder
    return 0;
  }

  private async removeDuplicateChunks(repositoryId: string): Promise<number> {
    const result = await this.db
      .with('duplicates', (db) => 
        db.selectFrom('code_chunks')
          .select(['content_hash', (eb) => eb.fn.count('id').as('chunk_count')])
          .where('repository_id', '=', repositoryId)
          .groupBy('content_hash')
          .having((eb) => eb.fn.count('id'), '>', 1)
      )
      .deleteFrom('code_chunks')
      .where('repository_id', '=', repositoryId)
      .where('content_hash', 'in', (eb) => 
        eb.selectFrom('duplicates').select('content_hash')
      )
      .where('id', 'not in', (eb) =>
        eb.selectFrom('code_chunks')
          .select((eb2) => eb2.fn.min('id').as('min_id'))
          .where('repository_id', '=', repositoryId)
          .groupBy('content_hash')
      )
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0);
  }

  private generateOptimizationRecommendations(
    originalStats: ChunkingStats,
    optimizedStats: ChunkingStats
  ): string[] {
    const recommendations: string[] = [];
    
    if (optimizedStats.totalChunks < originalStats.totalChunks * 0.8) {
      recommendations.push('Consider increasing chunk granularity for better context preservation');
    }
    
    if (optimizedStats.qualityMetrics.chunkCohesion < 0.7) {
      recommendations.push('Review chunking strategy for better logical unit preservation');
    }
    
    if (optimizedStats.relationshipStats.averageRelationshipsPerChunk < 1.0) {
      recommendations.push('Enhance relationship detection between chunks');
    }
    
    return recommendations;
  }

  private calculateChunkCohesion(chunks: any[]): number {
    // Simplified cohesion calculation
    const functionsWithNames = chunks.filter(c => c.chunk_type === 'function' && c.symbol_name).length;
    return chunks.length > 0 ? functionsWithNames / chunks.length : 0;
  }

  private calculateContextPreservation(chunks: any[]): number {
    // Simplified context preservation calculation
    const chunksWithContext = chunks.filter(c => c.context_before || c.context_after).length;
    return chunks.length > 0 ? chunksWithContext / chunks.length : 0;
  }

  private calculateDeduplicationRate(chunks: any[]): number {
    // Simplified deduplication rate calculation
    const uniqueHashes = new Set(chunks.map(c => c.content_hash));
    return chunks.length > 0 ? uniqueHashes.size / chunks.length : 0;
  }

  private dbRowToChunk(row: any): CodeChunk {
    return {
      id: row.id,
      fileId: row.file_id,
      repositoryId: row.repository_id,
      chunkType: row.chunk_type,
      chunkIndex: row.chunk_index,
      startLine: row.start_line,
      endLine: row.end_line,
      startColumn: row.start_column,
      endColumn: row.end_column,
      content: row.content,
      contentHash: row.content_hash,
      language: row.language,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      parentChunkId: row.parent_chunk_id,
      contextBefore: row.context_before,
      contextAfter: row.context_after,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}