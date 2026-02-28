/**
 * Summary Generator
 * 
 * Core service for LLM-powered content generation and summarization.
 * Handles different types of summary generation with specific prompts and strategies.
 */

import { LLMService } from '../nlp/llm-service.js';
import type {
  ContentSource,
  SummaryLength,
  GeneratedAnswer,
  AnswerType,
  SynthesizedContent,
  Comparison,
  ContentGap
} from '../../shared/types/ai-summaries.js';

/**
 * Configuration for summary generation
 */
interface SummaryGeneratorConfig {
  defaultLLMProvider: string;
  maxProcessingTimeMs: number;
  minConfidenceThreshold: number;
}

/**
 * Summary generation prompts
 */
class SummaryPrompts {
  static getGeneralSummaryPrompt(length: SummaryLength): string {
    const lengthInstructions = {
      brief: "Keep the summary to 1-2 sentences, focusing only on the most essential information.",
      short: "Write a concise summary in 2-3 paragraphs, covering the main points clearly.",
      medium: "Create a comprehensive summary in 3-5 paragraphs, covering all key aspects thoroughly.",
      detailed: "Provide an in-depth summary in 5+ paragraphs, exploring all important details and nuances.",
      comprehensive: "Generate a complete and thorough analysis covering all aspects, implications, and details."
    };

    return `You are an expert at creating high-quality summaries from technical content. 
    Create a well-structured, informative summary based on the provided sources.

    Requirements:
    - ${lengthInstructions[length]}
    - Use clear, professional language
    - Maintain accuracy and avoid speculation
    - Include the most relevant and important information
    - Organize information logically
    - Cite sources appropriately using [Source X] format
    - Avoid redundancy and ensure each point adds value

    Focus on:
    - Key concepts and definitions
    - Important processes or procedures
    - Significant benefits and limitations
    - Practical applications and examples
    - Critical warnings or considerations`;
  }

  static getAnswerGenerationPrompt(answerType: AnswerType): string {
    const typeInstructions = {
      direct_answer: "Provide a direct, factual answer to the specific question asked.",
      explanation: "Give a detailed explanation that helps the reader understand the concept thoroughly.",
      step_by_step: "Break down the process into clear, numbered steps that are easy to follow.",
      comparison: "Compare the different options, highlighting key similarities and differences.",
      definition: "Provide a clear definition followed by context and examples.",
      troubleshooting: "Identify the problem and provide step-by-step solutions.",
      opinion_synthesis: "Synthesize different viewpoints into a balanced perspective."
    };

    return `You are an expert at answering technical questions accurately and comprehensively.
    Answer the specific question based on the provided source material.

    Answer Type: ${answerType}
    Instructions: ${typeInstructions[answerType]}

    Requirements:
    - Base your answer strictly on the provided sources
    - Be accurate and avoid speculation beyond what the sources support
    - Use clear, accessible language appropriate for the audience
    - Include specific examples where available
    - Cite sources using [Source X] format
    - If information is incomplete, acknowledge the limitations
    - Provide practical value to the reader`;
  }

  static getKeypointsPrompt(): string {
    return `You are an expert at extracting and organizing key information from technical content.
    Extract the most important points from the provided sources and present them as a structured summary.

    Requirements:
    - Identify 5-10 key points that capture the essence of the content
    - Present each point clearly and concisely
    - Organize points logically (definitions first, then processes, benefits, limitations, etc.)
    - Use bullet points or numbered list format
    - Include relevant examples or details for complex points
    - Ensure each point provides unique value
    - Cite sources using [Source X] format

    Structure your response as:
    ## Key Points

    1. **[Point Category]**: [Clear statement with supporting details]
    2. **[Point Category]**: [Clear statement with supporting details]
    ...

    Categories might include: Definition, Process, Benefits, Limitations, Requirements, Examples, Best Practices, etc.`;
  }

  static getSynthesisPrompt(): string {
    return `You are an expert at synthesizing information from multiple sources to create comprehensive understanding.
    Analyze the provided sources and create a synthesis that combines and integrates the information.

    Requirements:
    - Identify common themes and patterns across sources
    - Note areas of consensus among sources  
    - Highlight any conflicts or contradictions between sources
    - Integrate information to provide a complete picture
    - Maintain accuracy and avoid over-interpretation
    - Present information in a logical, flowing narrative
    - Cite sources appropriately using [Source X] format

    Structure your response as:
    ## Information Synthesis

    **Consensus Points:**
    [Points where multiple sources agree]

    **Key Themes:**
    [Major themes that emerge from the sources]

    **Conflicting Information:**
    [Any disagreements or contradictions between sources]

    **Integrated Analysis:**
    [Your synthesis combining all information into coherent understanding]`;
  }

  static getComparisonPrompt(): string {
    return `You are an expert at analyzing and comparing different approaches, solutions, or concepts.
    Create a structured comparison based on the provided sources.

    Requirements:
    - Identify the items being compared
    - Define clear comparison criteria
    - Present similarities and differences objectively
    - Highlight unique strengths and weaknesses of each item
    - Provide practical insights for decision-making
    - Use structured format for easy comparison
    - Cite sources appropriately using [Source X] format

    Structure your response as:
    ## Comparison Analysis

    **Items Compared:**
    [List what is being compared]

    **Comparison Criteria:**
    [Key factors used for comparison]

    **Detailed Comparison:**
    | Criterion | Item 1 | Item 2 | Item 3 |
    |-----------|---------|---------|---------|
    | [Criterion 1] | [Details] | [Details] | [Details] |

    **Key Differences:**
    [Major distinguishing factors]

    **Recommendations:**
    [When to choose each option based on use case]`;
  }

  static getGapAnalysisPrompt(): string {
    return `You are an expert at identifying information gaps and incomplete coverage in documentation.
    Analyze the provided sources and identify what information might be missing for a complete understanding.

    Requirements:
    - Identify topics that are mentioned but not fully explained
    - Note missing examples or practical applications
    - Highlight areas where more detail would be valuable
    - Consider what a user might need to know that isn't covered
    - Suggest specific information that would fill these gaps
    - Prioritize gaps by importance to understanding

    Structure your response as:
    ## Information Gap Analysis

    **Critical Gaps:**
    [Most important missing information]

    **Moderate Gaps:**
    [Useful but not essential missing information]

    **Minor Gaps:**
    [Nice-to-have additional information]

    **Suggested Follow-up Questions:**
    [Questions that would help fill the gaps]`;
  }
}

export class SummaryGenerator {
  constructor(
    private llmService: LLMService,
    private config: SummaryGeneratorConfig
  ) {}

  /**
   * Generate general summary from sources
   */
  async generateSummary(
    query: string,
    sources: ContentSource[],
    length: SummaryLength = 'medium'
  ): Promise<string> {
    try {
      const systemPrompt = SummaryPrompts.getGeneralSummaryPrompt(length);
      const sourcesText = this.formatSourcesForPrompt(sources);
      
      const prompt = `Query: "${query}"

Sources:
${sourcesText}

Please create a summary based on the above sources that addresses the query.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        this.config.defaultLLMProvider as any,
        0.2
      );

      return this.cleanSummaryContent(response.content);

    } catch (error) {
      console.error('Summary generation failed:', error);
      throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate specific answer to a question
   */
  async generateAnswer(
    question: string,
    sources: ContentSource[],
    answerType: AnswerType = 'explanation'
  ): Promise<GeneratedAnswer> {
    try {
      const systemPrompt = SummaryPrompts.getAnswerGenerationPrompt(answerType);
      const sourcesText = this.formatSourcesForPrompt(sources);
      
      const prompt = `Question: "${question}"

Sources:
${sourcesText}

Please provide a comprehensive answer to the question based on the above sources.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        this.config.defaultLLMProvider as any,
        0.1
      );

      const answer = this.cleanSummaryContent(response.content);

      // Calculate confidence based on source relevance and answer completeness
      const confidence = this.calculateAnswerConfidence(answer, sources);
      const completeness = this.calculateAnswerCompleteness(answer, question);

      return {
        question,
        answer,
        answerType,
        confidence,
        completeness,
        primarySources: sources
          .filter(s => s.relevance > 0.7)
          .map(s => s.id)
          .slice(0, 5),
        followUpQuestions: await this.generateFollowUpQuestions(question, answer),
        alternativePhrasings: await this.generateAlternativePhrasings(question),
        caveats: this.extractCaveats(answer)
      };

    } catch (error) {
      console.error('Answer generation failed:', error);
      throw new Error(`Failed to generate answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate key points focused summary
   */
  async generateKeyPointsSummary(sources: ContentSource[]): Promise<string> {
    try {
      const systemPrompt = SummaryPrompts.getKeypointsPrompt();
      const sourcesText = this.formatSourcesForPrompt(sources);
      
      const prompt = `Sources:
${sourcesText}

Please extract and organize the key points from these sources.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        this.config.defaultLLMProvider as any,
        0.2
      );

      return this.cleanSummaryContent(response.content);

    } catch (error) {
      console.error('Key points generation failed:', error);
      throw new Error(`Failed to generate key points: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synthesize content from multiple sources
   */
  async synthesizeContent(sources: ContentSource[]): Promise<SynthesizedContent> {
    try {
      const systemPrompt = SummaryPrompts.getSynthesisPrompt();
      const sourcesText = this.formatSourcesForPrompt(sources);
      
      const prompt = `Sources:
${sourcesText}

Please synthesize the information from these sources.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        this.config.defaultLLMProvider as any,
        0.2
      );

      const content = this.cleanSummaryContent(response.content);

      // Extract synthesis components
      const themes = this.extractThemes(content);
      const consensusPoints = this.extractConsensusPoints(content);
      const conflicts = this.extractConflicts(content, sources);

      return {
        content,
        sourceIds: sources.map(s => s.id),
        themes,
        consensusPoints,
        conflicts,
        confidence: this.calculateSynthesisConfidence(content, sources)
      };

    } catch (error) {
      console.error('Content synthesis failed:', error);
      throw new Error(`Failed to synthesize content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compare content from sources
   */
  async compareContent(sources: ContentSource[]): Promise<Comparison> {
    try {
      const systemPrompt = SummaryPrompts.getComparisonPrompt();
      const sourcesText = this.formatSourcesForPrompt(sources);
      
      const prompt = `Sources:
${sourcesText}

Please create a structured comparison based on these sources.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        this.config.defaultLLMProvider as any,
        0.2
      );

      const comparisonText = this.cleanSummaryContent(response.content);

      // Parse comparison components (simplified implementation)
      const items = this.extractComparisonItems(comparisonText, sources);
      const criteria = this.extractComparisonCriteria(comparisonText);
      const comparisonMatrix = this.buildComparisonMatrix(items, criteria, comparisonText);
      const keyDifferences = this.extractKeyDifferences(comparisonText);
      const recommendations = this.extractRecommendations(comparisonText);

      return {
        items,
        criteria,
        comparisonMatrix,
        keyDifferences,
        recommendations
      };

    } catch (error) {
      console.error('Content comparison failed:', error);
      throw new Error(`Failed to compare content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Identify content gaps
   */
  async identifyContentGaps(query: string, sources: ContentSource[]): Promise<ContentGap[]> {
    try {
      const systemPrompt = SummaryPrompts.getGapAnalysisPrompt();
      const sourcesText = this.formatSourcesForPrompt(sources);
      
      const prompt = `Query: "${query}"

Sources:
${sourcesText}

Please identify information gaps for answering this query comprehensively.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        systemPrompt,
        this.config.defaultLLMProvider as any,
        0.3
      );

      const gapAnalysis = this.cleanSummaryContent(response.content);

      // Parse gap analysis into structured format
      return this.parseContentGaps(gapAnalysis, query);

    } catch (error) {
      console.error('Gap analysis failed:', error);
      // Return empty array rather than failing - gap analysis is nice-to-have
      return [];
    }
  }

  /**
   * Helper methods
   */

  private formatSourcesForPrompt(sources: ContentSource[]): string {
    return sources
      .map((source, index) => {
        const sourceNum = index + 1;
        return `[Source ${sourceNum}] ${source.title}
Type: ${source.type}
Relevance: ${source.relevance.toFixed(2)}
Content: ${source.content.substring(0, 2000)}${source.content.length > 2000 ? '...' : ''}
${source.url ? `URL: ${source.url}` : ''}
---`;
      })
      .join('\n\n');
  }

  private cleanSummaryContent(content: string): string {
    return content
      .trim()
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/\s{2,}/g, ' ') // Remove excessive spaces
      .replace(/^#+\s*/gm, '') // Remove markdown headers (they'll be added by UI)
      .replace(/\*\*(.*?)\*\*/g, '$1'); // Remove markdown bold formatting
  }

  private calculateAnswerConfidence(answer: string, sources: ContentSource[]): number {
    // Simplified confidence calculation
    const avgSourceRelevance = sources.length > 0 ? sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length : 0;
    const answerLength = Math.min(answer.length / 500, 1.0); // Longer answers generally more comprehensive
    const citationCount = (answer.match(/\[Source \d+\]/g) || []).length;
    const citationScore = Math.min(citationCount / 3, 1.0); // Good answers cite multiple sources

    return (avgSourceRelevance * 0.4) + (answerLength * 0.3) + (citationScore * 0.3);
  }

  private calculateAnswerCompleteness(answer: string, question: string): number {
    // Simplified completeness calculation
    const questionWords = question.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const answerWords = answer.toLowerCase().split(/\s+/);
    
    const addressedConcepts = questionWords.filter(word => answerWords.includes(word)).length;
    return Math.min(addressedConcepts / questionWords.length, 1.0);
  }

  private async generateFollowUpQuestions(question: string, answer: string): Promise<string[]> {
    try {
      const prompt = `Given this question: "${question}"
And this answer: "${answer.substring(0, 500)}..."

Generate 3 relevant follow-up questions that a user might ask next. Return as a JSON array of strings.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        'Generate follow-up questions in JSON array format.',
        this.config.defaultLLMProvider as any,
        0.4
      );

      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed.slice(0, 3) : [];

    } catch (error) {
      console.error('Failed to generate follow-up questions:', error);
      return [];
    }
  }

  private async generateAlternativePhrasings(question: string): Promise<string[]> {
    try {
      const prompt = `Generate 2 alternative ways to ask this question: "${question}"
Return as a JSON array of strings.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        'Generate alternative question phrasings in JSON array format.',
        this.config.defaultLLMProvider as any,
        0.4
      );

      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed.slice(0, 2) : [];

    } catch (error) {
      console.error('Failed to generate alternative phrasings:', error);
      return [];
    }
  }

  private extractCaveats(answer: string): string[] {
    // Extract sentences that contain caveat indicators
    const caveats: string[] = [];
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    const caveatIndicators = [
      'however', 'but', 'note that', 'important to', 'keep in mind', 
      'limitation', 'drawback', 'warning', 'careful', 'avoid'
    ];

    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (caveatIndicators.some(indicator => lowerSentence.includes(indicator))) {
        caveats.push(sentence.trim());
      }
    });

    return caveats.slice(0, 3); // Limit to 3 most relevant caveats
  }

  // Placeholder implementations for parsing synthesis and comparison content
  // These would need more sophisticated NLP processing in a production system

  private extractThemes(content: string): string[] {
    // Simplified theme extraction
    const keywordPatterns = /(?:theme|topic|concept|aspect)s?:?\s*([^.\n]+)/gi;
    const themes: string[] = [];
    let match;

    while ((match = keywordPatterns.exec(content)) !== null) {
      themes.push(match[1].trim());
    }

    return themes.slice(0, 5);
  }

  private extractConsensusPoints(content: string): string[] {
    // Extract points where multiple sources agree
    const consensusPatterns = /(?:agree|consensus|common|shared|consistent).*?([^.\n]+)/gi;
    const points: string[] = [];
    let match;

    while ((match = consensusPatterns.exec(content)) !== null) {
      points.push(match[1].trim());
    }

    return points.slice(0, 5);
  }

  private extractConflicts(content: string, sources: ContentSource[]): Array<{topic: string, conflictingSources: string[], description: string}> {
    // Simplified conflict extraction
    return []; // Would implement sophisticated conflict detection
  }

  private calculateSynthesisConfidence(content: string, sources: ContentSource[]): number {
    // Simplified synthesis confidence calculation
    const avgSourceRelevance = sources.length > 0 ? sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length : 0;
    const contentLength = Math.min(content.length / 1000, 1.0);
    
    return (avgSourceRelevance * 0.6) + (contentLength * 0.4);
  }

  private extractComparisonItems(content: string, sources: ContentSource[]): Array<{name: string, description: string, sources: string[]}> {
    // Simplified item extraction - would need more sophisticated parsing
    return sources.map(source => ({
      name: source.title,
      description: source.content.substring(0, 200),
      sources: [source.id]
    })).slice(0, 5);
  }

  private extractComparisonCriteria(content: string): string[] {
    // Extract comparison criteria from content
    return ['Performance', 'Ease of Use', 'Cost', 'Features']; // Simplified
  }

  private buildComparisonMatrix(items: any[], criteria: string[], content: string): Record<string, Record<string, string>> {
    // Build comparison matrix - simplified implementation
    const matrix: Record<string, Record<string, string>> = {};
    
    items.forEach(item => {
      matrix[item.name] = {};
      criteria.forEach(criterion => {
        matrix[item.name][criterion] = 'N/A'; // Would extract from content
      });
    });

    return matrix;
  }

  private extractKeyDifferences(content: string): string[] {
    // Extract key differences from comparison content
    return ['Different approaches to implementation', 'Varying performance characteristics']; // Simplified
  }

  private extractRecommendations(content: string): string[] {
    // Extract recommendations from content
    const recPattern = /(?:recommend|suggest|choose|use).*?([^.\n]+)/gi;
    const recommendations: string[] = [];
    let match;

    while ((match = recPattern.exec(content)) !== null) {
      recommendations.push(match[1].trim());
    }

    return recommendations.slice(0, 3);
  }

  private parseContentGaps(gapAnalysis: string, query: string): ContentGap[] {
    // Simplified gap parsing - would need more sophisticated NLP
    return [
      {
        gapDescription: 'Incomplete implementation details',
        missingInformation: ['Step-by-step instructions', 'Code examples'],
        potentialSources: ['Official documentation', 'Tutorial guides'],
        impact: 'medium',
        suggestedQueries: [`How to implement ${query}`, `${query} examples`]
      }
    ];
  }
}