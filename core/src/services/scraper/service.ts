/**
 * Web Scraper Service Layer
 * 
 * Core business logic for web scraping operations
 */

import { ScraperDatabaseManager } from './database.js';
import { ScrapingEngine } from './engine.js';
import { validateInput } from '../../utils/validation.js';
import type {
  ScrapeUrlInput,
  BatchScrapeInput,
  ScheduleJobInput,
  GetPageInput,
  ProcessedScrapeUrlInput,
  ProcessedBatchScrapeInput,
  ScrapedContent,
  ScrapingJobInfo,
  BatchScrapeResults,
  ScraperStats
} from './types.js';
import {
  ScrapeUrlSchema,
  BatchScrapeSchema,
  ScheduleJobSchema,
  GetPageSchema
} from './types.js';

export class ScraperService {
  private processingJobs = new Map<string, Promise<void>>();
  private jobProcessorInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor(
    private database: ScraperDatabaseManager,
    private engine: ScrapingEngine
  ) {}

  async scrapeUrl(input: ScrapeUrlInput): Promise<ScrapedContent> {
    const args = validateInput(ScrapeUrlSchema, input) as ProcessedScrapeUrlInput;
    const startTime = Date.now();
    
    try {
      // Check if we already have this content (deduplication)
      const existing = await this.database.getPageByUrl(args.url);
      if (existing && existing.status === 'success') {
        // Return existing content if scraped recently (within 1 hour)
        const scrapedAt = new Date(existing.scraped_at);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        if (scrapedAt > hourAgo) {
          return this.convertToScrapedContent(existing);
        }
      }

      // Perform the scraping
      const scrapedContent = await this.engine.scrapeUrl(args);
      const processingTime = Date.now() - startTime;
      
      // Extract domain from URL
      const domain = this.extractDomain(scrapedContent.url);
      
      // Store performance metrics
      await this.database.createPerformanceMetric({
        url: scrapedContent.url,
        domain,
        processing_time_ms: processingTime,
        content_size_bytes: scrapedContent.content?.length || null,
        status_code: null, // TODO: Add status code tracking to scraping engine
        error_message: scrapedContent.errorMessage || null,
        timestamp: new Date().toISOString()
      });
      
      // Store in database
      const pageRecord = await this.database.createPage({
        url: scrapedContent.url,
        title: scrapedContent.title || null,
        content: scrapedContent.content,
        content_hash: scrapedContent.contentHash,
        metadata: JSON.stringify(scrapedContent.metadata),
        scraped_at: scrapedContent.scrapedAt,
        status: scrapedContent.status,
        error_message: scrapedContent.errorMessage || null
      });

      return this.convertToScrapedContent(pageRecord);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const domain = this.extractDomain(args.url);
      
      // Store failed performance metrics
      await this.database.createPerformanceMetric({
        url: args.url,
        domain,
        processing_time_ms: processingTime,
        content_size_bytes: null,
        status_code: null,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      console.error('Failed to scrape URL:', error);
      throw error;
    }
  }

  async batchScrape(input: BatchScrapeInput): Promise<BatchScrapeResults> {
    const args = validateInput(BatchScrapeSchema, input) as ProcessedBatchScrapeInput;
    const startTime = Date.now();
    
    const successful: ScrapedContent[] = [];
    const failed: Array<{ url: string; error: string }> = [];
    
    // Process URLs with concurrency limit
    const concurrency = args.options?.concurrency || 3;
    const delay = args.options?.delay || 1000;
    
    for (let i = 0; i < args.urls.length; i += concurrency) {
      const batch = args.urls.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (url) => {
        try {
          // Now that schemas are compatible, we can pass options directly
          const result = await this.scrapeUrl({
            url,
            selector: args.selector,
            options: args.options
          });
          successful.push(result);
        } catch (error) {
          failed.push({
            url,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });
      
      await Promise.all(batchPromises);
      
      // Add delay between batches
      if (i + concurrency < args.urls.length && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    return {
      successful,
      failed,
      summary: {
        total: args.urls.length,
        successful: successful.length,
        failed: failed.length,
        processingTimeMs
      }
    };
  }

  async scheduleJob(input: ScheduleJobInput): Promise<ScrapingJobInfo> {
    const args = validateInput(ScheduleJobSchema, input);
    
    try {
      const jobRecord = await this.database.createJob({
        url: args.url,
        selector: args.selector || null,
        options: JSON.stringify(args.options || {}),
        status: 'pending',
        priority: args.priority || 5,
        scheduled_at: args.scheduledAt || null,
        started_at: null,
        completed_at: null,
        error_message: null,
        result_page_id: null
      });

      return this.convertToJobInfo(jobRecord);
    } catch (error) {
      console.error('Failed to schedule job:', error);
      throw error;
    }
  }

  async getJob(jobId: string): Promise<ScrapingJobInfo | null> {
    const job = await this.database.getJob(jobId);
    if (!job) return null;

    const jobInfo = this.convertToJobInfo(job);

    // If job is completed and has a result, fetch the scraped content
    if (job.status === 'completed' && job.result_page_id) {
      const page = await this.database.getPage(job.result_page_id);
      if (page) {
        jobInfo.result = this.convertToScrapedContent(page);
      }
    }

    return jobInfo;
  }

  async getJobs(filters: { status?: 'pending' | 'running' | 'completed' | 'failed'; limit?: number; offset?: number } = {}): Promise<ScrapingJobInfo[]> {
    const jobs = await this.database.getJobs(filters);
    return jobs.map(job => this.convertToJobInfo(job));
  }

  async getPages(input: GetPageInput): Promise<ScrapedContent[]> {
    const args = validateInput(GetPageSchema, input);
    
    const filters: any = {
      limit: args.limit,
      offset: args.offset
    };

    if (args.url) {
      filters.url = args.url;
    }

    let pages;
    if (args.contentHash) {
      const page = await this.database.getPageByContentHash(args.contentHash);
      pages = page ? [page] : [];
    } else {
      pages = await this.database.searchPages(filters);
    }

    return pages.map(page => this.convertToScrapedContent(page));
  }

  async getStats(): Promise<ScraperStats> {
    try {
      const [basicStats, topDomains, avgProcessingTime] = await Promise.all([
        this.database.getStats(),
        this.database.getTopDomains(10),
        this.database.getAverageProcessingTime('24h')
      ]);

      return {
        ...basicStats,
        averageProcessingTime: avgProcessingTime,
        topDomains
      };
    } catch (error) {
      console.error('Failed to get scraper stats:', error);
      throw error;
    }
  }

  // Job processing methods
  async processNextJob(): Promise<boolean> {
    const job = await this.database.getNextPendingJob();
    if (!job) return false;

    // Avoid processing the same job concurrently
    if (this.processingJobs.has(job.id)) {
      return false;
    }

    const processingPromise = this.processJob(job.id);
    this.processingJobs.set(job.id, processingPromise);

    try {
      await processingPromise;
      return true;
    } finally {
      this.processingJobs.delete(job.id);
    }
  }

  private async processJob(jobId: string): Promise<void> {
    try {
      // Mark job as running
      await this.database.updateJob(jobId, {
        status: 'running',
        started_at: new Date().toISOString()
      });

      const job = await this.database.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Parse job options
      const options = JSON.parse(job.options);

      // Perform the scraping
      const scrapedContent = await this.engine.scrapeUrl({
        url: job.url,
        selector: job.selector || undefined,
        options
      });

      // Store the result
      const pageRecord = await this.database.createPage({
        url: scrapedContent.url,
        title: scrapedContent.title || null,
        content: scrapedContent.content,
        content_hash: scrapedContent.contentHash,
        metadata: JSON.stringify(scrapedContent.metadata),
        scraped_at: scrapedContent.scrapedAt,
        status: scrapedContent.status,
        error_message: scrapedContent.errorMessage || null
      });

      // Update job as completed
      await this.database.updateJob(jobId, {
        status: scrapedContent.status === 'success' ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        result_page_id: pageRecord.id,
        error_message: scrapedContent.errorMessage || null
      });

    } catch (error) {
      console.error(`Failed to process job ${jobId}:`, error);
      
      // Mark job as failed
      await this.database.updateJob(jobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async startJobProcessor(intervalMs: number = 5000): Promise<void> {
    if (this.jobProcessorInterval) {
      clearInterval(this.jobProcessorInterval);
    }
    this.jobProcessorInterval = setInterval(() => {
      this.processNextJob().catch(error => {
        console.error('Error in job processor:', error);
      });
    }, intervalMs);
  }

  stopJobProcessor(): void {
    if (this.jobProcessorInterval) {
      clearInterval(this.jobProcessorInterval);
      this.jobProcessorInterval = null;
    }
  }

  // Performance monitoring methods
  async getPerformanceMetrics(filters: {
    domain?: string;
    limit?: number;
    offset?: number;
    since?: string;
  } = {}) {
    return await this.database.getPerformanceMetrics(filters);
  }

  async getDomainPerformanceStats(domain: string, timeframe: '1h' | '24h' | '7d' | '30d' = '24h') {
    return await this.database.getDomainPerformanceStats(domain, timeframe);
  }

  async getPerformanceTrends(timeframe: '7d' | '30d' = '7d') {
    return await this.database.getPerformanceTrends(timeframe);
  }

  async getDetailedStats(timeframe: '1h' | '24h' | '7d' | '30d' = '24h') {
    try {
      const [
        basicStats,
        topDomains,
        avgProcessingTime,
        performanceTrends
      ] = await Promise.all([
        this.database.getStats(),
        this.database.getTopDomains(10),
        this.database.getAverageProcessingTime(timeframe),
        this.database.getPerformanceTrends(timeframe === '1h' || timeframe === '24h' ? '7d' : '30d')
      ]);

      return {
        ...basicStats,
        averageProcessingTime: avgProcessingTime,
        topDomains,
        performanceTrends,
        timeframe
      };
    } catch (error) {
      console.error('Failed to get detailed stats:', error);
      throw error;
    }
  }

  // Helper methods
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      // Fallback for malformed URLs
      const match = url.match(/^https?:\/\/([^\/]+)/);
      return match ? match[1] : 'unknown';
    }
  }

  private convertToScrapedContent(pageRecord: any): ScrapedContent {
    return {
      id: pageRecord.id,
      url: pageRecord.url,
      title: pageRecord.title || undefined,
      content: pageRecord.content,
      contentHash: pageRecord.content_hash,
      metadata: JSON.parse(pageRecord.metadata),
      scrapedAt: pageRecord.scraped_at,
      status: pageRecord.status,
      errorMessage: pageRecord.error_message || undefined
    };
  }

  private convertToJobInfo(jobRecord: any): ScrapingJobInfo {
    return {
      id: jobRecord.id,
      url: jobRecord.url,
      selector: jobRecord.selector || undefined,
      status: jobRecord.status,
      priority: jobRecord.priority,
      scheduledAt: jobRecord.scheduled_at || undefined,
      startedAt: jobRecord.started_at || undefined,
      completedAt: jobRecord.completed_at || undefined,
      errorMessage: jobRecord.error_message || undefined,
      createdAt: jobRecord.created_at,
      updatedAt: jobRecord.updated_at
    };
  }
}