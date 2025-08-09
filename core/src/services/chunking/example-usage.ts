/**
 * Content Chunking Service Usage Example
 * 
 * This file demonstrates how to use the ContentChunkingService
 * for intelligent document chunking.
 */

import { ContentChunkingService } from './ContentChunkingService';
import { ChunkingOptions } from '../../shared/types/content';

// Example usage function (not exported - for demonstration only)
async function demonstrateChunkingService() {
  const service = new ContentChunkingService();

  // Sample content to chunk
  const sampleContent = `
# Introduction to Machine Learning

Machine learning is a subset of artificial intelligence that focuses on the development of algorithms and statistical models. These models enable computers to improve their performance on a specific task through experience.

## Types of Machine Learning

There are several types of machine learning approaches:

### Supervised Learning
Supervised learning involves training a model on labeled data. The algorithm learns from input-output pairs and can then make predictions on new, unseen data. Common examples include:

- Classification tasks (e.g., spam detection)
- Regression tasks (e.g., price prediction)
- Decision trees and neural networks

### Unsupervised Learning
Unsupervised learning works with unlabeled data. The algorithm tries to find hidden patterns or structures in the data without any guidance about the desired output.

Key techniques include:
- Clustering algorithms
- Dimensionality reduction
- Association rule learning

## Applications

Machine learning has numerous applications across industries:

1. Healthcare: Diagnosis assistance, drug discovery, medical imaging
2. Finance: Fraud detection, algorithmic trading, credit scoring
3. Technology: Recommendation systems, search engines, natural language processing
4. Transportation: Autonomous vehicles, route optimization, traffic management

The field continues to evolve rapidly with new techniques and applications emerging regularly.
  `.trim();

  // Example 1: Analyze content to get recommendation
  console.log('=== Content Analysis ===');
  const analysis = service.analyzeContent(sampleContent);
  console.log('Recommended strategy:', analysis.recommendedStrategy);
  console.log('Content type:', analysis.analysis.contentType);
  console.log('Paragraph count:', analysis.analysis.paragraphCount);
  console.log('Reasons:', analysis.reasons);

  // Example 2: Chunk using paragraph strategy
  console.log('\n=== Paragraph Strategy ===');
  const paragraphOptions: ChunkingOptions = {
    strategy: 'paragraph',
    target_size: 500,
    max_size: 800,
    min_size: 200,
    overlap_size: 50,
    preserve_boundaries: {
      sentences: true,
      paragraphs: true,
      code_blocks: true,
      list_items: true
    }
  };

  const paragraphChunks = await service.chunkContent(
    sampleContent,
    paragraphOptions,
    'sample-doc-123',
    'document'
  );

  console.log(`Created ${paragraphChunks.length} chunks using paragraph strategy`);
  paragraphChunks.forEach((chunk, index) => {
    console.log(`Chunk ${index + 1}:`);
    console.log(`  - Content length: ${chunk.content.length} characters`);
    console.log(`  - Word count: ${chunk.metadata.word_count}`);
    console.log(`  - Quality score: ${chunk.metadata.quality_score?.toFixed(2)}`);
    console.log(`  - Type: ${chunk.metadata.type}`);
    console.log(`  - Preview: "${chunk.content.substring(0, 100)}..."`);
    console.log('');
  });

  // Example 3: Chunk using sentence strategy
  console.log('\n=== Sentence Strategy ===');
  const sentenceOptions: ChunkingOptions = {
    strategy: 'sentence',
    target_size: 300,
    max_size: 400,
    min_size: 150,
    overlap_size: 30,
    preserve_boundaries: {
      sentences: true,
      paragraphs: true,
      code_blocks: true,
      list_items: true
    }
  };

  const sentenceChunks = await service.chunkContent(
    sampleContent,
    sentenceOptions,
    'sample-doc-123',
    'document'
  );

  console.log(`Created ${sentenceChunks.length} chunks using sentence strategy`);
  
  // Example 4: Fixed size strategy for comparison
  console.log('\n=== Fixed Size Strategy ===');
  const fixedSizeOptions: ChunkingOptions = {
    strategy: 'fixed_size',
    target_size: 600,
    max_size: 800,
    min_size: 300,
    overlap_size: 100,
    preserve_boundaries: {
      sentences: true,
      paragraphs: true,
      code_blocks: true,
      list_items: true
    }
  };

  const fixedSizeChunks = await service.chunkContent(
    sampleContent,
    fixedSizeOptions,
    'sample-doc-123',
    'document'
  );

  console.log(`Created ${fixedSizeChunks.length} chunks using fixed size strategy`);

  // Summary comparison
  console.log('\n=== Strategy Comparison ===');
  console.log(`Paragraph strategy: ${paragraphChunks.length} chunks`);
  console.log(`Sentence strategy: ${sentenceChunks.length} chunks`);
  console.log(`Fixed size strategy: ${fixedSizeChunks.length} chunks`);

  // Quality scores comparison
  const avgQuality = (chunks: typeof paragraphChunks) => {
    const scores = chunks.map(c => c.metadata.quality_score || 0);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  };

  console.log(`Average quality scores:`);
  console.log(`  Paragraph: ${avgQuality(paragraphChunks).toFixed(2)}`);
  console.log(`  Sentence: ${avgQuality(sentenceChunks).toFixed(2)}`);
  console.log(`  Fixed size: ${avgQuality(fixedSizeChunks).toFixed(2)}`);
}

// Export the example for potential use
export { demonstrateChunkingService };

// Note: This example would be run with:
// import { demonstrateChunkingService } from './example-usage';
// await demonstrateChunkingService();