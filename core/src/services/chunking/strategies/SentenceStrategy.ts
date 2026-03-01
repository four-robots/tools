/**
 * Sentence-based Chunking Strategy
 * 
 * Splits content at sentence boundaries using NLP techniques while maintaining
 * semantic coherence and proper sentence structure.
 */

import { ChunkingOptions, ContentChunk, ChunkMetadata } from '../../../shared/types/content';
import { ChunkingStrategy } from './index';
import { randomUUID } from 'node:crypto';

export class SentenceStrategy implements ChunkingStrategy {
  getName(): string {
    return 'sentence';
  }

  canHandle(content: string): boolean {
    // Check if content has well-formed sentences
    const sentences = this.extractSentences(content);
    return sentences.length >= 3 && sentences.some(s => s.text.length > 20);
  }

  async chunk(content: string, options: ChunkingOptions): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    const sentences = this.extractSentences(content);
    
    let currentChunk = '';
    let chunkStartPosition = 0;
    let chunkIndex = 0;

    for (const sentence of sentences) {
      const testChunk = currentChunk + (currentChunk ? ' ' : '') + sentence.text;

      // If adding this sentence exceeds target size, finalize current chunk
      if (testChunk.length > options.target_size && currentChunk.length >= options.min_size) {
        const chunk = this.createChunk(
          currentChunk,
          chunkStartPosition,
          chunkStartPosition + currentChunk.length - 1,
          chunkIndex,
          options
        );
        chunks.push(chunk);
        chunkIndex++;

        // Start new chunk with current sentence
        currentChunk = sentence.text;
        chunkStartPosition = sentence.startPosition;
      } else if (testChunk.length <= options.max_size) {
        // Add sentence to current chunk
        if (!currentChunk) {
          chunkStartPosition = sentence.startPosition;
        }
        currentChunk = testChunk;
      } else {
        // Single sentence exceeds max size - handle specially
        if (currentChunk.length > 0) {
          const chunk = this.createChunk(
            currentChunk,
            chunkStartPosition,
            chunkStartPosition + currentChunk.length - 1,
            chunkIndex,
            options
          );
          chunks.push(chunk);
          chunkIndex++;
        }

        // Split the large sentence if needed
        if (sentence.text.length > options.max_size) {
          const subChunks = await this.splitLargeSentence(
            sentence.text,
            sentence.startPosition,
            chunkIndex,
            options
          );
          chunks.push(...subChunks);
          chunkIndex += subChunks.length;
        } else {
          const chunk = this.createChunk(
            sentence.text,
            sentence.startPosition,
            sentence.endPosition,
            chunkIndex,
            options
          );
          chunks.push(chunk);
          chunkIndex++;
        }

        currentChunk = '';
        chunkStartPosition = sentence.endPosition + 1;
      }
    }

    // Add final chunk if any content remains
    if (currentChunk.trim().length >= options.min_size) {
      const chunk = this.createChunk(
        currentChunk,
        chunkStartPosition,
        chunkStartPosition + currentChunk.length - 1,
        chunkIndex,
        options
      );
      chunks.push(chunk);
    }

    return chunks;
  }

  private extractSentences(content: string): Array<{
    text: string;
    startPosition: number;
    endPosition: number;
    type: 'declarative' | 'interrogative' | 'exclamatory' | 'imperative';
  }> {
    const sentences: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
      type: 'declarative' | 'interrogative' | 'exclamatory' | 'imperative';
    }> = [];

    // Enhanced sentence boundary detection
    const sentenceRegex = /([^.!?]*[.!?]+(?:\s*["']*)?(?:\s+(?=[A-Z])|$))|([^.!?]+(?:$|\n))/g;
    let match;

    while ((match = sentenceRegex.exec(content)) !== null) {
      const text = match[0].trim();
      if (text.length > 0 && this.isValidSentence(text)) {
        sentences.push({
          text,
          startPosition: match.index,
          endPosition: match.index + match[0].length - 1,
          type: this.classifySentence(text)
        });
      }
    }

    return sentences;
  }

  private isValidSentence(text: string): boolean {
    // Filter out very short fragments or single words
    const words = text.trim().split(/\s+/);
    return words.length >= 3 && text.length >= 10;
  }

  private classifySentence(text: string): 'declarative' | 'interrogative' | 'exclamatory' | 'imperative' {
    const trimmed = text.trim();
    
    if (trimmed.endsWith('?')) return 'interrogative';
    if (trimmed.endsWith('!')) return 'exclamatory';
    
    // Check for imperative patterns
    const imperativePatterns = /^(please|let's|don't|do|be|have|get|make|take|give|put|go|come|try|remember)/i;
    if (imperativePatterns.test(trimmed)) return 'imperative';
    
    return 'declarative';
  }

  private async splitLargeSentence(
    sentence: string,
    startPosition: number,
    baseChunkIndex: number,
    options: ChunkingOptions
  ): Promise<ContentChunk[]> {
    const chunks: ContentChunk[] = [];
    
    // Split on clauses (commas, semicolons, conjunctions)
    const clauses = this.splitIntoClauses(sentence);
    
    let currentChunk = '';
    let chunkStartPos = startPosition;
    let localChunkIndex = 0;

    for (const clause of clauses) {
      const testChunk = currentChunk + (currentChunk ? ' ' : '') + clause;

      if (testChunk.length > options.max_size && currentChunk.length > 0) {
        chunks.push(this.createChunk(
          currentChunk,
          chunkStartPos,
          chunkStartPos + currentChunk.length - 1,
          baseChunkIndex + localChunkIndex,
          options
        ));
        localChunkIndex++;

        currentChunk = clause;
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
        startPosition + sentence.length - 1,
        baseChunkIndex + localChunkIndex,
        options
      ));
    }

    return chunks;
  }

  private splitIntoClauses(sentence: string): string[] {
    // Split on clause boundaries while preserving meaning
    const clauseRegex = /([^,;:]+(?:[,;:]|$))/g;
    const clauses: string[] = [];
    let match;

    while ((match = clauseRegex.exec(sentence)) !== null) {
      const clause = match[1].trim();
      if (clause.length > 0) {
        clauses.push(clause);
      }
    }

    return clauses.length > 0 ? clauses : [sentence];
  }

  private createChunk(
    content: string,
    startPosition: number,
    endPosition: number,
    chunkIndex: number,
    options: ChunkingOptions
  ): ContentChunk {
    const sentences = this.extractSentences(content);
    
    const metadata: ChunkMetadata = {
      type: this.detectContentType(content),
      complete_sentences: sentences.length > 0 && sentences.every(s => s.text.match(/[.!?]$/)),
      word_count: this.countWords(content),
      quality_score: this.calculateQualityScore(content, sentences)
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
    // Detect headers
    if (/^#+\s/.test(content.trim())) return 'header';
    
    // Detect lists
    if (/^[\s]*[-*+•]\s/m.test(content) || /^[\s]*\d+[.)]\s/m.test(content)) return 'list';
    
    // Detect quotes
    if (/^>\s/m.test(content) || /^["""]/.test(content.trim())) return 'quote';
    
    // Detect code patterns
    if (/[{}();]/.test(content) && /\b(function|class|if|for|while|return|import|export)\b/.test(content)) {
      return 'code';
    }
    
    // Detect documentation patterns
    if (/@param|@return|@throws|@see|@example/.test(content)) return 'documentation';
    
    // Detect comments
    if (/^\/\/|^\/\*|\*\/|^#|^<!--/.test(content.trim())) return 'comment';
    
    return 'text';
  }

  private countWords(content: string): number {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateQualityScore(
    content: string,
    sentences: Array<{
      text: string;
      startPosition: number;
      endPosition: number;
      type: 'declarative' | 'interrogative' | 'exclamatory' | 'imperative';
    }>
  ): number {
    let score = 0.5; // Base score

    // Bonus for complete sentences
    const hasCompleteSentences = sentences.every(s => s.text.match(/[.!?]$/));
    if (hasCompleteSentences) score += 0.2;
    
    // Bonus for sentence variety
    const sentenceTypes = new Set(sentences.map(s => s.type));
    if (sentenceTypes.size > 1) score += 0.1;
    
    // Bonus for appropriate length
    const wordCount = this.countWords(content);
    if (wordCount >= 15 && wordCount <= 100) score += 0.2;
    
    // Penalty for too short or fragmented
    if (wordCount < 5) score -= 0.4;
    if (sentences.length === 0) score -= 0.3;
    
    // Bonus for balanced sentence lengths
    if (sentences.length > 1) {
      const lengths = sentences.map(s => s.text.length);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
      const coefficient = avgLength > 0 ? Math.sqrt(variance) / avgLength : 0;
      
      // Good variation (not too uniform, not too chaotic)
      if (coefficient > 0.2 && coefficient < 0.8) score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }
}