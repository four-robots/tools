/**
 * Scraper Database Layer
 */

import { Kysely, sql } from 'kysely';
import crypto from 'crypto';
import { DatabaseConnectionManager } from '../../utils/database.js';
import type { DatabaseConfig } from '../../utils/database.js';
import type { ScrapedPage, ScrapingJob } from './types.js';
import type { ContentChunk } from '../../shared/types/content.js';
import { createSafeSearchPattern } from '../../utils/sql-security.js';

// Database schema interfaces
export interface ScraperPerformanceMetric {
  id: string;
  url: string;
  domain: string;
  processing_time_ms: number;
  content_size_bytes: number | null;
  status_code: number | null;
  error_message: string | null;
  timestamp: string;
}

// Enhanced scraped page with vector fields
export interface EnhancedScrapedPage extends ScrapedPage {
  markdown_content?: string;
  vector_id?: string;
  embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
  chunk_count: number;
  last_vectorized?: string;
}

// Content chunk from unified search schema
export interface ScrapedContentChunk {
  id: string;
  page_id: string;
  content: string;
  vector_id?: string;
  start_position?: number;
  end_position?: number;
  chunk_index?: number;
  metadata: string; // JSON
  created_at: string;
}

export interface ScraperDatabase {
  scraped_pages: ScrapedPage;
  scraping_jobs: ScrapingJob;
  scraper_performance: ScraperPerformanceMetric;
  // Note: content_chunks table is defined in unified search migration
  // We'll use it via direct queries rather than adding to this interface
}

export class ScraperDatabaseManager {
  private dbManager: DatabaseConnectionManager<ScraperDatabase>;

  constructor(config: DatabaseConfig) {
    this.dbManager = new DatabaseConnectionManager<ScraperDatabase>(config);
  }

  async initialize(): Promise<void> {
    await this.dbManager.initialize();
    await this.testConnection();
  }

  get db(): Kysely<ScraperDatabase> {
    return this.dbManager.kysely;
  }

  async healthCheck() {
    return await this.dbManager.healthCheck();
  }

  private async testConnection(): Promise<void> {
    try {
      await this.db.selectFrom('scraped_pages').select('id').limit(1).execute();
      console.log('✅ Scraper database connection verified successfully');
    } catch (error) {
      console.error('❌ Scraper database connection failed. Ensure migration service has completed:', error);
      throw new Error('Scraper database not available. Migration service may not have completed successfully.');
    }
  }

  // Scraped Pages CRUD operations
  async createPage(page: Omit<ScrapedPage, 'id' | 'created_at' | 'updated_at'>): Promise<ScrapedPage> {
    const id = crypto.randomUUID();
    const now = this.dbManager.getCurrentTimestamp();
    
    const result = await this.db
      .insertInto('scraped_pages')
      .values({
        id,
        created_at: now,
        updated_at: now,
        ...page
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    
    return result;
  }

  async getPage(id: string): Promise<ScrapedPage | undefined> {
    return await this.db
      .selectFrom('scraped_pages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getPageByUrl(url: string): Promise<ScrapedPage | undefined> {
    return await this.db
      .selectFrom('scraped_pages')
      .selectAll()
      .where('url', '=', url)
      .orderBy('scraped_at', 'desc')
      .executeTakeFirst();
  }

  async getPageByContentHash(contentHash: string): Promise<ScrapedPage | undefined> {
    return await this.db
      .selectFrom('scraped_pages')
      .selectAll()
      .where('content_hash', '=', contentHash)
      .executeTakeFirst();
  }

  async searchPages(filters: {
    url?: string;
    status?: ScrapedPage['status'];
    limit?: number;
    offset?: number;
  }): Promise<ScrapedPage[]> {
    let query = this.db.selectFrom('scraped_pages').selectAll();
    
    if (filters.url) {
      query = query.where('url', 'like', `%${filters.url}%`);
    }
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    
    query = query.orderBy('scraped_at', 'desc');
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }
    
    return await query.execute();
  }

  async updatePage(id: string, updates: Partial<ScrapedPage>): Promise<ScrapedPage> {
    const now = this.dbManager.getCurrentTimestamp();
    
    return await this.db
      .updateTable('scraped_pages')
      .set({ ...updates, updated_at: now })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deletePage(id: string): Promise<void> {
    await this.db
      .deleteFrom('scraped_pages')
      .where('id', '=', id)
      .execute();
  }

  // Scraping Jobs CRUD operations
  async createJob(job: Omit<ScrapingJob, 'id' | 'created_at' | 'updated_at'>): Promise<ScrapingJob> {
    const id = crypto.randomUUID();
    const now = this.dbManager.getCurrentTimestamp();
    
    const result = await this.db
      .insertInto('scraping_jobs')
      .values({
        id,
        created_at: now,
        updated_at: now,
        ...job
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    
    return result;
  }

  async getJob(id: string): Promise<ScrapingJob | undefined> {
    return await this.db
      .selectFrom('scraping_jobs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async getNextPendingJob(): Promise<ScrapingJob | undefined> {
    return await this.db
      .selectFrom('scraping_jobs')
      .selectAll()
      .where('status', '=', 'pending')
      .where((eb) => eb.or([
        eb('scheduled_at', 'is', null),
        eb('scheduled_at', '<=', new Date().toISOString())
      ]))
      .orderBy('priority', 'desc')
      .orderBy('created_at', 'asc')
      .executeTakeFirst();
  }

  async getJobs(filters: {
    status?: ScrapingJob['status'];
    limit?: number;
    offset?: number;
  }): Promise<ScrapingJob[]> {
    let query = this.db.selectFrom('scraping_jobs').selectAll();
    
    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    
    query = query.orderBy('created_at', 'desc');
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }
    
    return await query.execute();
  }

  async updateJob(id: string, updates: Partial<ScrapingJob>): Promise<ScrapingJob> {
    const now = new Date().toISOString();
    
    return await this.db
      .updateTable('scraping_jobs')
      .set({ ...updates, updated_at: now })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteJob(id: string): Promise<void> {
    await this.db
      .deleteFrom('scraping_jobs')
      .where('id', '=', id)
      .execute();
  }

  // Statistics and reporting
  async getStats(): Promise<{
    totalPages: number;
    totalJobs: number;
    pendingJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
  }> {
    const [pageCount, jobStats] = await Promise.all([
      this.db.selectFrom('scraped_pages').select(sql`count(*)`.as('count')).executeTakeFirstOrThrow(),
      this.db.selectFrom('scraping_jobs')
        .select([
          sql`count(*)`.as('total'),
          sql`count(case when status = 'pending' then 1 end)`.as('pending'),
          sql`count(case when status = 'running' then 1 end)`.as('running'),
          sql`count(case when status = 'completed' then 1 end)`.as('completed'),
          sql`count(case when status = 'failed' then 1 end)`.as('failed')
        ])
        .executeTakeFirstOrThrow()
    ]);
    
    return {
      totalPages: Number(pageCount.count),
      totalJobs: Number(jobStats.total),
      pendingJobs: Number(jobStats.pending),
      runningJobs: Number(jobStats.running),
      completedJobs: Number(jobStats.completed),
      failedJobs: Number(jobStats.failed)
    };
  }

  async getTopDomains(limit: number = 10): Promise<Array<{ domain: string; count: number }>> {
    const results = await this.db
      .selectFrom('scraped_pages')
      .select([
        sql`substr(url, 1, instr(substr(url, 9), '/') + 7)`.as('domain'),
        sql`count(*)`.as('count')
      ])
      .groupBy('domain')
      .orderBy('count', 'desc')
      .limit(limit)
      .execute();
    
    return results.map(r => ({
      domain: r.domain as string,
      count: Number(r.count)
    }));
  }

  get kysely() {
    return this.db;
  }

  // Performance metrics CRUD operations
  async createPerformanceMetric(metric: Omit<ScraperPerformanceMetric, 'id'>): Promise<ScraperPerformanceMetric> {
    const id = crypto.randomUUID();
    
    const result = await this.db
      .insertInto('scraper_performance')
      .values({
        id,
        ...metric
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    
    return result;
  }

  async getPerformanceMetrics(filters: {
    domain?: string;
    limit?: number;
    offset?: number;
    since?: string; // ISO timestamp
  } = {}): Promise<ScraperPerformanceMetric[]> {
    let query = this.db.selectFrom('scraper_performance').selectAll();
    
    if (filters.domain) {
      query = query.where('domain', '=', filters.domain);
    }
    if (filters.since) {
      query = query.where('timestamp', '>=', filters.since);
    }
    
    query = query.orderBy('timestamp', 'desc');
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.offset(filters.offset);
    }
    
    return await query.execute();
  }

  async getAverageProcessingTime(timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<number> {
    const since = this.getTimeframeSince(timeframe);
    
    const result = await this.db
      .selectFrom('scraper_performance')
      .select(sql`AVG(processing_time_ms)`.as('avg_time'))
      .where('timestamp', '>=', since)
      .where('error_message', 'is', null) // Only successful operations
      .executeTakeFirst();
    
    return Number(result?.avg_time || 5000); // Default fallback
  }

  async getDomainPerformanceStats(domain: string, timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    avgProcessingTime: number;
    successRate: number;
    totalRequests: number;
    avgContentSize: number;
  }> {
    const since = this.getTimeframeSince(timeframe);
    
    const stats = await this.db
      .selectFrom('scraper_performance')
      .select([
        sql`AVG(processing_time_ms)`.as('avg_time'),
        sql`COUNT(*)`.as('total'),
        sql`COUNT(CASE WHEN error_message IS NULL THEN 1 END)`.as('successful'),
        sql`AVG(content_size_bytes)`.as('avg_size')
      ])
      .where('domain', '=', domain)
      .where('timestamp', '>=', since)
      .executeTakeFirstOrThrow();
    
    return {
      avgProcessingTime: Number(stats.avg_time || 0),
      successRate: Number(stats.successful) / Number(stats.total) * 100,
      totalRequests: Number(stats.total),
      avgContentSize: Number(stats.avg_size || 0)
    };
  }

  async getPerformanceTrends(timeframe: '7d' | '30d' = '7d'): Promise<Array<{
    date: string;
    avgProcessingTime: number;
    requestCount: number;
    successRate: number;
  }>> {
    const since = this.getTimeframeSince(timeframe);
    
    const results = await this.db
      .selectFrom('scraper_performance')
      .select([
        sql`DATE(timestamp)`.as('date'),
        sql`AVG(processing_time_ms)`.as('avg_time'),
        sql`COUNT(*)`.as('count'),
        sql`(COUNT(CASE WHEN error_message IS NULL THEN 1 END) * 100.0 / COUNT(*))`.as('success_rate')
      ])
      .where('timestamp', '>=', since)
      .groupBy('date')
      .orderBy('date', 'asc')
      .execute();
    
    return results.map(r => ({
      date: r.date as string,
      avgProcessingTime: Number(r.avg_time),
      requestCount: Number(r.count),
      successRate: Number(r.success_rate)
    }));
  }

  private getTimeframeSince(timeframe: '1h' | '24h' | '7d' | '30d'): string {
    const now = new Date();
    
    switch (timeframe) {
      case '1h':
        now.setHours(now.getHours() - 1);
        break;
      case '24h':
        now.setHours(now.getHours() - 24);
        break;
      case '7d':
        now.setDate(now.getDate() - 7);
        break;
      case '30d':
        now.setDate(now.getDate() - 30);
        break;
    }
    
    return now.toISOString();
  }

  // ============================================================================
  // Enhanced Vector and Chunking Operations
  // ============================================================================

  /**
   * Update page with enhanced fields for vector support
   */
  async updatePageWithVectorInfo(pageId: string, updates: {
    markdownContent?: string;
    vectorId?: string;
    embeddingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    chunkCount?: number;
    lastVectorized?: string;
  }): Promise<void> {
    const now = this.dbManager.getCurrentTimestamp();
    
    // Build update object with only provided fields
    const updateObj: Record<string, any> = { updated_at: now };
    
    if (updates.markdownContent !== undefined) {
      updateObj.markdown_content = updates.markdownContent;
    }
    if (updates.vectorId !== undefined) {
      updateObj.vector_id = updates.vectorId;
    }
    if (updates.embeddingStatus !== undefined) {
      updateObj.embedding_status = updates.embeddingStatus;
    }
    if (updates.chunkCount !== undefined) {
      updateObj.chunk_count = updates.chunkCount;
    }
    if (updates.lastVectorized !== undefined) {
      updateObj.last_vectorized = updates.lastVectorized;
    }

    // Use raw SQL since we're extending the base table schema
    await sql`
      UPDATE scraped_pages 
      SET ${sql.raw(Object.keys(updateObj).map(key => `${key} = ?`).join(', '))}
      WHERE id = ?
    `.execute(this.db, [...Object.values(updateObj), pageId]);
  }

  /**
   * Create content chunks for a scraped page
   */
  async createContentChunks(
    pageId: string,
    chunks: Array<{
      id: string;
      content: string;
      vectorId?: string;
      startPosition?: number;
      endPosition?: number;
      chunkIndex?: number;
      metadata: any;
    }>
  ): Promise<void> {
    if (chunks.length === 0) return;

    const now = this.dbManager.getCurrentTimestamp();
    
    // Insert chunks using raw SQL to work with unified search schema
    const values = chunks.map(chunk => [
      chunk.id,
      pageId,
      'scraped_page',
      chunk.content,
      chunk.vectorId || null,
      chunk.startPosition || null,
      chunk.endPosition || null,
      chunk.chunkIndex || null,
      JSON.stringify(chunk.metadata),
      now
    ]);

    await sql`
      INSERT INTO content_chunks (
        id, parent_id, parent_type, content, vector_id,
        start_position, end_position, chunk_index, metadata, created_at
      ) VALUES ${sql.join(values.map(vals => sql`(${sql.join(vals)})`), sql`, `)}
    `.execute(this.db);
  }

  /**
   * Get content chunks for a page
   */
  async getContentChunks(pageId: string): Promise<ScrapedContentChunk[]> {
    const result = await sql<ScrapedContentChunk>`
      SELECT id, parent_id as page_id, content, vector_id,
             start_position, end_position, chunk_index, metadata, created_at
      FROM content_chunks 
      WHERE parent_id = ${pageId} AND parent_type = 'scraped_page'
      ORDER BY chunk_index ASC
    `.execute(this.db);
    
    return result.rows;
  }

  /**
   * Update chunk with vector ID
   */
  async updateChunkVectorId(chunkId: string, vectorId: string): Promise<void> {
    await sql`
      UPDATE content_chunks 
      SET vector_id = ${vectorId}
      WHERE id = ${chunkId}
    `.execute(this.db);
  }

  /**
   * Get pages that need vector processing (backfill support)
   */
  async getPagesForVectorProcessing(options: {
    missingEmbeddingsOnly?: boolean;
    domain?: string;
    limit?: number;
    offset?: number;
    dateRange?: { from?: string; to?: string };
  } = {}): Promise<ScrapedPage[]> {
    let query = sql`SELECT * FROM scraped_pages WHERE status = 'success'`;
    const conditions: any[] = [];

    if (options.missingEmbeddingsOnly) {
      // Use raw SQL to check for fields that might not exist
      conditions.push(sql`(embedding_status IS NULL OR embedding_status = 'pending' OR embedding_status = 'failed')`);
    }

    if (options.domain) {
      conditions.push(sql`url LIKE ${'%' + options.domain + '%'}`);
    }

    if (options.dateRange?.from) {
      conditions.push(sql`scraped_at >= ${options.dateRange.from}`);
    }

    if (options.dateRange?.to) {
      conditions.push(sql`scraped_at <= ${options.dateRange.to}`);
    }

    if (conditions.length > 0) {
      query = sql`${query} AND ${sql.join(conditions, sql` AND `)}`;
    }

    query = sql`${query} ORDER BY scraped_at DESC`;

    if (options.limit) {
      query = sql`${query} LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query = sql`${query} OFFSET ${options.offset}`;
    }

    const result = await query.execute(this.db);
    return result.rows as ScrapedPage[];
  }

  /**
   * Search content chunks using text search
   */
  async searchContentChunks(options: {
    query: string;
    limit?: number;
    offset?: number;
    pageIds?: string[];
  }): Promise<Array<ScrapedContentChunk & { page_url?: string; page_title?: string }>> {
    const safeSearch = createSafeSearchPattern(options.query);
    
    let query = sql`
      SELECT c.*, p.url as page_url, p.title as page_title
      FROM content_chunks c
      LEFT JOIN scraped_pages p ON c.parent_id = p.id
      WHERE c.parent_type = 'scraped_page' 
        AND c.content ILIKE ${safeSearch.pattern} ESCAPE '\\'
    `;

    if (options.pageIds && options.pageIds.length > 0) {
      query = sql`${query} AND c.parent_id = ANY(${options.pageIds})`;
    }

    query = sql`${query} ORDER BY c.created_at DESC`;

    if (options.limit) {
      query = sql`${query} LIMIT ${options.limit}`;
    }

    if (options.offset) {
      query = sql`${query} OFFSET ${options.offset}`;
    }

    const result = await query.execute(this.db);
    return result.rows as Array<ScrapedContentChunk & { page_url?: string; page_title?: string }>;
  }

  /**
   * Delete all chunks for a page
   */
  async deleteContentChunks(pageId: string): Promise<void> {
    await sql`
      DELETE FROM content_chunks 
      WHERE parent_id = ${pageId} AND parent_type = 'scraped_page'
    `.execute(this.db);
  }

  /**
   * Get vector processing statistics
   */
  async getVectorStats(): Promise<{
    totalPages: number;
    pagesWithEmbeddings: number;
    pagesWithChunks: number;
    totalChunks: number;
    averageChunksPerPage: number;
  }> {
    const [pageStats, chunkStats] = await Promise.all([
      sql`
        SELECT 
          COUNT(*) as total_pages,
          COUNT(CASE WHEN embedding_status = 'completed' THEN 1 END) as pages_with_embeddings,
          COUNT(CASE WHEN chunk_count > 0 THEN 1 END) as pages_with_chunks
        FROM scraped_pages 
        WHERE status = 'success'
      `.execute(this.db),
      sql`
        SELECT 
          COUNT(*) as total_chunks,
          AVG(chunks_per_page) as avg_chunks_per_page
        FROM (
          SELECT parent_id, COUNT(*) as chunks_per_page
          FROM content_chunks 
          WHERE parent_type = 'scraped_page'
          GROUP BY parent_id
        ) chunk_counts
      `.execute(this.db)
    ]);

    const pageRow = pageStats.rows[0] as any;
    const chunkRow = chunkStats.rows[0] as any;

    return {
      totalPages: Number(pageRow.total_pages || 0),
      pagesWithEmbeddings: Number(pageRow.pages_with_embeddings || 0),
      pagesWithChunks: Number(pageRow.pages_with_chunks || 0),
      totalChunks: Number(chunkRow.total_chunks || 0),
      averageChunksPerPage: Number(chunkRow.avg_chunks_per_page || 0)
    };
  }

  async close(): Promise<void> {
    await this.dbManager.close();
  }
}