import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google-ai/generativelanguage';
import { DatabaseManager } from '../../utils/database.js';
import {
  LLMConfig,
  LLMProvider,
  QueryUnderstanding,
  IntentClassification,
  QueryIntent,
  NamedEntity,
  RelatedQuery,
  LanguageDetection,
  ProcessedQuery
} from '../../shared/types/nlp.js';
import { createHash } from 'crypto';

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}

export class LLMService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private google?: GoogleGenerativeAI;
  private configs: Map<LLMProvider, LLMConfig> = new Map();
  private requestCache: Map<string, LLMResponse> = new Map();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private db?: DatabaseManager,
    configs: LLMConfig[] = []
  ) {
    // Initialize LLM clients based on provided configurations
    configs.forEach(config => this.addConfiguration(config));
  }

  public addConfiguration(config: LLMConfig): void {
    this.configs.set(config.provider, config);
    
    switch (config.provider) {
      case 'openai':
        if (config.apiKey) {
          this.openai = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.apiUrl
          });
        }
        break;
      
      case 'anthropic':
        if (config.apiKey) {
          this.anthropic = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.apiUrl
          });
        }
        break;
      
      case 'google':
        if (config.apiKey) {
          this.google = new GoogleGenerativeAI({
            apiKey: config.apiKey
          });
        }
        break;
    }
  }

  // Core LLM interaction method
  async generateCompletion(
    prompt: string, 
    systemPrompt?: string,
    provider: LLMProvider = 'openai',
    temperature = 0.1
  ): Promise<LLMResponse> {
    const cacheKey = this.getCacheKey(prompt, systemPrompt, provider, temperature);
    const cached = this.requestCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const config = this.configs.get(provider);
    if (!config) {
      throw new Error(`No configuration found for provider: ${provider}`);
    }

    let response: LLMResponse;

    try {
      switch (provider) {
        case 'openai':
          response = await this.generateOpenAICompletion(prompt, systemPrompt, config, temperature);
          break;
        case 'anthropic':
          response = await this.generateAnthropicCompletion(prompt, systemPrompt, config, temperature);
          break;
        case 'google':
          response = await this.generateGoogleCompletion(prompt, systemPrompt, config, temperature);
          break;
        case 'local':
          response = await this.generateLocalCompletion(prompt, systemPrompt, config, temperature);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      // Cache the response
      this.requestCache.set(cacheKey, response);
      
      // Clean up cache after timeout
      setTimeout(() => {
        this.requestCache.delete(cacheKey);
      }, this.cacheTimeout);

      return response;
    } catch (error) {
      console.error(`LLM generation failed for provider ${provider}:`, error);
      throw new Error(`Failed to generate completion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Query understanding
  async understandQuery(query: string): Promise<QueryUnderstanding> {
    const systemPrompt = `You are an expert at understanding user search queries in technical contexts. 
    Analyze the query and return a JSON response with the following structure:
    {
      "mainIntent": "string - the primary intent (search, question, navigation, comparison, definition, tutorial, troubleshoot)",
      "subIntents": ["array of secondary intents"],
      "entities": [{"text": "string", "type": "entity_type", "confidence": 0.95, "startIndex": 0, "endIndex": 5, "metadata": {}}],
      "concepts": ["array of technical concepts"],
      "expectedResultTypes": ["documentation", "code", "tutorial", "api_reference", "example"],
      "confidence": 0.95,
      "reasoning": "explanation of the analysis",
      "searchStrategy": "semantic|keyword|hybrid|structured|contextual|exploratory",
      "complexity": "simple|moderate|complex",
      "ambiguity": 0.1
    }`;

    const prompt = `Analyze this search query: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.1);
    
    try {
      const parsed = JSON.parse(response.content);
      return {
        mainIntent: parsed.mainIntent,
        subIntents: parsed.subIntents || [],
        entities: parsed.entities || [],
        concepts: parsed.concepts || [],
        expectedResultTypes: parsed.expectedResultTypes || [],
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || '',
        searchStrategy: parsed.searchStrategy || 'hybrid',
        complexity: parsed.complexity || 'moderate',
        ambiguity: parsed.ambiguity || 0.5
      };
    } catch (error) {
      console.error('Failed to parse query understanding response:', error);
      // Return fallback understanding
      return {
        mainIntent: 'search',
        subIntents: [],
        entities: [],
        concepts: [],
        expectedResultTypes: ['documentation'],
        confidence: 0.3,
        reasoning: 'Failed to parse LLM response',
        searchStrategy: 'hybrid',
        complexity: 'moderate',
        ambiguity: 0.8
      };
    }
  }

  // Generate search terms
  async generateSearchTerms(query: string): Promise<string[]> {
    const systemPrompt = `Generate effective search terms for the given query. 
    Return a JSON array of search terms that would help find relevant technical documentation, code, and resources.
    Focus on technical terms, synonyms, and related concepts.`;

    const prompt = `Generate search terms for: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.3);
    
    try {
      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : [query];
    } catch (error) {
      console.error('Failed to parse search terms response:', error);
      return [query];
    }
  }

  // Classify search intent
  async classifySearchIntent(query: string): Promise<IntentClassification> {
    const systemPrompt = `Classify the intent of this search query. Return JSON with:
    {
      "intent": "search|question|navigation|comparison|definition|tutorial|troubleshoot",
      "confidence": 0.95,
      "alternatives": [{"intent": "alternative", "confidence": 0.1}],
      "reasoning": "explanation",
      "features": {"hasQuestionWords": true, "hasComparison": false}
    }`;

    const prompt = `Classify the intent of: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.1);
    
    try {
      const parsed = JSON.parse(response.content);
      return {
        intent: parsed.intent as QueryIntent,
        confidence: parsed.confidence || 0.5,
        alternatives: parsed.alternatives || [],
        reasoning: parsed.reasoning || '',
        features: parsed.features || {}
      };
    } catch (error) {
      console.error('Failed to parse intent classification response:', error);
      return {
        intent: 'search',
        confidence: 0.3,
        alternatives: [],
        reasoning: 'Failed to parse LLM response',
        features: {}
      };
    }
  }

  // Expand with synonyms
  async expandWithSynonyms(query: string): Promise<string[]> {
    const systemPrompt = `Generate synonyms and alternative terms for the given technical query.
    Return a JSON array of relevant synonyms and related terms that maintain the same meaning.`;

    const prompt = `Generate synonyms for: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.3);
    
    try {
      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse synonyms response:', error);
      return [];
    }
  }

  // Generate related queries
  async generateRelatedQueries(query: string): Promise<RelatedQuery[]> {
    const systemPrompt = `Generate related queries that users might ask after or instead of the given query.
    Return JSON array with: [{"query": "string", "intent": "intent_type", "confidence": 0.9, "similarity": 0.8, "reasoning": "why this is related"}]`;

    const prompt = `Generate related queries for: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.4);
    
    try {
      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse related queries response:', error);
      return [];
    }
  }

  // Improve query
  async improveQuery(query: string, context: string): Promise<string> {
    const systemPrompt = `Improve the given search query based on the provided context.
    Make it more specific, clear, and likely to return relevant results.
    Return only the improved query string.`;

    const prompt = `Improve this query: "${query}"\nContext: ${context}`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.2);
    
    return response.content.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
  }

  // Translate query
  async translateQuery(query: string, sourceLang: string, targetLang: string): Promise<string> {
    const systemPrompt = `Translate the following technical query from ${sourceLang} to ${targetLang}.
    Preserve technical terms and concepts accurately. Return only the translated text.`;

    const prompt = `Translate: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.1);
    
    return response.content.trim();
  }

  // Detect language
  async detectLanguage(query: string): Promise<LanguageDetection> {
    const systemPrompt = `Detect the language of the given text. Return JSON with:
    {
      "language": "two-letter ISO code",
      "confidence": 0.95,
      "alternatives": [{"language": "alternative", "confidence": 0.1}]
    }`;

    const prompt = `Detect language of: "${query}"`;
    
    const response = await this.generateCompletion(prompt, systemPrompt, 'openai', 0.1);
    
    try {
      const parsed = JSON.parse(response.content);
      return {
        language: parsed.language || 'en',
        confidence: parsed.confidence || 0.5,
        alternatives: parsed.alternatives || []
      };
    } catch (error) {
      console.error('Failed to parse language detection response:', error);
      return {
        language: 'en',
        confidence: 0.3,
        alternatives: []
      };
    }
  }

  // Calculate confidence
  async calculateConfidence(processing: ProcessedQuery): Promise<number> {
    // Calculate overall confidence based on individual component confidences
    const weights = {
      intent: 0.3,
      entities: 0.2,
      expansion: 0.2,
      language: 0.1,
      corrections: 0.2
    };

    let totalConfidence = 0;
    let totalWeight = 0;

    // Intent confidence
    if (processing.intent) {
      totalConfidence += processing.confidence * weights.intent;
      totalWeight += weights.intent;
    }

    // Entity confidence (average of all entities)
    if (processing.entities.length > 0) {
      const avgEntityConfidence = processing.entities.reduce((sum, entity) => sum + entity.confidence, 0) / processing.entities.length;
      totalConfidence += avgEntityConfidence * weights.entities;
      totalWeight += weights.entities;
    }

    // Expansion confidence
    if (processing.expansion) {
      totalConfidence += processing.expansion.confidence * weights.expansion;
      totalWeight += weights.expansion;
    }

    // Language confidence (assume high if detected)
    if (processing.language) {
      totalConfidence += 0.9 * weights.language; // High confidence for language detection
      totalWeight += weights.language;
    }

    // Corrections confidence (lower if many corrections needed)
    const correctionsImpact = Math.max(0, 1 - (processing.corrections.length * 0.2));
    totalConfidence += correctionsImpact * weights.corrections;
    totalWeight += weights.corrections;

    return totalWeight > 0 ? totalConfidence / totalWeight : 0.5;
  }

  // Validate processing
  async validateProcessing(query: string, processing: ProcessedQuery): Promise<boolean> {
    // Basic validation checks
    if (!processing.normalized || processing.normalized.trim().length === 0) {
      return false;
    }

    if (!processing.intent) {
      return false;
    }

    if (processing.confidence < 0.1) {
      return false;
    }

    // Check for reasonable processing time
    if (processing.processingTimeMs > 30000) { // 30 seconds
      return false;
    }

    return true;
  }

  // Provider-specific implementation methods
  private async generateOpenAICompletion(
    prompt: string, 
    systemPrompt?: string,
    config?: LLMConfig,
    temperature = 0.1
  ): Promise<LLMResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openai.chat.completions.create({
      model: config?.model || 'gpt-4',
      messages: [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: prompt }
      ],
      temperature: temperature,
      max_tokens: config?.maxTokens || 1000
    });

    const choice = response.choices[0];
    return {
      content: choice.message?.content || '',
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
      model: response.model,
      finishReason: choice.finish_reason || undefined
    };
  }

  private async generateAnthropicCompletion(
    prompt: string, 
    systemPrompt?: string,
    config?: LLMConfig,
    temperature = 0.1
  ): Promise<LLMResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    const response = await this.anthropic.messages.create({
      model: config?.model || 'claude-3-haiku-20240307',
      max_tokens: config?.maxTokens || 1000,
      temperature: temperature,
      system: systemPrompt,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const content = response.content[0];
    return {
      content: content.type === 'text' ? content.text : '',
      usage: response.usage ? {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      } : undefined,
      model: response.model,
      finishReason: response.stop_reason || undefined
    };
  }

  private async generateGoogleCompletion(
    prompt: string, 
    systemPrompt?: string,
    config?: LLMConfig,
    temperature = 0.1
  ): Promise<LLMResponse> {
    // Simplified Google implementation - would need proper Google AI integration
    throw new Error('Google provider not fully implemented yet');
  }

  private async generateLocalCompletion(
    prompt: string, 
    systemPrompt?: string,
    config?: LLMConfig,
    temperature = 0.1
  ): Promise<LLMResponse> {
    // Placeholder for local model integration (Ollama, etc.)
    throw new Error('Local provider not implemented yet');
  }

  private getCacheKey(prompt: string, systemPrompt?: string, provider?: LLMProvider, temperature?: number): string {
    const content = `${prompt}|${systemPrompt || ''}|${provider || 'openai'}|${temperature || 0.1}`;
    return createHash('sha256').update(content).digest('hex');
  }

  // Health check method
  async healthCheck(): Promise<{ provider: LLMProvider; status: 'healthy' | 'error'; error?: string }[]> {
    const results: { provider: LLMProvider; status: 'healthy' | 'error'; error?: string }[] = [];

    for (const [provider, config] of this.configs.entries()) {
      try {
        await this.generateCompletion('Health check', undefined, provider, 0.1);
        results.push({ provider, status: 'healthy' });
      } catch (error) {
        results.push({ 
          provider, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return results;
  }

  // Get available providers
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.configs.keys());
  }

  // Get configuration for provider
  getConfig(provider: LLMProvider): LLMConfig | undefined {
    return this.configs.get(provider);
  }
}