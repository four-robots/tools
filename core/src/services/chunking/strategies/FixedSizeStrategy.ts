/**
 * Fixed-size Chunking Strategy
 * 
 * Splits content at fixed character boundaries while preserving word boundaries
 * and maintaining readability through intelligent boundary detection.
 */

import { ChunkingOptions, ContentChunk, ChunkMetadata } from '../../../shared/types/content';
import { ChunkingStrategy } from './index';
import { randomUUID } from 'node:crypto';

export class FixedSizeStrategy implements ChunkingStrategy {
  getName(): string {
    return 'fixed_size';
  }

  canHandle(content: string): boolean {
    // This strategy can handle any content as a fallback
    return content.length > 0;
  }

  async chunk(content: string, options: ChunkingOptions): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    let currentPosition = 0;
    let chunkIndex = 0;

    while (currentPosition < content.length) {
      const remainingLength = content.length - currentPosition;
      const targetSize = Math.min(options.target_size, remainingLength);
      
      // Find the optimal split point
      const splitPoint = this.findOptimalSplitPoint(
        content,
        currentPosition,
        targetSize,
        options.max_size,
        options.preserve_boundaries
      );

      const chunkContent = content.substring(currentPosition, splitPoint).trim();
      
      if (chunkContent.length >= options.min_size) {
        const chunk = this.createChunk(
          chunkContent,
          currentPosition,
          splitPoint - 1,
          chunkIndex,
          options
        );
        chunks.push(chunk);
        chunkIndex++;
      }

      currentPosition = splitPoint;
      
      // Skip whitespace at the beginning of the next chunk
      while (currentPosition < content.length && /\s/.test(content[currentPosition])) {
        currentPosition++;
      }
    }

    return chunks;
  }

  private findOptimalSplitPoint(
    content: string,
    startPosition: number,
    targetSize: number,
    maxSize: number,
    preserveBoundaries: ChunkingOptions['preserve_boundaries']
  ): number {
    const endPosition = Math.min(startPosition + targetSize, content.length);
    
    // If we're at the end of content, return the end position
    if (endPosition >= content.length) {
      return content.length;
    }

    // If we haven't reached the target size, don't split yet unless we hit max size
    if (endPosition - startPosition < targetSize && endPosition < content.length) {
      const maxEndPosition = Math.min(startPosition + maxSize, content.length);
      if (maxEndPosition > endPosition) {
        return this.findOptimalSplitPoint(content, startPosition, maxSize, maxSize, preserveBoundaries);
      }
    }

    // Look for the best boundary to split on
    const searchWindow = Math.min(100, Math.floor(targetSize * 0.2)); // Search within 20% of target size
    const searchStart = Math.max(startPosition, endPosition - searchWindow);
    const searchEnd = Math.min(content.length, endPosition + searchWindow);
    
    const candidate = this.findBestBoundary(
      content,
      searchStart,
      searchEnd,
      preserveBoundaries
    );

    return candidate !== -1 ? candidate : endPosition;
  }

  private findBestBoundary(
    content: string,
    searchStart: number,
    searchEnd: number,
    preserveBoundaries: ChunkingOptions['preserve_boundaries']
  ): number {
    const boundaries: Array<{ position: number; priority: number; type: string }> = [];

    // Scan for different types of boundaries
    for (let i = searchStart; i < searchEnd; i++) {
      const char = content[i];
      const nextChar = i + 1 < content.length ? content[i + 1] : '';
      const prevChar = i > 0 ? content[i - 1] : '';

      // Paragraph boundaries (highest priority)
      if (preserveBoundaries.paragraphs && char === '\n' && nextChar === '\n') {
        boundaries.push({ position: i + 2, priority: 100, type: 'paragraph' });
      }

      // Sentence boundaries (high priority)
      if (preserveBoundaries.sentences && /[.!?]/.test(char) && /\s/.test(nextChar) && /[A-Z]/.test(content[i + 2])) {
        boundaries.push({ position: i + 1, priority: 80, type: 'sentence' });
      }

      // Code block boundaries (high priority)
      if (preserveBoundaries.code_blocks) {
        // End of code blocks (```)
        if (char === '`' && prevChar === '`' && content[i - 2] === '`' && nextChar === '\n') {
          boundaries.push({ position: i + 1, priority: 90, type: 'code_block' });
        }
        // Function/method boundaries
        if (char === '}' && nextChar === '\n' && this.isCodeFunction(content, i)) {
          boundaries.push({ position: i + 1, priority: 85, type: 'function' });
        }
      }

      // List item boundaries (medium priority)
      if (preserveBoundaries.list_items && char === '\n' && /^[\s]*[-*+•]\s/.test(content.substring(i + 1, i + 10))) {
        boundaries.push({ position: i + 1, priority: 60, type: 'list_item' });
      }

      // Word boundaries (low priority, fallback)
      if (/\s/.test(char) && /\S/.test(nextChar)) {
        boundaries.push({ position: i + 1, priority: 20, type: 'word' });
      }
    }

    // Sort boundaries by priority (descending) and prefer those closer to the middle of search range
    const midPoint = (searchStart + searchEnd) / 2;
    boundaries.sort((a, b) => {
      // Primary sort: priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Secondary sort: distance from midpoint (closer is better)
      const distA = Math.abs(a.position - midPoint);
      const distB = Math.abs(b.position - midPoint);
      return distA - distB;
    });

    return boundaries.length > 0 ? boundaries[0].position : -1;
  }

  private isCodeFunction(content: string, position: number): boolean {
    // Simple heuristic to detect if a } closes a function/method
    const preceding = content.substring(Math.max(0, position - 200), position);
    return /\b(function|def |async |public |private |protected |\w+\s*\([^)]*\)\s*{)/.test(preceding);
  }

  private createChunk(
    content: string,
    startPosition: number,
    endPosition: number,
    chunkIndex: number,
    options: ChunkingOptions
  ): ContentChunk {
    const metadata: ChunkMetadata = {
      type: this.detectContentType(content),
      complete_sentences: this.hasCompleteSentences(content),
      word_count: this.countWords(content),
      quality_score: this.calculateQualityScore(content, startPosition, endPosition, options)
    };

    return {
      id: randomUUID(),
      parent_id: randomUUID(), // This should be set by the calling service
      parent_type: 'document', // This should be set by the calling service
      content: content.trim(),
      start_position: startPosition,
      end_position: endPosition,
      chunk_index: chunkIndex,
      metadata,
      created_at: new Date().toISOString()
    };
  }

  private detectContentType(content: string): 'text' | 'code' | 'documentation' | 'comment' | 'header' | 'list' | 'table' | 'quote' {
    const trimmed = content.trim();
    
    // Detect headers (markdown style)
    if (/^#+\s/.test(trimmed)) return 'header';
    
    // Detect lists
    if (/^[\s]*[-*+•]\s/m.test(content) || /^[\s]*\d+[.)]\s/m.test(content)) return 'list';
    
    // Detect tables (simple markdown table detection)
    if (/\|.*\|/.test(content) && content.split('\n').filter(line => /\|.*\|/.test(line)).length >= 2) {
      return 'table';
    }
    
    // Detect quotes
    if (/^>\s/m.test(content) || /^["""]/.test(trimmed) || /["""]$/.test(trimmed)) return 'quote';
    
    // Detect code patterns
    const codePatterns = [
      /[{}();]/,  // Curly braces, parentheses, semicolons
      /\b(function|class|if|for|while|return|import|export|def|var|let|const)\b/,
      /^\s*(public|private|protected|static)\s/m,
      /\/\/|\/\*|\*\/|#\s/, // Comments
      /```|`[^`]+`/ // Code blocks/inline code
    ];
    
    if (codePatterns.some(pattern => pattern.test(content))) return 'code';
    
    // Detect documentation patterns
    if (/@param|@return|@returns|@throws|@see|@example|@author|@since|@deprecated/.test(content)) {
      return 'documentation';
    }
    
    // Detect comments (standalone comment blocks)
    if (/^(\/\/|\/\*|#|<!--)/.test(trimmed)) return 'comment';
    
    return 'text';
  }

  private hasCompleteSentences(content: string): boolean {
    // Check if the content ends with a sentence terminator
    const trimmed = content.trim();
    if (!/[.!?]$/.test(trimmed)) return false;
    
    // Check if it has at least one complete sentence
    const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.length > 0 && sentences.some(s => s.trim().split(/\s+/).length >= 3);
  }

  private countWords(content: string): number {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateQualityScore(
    content: string,
    startPosition: number,
    endPosition: number,
    options: ChunkingOptions
  ): number {
    let score = 0.4; // Lower base score for fixed-size strategy
    
    const wordCount = this.countWords(content);
    const length = endPosition - startPosition;
    
    // Bonus for staying within target size range
    const targetRatio = length / options.target_size;
    if (targetRatio >= 0.8 && targetRatio <= 1.2) {
      score += 0.2; // Close to target size
    } else if (targetRatio >= 0.6 && targetRatio <= 1.5) {
      score += 0.1; // Reasonably close to target size
    }
    
    // Bonus for complete sentences
    if (this.hasCompleteSentences(content)) score += 0.25;
    
    // Bonus for good word count
    if (wordCount >= 20 && wordCount <= 150) score += 0.1;
    
    // Penalty for very short chunks
    if (wordCount < 10) score -= 0.2;
    
    // Bonus for clean boundaries (not cutting words)
    const trimmed = content.trim();
    const startsClean = /^[A-Z"']/.test(trimmed) || /^[\s]*[-*+•]\s/.test(content);
    const endsClean = /[.!?]$/.test(trimmed) || /\n$/.test(content);
    
    if (startsClean && endsClean) score += 0.15;
    else if (startsClean || endsClean) score += 0.05;
    
    // Detect content type quality
    const contentType = this.detectContentType(content);
    if (contentType === 'text' || contentType === 'documentation') {
      score += 0.05; // Slight bonus for well-structured text
    }

    return Math.max(0, Math.min(1, score));
  }
}