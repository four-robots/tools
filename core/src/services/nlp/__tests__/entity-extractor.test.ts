import { EntityExtractor } from '../entity-extractor.js';
import { LLMService } from '../llm-service.js';
import { DatabaseManager } from '../../../utils/database.js';
import {
  NamedEntity,
  TechnicalEntity,
  EnrichedEntity,
  EntityType,
  AbbreviationResolution
} from '../../../shared/types/nlp.js';

// Mock dependencies
jest.mock('../llm-service.js');
jest.mock('../../../utils/database.js');

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;
  let mockLLMService: jest.Mocked<LLMService>;
  let mockDb: jest.Mocked<DatabaseManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    } as any;

    mockLLMService = {
      generateCompletion: jest.fn(),
      expandWithSynonyms: jest.fn()
    } as any;

    extractor = new EntityExtractor(mockLLMService, mockDb);
  });

  describe('Basic Entity Extraction', () => {
    it('should extract programming languages', async () => {
      const entities = await extractor.extractEntities('JavaScript and Python programming');

      expect(entities).toHaveLength(2);
      
      const jsEntity = entities.find(e => e.text.toLowerCase().includes('javascript'));
      const pyEntity = entities.find(e => e.text.toLowerCase().includes('python'));
      
      expect(jsEntity?.type).toBe('programming_language');
      expect(pyEntity?.type).toBe('programming_language');
      expect(jsEntity?.confidence).toBeGreaterThan(0.8);
      expect(pyEntity?.confidence).toBeGreaterThan(0.8);
    });

    it('should extract frameworks', async () => {
      const entities = await extractor.extractEntities('React and Angular development');

      expect(entities.length).toBeGreaterThan(0);
      
      const reactEntity = entities.find(e => e.text.toLowerCase().includes('react'));
      const angularEntity = entities.find(e => e.text.toLowerCase().includes('angular'));
      
      expect(reactEntity?.type).toBe('framework');
      expect(angularEntity?.type).toBe('framework');
    });

    it('should extract technologies', async () => {
      const entities = await extractor.extractEntities('Docker and Kubernetes deployment');

      const dockerEntity = entities.find(e => e.text.toLowerCase().includes('docker'));
      const k8sEntity = entities.find(e => e.text.toLowerCase().includes('kubernetes'));
      
      expect(dockerEntity?.type).toBe('technology');
      expect(k8sEntity?.type).toBe('technology');
    });

    it('should extract file types', async () => {
      const entities = await extractor.extractEntities('Edit the config.json and styles.css files');

      const jsonEntity = entities.find(e => e.text.includes('.json'));
      const cssEntity = entities.find(e => e.text.includes('.css'));
      
      expect(jsonEntity?.type).toBe('file_type');
      expect(cssEntity?.type).toBe('file_type');
    });

    it('should extract email addresses', async () => {
      const entities = await extractor.extractEntities('Contact support at help@example.com');

      const emailEntity = entities.find(e => e.type === 'email');
      
      expect(emailEntity).toBeDefined();
      expect(emailEntity?.text).toBe('help@example.com');
      expect(emailEntity?.confidence).toBeGreaterThan(0.9);
    });

    it('should extract URLs', async () => {
      const entities = await extractor.extractEntities('Visit https://reactjs.org for documentation');

      const urlEntity = entities.find(e => e.type === 'url');
      
      expect(urlEntity).toBeDefined();
      expect(urlEntity?.text).toBe('https://reactjs.org');
      expect(urlEntity?.confidence).toBeGreaterThan(0.9);
    });

    it('should extract version numbers', async () => {
      const entities = await extractor.extractEntities('Node.js version 18.15.0 required');

      const versionEntity = entities.find(e => e.type === 'version');
      
      expect(versionEntity).toBeDefined();
      expect(versionEntity?.text).toBe('18.15.0');
      expect(versionEntity?.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('LLM-Enhanced Extraction', () => {
    it('should use LLM for complex entity extraction', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'microservices',
            type: 'concept',
            confidence: 0.9,
            startIndex: 20,
            endIndex: 33,
            metadata: { source: 'llm' }
          }
        ])
      });

      const entities = await extractor.extractEntities(
        'How to implement microservices architecture?'
      );

      expect(mockLLMService.generateCompletion).toHaveBeenCalled();
      
      const llmEntity = entities.find(e => e.metadata?.source === 'llm');
      expect(llmEntity).toBeDefined();
      expect(llmEntity?.text).toBe('microservices');
      expect(llmEntity?.type).toBe('concept');
    });

    it('should handle LLM failures gracefully', async () => {
      mockLLMService.generateCompletion.mockRejectedValue(new Error('LLM API failed'));

      const entities = await extractor.extractEntities('React development');

      // Should still work with regex and compromise extraction
      expect(entities.length).toBeGreaterThan(0);
      const reactEntity = entities.find(e => e.text.toLowerCase().includes('react'));
      expect(reactEntity).toBeDefined();
    });
  });

  describe('Technical Term Extraction', () => {
    it('should extract technical entities with additional metadata', async () => {
      const entities = await extractor.extractTechnicalTerms(
        'React 18.2.0 with TypeScript for web development'
      );

      expect(entities.length).toBeGreaterThan(0);
      
      const reactEntity = entities.find(e => e.text.toLowerCase().includes('react'));
      expect(reactEntity?.category).toBe('framework');
      
      const tsEntity = entities.find(e => e.text.toLowerCase().includes('typescript'));
      expect(tsEntity?.category).toBe('language');
    });

    it('should extract version information from technical terms', async () => {
      const entities = await extractor.extractTechnicalTerms('Node.js v18.15.0');

      const nodeEntity = entities.find(e => e.text.toLowerCase().includes('node'));
      expect(nodeEntity?.version).toBeDefined();
    });

    it('should provide documentation URLs for known technologies', async () => {
      const entities = await extractor.extractTechnicalTerms('React documentation');

      const reactEntity = entities.find(e => e.text.toLowerCase().includes('react'));
      expect(reactEntity?.documentation).toContain('reactjs.org');
      expect(reactEntity?.officialSite).toContain('reactjs.org');
    });
  });

  describe('Abbreviation Resolution', () => {
    it('should resolve common technical abbreviations', async () => {
      const resolutions = await extractor.resolveAbbreviations(
        'Use JS and TS for API development'
      );

      expect(resolutions.length).toBeGreaterThan(0);
      
      const jsResolution = resolutions.find(r => r.abbreviation === 'js');
      const tsResolution = resolutions.find(r => r.abbreviation === 'ts');
      const apiResolution = resolutions.find(r => r.abbreviation === 'api');
      
      expect(jsResolution?.fullForm).toBe('JavaScript');
      expect(tsResolution?.fullForm).toBe('TypeScript');
      expect(apiResolution?.fullForm).toBe('Application Programming Interface');
    });

    it('should use LLM for context-specific abbreviations', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            abbreviation: 'k8s',
            fullForm: 'Kubernetes',
            confidence: 0.95,
            context: 'container orchestration',
            domain: 'devops'
          }
        ])
      });

      const resolutions = await extractor.resolveAbbreviations(
        'Deploy with k8s clusters'
      );

      const k8sResolution = resolutions.find(r => r.abbreviation === 'k8s');
      expect(k8sResolution?.fullForm).toBe('Kubernetes');
      expect(k8sResolution?.domain).toBe('devops');
    });
  });

  describe('Entity Enrichment', () => {
    it('should enrich entities with additional information', async () => {
      mockLLMService.expandWithSynonyms.mockResolvedValue(['JS', 'ECMAScript']);
      mockLLMService.generateCompletion
        .mockResolvedValueOnce({
          content: JSON.stringify(['Node.js', 'Frontend', 'Backend'])
        })
        .mockResolvedValueOnce({
          content: 'JavaScript is a high-level programming language used for web development.'
        });

      const baseEntity: NamedEntity = {
        text: 'JavaScript',
        type: 'programming_language',
        confidence: 0.9,
        startIndex: 0,
        endIndex: 10,
        metadata: {}
      };

      const enriched = await extractor.enrichEntities([baseEntity]);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].synonyms).toContain('JS');
      expect(enriched[0].relatedTerms).toContain('Node.js');
      expect(enriched[0].description).toContain('programming language');
      expect(enriched[0].wikipediaUrl).toContain('wikipedia.org');
    });
  });

  describe('Entity Linking', () => {
    it('should create links for technical entities', async () => {
      const entities: NamedEntity[] = [
        {
          text: 'React',
          type: 'framework',
          confidence: 0.9,
          startIndex: 0,
          endIndex: 5,
          metadata: {}
        }
      ];

      const links = await extractor.linkEntities(entities);

      expect(links).toHaveLength(1);
      expect(links[0].linkedUrl).toContain('reactjs.org');
      expect(links[0].metadata?.linkType).toBe('documentation');
    });

    it('should create Wikipedia links for people and organizations', async () => {
      const entities: NamedEntity[] = [
        {
          text: 'Microsoft',
          type: 'organization',
          confidence: 0.8,
          startIndex: 0,
          endIndex: 9,
          metadata: {}
        }
      ];

      const links = await extractor.linkEntities(entities);

      expect(links).toHaveLength(1);
      expect(links[0].linkedUrl).toContain('wikipedia.org');
      expect(links[0].metadata?.linkType).toBe('wikipedia');
    });
  });

  describe('Entity Merging and Deduplication', () => {
    it('should merge duplicate entities', async () => {
      // Mock LLM to return duplicate entities
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'React',
            type: 'framework',
            confidence: 0.8,
            startIndex: 0,
            endIndex: 5,
            metadata: { source: 'llm' }
          }
        ])
      });

      const entities = await extractor.extractEntities('React development');

      // Should deduplicate React entities from regex and LLM
      const reactEntities = entities.filter(e => e.text.toLowerCase().includes('react'));
      expect(reactEntities).toHaveLength(1);
      
      // Should keep the higher confidence entity
      expect(reactEntities[0].confidence).toBeGreaterThan(0.8);
    });

    it('should sort entities by confidence', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'low',
            type: 'concept',
            confidence: 0.3,
            startIndex: 0,
            endIndex: 3,
            metadata: { source: 'llm' }
          },
          {
            text: 'high',
            type: 'concept',
            confidence: 0.9,
            startIndex: 4,
            endIndex: 8,
            metadata: { source: 'llm' }
          }
        ])
      });

      const entities = await extractor.extractEntities('low confidence vs high confidence');

      // Should be sorted by confidence (high to low)
      expect(entities[0].confidence).toBeGreaterThan(entities[1].confidence);
    });
  });

  describe('Confidence Filtering', () => {
    it('should filter entities by confidence threshold', async () => {
      mockLLMService.generateCompletion.mockResolvedValue({
        content: JSON.stringify([
          {
            text: 'highconf',
            type: 'concept',
            confidence: 0.9,
            startIndex: 0,
            endIndex: 8,
            metadata: {}
          },
          {
            text: 'lowconf',
            type: 'concept',
            confidence: 0.2,
            startIndex: 9,
            endIndex: 16,
            metadata: {}
          }
        ])
      });

      const entities = await extractor.extractEntities(
        'highconf and lowconf terms',
        { confidenceThreshold: 0.5 }
      );

      expect(entities).toHaveLength(1);
      expect(entities[0].text).toBe('highconf');
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate extraction metrics', async () => {
      // Mock database response
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            total_entities: 1000,
            unique_queries: 200,
            avg_confidence: 0.78
          }],
          rowCount: 1
        })
        .mockResolvedValueOnce({
          rows: [
            { entity_type: 'programming_language', count: 400 },
            { entity_type: 'framework', count: 300 },
            { entity_type: 'technology', count: 200 },
            { entity_type: 'concept', count: 100 }
          ],
          rowCount: 4
        });

      const metrics = await extractor.getExtractionMetrics();

      expect(metrics.totalExtractions).toBe(1000);
      expect(metrics.averageEntitiesPerQuery).toBe(5);
      expect(metrics.averageConfidence).toBe(0.78);
      expect(metrics.entityTypeDistribution.programming_language).toBe(400);
    });

    it('should handle missing database gracefully', async () => {
      const extractorWithoutDb = new EntityExtractor(mockLLMService);

      const metrics = await extractorWithoutDb.getExtractionMetrics();

      expect(metrics.totalExtractions).toBe(0);
      expect(metrics.averageEntitiesPerQuery).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty queries', async () => {
      const entities = await extractor.extractEntities('');

      expect(entities).toHaveLength(0);
    });

    it('should handle queries with no entities', async () => {
      const entities = await extractor.extractEntities('hello world simple text');

      // Might extract some entities from compromise.js but should handle gracefully
      expect(entities).toBeDefined();
    });

    it('should handle special characters and symbols', async () => {
      const entities = await extractor.extractEntities('Use @angular/core with $http service');

      // Should still extract Angular despite special characters
      const angularEntity = entities.find(e => e.text.toLowerCase().includes('angular'));
      expect(angularEntity).toBeDefined();
    });

    it('should handle very long queries', async () => {
      const longQuery = 'React '.repeat(100) + 'development';
      
      const entities = await extractor.extractEntities(longQuery);

      expect(entities).toBeDefined();
      // Should handle deduplication properly
      const reactEntities = entities.filter(e => e.text.toLowerCase().includes('react'));
      expect(reactEntities.length).toBeLessThan(10); // Should be deduplicated
    });
  });

  describe('Caching', () => {
    it('should cache extraction results', async () => {
      const query = 'React development';
      
      // First call
      const entities1 = await extractor.extractEntities(query);
      
      // Second call should use cache (mock won't be called again for same query)
      const entities2 = await extractor.extractEntities(query);

      expect(entities1).toEqual(entities2);
    });

    it('should respect cache options', async () => {
      const query = 'React development';
      
      // Call with different options should not use cache
      const entities1 = await extractor.extractEntities(query, { confidenceThreshold: 0.5 });
      const entities2 = await extractor.extractEntities(query, { confidenceThreshold: 0.8 });

      // Results might differ due to different confidence thresholds
      expect(entities1.length).toBeGreaterThanOrEqual(entities2.length);
    });
  });

  describe('Database Storage', () => {
    it('should store extracted entities', async () => {
      await extractor.extractEntities('React development');

      // Should call database to store entities
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO query_entities'),
        expect.arrayContaining([
          expect.any(String), // query_hash
          expect.any(String), // entity_text
          expect.any(String), // entity_type
          expect.any(Number), // confidence_score
          expect.any(Number), // start_index
          expect.any(Number), // end_index
          expect.any(String)  // metadata JSON
        ])
      );
    });

    it('should handle database storage errors gracefully', async () => {
      mockDb.query.mockRejectedValue(new Error('Database error'));

      // Should not throw error
      const entities = await extractor.extractEntities('React development');

      expect(entities).toBeDefined();
    });
  });
});