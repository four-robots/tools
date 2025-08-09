/**
 * Markdown Processor
 * 
 * Handles conversion of HTML content to markdown format using the 
 * MarkItDown worker service via NATS messaging.
 */

import { connect, NatsConnection } from 'nats';
import type {
  ConvertDocumentRequest,
  ConvertDocumentResponse,
  ConvertUrlRequest,
  DocumentMetadata
} from '../../../workers/markitdown/src/types.js';

/**
 * Markdown conversion options
 */
export interface MarkdownOptions {
  /** Preserve original formatting where possible */
  preserveFormatting?: boolean;
  /** Include document metadata in result */
  includeMetadata?: boolean;
  /** Strip images from the content */
  stripImages?: boolean;
  /** Maximum content length to process */
  maxLength?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Markdown conversion result
 */
export interface MarkdownResult {
  /** Converted markdown content */
  markdown: string;
  /** Document metadata if requested */
  metadata?: DocumentMetadata;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Any warnings during conversion */
  warnings?: string[];
}

/**
 * Markdown processing configuration
 */
export interface MarkdownProcessorConfig {
  natsUrl: string;
  timeout?: number;
}

export class MarkdownProcessor {
  private natsConnection?: NatsConnection;
  private isConnected = false;

  constructor(private config: MarkdownProcessorConfig) {}

  /**
   * Initialize the processor and establish NATS connection
   */
  async initialize(): Promise<void> {
    try {
      this.natsConnection = await connect({ 
        servers: this.config.natsUrl,
        timeout: this.config.timeout || 30000
      });
      
      this.isConnected = true;
      console.log('✅ Markdown processor connected to NATS');
    } catch (error) {
      console.error('❌ Failed to connect to NATS for markdown processing:', error);
      this.isConnected = false;
      // Don't throw - allow fallback operations
    }
  }

  /**
   * Convert HTML content to markdown
   */
  async convert(
    htmlContent: string,
    options: MarkdownOptions = {}
  ): Promise<MarkdownResult> {
    const startTime = Date.now();

    // Fallback for when NATS is not available
    if (!this.isConnected || !this.natsConnection) {
      console.warn('⚠️ NATS not connected, returning original content as fallback');
      return {
        markdown: this.fallbackHtmlToMarkdown(htmlContent),
        processingTimeMs: Date.now() - startTime,
        warnings: ['NATS not connected, used fallback HTML processing']
      };
    }

    try {
      const request: ConvertDocumentRequest = {
        content: htmlContent,
        contentType: 'text/html',
        options: {
          preserveFormatting: options.preserveFormatting ?? true,
          includeMetadata: options.includeMetadata ?? false,
          stripImages: options.stripImages ?? false,
          maxLength: options.maxLength
        }
      };

      const response = await this.natsConnection.request(
        'markitdown.convert.document',
        JSON.stringify(request),
        { timeout: options.timeout || this.config.timeout || 30000 }
      );

      const result = JSON.parse(new TextDecoder().decode(response.data)) as ConvertDocumentResponse;
      
      if (!result.success) {
        throw new Error(result.error || 'Conversion failed without error message');
      }

      return {
        markdown: result.markdown || '',
        metadata: result.metadata,
        processingTimeMs: result.processingTimeMs,
        warnings: []
      };
    } catch (error) {
      console.error('❌ MarkItDown conversion failed, using fallback:', error);
      
      return {
        markdown: this.fallbackHtmlToMarkdown(htmlContent),
        processingTimeMs: Date.now() - startTime,
        warnings: [
          `MarkItDown conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Used fallback HTML processing'
        ]
      };
    }
  }

  /**
   * Convert URL content to markdown using MarkItDown worker
   */
  async convertUrl(
    url: string,
    options: MarkdownOptions = {}
  ): Promise<MarkdownResult> {
    const startTime = Date.now();

    if (!this.isConnected || !this.natsConnection) {
      throw new Error('Cannot convert URL without NATS connection');
    }

    try {
      const request: ConvertUrlRequest = {
        url,
        options: {
          preserveFormatting: options.preserveFormatting ?? true,
          includeMetadata: options.includeMetadata ?? false,
          stripImages: options.stripImages ?? false,
          maxLength: options.maxLength,
          timeout: options.timeout
        }
      };

      const response = await this.natsConnection.request(
        'markitdown.convert.url',
        JSON.stringify(request),
        { timeout: (options.timeout || this.config.timeout || 30000) + 5000 }
      );

      const result = JSON.parse(new TextDecoder().decode(response.data)) as ConvertDocumentResponse;
      
      if (!result.success) {
        throw new Error(result.error || 'URL conversion failed without error message');
      }

      return {
        markdown: result.markdown || '',
        metadata: result.metadata,
        processingTimeMs: result.processingTimeMs,
        warnings: []
      };
    } catch (error) {
      console.error('❌ MarkItDown URL conversion failed:', error);
      
      throw new Error(`URL conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert multiple HTML content pieces in batch
   */
  async convertBatch(
    contents: Array<{
      id: string;
      html: string;
      options?: MarkdownOptions;
    }>
  ): Promise<Array<{
    id: string;
    result: MarkdownResult;
  }>> {
    const results: Array<{ id: string; result: MarkdownResult }> = [];

    // Process in sequence to avoid overwhelming the worker
    for (const content of contents) {
      try {
        const result = await this.convert(content.html, content.options);
        results.push({
          id: content.id,
          result
        });
      } catch (error) {
        console.error(`❌ Failed to convert content ${content.id}:`, error);
        results.push({
          id: content.id,
          result: {
            markdown: this.fallbackHtmlToMarkdown(content.html),
            processingTimeMs: 0,
            warnings: [`Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
          }
        });
      }
    }

    return results;
  }

  /**
   * Simple fallback HTML to markdown conversion
   * Used when MarkItDown worker is not available
   */
  private fallbackHtmlToMarkdown(html: string): string {
    if (!html || html.trim().length === 0) {
      return '';
    }

    let markdown = html;

    try {
      // Remove script and style tags completely
      markdown = markdown.replace(/<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi, '');
      
      // Convert common HTML elements to markdown
      markdown = markdown
        // Headers
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
        .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
        .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
        .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
        
        // Paragraphs
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
        
        // Line breaks
        .replace(/<br\s*\/?>/gi, '\n')
        
        // Bold and italic
        .replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**')
        .replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*')
        
        // Links
        .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        
        // Code
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '```\n$1\n```')
        .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```')
        
        // Lists
        .replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
          const items = content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
          return items + '\n';
        })
        .replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
          let counter = 1;
          const items = content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${counter++}. $1\n`);
          return items + '\n';
        })
        
        // Blockquotes
        .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n')
        
        // Images
        .replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)')
        .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![$1]($2)')
        .replace(/<img[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![]($1)')
        
        // Remove remaining HTML tags
        .replace(/<[^>]*>/g, '')
        
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        
        // Clean up whitespace
        .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double newlines
        .replace(/^\s+|\s+$/g, '') // Trim start and end
        .replace(/[ \t]+/g, ' '); // Multiple spaces to single space

      return markdown;
    } catch (error) {
      console.error('❌ Fallback HTML to markdown conversion failed:', error);
      
      // Ultimate fallback: strip all HTML tags and return plain text
      return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  /**
   * Check if the processor is ready for operations
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Close the processor and cleanup resources
   */
  async close(): Promise<void> {
    if (this.natsConnection) {
      await this.natsConnection.close();
      this.isConnected = false;
      console.log('🔌 Markdown processor disconnected from NATS');
    }
  }
}