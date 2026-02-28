/**
 * MarkItDown Conversion Service
 */

import { spawn } from 'child_process';
import { writeFile, unlink, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ConvertDocumentRequest, ConvertDocumentResponse, DocumentMetadata } from './types.js';

export class MarkItDownConverter {
  private activeJobs = new Set<string>();
  private stats = {
    totalRequests: 0,
    successfulConversions: 0,
    failedConversions: 0,
    totalProcessingTime: 0
  };

  async convertDocument(request: ConvertDocumentRequest): Promise<ConvertDocumentResponse> {
    const startTime = Date.now();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeJobs.add(jobId);
    this.stats.totalRequests++;

    try {
      // Create temporary file for input
      const tempDir = await mkdtemp(join(tmpdir(), 'markitdown-'));
      const inputFile = join(tempDir, request.filename || 'input.txt');
      
      // Write content to temporary file
      await writeFile(inputFile, request.content);

      // Run markitdown via Python subprocess
      const result = await this.runMarkItDown(inputFile, request.options);
      
      // Clean up temporary file and directory
      await rm(tempDir, { recursive: true }).catch(() => {}); // Ignore cleanup errors
      
      const processingTimeMs = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTimeMs;
      this.stats.successfulConversions++;

      return {
        success: true,
        markdown: result.markdown,
        metadata: result.metadata,
        processingTimeMs
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTimeMs;
      this.stats.failedConversions++;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs
      };
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  async convertFromUrl(url: string, options?: any): Promise<ConvertDocumentResponse> {
    const startTime = Date.now();
    const jobId = `url_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeJobs.add(jobId);
    this.stats.totalRequests++;

    try {
      // Run markitdown directly on URL
      const result = await this.runMarkItDownUrl(url, options);
      
      const processingTimeMs = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTimeMs;
      this.stats.successfulConversions++;

      return {
        success: true,
        markdown: result.markdown,
        metadata: result.metadata,
        processingTimeMs
      };

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.stats.totalProcessingTime += processingTimeMs;
      this.stats.failedConversions++;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs
      };
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async runMarkItDown(inputFile: string, options?: any): Promise<{
    markdown: string;
    metadata: DocumentMetadata;
  }> {
    return new Promise((resolve, reject) => {
      const args = ['-m', 'markitdown', inputFile];
      
      // Add options as command line arguments
      if (options?.preserveFormatting) {
        args.push('--preserve-formatting');
      }
      if (options?.stripImages) {
        args.push('--strip-images');
      }
      if (options?.maxLength) {
        args.push('--max-length', options.maxLength.toString());
      }

      const process = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse the output - assuming markitdown returns JSON with markdown and metadata
            const result = this.parseMarkItDownOutput(stdout);
            resolve(result);
          } catch (parseError) {
            // Fallback: treat entire output as markdown
            resolve({
              markdown: stdout,
              metadata: this.generateBasicMetadata(stdout, 'unknown')
            });
          }
        } else {
          reject(new Error(`MarkItDown process failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to spawn MarkItDown process: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('MarkItDown process timed out'));
      }, options?.timeout || 30000);

      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  private async runMarkItDownUrl(url: string, options?: any): Promise<{
    markdown: string;
    metadata: DocumentMetadata;
  }> {
    return new Promise((resolve, reject) => {
      const args = ['-m', 'markitdown', '--url', url];
      
      // Add options as command line arguments
      if (options?.preserveFormatting) {
        args.push('--preserve-formatting');
      }
      if (options?.stripImages) {
        args.push('--strip-images');
      }
      if (options?.maxLength) {
        args.push('--max-length', options.maxLength.toString());
      }

      const process = spawn('python', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const result = this.parseMarkItDownOutput(stdout);
            resolve(result);
          } catch (parseError) {
            resolve({
              markdown: stdout,
              metadata: this.generateBasicMetadata(stdout, 'web')
            });
          }
        } else {
          reject(new Error(`MarkItDown URL process failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to spawn MarkItDown URL process: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('MarkItDown URL process timed out'));
      }, options?.timeout || 60000);

      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  private parseMarkItDownOutput(output: string): {
    markdown: string;
    metadata: DocumentMetadata;
  } {
    try {
      // Try to parse as JSON first (if markitdown supports JSON output)
      const parsed = JSON.parse(output);
      return {
        markdown: parsed.markdown || parsed.content || output,
        metadata: parsed.metadata || this.generateBasicMetadata(parsed.markdown || output, parsed.format || 'unknown')
      };
    } catch {
      // Fallback to treating entire output as markdown
      return {
        markdown: output,
        metadata: this.generateBasicMetadata(output, 'unknown')
      };
    }
  }

  private generateBasicMetadata(content: string, format: string): DocumentMetadata {
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const characterCount = content.length;
    
    // Try to extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : undefined;

    return {
      title,
      wordCount,
      characterCount,
      format,
      createdDate: new Date().toISOString()
    };
  }

  getStats() {
    const averageProcessingTime = this.stats.totalRequests > 0 
      ? this.stats.totalProcessingTime / this.stats.totalRequests 
      : 0;

    return {
      ...this.stats,
      averageProcessingTime,
      activeJobs: this.activeJobs.size
    };
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }
}