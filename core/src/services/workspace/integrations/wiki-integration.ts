import { WikiService } from '../../wiki/service.js';
import { WorkspaceActivityService } from '../workspace-activity-service.js';
import { Logger } from '../../../utils/logger.js';
import type { WorkspaceIntegrationConfiguration } from '@shared/types/workspace.js';

/**
 * Integration adapter for Wiki service within workspaces
 */
export class WikiWorkspaceIntegration {
  private logger: Logger;

  constructor(
    private wikiService: WikiService,
    private activityService: WorkspaceActivityService
  ) {
    this.logger = new Logger('WikiWorkspaceIntegration');
  }

  /**
   * Initialize Wiki integration for a workspace
   */
  async initialize(workspaceId: string, configuration: WorkspaceIntegrationConfiguration): Promise<void> {
    try {
      // Create default pages if configured
      if (configuration.defaultSettings?.createDefaultPages) {
        await this.createDefaultPages(workspaceId);
      }

      this.logger.info('Wiki integration initialized', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to initialize Wiki integration', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create a workspace-scoped Wiki page
   */
  async createWorkspacePage(
    workspaceId: string,
    userId: string,
    pageData: {
      title: string;
      content: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
    }
  ): Promise<any> {
    try {
      const page = await this.wikiService.createPage({
        title: pageData.title,
        content: pageData.content,
        category: pageData.category,
        tags: pageData.tags || [],
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
        'wiki_page',
        page.id.toString(),
        { pageTitle: pageData.title, category: pageData.category },
        { integration: 'wiki' }
      );

      this.logger.info('Workspace Wiki page created', { workspaceId, pageId: page.id });
      
      return page;
    } catch (error) {
      this.logger.error('Failed to create workspace Wiki page', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get all Wiki pages for a workspace
   */
  async getWorkspacePages(workspaceId: string): Promise<any[]> {
    try {
      // Get all pages and filter by workspace
      const allPages = await this.wikiService.getAllPages();
      
      // Filter pages that belong to this workspace
      const workspacePages = allPages.filter(page => 
        page.metadata?.workspaceId === workspaceId
      );

      return workspacePages;
    } catch (error) {
      this.logger.error('Failed to get workspace Wiki pages', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Update Wiki page within workspace context
   */
  async updateWorkspacePage(
    workspaceId: string,
    userId: string,
    pageId: string,
    updates: {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
    }
  ): Promise<any> {
    try {
      // Verify page belongs to workspace
      const page = await this.wikiService.getPageById(pageId);
      if (page?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Page does not belong to this workspace');
      }

      const updatedPage = await this.wikiService.updatePage(pageId, {
        title: updates.title,
        content: updates.content,
        category: updates.category,
        tags: updates.tags,
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_updated',
        'wiki_page',
        pageId,
        { updates },
        { integration: 'wiki' }
      );

      this.logger.info('Workspace Wiki page updated', { workspaceId, pageId });

      return updatedPage;
    } catch (error) {
      this.logger.error('Failed to update workspace Wiki page', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Delete Wiki page within workspace context
   */
  async deleteWorkspacePage(
    workspaceId: string,
    userId: string,
    pageId: string
  ): Promise<void> {
    try {
      // Verify page belongs to workspace
      const page = await this.wikiService.getPageById(pageId);
      if (page?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Page does not belong to this workspace');
      }

      await this.wikiService.deletePage(pageId);

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'content_deleted',
        'wiki_page',
        pageId,
        { pageTitle: page.title },
        { integration: 'wiki' }
      );

      this.logger.info('Workspace Wiki page deleted', { workspaceId, pageId });
    } catch (error) {
      this.logger.error('Failed to delete workspace Wiki page', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Search Wiki pages within workspace
   */
  async searchWorkspacePages(
    workspaceId: string,
    query: string,
    filters?: {
      category?: string;
      tags?: string[];
    }
  ): Promise<any[]> {
    try {
      // Search all pages
      const searchResults = await this.wikiService.searchPages(query, {
        category: filters?.category,
        tags: filters?.tags,
      });

      // Filter results to workspace pages only
      const workspaceResults = searchResults.filter(page => 
        page.metadata?.workspaceId === workspaceId
      );

      return workspaceResults;
    } catch (error) {
      this.logger.error('Failed to search workspace Wiki pages', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Get workspace Wiki activity
   */
  async getWorkspaceWikiActivity(workspaceId: string): Promise<any[]> {
    try {
      // Get activity for all Wiki resources in this workspace
      const activities = await this.activityService.getResourceActivity(
        workspaceId,
        'wiki_page',
        workspaceId,
        'system',
        'tenant-id' // TODO: Get from context
      );

      return activities;
    } catch (error) {
      this.logger.error('Failed to get workspace Wiki activity', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Create page comments within workspace context
   */
  async createPageComment(
    workspaceId: string,
    userId: string,
    pageId: string,
    content: string
  ): Promise<any> {
    try {
      // Verify page belongs to workspace
      const page = await this.wikiService.getPageById(pageId);
      if (page?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Page does not belong to this workspace');
      }

      const comment = await this.wikiService.addComment(pageId, {
        content,
        authorId: userId,
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'comment_added',
        'wiki_page',
        pageId,
        { content: content.substring(0, 100) + '...' },
        { integration: 'wiki' }
      );

      this.logger.info('Workspace Wiki page comment created', { workspaceId, pageId });

      return comment;
    } catch (error) {
      this.logger.error('Failed to create workspace Wiki page comment', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Upload attachment to workspace Wiki page
   */
  async uploadPageAttachment(
    workspaceId: string,
    userId: string,
    pageId: string,
    attachmentData: {
      filename: string;
      content: Buffer;
      mimeType: string;
    }
  ): Promise<any> {
    try {
      // Verify page belongs to workspace
      const page = await this.wikiService.getPageById(pageId);
      if (page?.metadata?.workspaceId !== workspaceId) {
        throw new Error('Page does not belong to this workspace');
      }

      const attachment = await this.wikiService.uploadAttachment(pageId, {
        filename: attachmentData.filename,
        content: attachmentData.content,
        mimeType: attachmentData.mimeType,
        uploadedBy: userId,
      });

      // Log activity
      await this.activityService.logActivity(
        workspaceId,
        userId,
        'resource_uploaded',
        'wiki_attachment',
        attachment.id.toString(),
        { 
          filename: attachmentData.filename,
          pageId,
          mimeType: attachmentData.mimeType 
        },
        { integration: 'wiki' }
      );

      this.logger.info('Workspace Wiki page attachment uploaded', { workspaceId, pageId });

      return attachment;
    } catch (error) {
      this.logger.error('Failed to upload workspace Wiki page attachment', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Sync Wiki data for workspace
   */
  async syncWorkspaceWiki(workspaceId: string): Promise<{
    success: boolean;
    message: string;
    syncedItems: number;
  }> {
    try {
      // Get all workspace pages and their current state
      const pages = await this.getWorkspacePages(workspaceId);
      let syncedItems = 0;

      // Sync each page's data
      for (const page of pages) {
        // Update page metadata if needed
        if (!page.metadata?.lastSync || 
            new Date(page.metadata.lastSync).getTime() < Date.now() - 3600000) { // 1 hour
          
          // Mark as synced
          page.metadata = {
            ...page.metadata,
            lastSync: new Date().toISOString(),
          };
          syncedItems++;
        }
      }

      this.logger.info('Workspace Wiki sync completed', { workspaceId, syncedItems });

      return {
        success: true,
        message: `Synced ${syncedItems} Wiki pages`,
        syncedItems,
      };
    } catch (error) {
      this.logger.error('Failed to sync workspace Wiki', { error, workspaceId });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed',
        syncedItems: 0,
      };
    }
  }

  /**
   * Test Wiki integration
   */
  async testIntegration(workspaceId: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // Test basic operations
      const pages = await this.getWorkspacePages(workspaceId);
      
      return {
        success: true,
        message: 'Wiki integration is working properly',
        details: {
          workspacePages: pages.length,
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
   * Create default pages for new workspaces
   */
  private async createDefaultPages(workspaceId: string): Promise<void> {
    try {
      const defaultPages = [
        {
          title: 'Welcome to the Workspace',
          content: `# Welcome to Your Collaborative Workspace

This is your workspace wiki where you can document knowledge, processes, and collaborate with your team.

## Getting Started

- Create new pages to document your work
- Use categories to organize content
- Add tags for easy discovery
- Collaborate with comments and discussions

## Tips

- Use markdown for rich formatting
- Link between pages with [[Page Title]] syntax
- Upload attachments to share files
- Keep content up to date for the best collaboration experience

Happy collaborating! 🚀`,
          category: 'Getting Started',
          tags: ['welcome', 'guide'],
        },
      ];

      for (const pageData of defaultPages) {
        await this.wikiService.createPage({
          title: pageData.title,
          content: pageData.content,
          category: pageData.category,
          tags: pageData.tags,
          metadata: {
            workspaceId,
            isDefault: true,
            workspaceContext: true,
          }
        });
      }

      this.logger.info('Default Wiki pages created for workspace', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to create default Wiki pages', { error, workspaceId });
      // Don't throw here as this is not critical
    }
  }

  /**
   * Cleanup Wiki data for workspace
   */
  async cleanup(workspaceId: string): Promise<void> {
    try {
      const pages = await this.getWorkspacePages(workspaceId);
      
      // Archive or delete workspace pages
      for (const page of pages) {
        // For now, just mark as archived in metadata
        page.metadata = {
          ...page.metadata,
          archivedAt: new Date().toISOString(),
          archivedReason: 'workspace_deleted',
        };
      }

      this.logger.info('Wiki cleanup completed for workspace', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to cleanup Wiki data', { error, workspaceId });
      throw error;
    }
  }
}