/**
 * Paragraph-based Chunking Strategy
 * 
 * Splits content at paragraph boundaries (double newlines) while preserving
 * paragraph integrity and maintaining semantic coherence.
 */

import { ChunkingOptions, ContentChunk, ChunkMetadata } from '../../../shared/types/content';
import { ChunkingStrategy } from './index';
import { randomUUID } from 'node:crypto';

export class ParagraphStrategy implements ChunkingStrategy {
  getName(): string {
    return 'paragraph';
  }

  canHandle(content: string): boolean {
    // Check if content has well-formed paragraphs
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    return paragraphs.length >= 2 && paragraphs.some(p => p.length > 50);
  }

  async chunk(content: string, options: ChunkingOptions): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    let currentPosition = 0;
    let chunkIndex = 0;

    // Split content into paragraphs
    const paragraphs = this.extractParagraphs(content);
    
    let currentChunk = '';
    let chunkStartPosition = 0;

    for (const paragraph of paragraphs) {
      const paragraphWithNewlines = paragraph.text;
      const testChunk = currentChunk + (currentChunk ? '\n\n' : '') + paragraphWithNewlines;

      // If adding this paragraph exceeds max size, finalize current chunk
      if (testChunk.length > options.max_size && currentChunk.length > 0) {
        const chunk = this.createChunk(
          currentChunk,
          chunkStartPosition,
          currentPosition - 1,
          chunkIndex,
          options
        );
        chunks.push(chunk);
        chunkIndex++;

        // Start new chunk with current paragraph
        currentChunk = paragraphWithNewlines;
        chunkStartPosition = paragraph.startPosition;
      } else if (testChunk.length <= options.max_size) {
        // Add paragraph to current chunk
        currentChunk = testChunk;
        if (!currentChunk || chunkIndex === 0) {
          chunkStartPosition = paragraph.startPosition;
        }
      } else {
        // Single paragraph exceeds max size - need to split it
        if (currentChunk) {
          const chunk = this.createChunk(
            currentChunk,
            chunkStartPosition,
            currentPosition - 1,
            chunkIndex,
            options
          );
          chunks.push(chunk);
          chunkIndex++;
        }

        // Split the large paragraph
        const subChunks = await this.splitLargeParagraph(
          paragraphWithNewlines,
          paragraph.startPosition,
          chunkIndex,
          options
        );
        chunks.push(...subChunks);
        chunkIndex += subChunks.length;

        currentChunk = '';
        chunkStartPosition = paragraph.endPosition + 1;
      }

      currentPosition = paragraph.endPosition + 1;
    }

    // Add final chunk if any content remains
    if (currentChunk.trim().length >= options.min_size) {
      const chunk = this.createChunk(
        currentChunk,
        chunkStartPosition,
        content.length - 1,
        chunkIndex,
        options
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  private extractParagraphs(content: string): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
  }> {
    const paragraphs: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
    }> = [];

    const paragraphRegex = /([^\n\r]*(?:\n(?!\s*\n)[^\n\r]*)*)/g;
    let match;

    while ((match = paragraphRegex.exec(content)) !== null) {
      const text = match[1].trim();
      if (text.length > 0) {
        paragraphs.push({
          text,
          startPosition: match.index,
          endPosition: match.index + match[1].length - 1
        });
      }
    }

    return paragraphs;
  }

  private async splitLargeParagraph(
    paragraph: string,
    startPosition: number,
    baseChunkIndex: number,
    options: ChunkingOptions
  ): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    const sentences = this.splitIntoSentences(paragraph);
    
    let currentChunk = '';
    let chunkStartPos = startPosition;
    let localChunkIndex = 0;

    for (const sentence of sentences) {
      const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;

      if (testChunk.length > options.max_size && currentChunk.length > 0) {
        // Finalize current chunk
        chunks.push(this.createChunk(
          currentChunk,
          chunkStartPos,
          chunkStartPos + currentChunk.length - 1,
          baseChunkIndex + localChunkIndex,
          options
        ));
        localChunkIndex++;

        // Start new chunk
        currentChunk = sentence;
        chunkStartPos += currentChunk.length + 1;
      } else {
        currentChunk = testChunk;
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(
        currentChunk,
        chunkStartPos,
        startPosition + paragraph.length - 1,
        baseChunkIndex + localChunkIndex,
        options
      ));
    }

    return chunks;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - can be enhanced with NLP libraries
    return text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
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
      quality_score: this.calculateQualityScore(content)
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
    // Detect if content is a header
    if (/^#+\s/.test(content.trim())) return 'header';
    
    // Detect if content is a list
    if (/^[\s]*[-*+]\s/m.test(content) || /^[\s]*\d+\.\s/m.test(content)) return 'list';
    
    // Detect if content is a quote
    if (/^>\s/m.test(content)) return 'quote';
    
    // Detect if content is code-like
    if (/^\s*(function|class|def |public |private |import |export )/m.test(content)) return 'code';
    
    // Default to text
    return 'text';
  }

  private hasCompleteSentences(content: string): boolean {
    const sentences = content.split(/[.!?]+/);
    return sentences.length > 1 && sentences.some(s => s.trim().length > 10);
  }

  private countWords(content: string): number {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateQualityScore(content: string): number {
    let score = 0.5; // Base score

    // Bonus for good sentence structure
    if (this.hasCompleteSentences(content)) score += 0.2;
    
    // Bonus for appropriate length
    const wordCount = this.countWords(content);
    if (wordCount >= 20 && wordCount <= 200) score += 0.2;
    
    // Penalty for too short
    if (wordCount < 10) score -= 0.3;
    
    // Bonus for varied sentence length
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 1) {
      const avgLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
      const variance = sentences.reduce((sum, s) => sum + Math.pow(s.length - avgLength, 2), 0) / sentences.length;
      if (variance > 100) score += 0.1; // Good sentence variety
    }

    return Math.max(0, Math.min(1, score));
  }
}