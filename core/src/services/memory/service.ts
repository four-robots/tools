/**
 * Memory Service Layer
 * 
 * Core business logic for Memory operations
 */

import crypto from 'crypto';
import { MemoryDatabaseManager } from './database.js';
import { VectorEngine } from './vectorEngine.js';
import { validateInput } from '../../utils/validation.js';
import {
  StoreMemorySchema,
  RetrieveMemorySchema,
  SearchMemoriesSchema,
  CreateConnectionSchema,
  MemoryError,
  MemoryNotFoundError
} from './types.js';
import type {
  Memory,
  MemoryNode,
  ConceptInfo,
  RelatedMemories,
  MemorySearchResults,
  MemoryStats,
  StoreMemoryInput,
  RetrieveMemoryInput,
  SearchMemoriesInput,
  CreateConnectionInput
} from './types.js';

export class MemoryService {
  constructor(
    private database: MemoryDatabaseManager,
    private vectorEngine: VectorEngine
  ) {}

  async storeMemory(input: StoreMemoryInput): Promise<MemoryNode> {
    const args = validateInput(StoreMemorySchema, input);
    
    try {
      // Generate content hash for deduplication
      const contentHash = crypto
        .createHash('sha256')
        .update(args.content)
        .digest('hex');

      // Check for existing memory with same content hash
      const existing = await this.database.searchMemories({ 
        contentHash, 
        limit: 1 
      });
      
      if (existing.length > 0) {
        // Return existing memory instead of creating duplicate
        return this.convertToMemoryNode(existing[0]);
      }

      // Store memory in database
      const memoryRecord = await this.database.createMemory({
        content: args.content,
        content_hash: contentHash,
        context: JSON.stringify(args.context),
        importance: args.importance || 1,
        status: 'active',
        access_count: 0,
        last_accessed_at: null,
        vector_id: null,
        created_by: args.context.userId || null,
        metadata: JSON.stringify({})
      });

      // Extract and store concepts
      const conceptNames = args.concepts || this.extractConcepts(args.content);
      const concepts: ConceptInfo[] = [];
      
      for (const conceptName of conceptNames) {
        let concept = await this.database.findConceptByName(conceptName);
        if (!concept) {
          concept = await this.database.createConcept({
            name: conceptName,
            description: null,
            type: 'topic',
            confidence: 0.8,
            extracted_at: new Date().toISOString()
          });
        }
        
        await this.database.linkMemoryConcept(memoryRecord.id, concept.id);
        concepts.push({
          id: concept.id,
          name: concept.name,
          description: concept.description || undefined,
          type: concept.type,
          confidence: concept.confidence,
          extractedAt: concept.extracted_at
        });
      }

      // Index in vector database
      const vectorId = await this.vectorEngine.indexMemory(
        memoryRecord.id,
        args.content,
        args.context
      );

      // Update memory with vector ID
      const updatedMemory = await this.database.updateMemory(memoryRecord.id, {
        vector_id: vectorId
      });

      // Find similar memories and create automatic relationships
      await this.createAutomaticRelationships(memoryRecord.id, args.content);

      return this.convertToMemoryNode(updatedMemory, concepts);
    } catch (error) {
      console.error('Failed to store memory:', error);
      throw error;
    }
  }

  async retrieveMemories(input: RetrieveMemoryInput): Promise<MemoryNode[]> {
    const args = validateInput(RetrieveMemorySchema, input);
    
    try {
      let memoryIds: string[] | undefined;
      
      // If query provided, use vector search to find similar memories
      if (args.query) {
        const similarMemories = await this.vectorEngine.findSimilar(
          args.query,
          args.similarityThreshold || 0.7,
          args.limit || 10
        );
        memoryIds = similarMemories.map(m => m.memoryId);
      }

      // Build database filters
      const filters: any = {
        status: 'active',
        limit: args.limit || 10
      };
      
      if (args.userId) {
        filters.createdBy = args.userId;
      }

      // Get memories from database
      let memories = await this.database.searchMemories(filters);
      
      // Filter by memory IDs from vector search if applicable
      if (memoryIds) {
        memories = memories.filter(m => memoryIds!.includes(m.id));
      }

      // Convert to MemoryNodes
      const memoryNodes: MemoryNode[] = [];
      for (const memory of memories) {
        const concepts = await this.database.getMemoryConcepts(memory.id);
        memoryNodes.push(this.convertToMemoryNode(memory, concepts.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || undefined,
          type: c.type,
          confidence: c.confidence,
          extractedAt: c.extracted_at
        }))));
      }

      return memoryNodes;
    } catch (error) {
      console.error('Failed to retrieve memories:', error);
      throw error;
    }
  }

  async searchMemories(input: SearchMemoriesInput): Promise<MemorySearchResults> {
    const args = validateInput(SearchMemoriesSchema, input);
    const startTime = Date.now();
    
    try {
      // Use vector search to find similar memories
      const similarMemories = await this.vectorEngine.findSimilar(
        args.query,
        args.similarityThreshold || 0.7,
        args.limit || 10
      );
      
      const memoryIds = similarMemories.map(m => m.memoryId);
      
      // Get full memory records
      const memories: MemoryNode[] = [];
      for (const memoryId of memoryIds) {
        const memoryRecord = await this.database.getMemory(memoryId);
        if (memoryRecord && memoryRecord.status === 'active') {
          const concepts = await this.database.getMemoryConcepts(memoryId);
          memories.push(this.convertToMemoryNode(memoryRecord, concepts.map(c => ({
            id: c.id,
            name: c.name,
            description: c.description || undefined,
            type: c.type,
            confidence: c.confidence,
            extractedAt: c.extracted_at
          }))));
        }
      }
      
      const processingTimeMs = Date.now() - startTime;
      
      return {
        memories,
        total: memories.length,
        processingTimeMs
      };
    } catch (error) {
      console.error('Failed to search memories:', error);
      throw error;
    }
  }

  async createConnection(input: CreateConnectionInput): Promise<void> {
    const args = validateInput(CreateConnectionSchema, input);
    
    try {
      // Validate memory IDs exist
      const [source, target] = await Promise.all([
        this.database.getMemory(args.sourceId),
        this.database.getMemory(args.targetId)
      ]);
      
      if (!source || !target) {
        throw new MemoryError('One or both memory IDs do not exist', 'INVALID_MEMORY_ID', 400);
      }
      
      // Create relationship in database
      await this.database.createRelationship({
        source_id: args.sourceId,
        target_id: args.targetId,
        relationship_type: args.relationshipType,
        strength: args.strength || 1.0,
        bidirectional: args.bidirectional || false,
        metadata: JSON.stringify(args.metadata || {}),
        last_updated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to create connection:', error);
      throw error;
    }
  }

  async getRelatedMemories(memoryId: string, _maxDepth?: number, _minStrength?: number): Promise<RelatedMemories> {
    try {
      // Get the center memory
      const centerMemoryRecord = await this.database.getMemory(memoryId);
      if (!centerMemoryRecord) {
        throw new MemoryNotFoundError(memoryId);
      }
      
      const centerConcepts = await this.database.getMemoryConcepts(memoryId);
      const centerMemory = this.convertToMemoryNode(centerMemoryRecord, centerConcepts.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || undefined,
        type: c.type,
        confidence: c.confidence,
        extractedAt: c.extracted_at
      })));
      
      // Get direct relationships
      const relationships = await this.database.getRelationships(memoryId);
      const relatedNodes = [];
      
      for (const rel of relationships) {
        const relatedId = rel.source_id === memoryId ? rel.target_id : rel.source_id;
        const relatedMemoryRecord = await this.database.getMemory(relatedId);
        
        if (relatedMemoryRecord && relatedMemoryRecord.status === 'active') {
          const relatedConcepts = await this.database.getMemoryConcepts(relatedId);
          const relatedMemory = this.convertToMemoryNode(relatedMemoryRecord, relatedConcepts.map(c => ({
            id: c.id,
            name: c.name,
            description: c.description || undefined,
            type: c.type,
            confidence: c.confidence,
            extractedAt: c.extracted_at
          })));
          
          relatedNodes.push({
            memory: relatedMemory,
            relationship: {
              id: rel.id,
              sourceId: rel.source_id,
              targetId: rel.target_id,
              relationshipType: rel.relationship_type,
              strength: rel.strength,
              bidirectional: rel.bidirectional,
              metadata: this.safeJsonParse(rel.metadata),
              lastUpdated: rel.last_updated,
              createdAt: rel.created_at,
              updatedAt: rel.updated_at
            },
            distance: 1
          });
        }
      }
      
      return {
        centerMemory,
        relatedNodes,
        clusters: [], // TODO: Implement clustering
        concepts: centerConcepts.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || undefined,
          type: c.type,
          confidence: c.confidence,
          extractedAt: c.extracted_at
        }))
      };
    } catch (error) {
      console.error('Failed to get related memories:', error);
      throw error;
    }
  }

  async getStats(): Promise<MemoryStats> {
    try {
      const stats = await this.database.getMemoryStats();
      
      // Calculate real average importance
      const averageImportance = await this.database.getAverageImportance();
      
      // Get most active users
      const mostActiveUsers = await this.database.getMostActiveUsers(10);
      
      // Get top projects
      const topProjects = await this.database.getTopProjects(10);
      
      // Get concept distribution
      const conceptDistribution = await this.database.getConceptDistribution();
      
      return {
        totalMemories: stats.totalMemories,
        totalRelationships: stats.totalRelationships,
        totalConcepts: stats.totalConcepts,
        averageImportance,
        mostActiveUsers: mostActiveUsers.map((user: any) => ({
          userId: user.created_by,
          count: user.memory_count
        })),
        topProjects: topProjects.map((project: any) => ({
          projectName: project.project_name,
          count: project.memory_count
        })),
        conceptDistribution
      };
    } catch (error) {
      console.error('Failed to get memory stats:', error);
      throw error;
    }
  }

  async mergeMemories(primaryId: string, secondaryIds: string[], strategy: 'combine' | 'replace' | 'append'): Promise<MemoryNode> {
    try {
      // Validate all memory IDs exist
      const [primaryMemory, ...secondaryMemories] = await Promise.all([
        this.database.getMemory(primaryId),
        ...secondaryIds.map(id => this.database.getMemory(id))
      ]);

      if (!primaryMemory) {
        throw new MemoryNotFoundError(primaryId);
      }

      const missingIds = secondaryIds.filter((id, index) => !secondaryMemories[index]);
      if (missingIds.length > 0) {
        throw new MemoryError(`Secondary memories not found: ${missingIds.join(', ')}`, 'NOT_FOUND', 404);
      }

      // Get concepts for all memories
      const [primaryConcepts, ...secondaryConceptArrays] = await Promise.all([
        this.database.getMemoryConcepts(primaryId),
        ...secondaryIds.map(id => this.database.getMemoryConcepts(id))
      ]);

      // Merge content based on strategy
      let mergedContent: string;
      let mergedImportance: number;
      let mergedMetadata: Record<string, any>;

      switch (strategy) {
        case 'combine':
          mergedContent = [primaryMemory.content, ...secondaryMemories.filter(m => m).map(m => m!.content)].join('\n\n---\n\n');
          mergedImportance = Math.max(primaryMemory.importance, ...secondaryMemories.filter(m => m).map(m => m!.importance));
          mergedMetadata = this.mergeMetadata([
            this.safeJsonParse(primaryMemory.metadata),
            ...secondaryMemories.filter(m => m).map(m => this.safeJsonParse(m!.metadata))
          ]);
          break;

        case 'replace':
          // Use primary content but merge metadata and concepts
          mergedContent = primaryMemory.content;
          mergedImportance = Math.max(primaryMemory.importance, ...secondaryMemories.filter(m => m).map(m => m!.importance));
          mergedMetadata = this.mergeMetadata([
            this.safeJsonParse(primaryMemory.metadata),
            ...secondaryMemories.filter(m => m).map(m => this.safeJsonParse(m!.metadata))
          ]);
          break;

        case 'append':
          mergedContent = primaryMemory.content + '\n\n' + secondaryMemories.filter(m => m).map(m => m!.content).join('\n\n');
          mergedImportance = Math.max(primaryMemory.importance, ...secondaryMemories.filter(m => m).map(m => m!.importance));
          mergedMetadata = this.mergeMetadata([
            this.safeJsonParse(primaryMemory.metadata),
            ...secondaryMemories.filter(m => m).map(m => this.safeJsonParse(m!.metadata))
          ]);
          break;

        default:
          throw new MemoryError(`Unknown merge strategy: ${strategy}`, 'INVALID_STRATEGY', 400);
      }

      // Merge concepts (deduplicate by name)
      const allConcepts = [primaryConcepts, ...secondaryConceptArrays].flat();
      const uniqueConcepts = allConcepts.reduce((acc, concept) => {
        const existing = acc.find(c => c.name === concept.name);
        if (existing) {
          // Keep the one with higher confidence
          if (concept.confidence > existing.confidence) {
            acc[acc.indexOf(existing)] = concept;
          }
        } else {
          acc.push(concept);
        }
        return acc;
      }, [] as typeof allConcepts);

      // Generate new content hash
      const contentHash = crypto
        .createHash('sha256')
        .update(mergedContent)
        .digest('hex');

      // Update primary memory with merged data
      const updatedMemory = await this.database.updateMemory(primaryId, {
        content: mergedContent,
        content_hash: contentHash,
        importance: mergedImportance,
        metadata: JSON.stringify(mergedMetadata),
        status: 'active'
      });

      // Clear and re-link concepts
      await this.database.clearMemoryConcepts(primaryId);
      for (const concept of uniqueConcepts) {
        await this.database.linkMemoryConcept(primaryId, concept.id);
      }

      // Update vector embedding with new content
      if (updatedMemory.vector_id) {
        await this.vectorEngine.updateVector(
          updatedMemory.vector_id,
          mergedContent,
          JSON.parse(updatedMemory.context)
        );
      }

      // Mark secondary memories as merged and redirect relationships
      for (let i = 0; i < secondaryIds.length; i++) {
        const secondaryId = secondaryIds[i];
        
        // Update status to merged with reference to primary
        const secondaryMemory = secondaryMemories[i];
        if (secondaryMemory) {
          await this.database.updateMemory(secondaryId, {
            status: 'merged',
            metadata: JSON.stringify({
              ...JSON.parse(secondaryMemory.metadata || '{}'),
              merged_into: primaryId,
              merged_at: new Date().toISOString(),
              merge_strategy: strategy
            })
          });
        }

        // Redirect relationships from secondary to primary
        await this.redirectRelationships(secondaryId, primaryId);
      }

      // Create audit trail
      await this.createMergeAuditTrail(primaryId, secondaryIds, strategy);

      // Convert and return the merged memory
      return this.convertToMemoryNode(updatedMemory, uniqueConcepts.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || undefined,
        type: c.type,
        confidence: c.confidence,
        extractedAt: c.extracted_at
      })));

    } catch (error) {
      console.error('Failed to merge memories:', error);
      throw error;
    }
  }

  // Helper methods
  private safeJsonParse(value: string | null | undefined, fallback: any = {}): any {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  private convertToMemoryNode(memoryRecord: Memory, concepts: ConceptInfo[] = []): MemoryNode {
    return {
      id: memoryRecord.id,
      content: memoryRecord.content,
      contentHash: memoryRecord.content_hash,
      context: this.safeJsonParse(memoryRecord.context),
      concepts,
      importance: memoryRecord.importance,
      status: memoryRecord.status,
      accessCount: memoryRecord.access_count,
      lastAccessedAt: memoryRecord.last_accessed_at || undefined,
      vectorId: memoryRecord.vector_id || undefined,
      createdAt: memoryRecord.created_at,
      updatedAt: memoryRecord.updated_at,
      createdBy: memoryRecord.created_by || undefined,
      metadata: this.safeJsonParse(memoryRecord.metadata)
    };
  }

  private extractConcepts(content: string): string[] {
    // Simple concept extraction - in production would use NLP
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Return unique words as basic concepts
    return [...new Set(words)].slice(0, 5);
  }

  private async createAutomaticRelationships(memoryId: string, content: string): Promise<void> {
    try {
      // Find similar memories
      const similarMemories = await this.vectorEngine.findSimilar(content, 0.8, 5);
      
      // Create semantic similarity relationships
      for (const similar of similarMemories) {
        if (similar.memoryId !== memoryId) {
          await this.database.createRelationship({
            source_id: memoryId,
            target_id: similar.memoryId,
            relationship_type: 'semantic_similarity',
            strength: similar.similarity,
            bidirectional: true,
            metadata: JSON.stringify({ auto_generated: true }),
            last_updated: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to create automatic relationships:', error);
      // Don't throw - this is optional
    }
  }

  private mergeMetadata(metadataArray: Record<string, any>[]): Record<string, any> {
    const merged: Record<string, any> = {};
    
    for (const metadata of metadataArray) {
      for (const [key, value] of Object.entries(metadata)) {
        if (merged[key] === undefined) {
          merged[key] = value;
        } else if (Array.isArray(merged[key]) && Array.isArray(value)) {
          // Merge arrays and deduplicate
          merged[key] = [...new Set([...merged[key], ...value])];
        } else if (typeof merged[key] === 'object' && typeof value === 'object' && merged[key] !== null && value !== null) {
          // Recursively merge objects
          merged[key] = this.mergeMetadata([merged[key], value]);
        } else if (merged[key] !== value) {
          // For conflicting primitive values, create an array
          if (!Array.isArray(merged[key])) {
            merged[key] = [merged[key]];
          }
          if (!merged[key].includes(value)) {
            merged[key].push(value);
          }
        }
      }
    }
    
    return merged;
  }

  private async redirectRelationships(fromMemoryId: string, toMemoryId: string): Promise<void> {
    try {
      const relationships = await this.database.getRelationships(fromMemoryId);
      
      for (const rel of relationships) {
        // Skip if this relationship already connects to the target memory
        if ((rel.source_id === toMemoryId && rel.target_id === fromMemoryId) ||
            (rel.source_id === fromMemoryId && rel.target_id === toMemoryId)) {
          continue;
        }

        // Create new relationship with the target memory
        const newSourceId = rel.source_id === fromMemoryId ? toMemoryId : rel.source_id;
        const newTargetId = rel.target_id === fromMemoryId ? toMemoryId : rel.target_id;
        
        // Check if this relationship already exists
        const existingRels = await this.database.getRelationships(toMemoryId);
        const alreadyExists = existingRels.some(existing => 
          (existing.source_id === newSourceId && existing.target_id === newTargetId) ||
          (existing.source_id === newTargetId && existing.target_id === newSourceId && existing.bidirectional)
        );

        if (!alreadyExists) {
          await this.database.createRelationship({
            source_id: newSourceId,
            target_id: newTargetId,
            relationship_type: rel.relationship_type,
            strength: rel.strength,
            bidirectional: rel.bidirectional,
            metadata: JSON.stringify({
              ...JSON.parse(rel.metadata),
              redirected_from: fromMemoryId,
              redirected_at: new Date().toISOString()
            }),
            last_updated: new Date().toISOString()
          });
        }

        // Delete the old relationship
        await this.database.deleteRelationship(rel.id);
      }
    } catch (error) {
      console.error('Failed to redirect relationships:', error);
      // Don't throw - this is optional cleanup
    }
  }

  private async createMergeAuditTrail(primaryId: string, secondaryIds: string[], strategy: string): Promise<void> {
    try {
      await this.database.createMergeAuditTrail({
        primary_memory_id: primaryId,
        merged_memory_ids: JSON.stringify(secondaryIds),
        strategy,
        created_at: new Date().toISOString(),
        created_by: null // TODO: Add user context tracking
      });
    } catch (error) {
      console.error('Failed to create merge audit trail:', error);
      // Don't throw - this is optional audit logging
    }
  }
}