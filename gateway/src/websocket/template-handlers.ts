/**
 * Whiteboard Template WebSocket Handlers
 * 
 * Real-time collaboration features for template management including:
 * - Template creation and updates
 * - Template usage tracking
 * - Template search and discovery
 * - Template analytics updates
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { DatabasePool } from '@mcp-tools/core/utils/database-pool';
import { WhiteboardTemplateService } from '@mcp-tools/core/services/whiteboard/whiteboard-template-service';
import { WhiteboardThumbnailService } from '@mcp-tools/core/services/whiteboard/whiteboard-thumbnail-service';
import { 
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateFilter,
  TemplateSort,
  WhiteboardTemplate,
  TemplateUsageEvent,
  ThumbnailOptions,
} from '@mcp-tools/core/services/whiteboard/whiteboard-template-service';
import { getGlobalRateLimiter } from './rate-limiter.js';
import { 
  AuthenticatedSocket,
  authenticateWebSocketConnection 
} from './auth-handler.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';

interface TemplateAuthenticatedSocket extends AuthenticatedSocket {
  templateSession?: {
    userId: string;
    workspaceId?: string;
    sessionId: string;
  };
}

/**
 * Template WebSocket event schemas for validation
 */
const TemplateEventSchema = z.object({
  type: z.enum([
    'template_created',
    'template_updated', 
    'template_deleted',
    'template_applied',
    'template_viewed',
    'template_searched',
    'template_analytics_updated',
    'template_thumbnail_generated'
  ]),
  templateId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  data: z.record(z.string(), z.any()).default({}),
  timestamp: z.string().datetime(),
});

const CreateTemplateEventSchema = z.object({
  request: CreateTemplateRequest,
  workspaceId: z.string().uuid().optional(),
  generateThumbnail: z.boolean().default(true),
  thumbnailOptions: ThumbnailOptions.partial().optional(),
});

const UpdateTemplateEventSchema = z.object({
  templateId: z.string().uuid(),
  request: UpdateTemplateRequest,
  workspaceId: z.string().uuid().optional(),
});

const SearchTemplateEventSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  filters: TemplateFilter.optional(),
  sort: TemplateSort.optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

const ApplyTemplateEventSchema = z.object({
  templateId: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  customizations: z.record(z.string(), z.any()).default({}),
});

const GenerateThumbnailEventSchema = z.object({
  templateId: z.string().uuid(),
  thumbnailData: z.string().optional(), // Canvas data URL
  options: ThumbnailOptions.partial().optional(),
});

/**
 * Template WebSocket Handler Class
 */
export class TemplateWebSocketHandler {
  private logger: Logger;
  private templateService: WhiteboardTemplateService;
  private thumbnailService: WhiteboardThumbnailService;
  private activeConnections: Map<string, TemplateAuthenticatedSocket> = new Map();
  private templateSubscriptions: Map<string, Set<string>> = new Map(); // templateId -> socketIds
  private workspaceSubscriptions: Map<string, Set<string>> = new Map(); // workspaceId -> socketIds

  constructor(
    private io: SocketIOServer,
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('TemplateWebSocketHandler');
    this.templateService = new WhiteboardTemplateService(db, logger);
    this.thumbnailService = new WhiteboardThumbnailService(logger);
    this.setupEventHandlers();
  }

  /**
   * Setup WebSocket event handlers for template operations
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket as TemplateAuthenticatedSocket);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(socket: TemplateAuthenticatedSocket): Promise<void> {
    try {
      // Authenticate the connection
      const authResult = await authenticateWebSocketConnection(socket);
      if (!authResult) {
        socket.disconnect();
        return;
      }

      socket.user = authResult;
      this.activeConnections.set(socket.id, socket);

      this.logger.info('Template WebSocket connection established', {
        socketId: socket.id,
        userId: socket.user.id,
        userName: socket.user.name
      });

      // Setup template-specific event handlers
      this.setupTemplateEventHandlers(socket);

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });

    } catch (error) {
      this.logger.error('Failed to handle template WebSocket connection', { error });
      socket.disconnect();
    }
  }

  /**
   * Setup template-specific event handlers for a socket
   */
  private setupTemplateEventHandlers(socket: TemplateAuthenticatedSocket): void {
    // Template CRUD operations
    socket.on('template:create', this.handleCreateTemplate.bind(this, socket));
    socket.on('template:update', this.handleUpdateTemplate.bind(this, socket));
    socket.on('template:delete', this.handleDeleteTemplate.bind(this, socket));
    socket.on('template:search', this.handleSearchTemplates.bind(this, socket));
    socket.on('template:apply', this.handleApplyTemplate.bind(this, socket));

    // Template subscription management
    socket.on('template:subscribe', this.handleSubscribeTemplate.bind(this, socket));
    socket.on('template:unsubscribe', this.handleUnsubscribeTemplate.bind(this, socket));
    socket.on('workspace:subscribe_templates', this.handleSubscribeWorkspaceTemplates.bind(this, socket));
    socket.on('workspace:unsubscribe_templates', this.handleUnsubscribeWorkspaceTemplates.bind(this, socket));

    // Thumbnail operations
    socket.on('template:generate_thumbnail', this.handleGenerateThumbnail.bind(this, socket));

    // Analytics and tracking
    socket.on('template:track_usage', this.handleTrackUsage.bind(this, socket));
    socket.on('template:get_analytics', this.handleGetAnalytics.bind(this, socket));

    // System templates
    socket.on('template:get_system_templates', this.handleGetSystemTemplates.bind(this, socket));
    socket.on('template:get_categories', this.handleGetCategories.bind(this, socket));
  }

  /**
   * Handle template creation
   */
  private async handleCreateTemplate(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Rate limiting
      const rateLimiter = getGlobalRateLimiter();
      const allowed = await rateLimiter.checkLimit(`template_create:${socket.user.id}`, 10, 60); // 10 per minute
      if (!allowed) {
        const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many template creation requests' };
        callback?.(error);
        return;
      }

      // Validate input
      const validatedData = CreateTemplateEventSchema.parse(data);
      const { request, workspaceId, generateThumbnail, thumbnailOptions } = validatedData;

      // Create template
      const template = await this.templateService.createTemplate(
        socket.user.id,
        request,
        workspaceId
      );

      // Generate thumbnail if requested
      let thumbnailResult;
      if (generateThumbnail && request.templateData) {
        thumbnailResult = await this.thumbnailService.generateTemplateThumbnail(
          request.templateData,
          thumbnailOptions
        );

        // Update template with thumbnail
        if (thumbnailResult.dataUrl) {
          await this.templateService.generateThumbnail(
            template.id,
            thumbnailResult.dataUrl,
            socket.user.id
          );
        }
      }

      // Emit template created event
      const event = {
        type: 'template_created',
        templateId: template.id,
        workspaceId,
        data: {
          template,
          thumbnail: thumbnailResult,
          createdBy: socket.user.name,
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast to workspace subscribers
      if (workspaceId) {
        this.broadcastToWorkspace(workspaceId, 'template:created', event);
      }

      // Broadcast to public template subscribers if public
      if (template.isPublic) {
        socket.broadcast.emit('template:created', event);
      }

      this.logger.info('Template created via WebSocket', {
        templateId: template.id,
        userId: socket.user.id,
        workspaceId
      });

      callback?.({ success: true, template, thumbnail: thumbnailResult });

    } catch (error) {
      this.logger.error('Failed to handle template creation', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'TEMPLATE_CREATION_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle template update
   */
  private async handleUpdateTemplate(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Rate limiting
      const rateLimiter = getGlobalRateLimiter();
      const allowed = await rateLimiter.checkLimit(`template_update:${socket.user.id}`, 30, 60); // 30 per minute
      if (!allowed) {
        const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many template update requests' };
        callback?.(error);
        return;
      }

      // Validate input
      const validatedData = UpdateTemplateEventSchema.parse(data);
      const { templateId, request, workspaceId } = validatedData;

      // Update template
      const updatedTemplate = await this.templateService.updateTemplate(
        templateId,
        socket.user.id,
        request,
        workspaceId
      );

      // Emit template updated event
      const event = {
        type: 'template_updated',
        templateId,
        workspaceId,
        data: {
          template: updatedTemplate,
          updatedBy: socket.user.name,
          changes: Object.keys(request),
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast to template subscribers
      this.broadcastToTemplate(templateId, 'template:updated', event);

      this.logger.info('Template updated via WebSocket', {
        templateId,
        userId: socket.user.id,
        changes: Object.keys(request)
      });

      callback?.({ success: true, template: updatedTemplate });

    } catch (error) {
      this.logger.error('Failed to handle template update', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'TEMPLATE_UPDATE_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle template deletion
   */
  private async handleDeleteTemplate(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Rate limiting
      const rateLimiter = getGlobalRateLimiter();
      const allowed = await rateLimiter.checkLimit(`template_delete:${socket.user.id}`, 10, 60); // 10 per minute
      if (!allowed) {
        const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many template deletion requests' };
        callback?.(error);
        return;
      }

      const templateId = z.string().uuid().parse(data.templateId);
      const workspaceId = z.string().uuid().optional().parse(data.workspaceId);

      // Delete template
      await this.templateService.deleteTemplate(templateId, socket.user.id, workspaceId);

      // Emit template deleted event
      const event = {
        type: 'template_deleted',
        templateId,
        workspaceId,
        data: {
          deletedBy: socket.user.name,
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast to template subscribers
      this.broadcastToTemplate(templateId, 'template:deleted', event);

      // Clean up subscriptions
      this.templateSubscriptions.delete(templateId);

      this.logger.info('Template deleted via WebSocket', {
        templateId,
        userId: socket.user.id
      });

      callback?.({ success: true });

    } catch (error) {
      this.logger.error('Failed to handle template deletion', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'TEMPLATE_DELETION_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle template search
   */
  private async handleSearchTemplates(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Rate limiting
      const rateLimiter = getGlobalRateLimiter();
      const allowed = await rateLimiter.checkLimit(`template_search:${socket.user.id}`, 60, 60); // 60 per minute
      if (!allowed) {
        const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many search requests' };
        callback?.(error);
        return;
      }

      // Validate input
      const validatedData = SearchTemplateEventSchema.parse(data);
      const { workspaceId, filters, sort, limit, offset } = validatedData;

      // Search templates
      const results = await this.templateService.searchTemplates(
        socket.user.id,
        workspaceId,
        filters,
        sort,
        limit,
        offset
      );

      this.logger.debug('Template search performed via WebSocket', {
        userId: socket.user.id,
        workspaceId,
        resultCount: results.items.length,
        total: results.total
      });

      callback?.({ success: true, results });

    } catch (error) {
      this.logger.error('Failed to handle template search', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'TEMPLATE_SEARCH_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle template application
   */
  private async handleApplyTemplate(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Rate limiting
      const rateLimiter = getGlobalRateLimiter();
      const allowed = await rateLimiter.checkLimit(`template_apply:${socket.user.id}`, 30, 60); // 30 per minute
      if (!allowed) {
        const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many template application requests' };
        callback?.(error);
        return;
      }

      // Validate input
      const validatedData = ApplyTemplateEventSchema.parse(data);
      const { templateId, whiteboardId, workspaceId } = validatedData;

      // Apply template
      await this.templateService.applyTemplate(templateId, whiteboardId, socket.user.id, workspaceId);

      // Emit template applied event
      const event = {
        type: 'template_applied',
        templateId,
        whiteboardId,
        workspaceId,
        data: {
          appliedBy: socket.user.name,
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast to template subscribers
      this.broadcastToTemplate(templateId, 'template:applied', event);

      this.logger.info('Template applied via WebSocket', {
        templateId,
        whiteboardId,
        userId: socket.user.id
      });

      callback?.({ success: true });

    } catch (error) {
      this.logger.error('Failed to handle template application', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'TEMPLATE_APPLICATION_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle template subscription
   */
  private handleSubscribeTemplate(socket: TemplateAuthenticatedSocket, data: any): void {
    try {
      const templateId = z.string().uuid().parse(data.templateId);

      if (!this.templateSubscriptions.has(templateId)) {
        this.templateSubscriptions.set(templateId, new Set());
      }
      this.templateSubscriptions.get(templateId)!.add(socket.id);

      this.logger.debug('Client subscribed to template updates', {
        socketId: socket.id,
        templateId,
        userId: socket.user.id
      });

    } catch (error) {
      this.logger.error('Failed to handle template subscription', { error, userId: socket.user.id });
    }
  }

  /**
   * Handle template unsubscription
   */
  private handleUnsubscribeTemplate(socket: TemplateAuthenticatedSocket, data: any): void {
    try {
      const templateId = z.string().uuid().parse(data.templateId);

      const subscribers = this.templateSubscriptions.get(templateId);
      if (subscribers) {
        subscribers.delete(socket.id);
        if (subscribers.size === 0) {
          this.templateSubscriptions.delete(templateId);
        }
      }

      this.logger.debug('Client unsubscribed from template updates', {
        socketId: socket.id,
        templateId,
        userId: socket.user.id
      });

    } catch (error) {
      this.logger.error('Failed to handle template unsubscription', { error, userId: socket.user.id });
    }
  }

  /**
   * Handle workspace templates subscription
   */
  private handleSubscribeWorkspaceTemplates(socket: TemplateAuthenticatedSocket, data: any): void {
    try {
      const workspaceId = z.string().uuid().parse(data.workspaceId);

      if (!this.workspaceSubscriptions.has(workspaceId)) {
        this.workspaceSubscriptions.set(workspaceId, new Set());
      }
      this.workspaceSubscriptions.get(workspaceId)!.add(socket.id);

      this.logger.debug('Client subscribed to workspace template updates', {
        socketId: socket.id,
        workspaceId,
        userId: socket.user.id
      });

    } catch (error) {
      this.logger.error('Failed to handle workspace template subscription', { error, userId: socket.user.id });
    }
  }

  /**
   * Handle workspace templates unsubscription
   */
  private handleUnsubscribeWorkspaceTemplates(socket: TemplateAuthenticatedSocket, data: any): void {
    try {
      const workspaceId = z.string().uuid().parse(data.workspaceId);

      const subscribers = this.workspaceSubscriptions.get(workspaceId);
      if (subscribers) {
        subscribers.delete(socket.id);
        if (subscribers.size === 0) {
          this.workspaceSubscriptions.delete(workspaceId);
        }
      }

      this.logger.debug('Client unsubscribed from workspace template updates', {
        socketId: socket.id,
        workspaceId,
        userId: socket.user.id
      });

    } catch (error) {
      this.logger.error('Failed to handle workspace template unsubscription', { error, userId: socket.user.id });
    }
  }

  /**
   * Handle thumbnail generation
   */
  private async handleGenerateThumbnail(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Rate limiting
      const rateLimiter = getGlobalRateLimiter();
      const allowed = await rateLimiter.checkLimit(`thumbnail_generate:${socket.user.id}`, 20, 60); // 20 per minute
      if (!allowed) {
        const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many thumbnail generation requests' };
        callback?.(error);
        return;
      }

      // Validate input
      const validatedData = GenerateThumbnailEventSchema.parse(data);
      const { templateId, thumbnailData, options } = validatedData;

      let thumbnailResult;

      if (thumbnailData) {
        // Generate from provided canvas data
        thumbnailResult = await this.thumbnailService.generateFromCanvasData(thumbnailData, options);
      } else {
        // Get template and generate thumbnail from template data
        const template = await this.templateService.getTemplate(templateId, socket.user.id);
        if (!template) {
          throw new Error('Template not found');
        }

        thumbnailResult = await this.thumbnailService.generateTemplateThumbnail(
          template.templateData,
          options
        );
      }

      // Update template with new thumbnail
      await this.templateService.generateThumbnail(
        templateId,
        thumbnailResult.dataUrl,
        socket.user.id
      );

      // Emit thumbnail generated event
      const event = {
        type: 'template_thumbnail_generated',
        templateId,
        data: {
          thumbnail: thumbnailResult,
          generatedBy: socket.user.name,
        },
        timestamp: new Date().toISOString(),
      };

      // Broadcast to template subscribers
      this.broadcastToTemplate(templateId, 'template:thumbnail_generated', event);

      this.logger.info('Template thumbnail generated via WebSocket', {
        templateId,
        userId: socket.user.id,
        size: thumbnailResult.size
      });

      callback?.({ success: true, thumbnail: thumbnailResult });

    } catch (error) {
      this.logger.error('Failed to handle thumbnail generation', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'THUMBNAIL_GENERATION_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle usage tracking
   */
  private async handleTrackUsage(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      const event: TemplateUsageEvent = {
        templateId: z.string().uuid().parse(data.templateId),
        whiteboardId: z.string().uuid().parse(data.whiteboardId),
        userId: socket.user.id,
        workspaceId: z.string().uuid().parse(data.workspaceId),
        eventType: z.enum(['applied', 'viewed', 'searched', 'favorited']).parse(data.eventType),
        metadata: data.metadata || {},
      };

      await this.templateService.trackTemplateUsage(event);

      this.logger.debug('Template usage tracked via WebSocket', {
        templateId: event.templateId,
        eventType: event.eventType,
        userId: socket.user.id
      });

      callback?.({ success: true });

    } catch (error) {
      this.logger.error('Failed to handle usage tracking', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'USAGE_TRACKING_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle analytics request
   */
  private async handleGetAnalytics(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      const templateId = z.string().uuid().parse(data.templateId);
      const periodStart = z.string().datetime().optional().parse(data.periodStart);
      const periodEnd = z.string().datetime().optional().parse(data.periodEnd);

      const analytics = await this.templateService.getTemplateAnalytics(
        templateId,
        socket.user.id,
        periodStart,
        periodEnd
      );

      callback?.({ success: true, analytics });

    } catch (error) {
      this.logger.error('Failed to handle analytics request', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'ANALYTICS_REQUEST_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle system templates request
   */
  private async handleGetSystemTemplates(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): Promise<void> {
    try {
      // Generate system templates on demand
      const systemTemplates = await this.generateSystemTemplates();
      
      callback?.({ success: true, templates: systemTemplates });

    } catch (error) {
      this.logger.error('Failed to handle system templates request', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'SYSTEM_TEMPLATES_REQUEST_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle categories request
   */
  private handleGetCategories(
    socket: TemplateAuthenticatedSocket,
    data: any,
    callback?: (response: any) => void
  ): void {
    try {
      const categories = this.templateService.getTemplateCategories();
      callback?.({ success: true, categories });

    } catch (error) {
      this.logger.error('Failed to handle categories request', { error, userId: socket.user.id });
      callback?.({ 
        success: false, 
        error: { 
          code: 'CATEGORIES_REQUEST_FAILED', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(socket: TemplateAuthenticatedSocket): void {
    this.activeConnections.delete(socket.id);

    // Clean up subscriptions
    for (const subscribers of this.templateSubscriptions.values()) {
      subscribers.delete(socket.id);
    }
    for (const subscribers of this.workspaceSubscriptions.values()) {
      subscribers.delete(socket.id);
    }

    this.logger.info('Template WebSocket connection closed', {
      socketId: socket.id,
      userId: socket.user?.id
    });
  }

  /**
   * Broadcast event to template subscribers
   */
  private broadcastToTemplate(templateId: string, eventName: string, data: any): void {
    const subscribers = this.templateSubscriptions.get(templateId);
    if (subscribers) {
      for (const socketId of subscribers) {
        const socket = this.activeConnections.get(socketId);
        if (socket) {
          socket.emit(eventName, data);
        }
      }
    }
  }

  /**
   * Broadcast event to workspace subscribers
   */
  private broadcastToWorkspace(workspaceId: string, eventName: string, data: any): void {
    const subscribers = this.workspaceSubscriptions.get(workspaceId);
    if (subscribers) {
      for (const socketId of subscribers) {
        const socket = this.activeConnections.get(socketId);
        if (socket) {
          socket.emit(eventName, data);
        }
      }
    }
  }

  /**
   * Generate system templates with thumbnails
   */
  private async generateSystemTemplates(): Promise<any[]> {
    const systemTemplateTypes = [
      'brainstorming',
      'project_planning',
      'user_journey',
      'wireframes',
      'retrospectives',
      'swot_analysis',
      'business_model',
      'flowcharts',
      'meeting_notes',
      'design_system'
    ];

    const templates = [];
    
    for (const type of systemTemplateTypes) {
      try {
        const thumbnail = await this.thumbnailService.generateSystemTemplateThumbnail(type);
        templates.push({
          id: `system-${type}`,
          name: this.formatTemplateName(type),
          description: this.getTemplateDescription(type),
          category: this.getCategoryForTemplate(type),
          thumbnail: thumbnail.dataUrl,
          isSystemTemplate: true,
          isPublic: true,
          usageCount: 0,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.warn('Failed to generate system template', { type, error });
      }
    }

    return templates;
  }

  private formatTemplateName(type: string): string {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  private getTemplateDescription(type: string): string {
    const descriptions = {
      brainstorming: 'Collaborative idea generation with sticky notes and voting',
      project_planning: 'Timeline-based project planning with milestones and tasks',
      user_journey: 'Customer journey mapping with touchpoints and emotions',
      wireframes: 'UI/UX wireframing with standard component library',
      retrospectives: 'Team retrospective with Start, Stop, Continue format',
      swot_analysis: 'Strategic planning with Strengths, Weaknesses, Opportunities, Threats',
      business_model: 'Business Model Canvas with 9 key building blocks',
      flowcharts: 'Process flowchart with decision nodes and connectors',
      meeting_notes: 'Structured meeting notes with agenda and action items',
      design_system: 'Design system documentation and component library'
    };
    return descriptions[type as keyof typeof descriptions] || 'System template';
  }

  private getCategoryForTemplate(type: string): string {
    const categories = {
      brainstorming: 'Brainstorming',
      project_planning: 'Project Planning',
      user_journey: 'User Journey',
      wireframes: 'Wireframes',
      retrospectives: 'Retrospectives',
      swot_analysis: 'Analysis',
      business_model: 'Business Model',
      flowcharts: 'Flowcharts',
      meeting_notes: 'Meeting Notes',
      design_system: 'Design System'
    };
    return categories[type as keyof typeof categories] || 'Custom';
  }
}

/**
 * Initialize template WebSocket handlers
 */
export function initializeTemplateWebSocket(
  io: SocketIOServer,
  db: DatabasePool,
  logger?: Logger
): TemplateWebSocketHandler {
  return new TemplateWebSocketHandler(io, db, logger);
}