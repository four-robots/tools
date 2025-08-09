import { DatabaseManager } from '../../utils/database.js';
import { LLMService } from './llm-service.js';
import {
  NamedEntity,
  TechnicalEntity,
  EnrichedEntity,
  EntityType,
  EntityLink,
  AbbreviationResolution
} from '../../shared/types/nlp.js';
import * as natural from 'natural';
import compromise from 'compromise';

export interface EntityExtractionOptions {
  includeTechnicalTerms: boolean;
  includeAbbreviations: boolean;
  enrichEntities: boolean;
  confidenceThreshold: number;
}

export class EntityExtractor {
  private readonly technicalTermsRegex = new Map<EntityType, RegExp[]>([
    ['programming_language', [
      /\b(javascript|typescript|python|java|c\+\+|c#|php|ruby|go|rust|swift|kotlin|scala|perl|r|matlab|sql)\b/gi,
      /\b(js|ts|py|cpp|c|html|css|xml|json|yaml)\b/gi
    ]],
    ['framework', [
      /\b(react|angular|vue|express|django|flask|spring|laravel|rails|nextjs|gatsby|nuxt)\b/gi,
      /\b(node\.?js|jquery|bootstrap|tailwind|material-ui|chakra)\b/gi
    ]],
    ['technology', [
      /\b(docker|kubernetes|k8s|aws|azure|gcp|mongodb|postgresql|mysql|redis|elasticsearch)\b/gi,
      /\b(git|github|gitlab|jenkins|travis|circleci|webpack|vite|babel|eslint|prettier)\b/gi
    ]],
    ['concept', [
      /\b(api|rest|graphql|microservice|serverless|devops|ci\/cd|machine learning|ai|blockchain)\b/gi,
      /\b(authentication|authorization|oauth|jwt|ssl|tls|https|websocket)\b/gi
    ]],
    ['file_type', [
      /\.(js|ts|py|java|cpp|c|h|php|rb|go|rs|swift|kt|scala|pl|r|m|sql|html|css|xml|json|yaml|yml|md|txt|pdf|doc|docx)(\b|\s|$)/gi
    ]]
  ]);

  private readonly commonAbbreviations = new Map<string, string>([
    // Programming
    ['js', 'JavaScript'],
    ['ts', 'TypeScript'],
    ['py', 'Python'],
    ['cpp', 'C++'],
    ['cs', 'C#'],
    ['php', 'PHP'],
    ['rb', 'Ruby'],
    ['go', 'Go'],
    ['rs', 'Rust'],
    
    // Technologies
    ['k8s', 'Kubernetes'],
    ['aws', 'Amazon Web Services'],
    ['gcp', 'Google Cloud Platform'],
    ['db', 'database'],
    ['api', 'Application Programming Interface'],
    ['ui', 'User Interface'],
    ['ux', 'User Experience'],
    ['ci', 'Continuous Integration'],
    ['cd', 'Continuous Deployment'],
    ['cd', 'Continuous Delivery'],
    
    // Protocols
    ['http', 'HyperText Transfer Protocol'],
    ['https', 'HyperText Transfer Protocol Secure'],
    ['ssl', 'Secure Sockets Layer'],
    ['tls', 'Transport Layer Security'],
    ['tcp', 'Transmission Control Protocol'],
    ['udp', 'User Datagram Protocol'],
    ['dns', 'Domain Name System'],
    
    // Data formats
    ['json', 'JavaScript Object Notation'],
    ['xml', 'eXtensible Markup Language'],
    ['yaml', 'YAML Ain\'t Markup Language'],
    ['csv', 'Comma-Separated Values'],
    ['sql', 'Structured Query Language'],
    ['html', 'HyperText Markup Language'],
    ['css', 'Cascading Style Sheets']
  ]);

  private readonly entityCache = new Map<string, NamedEntity[]>();
  private readonly cacheTimeout = 10 * 60 * 1000; // 10 minutes

  constructor(
    private llmService: LLMService,
    private db?: DatabaseManager
  ) {}

  // Main entity extraction method
  async extractEntities(
    query: string, 
    options: Partial<EntityExtractionOptions> = {}
  ): Promise<NamedEntity[]> {
    const opts: EntityExtractionOptions = {
      includeTechnicalTerms: true,
      includeAbbreviations: true,
      enrichEntities: false,
      confidenceThreshold: 0.5,
      ...options
    };

    // Check cache first
    const cacheKey = this.getCacheKey(query, opts);
    const cached = this.entityCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const entities: NamedEntity[] = [];

    try {
      // Extract using different methods
      const compromiseEntities = await this.extractWithCompromise(query);
      const regexEntities = await this.extractWithRegex(query);
      const llmEntities = await this.extractWithLLM(query);

      // Merge and deduplicate entities
      const allEntities = [...compromiseEntities, ...regexEntities, ...llmEntities];
      const mergedEntities = this.mergeEntities(allEntities);

      // Filter by confidence threshold
      const filteredEntities = mergedEntities.filter(entity => 
        entity.confidence >= opts.confidenceThreshold
      );

      // Enrich entities if requested
      let finalEntities = filteredEntities;
      if (opts.enrichEntities) {
        finalEntities = await Promise.all(
          filteredEntities.map(entity => this.enrichEntity(entity))
        );
      }

      // Cache the results
      this.entityCache.set(cacheKey, finalEntities);
      setTimeout(() => {
        this.entityCache.delete(cacheKey);
      }, this.cacheTimeout);

      // Store entities for analytics
      if (this.db) {
        await this.storeExtractedEntities(query, finalEntities);
      }

      return finalEntities;
    } catch (error) {
      console.error('Entity extraction failed:', error);
      return [];
    }
  }

  // Extract technical terms specifically
  async extractTechnicalTerms(query: string): Promise<TechnicalEntity[]> {
    const entities = await this.extractEntities(query, { 
      includeTechnicalTerms: true, 
      confidenceThreshold: 0.3 
    });

    const technicalEntities: TechnicalEntity[] = [];

    for (const entity of entities) {
      if (this.isTechnicalEntity(entity)) {
        const technicalEntity: TechnicalEntity = {
          ...entity,
          category: this.getTechnicalCategory(entity.text, entity.type),
          version: this.extractVersion(entity.text),
          documentation: await this.getDocumentationUrl(entity.text),
          officialSite: await this.getOfficialSiteUrl(entity.text)
        };
        
        technicalEntities.push(technicalEntity);
      }
    }

    return technicalEntities;
  }

  // Resolve abbreviations
  async resolveAbbreviations(query: string): Promise<AbbreviationResolution[]> {
    const resolutions: AbbreviationResolution[] = [];
    const words = query.toLowerCase().split(/\s+/);

    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '');
      
      if (this.commonAbbreviations.has(cleanWord)) {
        const fullForm = this.commonAbbreviations.get(cleanWord)!;
        
        resolutions.push({
          abbreviation: cleanWord,
          fullForm,
          confidence: 0.9,
          context: query,
          domain: 'technology'
        });
      }
    }

    // Use LLM for context-specific abbreviations
    if (resolutions.length === 0) {
      try {
        const llmResolutions = await this.resolveAbbreviationsWithLLM(query);
        resolutions.push(...llmResolutions);
      } catch (error) {
        console.warn('LLM abbreviation resolution failed:', error);
      }
    }

    return resolutions;
  }

  // Enrich entities with additional information
  async enrichEntities(entities: NamedEntity[]): Promise<EnrichedEntity[]> {
    return Promise.all(entities.map(entity => this.enrichEntity(entity)));
  }

  // Link entities to external resources
  async linkEntities(entities: NamedEntity[]): Promise<EntityLink[]> {
    const links: EntityLink[] = [];

    for (const entity of entities) {
      const link = await this.createEntityLink(entity);
      if (link) {
        links.push(link);
      }
    }

    return links;
  }

  // Extract entities using compromise.js
  private async extractWithCompromise(query: string): Promise<NamedEntity[]> {
    const doc = compromise(query);
    const entities: NamedEntity[] = [];

    // Extract people
    const people = doc.people().out('array');
    people.forEach((person, index) => {
      const match = doc.match(person);
      if (match.found) {
        entities.push({
          text: person,
          type: 'person',
          confidence: 0.8,
          startIndex: query.toLowerCase().indexOf(person.toLowerCase()),
          endIndex: query.toLowerCase().indexOf(person.toLowerCase()) + person.length,
          metadata: { source: 'compromise' }
        });
      }
    });

    // Extract organizations
    const orgs = doc.organizations().out('array');
    orgs.forEach((org, index) => {
      const match = doc.match(org);
      if (match.found) {
        entities.push({
          text: org,
          type: 'organization',
          confidence: 0.75,
          startIndex: query.toLowerCase().indexOf(org.toLowerCase()),
          endIndex: query.toLowerCase().indexOf(org.toLowerCase()) + org.length,
          metadata: { source: 'compromise' }
        });
      }
    });

    // Extract places
    const places = doc.places().out('array');
    places.forEach((place, index) => {
      const match = doc.match(place);
      if (match.found) {
        entities.push({
          text: place,
          type: 'location',
          confidence: 0.7,
          startIndex: query.toLowerCase().indexOf(place.toLowerCase()),
          endIndex: query.toLowerCase().indexOf(place.toLowerCase()) + place.length,
          metadata: { source: 'compromise' }
        });
      }
    });

    return entities.filter(e => e.startIndex >= 0); // Remove entities not found in original query
  }

  // Extract entities using regex patterns
  private async extractWithRegex(query: string): Promise<NamedEntity[]> {
    const entities: NamedEntity[] = [];

    for (const [entityType, regexes] of this.technicalTermsRegex.entries()) {
      for (const regex of regexes) {
        let match;
        while ((match = regex.exec(query)) !== null) {
          entities.push({
            text: match[0],
            type: entityType,
            confidence: 0.85,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            metadata: { source: 'regex', pattern: regex.source }
          });
        }
      }
    }

    // Extract email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    let match;
    while ((match = emailRegex.exec(query)) !== null) {
      entities.push({
        text: match[0],
        type: 'email',
        confidence: 0.95,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        metadata: { source: 'regex' }
      });
    }

    // Extract URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    while ((match = urlRegex.exec(query)) !== null) {
      entities.push({
        text: match[0],
        type: 'url',
        confidence: 0.95,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        metadata: { source: 'regex' }
      });
    }

    // Extract version numbers
    const versionRegex = /\b\d+\.\d+(\.\d+)?(-[\w.]+)?\b/g;
    while ((match = versionRegex.exec(query)) !== null) {
      entities.push({
        text: match[0],
        type: 'version',
        confidence: 0.7,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        metadata: { source: 'regex' }
      });
    }

    return entities;
  }

  // Extract entities using LLM
  private async extractWithLLM(query: string): Promise<NamedEntity[]> {
    try {
      const systemPrompt = `Extract named entities from the given technical query. Return a JSON array of entities with this structure:
      [{"text": "entity text", "type": "entity_type", "confidence": 0.95, "startIndex": 0, "endIndex": 5, "metadata": {}}]
      
      Entity types: person, organization, technology, programming_language, framework, concept, file_type, date, location, version, url, email, command
      
      Focus on technical terms, programming languages, frameworks, technologies, and concepts.`;

      const prompt = `Extract entities from: "${query}"`;
      
      const response = await this.llmService.generateCompletion(prompt, systemPrompt, 'openai', 0.1);
      
      const parsed = JSON.parse(response.content);
      
      if (Array.isArray(parsed)) {
        return parsed.map(entity => ({
          ...entity,
          metadata: { ...entity.metadata, source: 'llm' }
        }));
      }
      
      return [];
    } catch (error) {
      console.warn('LLM entity extraction failed:', error);
      return [];
    }
  }

  // Merge and deduplicate entities
  private mergeEntities(entities: NamedEntity[]): NamedEntity[] {
    const merged = new Map<string, NamedEntity>();

    for (const entity of entities) {
      const key = `${entity.text.toLowerCase()}_${entity.type}`;
      
      if (merged.has(key)) {
        const existing = merged.get(key)!;
        // Keep the one with higher confidence
        if (entity.confidence > existing.confidence) {
          merged.set(key, entity);
        }
      } else {
        merged.set(key, entity);
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
  }

  // Enrich a single entity
  private async enrichEntity(entity: NamedEntity): Promise<EnrichedEntity> {
    const enriched: EnrichedEntity = {
      ...entity,
      synonyms: await this.getSynonyms(entity.text),
      relatedTerms: await this.getRelatedTerms(entity.text),
      description: await this.getEntityDescription(entity.text, entity.type),
      wikipediaUrl: await this.getWikipediaUrl(entity.text),
      officialDocumentation: await this.getDocumentationUrl(entity.text)
    };

    return enriched;
  }

  // Helper methods for entity enrichment
  private async getSynonyms(entityText: string): Promise<string[]> {
    // Use LLM to get synonyms for technical terms
    try {
      const synonyms = await this.llmService.expandWithSynonyms(entityText);
      return synonyms.slice(0, 5); // Limit to 5 synonyms
    } catch (error) {
      return [];
    }
  }

  private async getRelatedTerms(entityText: string): Promise<string[]> {
    // Use LLM to get related technical terms
    try {
      const prompt = `List 3-5 technical terms related to "${entityText}". Return as JSON array.`;
      const response = await this.llmService.generateCompletion(prompt, undefined, 'openai', 0.3);
      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch (error) {
      return [];
    }
  }

  private async getEntityDescription(entityText: string, entityType: EntityType): Promise<string | undefined> {
    if (!this.isTechnicalEntity({ text: entityText, type: entityType } as NamedEntity)) {
      return undefined;
    }

    try {
      const prompt = `Provide a brief technical description of "${entityText}". Keep it under 100 words.`;
      const response = await this.llmService.generateCompletion(prompt, undefined, 'openai', 0.1);
      return response.content.trim();
    } catch (error) {
      return undefined;
    }
  }

  private async getWikipediaUrl(entityText: string): Promise<string | undefined> {
    // For now, construct Wikipedia URL - in production would use Wikipedia API
    const encoded = encodeURIComponent(entityText.replace(/\s+/g, '_'));
    return `https://en.wikipedia.org/wiki/${encoded}`;
  }

  private async getDocumentationUrl(entityText: string): Promise<string | undefined> {
    // Map common technologies to their documentation URLs
    const docUrls = new Map<string, string>([
      ['react', 'https://reactjs.org/docs'],
      ['vue', 'https://vuejs.org/guide/'],
      ['angular', 'https://angular.io/docs'],
      ['express', 'https://expressjs.com/'],
      ['node.js', 'https://nodejs.org/docs/'],
      ['typescript', 'https://www.typescriptlang.org/docs/'],
      ['javascript', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'],
      ['python', 'https://docs.python.org/3/'],
      ['docker', 'https://docs.docker.com/'],
      ['kubernetes', 'https://kubernetes.io/docs/']
    ]);

    return docUrls.get(entityText.toLowerCase());
  }

  private async getOfficialSiteUrl(entityText: string): Promise<string | undefined> {
    // Map common technologies to their official sites
    const officialSites = new Map<string, string>([
      ['react', 'https://reactjs.org/'],
      ['vue', 'https://vuejs.org/'],
      ['angular', 'https://angular.io/'],
      ['express', 'https://expressjs.com/'],
      ['node.js', 'https://nodejs.org/'],
      ['typescript', 'https://www.typescriptlang.org/'],
      ['python', 'https://www.python.org/'],
      ['docker', 'https://www.docker.com/'],
      ['kubernetes', 'https://kubernetes.io/']
    ]);

    return officialSites.get(entityText.toLowerCase());
  }

  // Utility methods
  private isTechnicalEntity(entity: NamedEntity): boolean {
    const technicalTypes: EntityType[] = [
      'technology', 'programming_language', 'framework', 'concept', 'file_type', 'command'
    ];
    return technicalTypes.includes(entity.type);
  }

  private getTechnicalCategory(text: string, type: EntityType): 'language' | 'framework' | 'library' | 'tool' | 'concept' | 'standard' {
    switch (type) {
      case 'programming_language':
        return 'language';
      case 'framework':
        return 'framework';
      case 'technology':
        return text.toLowerCase().includes('docker') || text.toLowerCase().includes('git') ? 'tool' : 'library';
      case 'concept':
        return 'concept';
      default:
        return 'tool';
    }
  }

  private extractVersion(text: string): string | undefined {
    const versionMatch = text.match(/\d+\.\d+(\.\d+)?/);
    return versionMatch ? versionMatch[0] : undefined;
  }

  private async createEntityLink(entity: NamedEntity): Promise<EntityLink | null> {
    // Create links to external resources based on entity type
    switch (entity.type) {
      case 'technology':
      case 'programming_language':
      case 'framework':
        const docUrl = await this.getDocumentationUrl(entity.text);
        if (docUrl) {
          return {
            linkedUrl: docUrl,
            confidence: 0.8,
            metadata: { linkType: 'documentation' }
          };
        }
        break;
      
      case 'person':
      case 'organization':
        const wikiUrl = await this.getWikipediaUrl(entity.text);
        if (wikiUrl) {
          return {
            linkedUrl: wikiUrl,
            confidence: 0.6,
            metadata: { linkType: 'wikipedia' }
          };
        }
        break;
    }

    return null;
  }

  private async resolveAbbreviationsWithLLM(query: string): Promise<AbbreviationResolution[]> {
    try {
      const systemPrompt = `Find and resolve abbreviations in the given technical query. Return JSON array:
      [{"abbreviation": "js", "fullForm": "JavaScript", "confidence": 0.95, "context": "query context", "domain": "programming"}]`;

      const prompt = `Find abbreviations in: "${query}"`;
      
      const response = await this.llmService.generateCompletion(prompt, systemPrompt, 'openai', 0.1);
      
      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('LLM abbreviation resolution failed:', error);
      return [];
    }
  }

  private async storeExtractedEntities(query: string, entities: NamedEntity[]): Promise<void> {
    if (!this.db) return;

    try {
      const queryHash = require('crypto').createHash('sha256').update(query.toLowerCase().trim()).digest('hex').substring(0, 16);
      
      for (const entity of entities) {
        await this.db.query(`
          INSERT INTO query_entities (query_hash, entity_text, entity_type, confidence_score, start_index, end_index, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT DO NOTHING
        `, [
          queryHash,
          entity.text,
          entity.type,
          entity.confidence,
          entity.startIndex,
          entity.endIndex,
          JSON.stringify(entity.metadata)
        ]);
      }
    } catch (error) {
      console.error('Failed to store extracted entities:', error);
    }
  }

  private getCacheKey(query: string, options: EntityExtractionOptions): string {
    const content = `${query}|${JSON.stringify(options)}`;
    return require('crypto').createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  // Performance metrics
  async getExtractionMetrics(): Promise<{
    totalExtractions: number;
    averageEntitiesPerQuery: number;
    entityTypeDistribution: Record<EntityType, number>;
    averageConfidence: number;
  }> {
    if (!this.db) {
      return {
        totalExtractions: 0,
        averageEntitiesPerQuery: 0,
        entityTypeDistribution: {} as Record<EntityType, number>,
        averageConfidence: 0
      };
    }

    try {
      // Get total extractions and averages
      const totalResult = await this.db.query(`
        SELECT 
          COUNT(*) as total_entities,
          COUNT(DISTINCT query_hash) as unique_queries,
          AVG(confidence_score) as avg_confidence
        FROM query_entities
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);

      const row = totalResult.rows[0];
      const totalEntities = parseInt(row.total_entities);
      const uniqueQueries = parseInt(row.unique_queries);
      const avgConfidence = parseFloat(row.avg_confidence) || 0;

      // Get entity type distribution
      const distributionResult = await this.db.query(`
        SELECT entity_type, COUNT(*) as count
        FROM query_entities
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY entity_type
      `);

      const entityTypeDistribution: Record<EntityType, number> = {} as Record<EntityType, number>;
      distributionResult.rows.forEach(row => {
        entityTypeDistribution[row.entity_type as EntityType] = parseInt(row.count);
      });

      return {
        totalExtractions: totalEntities,
        averageEntitiesPerQuery: uniqueQueries > 0 ? totalEntities / uniqueQueries : 0,
        entityTypeDistribution,
        averageConfidence: avgConfidence
      };
    } catch (error) {
      console.error('Failed to get extraction metrics:', error);
      return {
        totalExtractions: 0,
        averageEntitiesPerQuery: 0,
        entityTypeDistribution: {} as Record<EntityType, number>,
        averageConfidence: 0
      };
    }
  }
}