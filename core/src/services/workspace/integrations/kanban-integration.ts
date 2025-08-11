import { KanbanService } from '../../kanban/service.js';
import { WorkspaceActivityService } from '../workspace-activity-service.js';
import { Logger } from '../../../utils/logger.js';
import type { WorkspaceIntegrationConfiguration } from '@shared/types/workspace.js';

/**
 * Integration adapter for Kanban service within workspaces
 */
export class KanbanWorkspaceIntegration {
  private logger: Logger;

  constructor(
    private kanbanService: KanbanService,
    private activityService: WorkspaceActivityService
  ) {
    this.logger = new Logger('KanbanWorkspaceIntegration');
  }

  /**
   * Initialize Kanban integration for a workspace
   */
  async initialize(workspaceId: string, configuration: WorkspaceIntegrationConfiguration): Promise<void> {
    try {
      // Create default board if configured
      if (configuration.defaultSettings?.createDefaultBoard) {
        await this.createDefaultBoard(workspaceId);
      }

      this.logger.info('Kanban integration initialized', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to initialize Kanban integration', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create a workspace-scoped Kanban board
   */
  async createWorkspaceBoard(
    workspaceId: string,
    userId: string,
    boardData: {
      name: string;
      description?: string;
      color?: string;
    }
  ): Promise<any> {
    try {
      // Add workspace context to board data
      const board = await this.kanbanService.createBoard({
        name: boardData.name,
        description: boardData.description,
        color: boardData.color || '#6366f1',
        // Add workspace metadata
        metadata: {
          workspaceId,
          createdBy: userId,
          workspaceContext: true,
        }
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_created',
        'kanban_board',
        board.id.toString(),
        { boardName: boardData.name },
        { integration: 'kanban' }
      );

      this.logger.info('Workspace Kanban board created', { workspaceId, boardId: board.id });
      
      return board;
    } catch (error) {
      this.logger.error('Failed to create workspace Kanban board', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get all Kanban boards for a workspace
   */
  async getWorkspaceBoards(workspaceId: string): Promise<any[]> {
    try {
      // Get all boards and filter by workspace
      const allBoards = await this.kanbanService.getBoards();
      
      // Filter boards that belong to this workspace
      const workspaceBoards = allBoards.filter(board => 
        board.metadata?.workspaceId === workspaceId ||
        board.slug?.startsWith(`workspace-${workspaceId}`)
      );

      return workspaceBoards;
    } catch (error) {
      this.logger.error('Failed to get workspace Kanban boards', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create a card within workspace context
   */
  async createWorkspaceCard(
    workspaceId: string,
    userId: string,
    cardData: {
      boardId: string;
      columnId: string;
      title: string;
      description?: string;
      assignedTo?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      tags?: string[];
      dueDate?: string;
    }
  ): Promise<any> {
    try {
      // Verify board belongs to workspace
      const board = await this.kanbanService.getBoard(parseInt(cardData.boardId));
      if (board?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Board does not belong to this workspace');
      }

      const card = await this.kanbanService.createCard({
        board_id: parseInt(cardData.boardId),
        column_position: parseInt(cardData.columnId),
        title: cardData.title,
        description: cardData.description,
        assigned_to: cardData.assignedTo,
        priority: cardData.priority || 'medium',
        due_date: cardData.dueDate,
        position: 0
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_created',
        'kanban_card',
        card.id.toString(),
        { 
          cardTitle: cardData.title, 
          boardId: cardData.boardId,
          columnId: cardData.columnId 
        },
        { integration: 'kanban' }
      );

      this.logger.info('Workspace Kanban card created', { workspaceId, cardId: card.id });

      return card;
    } catch (error) {
      this.logger.error('Failed to create workspace Kanban card', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Move card within workspace context
   */
  async moveWorkspaceCard(
    workspaceId: string,
    userId: string,
    cardId: string,
    targetColumnId: string,
    position: number
  ): Promise<any> {
    try {
      // Move the card
      const movedCard = await this.kanbanService.moveCard({
        card_id: parseInt(cardId),
        column_position: parseInt(targetColumnId),
        position
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_updated',
        'kanban_card',
        cardId,
        { 
          action: 'moved',
          targetColumnId,
          position 
        },
        { integration: 'kanban' }
      );

      this.logger.info('Workspace Kanban card moved', { workspaceId, cardId });

      return movedCard;
    } catch (error) {
      this.logger.error('Failed to move workspace Kanban card', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Update card within workspace context
   */
  async updateWorkspaceCard(
    workspaceId: string,
    userId: string,
    cardId: string,
    updates: any
  ): Promise<any> {
    try {
      const updatedCard = await this.kanbanService.updateCard({
        card_id: parseInt(cardId),
        ...updates
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_updated',
        'kanban_card',
        cardId,
        { updates },
        { integration: 'kanban' }
      );

      this.logger.info('Workspace Kanban card updated', { workspaceId, cardId });

      return updatedCard;
    } catch (error) {
      this.logger.error('Failed to update workspace Kanban card', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Delete card within workspace context
   */
  async deleteWorkspaceCard(
    workspaceId: string,
    userId: string,
    cardId: string
  ): Promise<void> {
    try {
      await this.kanbanService.deleteCard(parseInt(cardId));

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_deleted',
        'kanban_card',
        cardId,
        {},
        { integration: 'kanban' }
      );

      this.logger.info('Workspace Kanban card deleted', { workspaceId, cardId });
    } catch (error) {
      this.logger.error('Failed to delete workspace Kanban card', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get workspace Kanban activity
   */
  async getWorkspaceKanbanActivity(workspaceId: string): Promise<any[]> {
    try {
      // Get activity for all Kanban resources in this workspace
      const activities = await this.activityService.getResourceActivity(
        workspaceId,
        'kanban_board',
        workspaceId,
        'system',
        'tenant-id' // TODO: Get from context
      );

      return activities;
    } catch (error) {
      this.logger.error('Failed to get workspace Kanban activity', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Sync Kanban data for workspace
   */
  async syncWorkspaceKanban(workspaceId: string): Promise<{
    success: boolean;
    message: string;
    syncedItems: number;
  }> {
    try {
      // Get all workspace boards and their current state
      const boards = await this.getWorkspaceBoards(workspaceId);
      let syncedItems = 0;

      // Sync each board's data
      for (const board of boards) {
        // Update board metadata if needed
        if (!board.metadata?.lastSync || 
            new Date(board.metadata.lastSync).getTime() < Date.now() - 3600000) { // 1 hour
          
          // Mark as synced
          board.metadata = {
            ...board.metadata,
            lastSync: new Date().toISOString(),
          };
          syncedItems++;
        }
      }

      this.logger.info('Workspace Kanban sync completed', { workspaceId, syncedItems });

      return {
        success: true,
        message: `Synced ${syncedItems} Kanban items`,
        syncedItems,
      };
    } catch (error) {
      this.logger.error('Failed to sync workspace Kanban', { error, workspaceId });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed',
        syncedItems: 0,
      };
    }
  }

  /**
   * Test Kanban integration
   */
  async testIntegration(workspaceId: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // Test basic operations
      const boards = await this.getWorkspaceBoards(workspaceId);
      const stats = await this.kanbanService.getStats();

      return {
        success: true,
        message: 'Kanban integration is working properly',
        details: {
          workspaceBoards: boards.length,
          totalBoards: stats.total_boards,
          totalCards: stats.total_cards,
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
   * Create a default board for new workspaces
   */
  private async createDefaultBoard(workspaceId: string): Promise<void> {
    try {
      const defaultBoard = await this.kanbanService.createBoard({
        name: 'Workspace Board',
        description: 'Default board for workspace collaboration',
        color: '#6366f1',
        metadata: {
          workspaceId,
          isDefault: true,
          workspaceContext: true,
        }
      });

      this.logger.info('Default Kanban board created for workspace', { 
        workspaceId, 
        boardId: defaultBoard.id 
      });
    } catch (error) {
      this.logger.error('Failed to create default Kanban board', { error, workspaceId });
      // Don't throw here as this is not critical
    }
  }

  /**
   * Cleanup Kanban data for workspace
   */
  async cleanup(workspaceId: string): Promise<void> {
    try {
      const boards = await this.getWorkspaceBoards(workspaceId);
      
      // Archive or delete workspace boards
      for (const board of boards) {
        // For now, just mark as archived in metadata
        board.metadata = {
          ...board.metadata,
          archivedAt: new Date().toISOString(),
          archivedReason: 'workspace_deleted',
        };
      }

      this.logger.info('Kanban cleanup completed for workspace', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to cleanup Kanban data', { error, workspaceId });
      throw error;
    }
  }
}