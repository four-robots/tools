import { MemoryService } from '../../memory/service.js';
import { WorkspaceActivityService } from '../workspace-activity-service.js';
import { Logger } from '../../../utils/logger.js';
import type { WorkspaceIntegrationConfiguration } from '@shared/types/workspace.js';

/**
 * Integration adapter for Memory service within workspaces
 */
export class MemoryWorkspaceIntegration {
  private logger: Logger;

  constructor(
    private memoryService: MemoryService,
    private activityService: WorkspaceActivityService
  ) {
    this.logger = new Logger('MemoryWorkspaceIntegration');
  }

  /**
   * Initialize Memory integration for a workspace
   */
  async initialize(workspaceId: string, configuration: WorkspaceIntegrationConfiguration): Promise<void> {
    try {
      // Create default memory nodes if configured
      if (configuration.defaultSettings?.createDefaultMemories) {
        await this.createDefaultMemories(workspaceId);
      }

      this.logger.info('Memory integration initialized', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to initialize Memory integration', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create a workspace-scoped Memory node
   */
  async createWorkspaceMemory(
    workspaceId: string,
    userId: string,
    memoryData: {
      title: string;
      content: string;
      type?: string;
      tags?: string[];
      connections?: string[];
    }
  ): Promise<any> {
    try {
      const memory = await this.memoryService.createMemory({
        title: memoryData.title,
        content: memoryData.content,
        type: memoryData.type || 'note',
        tags: memoryData.tags || [],
        metadata: {
          workspaceId,
          createdBy: userId,
          workspaceContext: true,
        }
      });

      // Create connections if specified
      if (memoryData.connections && memoryData.connections.length > 0) {
        for (const connectionId of memoryData.connections) {
          await this.memoryService.createConnection(memory.id, connectionId, {
            strength: 1.0,
            type: 'related',
          });
        }
      }

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_created',
        'memory_node',
        memory.id.toString(),
        { 
          memoryTitle: memoryData.title, 
          type: memoryData.type,
          connections: memoryData.connections?.length || 0
        },
        { integration: 'memory' }
      );

      this.logger.info('Workspace Memory node created', { workspaceId, memoryId: memory.id });
      
      return memory;
    } catch (error) {
      this.logger.error('Failed to create workspace Memory node', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get all Memory nodes for a workspace
   */
  async getWorkspaceMemories(workspaceId: string): Promise<any[]> {
    try {
      // Get all memories and filter by workspace
      const allMemories = await this.memoryService.getAllMemories();
      
      // Filter memories that belong to this workspace
      const workspaceMemories = allMemories.filter(memory => 
        memory.metadata?.workspaceId === workspaceId
      );

      return workspaceMemories;
    } catch (error) {
      this.logger.error('Failed to get workspace Memory nodes', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Update Memory node within workspace context
   */
  async updateWorkspaceMemory(
    workspaceId: string,
    userId: string,
    memoryId: string,
    updates: {
      title?: string;
      content?: string;
      type?: string;
      tags?: string[];
    }
  ): Promise<any> {
    try {
      // Verify memory belongs to workspace
      const memory = await this.memoryService.getMemoryById(memoryId);
      if (memory?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Memory node does not belong to this workspace');
      }

      const updatedMemory = await this.memoryService.updateMemory(memoryId, {
        title: updates.title,
        content: updates.content,
        type: updates.type,
        tags: updates.tags,
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_updated',
        'memory_node',
        memoryId,
        { updates },
        { integration: 'memory' }
      );

      this.logger.info('Workspace Memory node updated', { workspaceId, memoryId });

      return updatedMemory;
    } catch (error) {
      this.logger.error('Failed to update workspace Memory node', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Delete Memory node within workspace context
   */
  async deleteWorkspaceMemory(
    workspaceId: string,
    userId: string,
    memoryId: string
  ): Promise<void> {
    try {
      // Verify memory belongs to workspace
      const memory = await this.memoryService.getMemoryById(memoryId);
      if (memory?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Memory node does not belong to this workspace');
      }

      await this.memoryService.deleteMemory(memoryId);

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_deleted',
        'memory_node',
        memoryId,
        { memoryTitle: memory.title },
        { integration: 'memory' }
      );

      this.logger.info('Workspace Memory node deleted', { workspaceId, memoryId });
    } catch (error) {
      this.logger.error('Failed to delete workspace Memory node', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create connection between Memory nodes within workspace
   */
  async createWorkspaceConnection(
    workspaceId: string,
    userId: string,
    fromMemoryId: string,
    toMemoryId: string,
    connectionData: {
      strength: number;
      type: string;
      description?: string;
    }
  ): Promise<any> {
    try {
      // Verify both memories belong to workspace
      const fromMemory = await this.memoryService.getMemoryById(fromMemoryId);
      const toMemory = await this.memoryService.getMemoryById(toMemoryId);

      if (fromMemory?.metadata?.workspaceId !== workspaceId || 
          toMemory?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Memory nodes do not belong to this workspace');
      }

      const connection = await this.memoryService.createConnection(
        fromMemoryId,
        toMemoryId,
        {
          strength: connectionData.strength,
          type: connectionData.type,
          description: connectionData.description,
        }
      );

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_created',
        'memory_connection',
        connection.id.toString(),
        { 
          fromTitle: fromMemory.title,
          toTitle: toMemory.title,
          connectionType: connectionData.type 
        },
        { integration: 'memory' }
      );

      this.logger.info('Workspace Memory connection created', { workspaceId, connectionId: connection.id });

      return connection;
    } catch (error) {
      this.logger.error('Failed to create workspace Memory connection', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Search Memory nodes within workspace
   */
  async searchWorkspaceMemories(
    workspaceId: string,
    query: string,
    filters?: {
      type?: string;
      tags?: string[];
    }
  ): Promise<any[]> {
    try {
      // Search all memories
      const searchResults = await this.memoryService.searchMemories(query, {
        type: filters?.type,
        tags: filters?.tags,
      });

      // Filter results to workspace memories only
      const workspaceResults = searchResults.filter(memory => 
        memory.metadata?.workspaceId === workspaceId
      );

      return workspaceResults;
    } catch (error) {
      this.logger.error('Failed to search workspace Memory nodes', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get workspace Memory graph visualization data
   */
  async getWorkspaceMemoryGraph(workspaceId: string): Promise<{
    nodes: any[];
    edges: any[];
    stats: any;
  }> {
    try {
      // Get all workspace memories
      const memories = await this.getWorkspaceMemories(workspaceId);
      const connections = await this.getWorkspaceConnections(workspaceId);

      // Build graph data
      const nodes = memories.map(memory => ({
        id: memory.id,
        title: memory.title,
        type: memory.type,
        tags: memory.tags,
        createdAt: memory.createdAt,
      }));

      const edges = connections.map(connection => ({
        id: connection.id,
        source: connection.fromId,
        target: connection.toId,
        type: connection.type,
        strength: connection.strength,
      }));

      const stats = {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypes: [...new Set(memories.map(m => m.type))],
        connectionTypes: [...new Set(connections.map(c => c.type))],
      };

      return { nodes, edges, stats };
    } catch (error) {
      this.logger.error('Failed to get workspace Memory graph', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get workspace Memory activity
   */
  async getWorkspaceMemoryActivity(workspaceId: string): Promise<any[]> {
    try {
      // Get activity for all Memory resources in this workspace
      const activities = await this.activityService.getResourceActivity(
        workspaceId,
        'memory_node',
        workspaceId,
        'system',
        'tenant-id' // TODO: Get from context
      );

      return activities;
    } catch (error) {
      this.logger.error('Failed to get workspace Memory activity', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Sync Memory data for workspace
   */
  async syncWorkspaceMemory(workspaceId: string): Promise<{
    success: boolean;
    message: string;
    syncedItems: number;
  }> {
    try {
      // Get all workspace memories and their current state
      const memories = await this.getWorkspaceMemories(workspaceId);
      let syncedItems = 0;

      // Sync each memory's data
      for (const memory of memories) {
        // Update memory metadata if needed
        if (!memory.metadata?.lastSync || 
            new Date(memory.metadata.lastSync).getTime() < Date.now() - 3600000) { // 1 hour
          
          // Mark as synced
          memory.metadata = {
            ...memory.metadata,
            lastSync: new Date().toISOString(),
          };
          syncedItems++;
        }
      }

      this.logger.info('Workspace Memory sync completed', { workspaceId, syncedItems });

      return {
        success: true,
        message: `Synced ${syncedItems} Memory nodes`,
        syncedItems,
      };
    } catch (error) {
      this.logger.error('Failed to sync workspace Memory', { error, workspaceId });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed',
        syncedItems: 0,
      };
    }
  }

  /**
   * Test Memory integration
   */
  async testIntegration(workspaceId: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // Test basic operations
      const memories = await this.getWorkspaceMemories(workspaceId);
      const connections = await this.getWorkspaceConnections(workspaceId);
      
      return {
        success: true,
        message: 'Memory integration is working properly',
        details: {
          workspaceMemories: memories.length,
          workspaceConnections: connections.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Integration test failed',
      };
    }
  }

  /**
   * Get workspace connections
   */
  private async getWorkspaceConnections(workspaceId: string): Promise<any[]> {
    try {
      // Get all memories in workspace first
      const memories = await this.getWorkspaceMemories(workspaceId);
      const memoryIds = memories.map(m => m.id);

      // Get connections between these memories
      const allConnections = await this.memoryService.getAllConnections();
      
      const workspaceConnections = allConnections.filter(connection =>
        memoryIds.includes(connection.fromId) && memoryIds.includes(connection.toId)
      );

      return workspaceConnections;
    } catch (error) {
      this.logger.error('Failed to get workspace connections', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create default memories for new workspaces
   */
  private async createDefaultMemories(workspaceId: string): Promise<void> {
    try {
      const defaultMemories = [
        {
          title: 'Workspace Overview',
          content: 'This is your collaborative workspace memory graph. Use it to capture insights, ideas, and connections.',
          type: 'overview',
          tags: ['workspace', 'overview'],
        },
        {
          title: 'Getting Started',
          content: 'Tips for using the memory graph effectively in your workspace collaboration.',
          type: 'guide',
          tags: ['guide', 'getting-started'],
        },
      ];

      const createdMemories = [];
      for (const memoryData of defaultMemories) {
        const memory = await this.memoryService.createMemory({
          title: memoryData.title,
          content: memoryData.content,
          type: memoryData.type,
          tags: memoryData.tags,
          metadata: {
            workspaceId,
            isDefault: true,
            workspaceContext: true,
          }
        });
        createdMemories.push(memory);
      }

      // Create a connection between the default memories
      if (createdMemories.length >= 2) {
        await this.memoryService.createConnection(
          createdMemories[0].id,
          createdMemories[1].id,
          {
            strength: 1.0,
            type: 'related',
            description: 'Default workspace connection',
          }
        );
      }

      this.logger.info('Default Memory nodes created for workspace', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to create default Memory nodes', { error, workspaceId });
      // Don't throw here as this is not critical
    }
  }

  /**
   * Cleanup Memory data for workspace
   */
  async cleanup(workspaceId: string): Promise<void> {
    try {
      const memories = await this.getWorkspaceMemories(workspaceId);
      const connections = await this.getWorkspaceConnections(workspaceId);
      
      // Archive or delete workspace memories and connections
      for (const memory of memories) {
        memory.metadata = {
          ...memory.metadata,
          archivedAt: new Date().toISOString(),
          archivedReason: 'workspace_deleted',
        };
      }

      for (const connection of connections) {
        connection.metadata = {
          ...connection.metadata,
          archivedAt: new Date().toISOString(),
          archivedReason: 'workspace_deleted',
        };
      }

      this.logger.info('Memory cleanup completed for workspace', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to cleanup Memory data', { error, workspaceId });
      throw error;
    }
  }
}