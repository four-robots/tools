/**
 * Search Collaboration WebSocket Handler
 * 
 * Specialized handler for real-time search collaboration messages including
 * query synchronization, filter updates, result highlighting, and annotations.
 */

import { WebSocket } from 'ws';
import {
  SearchCollaborationMessage,
  SearchCollaborationMessageSchema,
  LiveSearchCollaborationService,
  SearchStateUpdate,
  SearchCollaborationWebSocketGateway as ISearchCollaborationWebSocketGateway,
  CollaborationMessage,
  SearchEventType,
  AnnotationType,
  ConflictResolutionStrategy
} from '@mcp-tools/core';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

interface AuthenticatedWebSocket extends WebSocket {
  connectionId: string;
  userId: string;
  sessionId?: string;
  searchSessionId?: string;
  isAuthenticated: boolean;
  lastHeartbeat: Date;
  messageCount: number;
  joinedRooms: Set<string>;
  // Add cleanup tracking
  debounceKeys: Set<string>;
  batchKeys: Set<string>;
}

export class SearchWebSocketHandler implements ISearchCollaborationWebSocketGateway {
  // Debouncing for rapid search queries
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private debounceGroups: Map<string, { messages: SearchCollaborationMessage[], timer: NodeJS.Timeout }> = new Map();
  
  // Batch processing for related events
  private batchProcessors: Map<string, NodeJS.Timeout> = new Map();
  private batchQueues: Map<string, SearchCollaborationMessage[]> = new Map();
  
  // Connection tracking for proper cleanup
  private connections: Map<string, AuthenticatedWebSocket> = new Map();
  private connectionDebounceKeys: Map<string, Set<string>> = new Map();
  private connectionBatchKeys: Map<string, Set<string>> = new Map();

  constructor(
    private searchService: LiveSearchCollaborationService,
    private broadcastCallback: (sessionId: string, message: CollaborationMessage, excludeConnectionId?: string) => Promise<void>,
    private config: {
      debounceDelayMs: number;
      batchProcessingDelayMs: number;
      maxBatchSize: number;
    } = {
      debounceDelayMs: 300, // 300ms for query updates
      batchProcessingDelayMs: 100, // 100ms for batching related events
      maxBatchSize: 10
    }
  ) {}

  /**
   * Registers a new connection for cleanup tracking
   */
  registerConnection(ws: AuthenticatedWebSocket): void {
    ws.debounceKeys = new Set();
    ws.batchKeys = new Set();
    this.connections.set(ws.connectionId, ws);
    this.connectionDebounceKeys.set(ws.connectionId, new Set());
    this.connectionBatchKeys.set(ws.connectionId, new Set());

    // Set up cleanup on connection close
    ws.on('close', () => {
      this.cleanupConnection(ws.connectionId);
    });

    ws.on('error', () => {
      this.cleanupConnection(ws.connectionId);
    });
  }

  /**
   * Cleans up all resources associated with a connection
   */
  private cleanupConnection(connectionId: string): void {
    logger.debug('Cleaning up connection resources', { connectionId });

    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Cleanup debounce timers associated with this connection
    const debounceKeys = this.connectionDebounceKeys.get(connectionId) || new Set();
    for (const key of debounceKeys) {
      const timer = this.debounceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(key);
      }

      const group = this.debounceGroups.get(key);
      if (group) {
        clearTimeout(group.timer);
        this.debounceGroups.delete(key);
      }
    }

    // Cleanup batch processors associated with this connection
    const batchKeys = this.connectionBatchKeys.get(connectionId) || new Set();
    for (const key of batchKeys) {
      const timer = this.batchProcessors.get(key);
      if (timer) {
        clearTimeout(timer);
        this.batchProcessors.delete(key);
      }
      this.batchQueues.delete(key);
    }

    // Remove from tracking maps
    this.connections.delete(connectionId);
    this.connectionDebounceKeys.delete(connectionId);
    this.connectionBatchKeys.delete(connectionId);

    logger.debug('Connection cleanup completed', { 
      connectionId,
      cleanedDebounceKeys: debounceKeys.size,
      cleanedBatchKeys: batchKeys.size
    });
  }

  /**
   * Handles search collaboration messages
   */
  async handleSearchMessage(message: SearchCollaborationMessage): Promise<void> {
    try {
      const validatedMessage = SearchCollaborationMessageSchema.parse(message);

      logger.debug('Processing search collaboration message', {
        type: validatedMessage.type,
        searchSessionId: validatedMessage.searchSessionId,
        userId: validatedMessage.userId,
        messageId: validatedMessage.messageId
      });

      // Route message based on type
      switch (validatedMessage.type) {
        case 'search_join':
          await this.handleSearchJoin(validatedMessage);
          break;

        case 'search_leave':
          await this.handleSearchLeave(validatedMessage);
          break;

        case 'search_query_update':
          await this.handleSearchQueryUpdate(validatedMessage);
          break;

        case 'search_filter_update':
          await this.handleSearchFilterUpdate(validatedMessage);
          break;

        case 'search_result_highlight':
          await this.handleResultHighlight(validatedMessage);
          break;

        case 'search_annotation':
          await this.handleSearchAnnotation(validatedMessage);
          break;

        case 'search_cursor_update':
          await this.handleCursorUpdate(validatedMessage);
          break;

        case 'search_selection_change':
          await this.handleSelectionChange(validatedMessage);
          break;

        case 'search_bookmark':
          await this.handleBookmark(validatedMessage);
          break;

        case 'search_state_sync':
          await this.handleStateSync(validatedMessage);
          break;

        case 'search_conflict_resolution':
          await this.handleConflictResolution(validatedMessage);
          break;

        case 'search_session_update':
          await this.handleSessionUpdate(validatedMessage);
          break;

        default:
          logger.warn('Unknown search collaboration message type', {
            type: (validatedMessage as any).type,
            messageId: validatedMessage.messageId
          });
      }

    } catch (error) {
      logger.error('Failed to handle search message', {
        error: error.message,
        message: message
      });
      throw error;
    }
  }

  /**
   * Handles user joining a search session
   */
  private async handleSearchJoin(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const role = data.role || 'searcher';

      // Join the search session
      const participant = await this.searchService.joinSearchSession(searchSessionId, userId, role);

      // Get current search state for synchronization
      const searchState = await this.searchService.syncSearchState(searchSessionId);
      const sessionParticipants = await this.searchService.getSessionParticipants(searchSessionId);
      const recentAnnotations = await this.searchService.getSessionAnnotations(searchSessionId);

      // Send acknowledgment with session state
      const joinAck: CollaborationMessage = {
        type: 'ack',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          message: 'Joined search session successfully',
          participant,
          searchState,
          participants: sessionParticipants,
          annotations: recentAnnotations
        },
        timestamp: new Date(),
        sequenceNumber: 0,
        messageId: crypto.randomUUID()
      };

      // Broadcast join notification to other participants
      const joinNotification: CollaborationMessage = {
        type: 'search',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchAction: 'user_joined',
          participant,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, joinNotification, userId);

      logger.info('User joined search session', {
        searchSessionId,
        userId,
        role,
        participantCount: sessionParticipants.length
      });

    } catch (error) {
      logger.error('Failed to handle search join', { error, message });
      throw error;
    }
  }

  /**
   * Handles user leaving a search session
   */
  private async handleSearchLeave(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId } = message;

      // Remove from search session
      await this.searchService.leaveSearchSession(searchSessionId, userId);

      // Broadcast leave notification
      const leaveNotification: CollaborationMessage = {
        type: 'search',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchAction: 'user_left',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, leaveNotification, userId);

      logger.info('User left search session', {
        searchSessionId,
        userId
      });

    } catch (error) {
      logger.error('Failed to handle search leave', { error, message });
      throw error;
    }
  }

  /**
   * Handles search query updates with debouncing and proper connection tracking
   */
  private async handleSearchQueryUpdate(message: SearchCollaborationMessage): Promise<void> {
    const { searchSessionId, userId, data } = message;
    const query = data.query || '';
    const debounceKey = `query:${searchSessionId}:${userId}`;

    // Find the connection for this user to track the debounce key
    let connectionId: string | undefined;
    for (const [connId, conn] of this.connections) {
      if (conn.userId === userId) {
        connectionId = connId;
        break;
      }
    }

    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(debounceKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set up debounce timer
    const timer = setTimeout(async () => {
      try {
        // Update search state
        await this.updateSearchState(searchSessionId, userId, 'query', {
          text: query,
          timestamp: new Date().toISOString(),
          userId: userId
        });

        // Broadcast query update
        const queryUpdate: CollaborationMessage = {
          type: 'search',
          sessionId: searchSessionId,
          userId: userId,
          data: {
            searchAction: 'query_update',
            query: query,
            debounced: true,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date(),
          sequenceNumber: message.sequenceNumber,
          messageId: message.messageId
        };

        await this.broadcastSearchUpdate(searchSessionId, queryUpdate, userId);

        // Update participant's current query
        const participants = await this.searchService.getSessionParticipants(searchSessionId);
        const participant = participants.find(p => p.user_id === userId);
        
        if (participant) {
          await this.searchService.updateParticipant(participant.id, {
            current_query: query,
            search_query_count: participant.search_query_count + 1
          });
        }

        logger.debug('Search query updated', {
          searchSessionId,
          userId,
          query: query.substring(0, 100) // Log first 100 chars
        });

      } catch (error) {
        logger.error('Failed to process debounced query update', { error, searchSessionId, userId });
      } finally {
        // Clean up tracking
        this.debounceTimers.delete(debounceKey);
        if (connectionId) {
          const connKeys = this.connectionDebounceKeys.get(connectionId);
          if (connKeys) {
            connKeys.delete(debounceKey);
          }
        }
      }
    }, this.config.debounceDelayMs);

    this.debounceTimers.set(debounceKey, timer);

    // Track this debounce key for the connection
    if (connectionId) {
      const connKeys = this.connectionDebounceKeys.get(connectionId);
      if (connKeys) {
        connKeys.add(debounceKey);
      }
    }

    // Send immediate typing indicator for real-time feedback
    const typingIndicator: CollaborationMessage = {
      type: 'cursor',
      sessionId: searchSessionId,
      userId: userId,
      data: {
        action: 'typing',
        query: query,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      sequenceNumber: message.sequenceNumber,
      messageId: crypto.randomUUID()
    };

    await this.broadcastSearchUpdate(searchSessionId, typingIndicator, userId);
  }

  /**
   * Handles search filter updates
   */
  private async handleSearchFilterUpdate(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const filters = data.filters || {};

      // Update search state
      await this.updateSearchState(searchSessionId, userId, 'filters', filters);

      // Broadcast filter update
      const filterUpdate: CollaborationMessage = {
        type: 'filter',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          action: 'filter_update',
          filters: filters,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, filterUpdate, userId);

      // Update participant metrics
      const participants = await this.searchService.getSessionParticipants(searchSessionId);
      const participant = participants.find(p => p.user_id === userId);
      
      if (participant) {
        await this.searchService.updateParticipant(participant.id, {
          active_filters: filters,
          filter_change_count: participant.filter_change_count + 1
        });
      }

      logger.debug('Search filters updated', {
        searchSessionId,
        userId,
        filterCount: Object.keys(filters).length
      });

    } catch (error) {
      logger.error('Failed to handle filter update', { error, message });
      throw error;
    }
  }

  /**
   * Handles search result highlighting
   */
  private async handleResultHighlight(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const { resultId, action, highlightData } = data;

      // Broadcast result highlight
      const highlightUpdate: CollaborationMessage = {
        type: 'search',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchAction: 'result_highlight',
          resultId: resultId,
          action: action, // 'add', 'remove', 'select'
          highlightData: highlightData,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, highlightUpdate, userId);

      // Update participant's selected results
      const participants = await this.searchService.getSessionParticipants(searchSessionId);
      const participant = participants.find(p => p.user_id === userId);
      
      if (participant) {
        let selectedResults = [...participant.selected_results];
        
        if (action === 'select' && !selectedResults.includes(resultId)) {
          selectedResults.push(resultId);
        } else if (action === 'deselect') {
          selectedResults = selectedResults.filter(id => id !== resultId);
        }

        await this.searchService.updateParticipant(participant.id, {
          selected_results: selectedResults
        });
      }

      logger.debug('Result highlight updated', {
        searchSessionId,
        userId,
        resultId,
        action
      });

    } catch (error) {
      logger.error('Failed to handle result highlight', { error, message });
      throw error;
    }
  }

  /**
   * Handles search annotations
   */
  private async handleSearchAnnotation(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const { action, annotation } = data;

      let updatedAnnotation;

      switch (action) {
        case 'create':
          updatedAnnotation = await this.searchService.createAnnotation({
            search_session_id: searchSessionId,
            user_id: userId,
            result_id: annotation.resultId,
            result_type: annotation.resultType,
            result_url: annotation.resultUrl,
            annotation_type: annotation.type as AnnotationType,
            annotation_text: annotation.text,
            annotation_data: annotation.data || {},
            text_selection: annotation.textSelection || {},
            selected_text: annotation.selectedText,
            is_shared: annotation.isShared !== false,
            parent_annotation_id: annotation.parentId,
            mentions: annotation.mentions || []
          });
          break;

        case 'update':
          updatedAnnotation = await this.searchService.updateAnnotation(annotation.id, {
            annotation_text: annotation.text,
            annotation_data: annotation.data,
            text_selection: annotation.textSelection,
            selected_text: annotation.selectedText,
            is_resolved: annotation.isResolved
          });
          break;

        case 'delete':
          await this.searchService.deleteAnnotation(annotation.id);
          updatedAnnotation = { id: annotation.id, deleted: true };
          break;

        default:
          throw new Error(`Unknown annotation action: ${action}`);
      }

      // Broadcast annotation update
      const annotationUpdate: CollaborationMessage = {
        type: 'annotation',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          action: action,
          annotation: updatedAnnotation,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, annotationUpdate, userId);

      // Update participant annotation count
      if (action === 'create') {
        const participants = await this.searchService.getSessionParticipants(searchSessionId);
        const participant = participants.find(p => p.user_id === userId);
        
        if (participant) {
          await this.searchService.updateParticipant(participant.id, {
            annotation_count: participant.annotation_count + 1
          });
        }
      }

      logger.debug('Search annotation processed', {
        searchSessionId,
        userId,
        action,
        annotationId: updatedAnnotation?.id
      });

    } catch (error) {
      logger.error('Failed to handle search annotation', { error, message });
      throw error;
    }
  }

  /**
   * Handles cursor position updates
   */
  private async handleCursorUpdate(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const cursorPosition = data.cursorPosition || {};

      // Update participant cursor position
      const participants = await this.searchService.getSessionParticipants(searchSessionId);
      const participant = participants.find(p => p.user_id === userId);
      
      if (participant) {
        await this.searchService.updateParticipant(participant.id, {
          cursor_position: cursorPosition
        });
      }

      // Broadcast cursor update (don't store in search state, too transient)
      const cursorUpdate: CollaborationMessage = {
        type: 'cursor',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          action: 'cursor_move',
          cursorPosition: cursorPosition,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, cursorUpdate, userId);

    } catch (error) {
      logger.error('Failed to handle cursor update', { error, message });
      // Don't throw for cursor updates - they're non-critical
    }
  }

  /**
   * Handles selection changes
   */
  private async handleSelectionChange(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const selectedResults = data.selectedResults || [];

      // Update participant selected results
      const participants = await this.searchService.getSessionParticipants(searchSessionId);
      const participant = participants.find(p => p.user_id === userId);
      
      if (participant) {
        await this.searchService.updateParticipant(participant.id, {
          selected_results: selectedResults
        });
      }

      // Broadcast selection change
      const selectionUpdate: CollaborationMessage = {
        type: 'search',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchAction: 'selection_change',
          selectedResults: selectedResults,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, selectionUpdate, userId);

    } catch (error) {
      logger.error('Failed to handle selection change', { error, message });
      throw error;
    }
  }

  /**
   * Handles bookmark actions
   */
  private async handleBookmark(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const { action, resultId, bookmarkData } = data;

      // Create bookmark as a special annotation
      let bookmark;
      if (action === 'add') {
        bookmark = await this.searchService.createAnnotation({
          search_session_id: searchSessionId,
          user_id: userId,
          result_id: resultId,
          result_type: bookmarkData.resultType || 'search_result',
          result_url: bookmarkData.resultUrl,
          annotation_type: 'bookmark',
          annotation_text: bookmarkData.note || '',
          annotation_data: bookmarkData,
          is_shared: bookmarkData.isShared !== false
        });
      } else if (action === 'remove' && bookmarkData.bookmarkId) {
        await this.searchService.deleteAnnotation(bookmarkData.bookmarkId);
        bookmark = { id: bookmarkData.bookmarkId, deleted: true };
      }

      // Broadcast bookmark update
      const bookmarkUpdate: CollaborationMessage = {
        type: 'search',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchAction: 'bookmark',
          action: action,
          resultId: resultId,
          bookmark: bookmark,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, bookmarkUpdate, userId);

    } catch (error) {
      logger.error('Failed to handle bookmark', { error, message });
      throw error;
    }
  }

  /**
   * Handles state synchronization requests
   */
  private async handleStateSync(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId } = message;

      // Get current search state
      const searchState = await this.searchService.syncSearchState(searchSessionId);
      const participants = await this.searchService.getSessionParticipants(searchSessionId);
      const annotations = await this.searchService.getSessionAnnotations(searchSessionId);

      // Send state sync response
      const syncResponse: CollaborationMessage = {
        type: 'sync',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchState: searchState,
          participants: participants,
          annotations: annotations,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      // Send only to requesting user
      await this.broadcastSearchUpdate(searchSessionId, syncResponse, undefined, userId);

    } catch (error) {
      logger.error('Failed to handle state sync', { error, message });
      throw error;
    }
  }

  /**
   * Handles conflict resolution
   */
  private async handleConflictResolution(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const { conflictId, resolution } = data;

      // Resolve the conflict
      await this.searchService.resolveConflict(conflictId, {
        conflictId: conflictId,
        sessionId: searchSessionId,
        stateKey: resolution.stateKey,
        conflictingValues: resolution.conflictingValues,
        resolutionStrategy: resolution.strategy as ConflictResolutionStrategy,
        resolvedValue: resolution.resolvedValue,
        resolvedBy: userId,
        resolvedAt: new Date()
      });

      // Broadcast resolution result
      const resolutionUpdate: CollaborationMessage = {
        type: 'sync',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          action: 'conflict_resolved',
          conflictId: conflictId,
          stateKey: resolution.stateKey,
          resolvedValue: resolution.resolvedValue,
          resolvedBy: userId,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, resolutionUpdate, userId);

    } catch (error) {
      logger.error('Failed to handle conflict resolution', { error, message });
      throw error;
    }
  }

  /**
   * Handles search session updates
   */
  private async handleSessionUpdate(message: SearchCollaborationMessage): Promise<void> {
    try {
      const { searchSessionId, userId, data } = message;
      const updates = data.updates || {};

      // Update search session
      await this.searchService.updateSearchSession(searchSessionId, updates);

      // Broadcast session update
      const sessionUpdate: CollaborationMessage = {
        type: 'search',
        sessionId: searchSessionId,
        userId: userId,
        data: {
          searchAction: 'session_update',
          updates: updates,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date(),
        sequenceNumber: message.sequenceNumber,
        messageId: message.messageId
      };

      await this.broadcastSearchUpdate(searchSessionId, sessionUpdate, userId);

    } catch (error) {
      logger.error('Failed to handle session update', { error, message });
      throw error;
    }
  }

  /**
   * Broadcasts search update to session participants with optimized delivery
   */
  async broadcastSearchUpdate(
    sessionId: string, 
    message: CollaborationMessage, 
    excludeUserId?: string,
    targetUserId?: string
  ): Promise<void> {
    try {
      // If target user specified, use direct delivery
      if (targetUserId) {
        await this.broadcastToSpecificUser(sessionId, message, targetUserId);
        return;
      }

      // For broadcast messages, use connection pooling and batching
      await this.optimizedBroadcast(sessionId, message, excludeUserId);

    } catch (error) {
      logger.error('Failed to broadcast search update', { error, sessionId });
      throw error;
    }
  }

  /**
   * Optimized broadcast with connection pooling and batching
   */
  private async optimizedBroadcast(
    sessionId: string,
    message: CollaborationMessage,
    excludeUserId?: string
  ): Promise<void> {
    const batchKey = `broadcast:${sessionId}:${Date.now()}`;
    
    // Get active participants for connection pooling
    const participants = await this.getActiveSearchParticipants(sessionId);
    const targetParticipants = participants.filter(p => p !== excludeUserId);
    
    // If there are many participants, use batch processing
    if (targetParticipants.length > 10) {
      await this.batchedBroadcast(sessionId, message, targetParticipants);
    } else {
      // For smaller groups, use direct broadcast
      await this.broadcastCallback(sessionId, message, excludeUserId);
    }
  }

  /**
   * Batched broadcasting for large participant groups
   */
  private async batchedBroadcast(
    sessionId: string,
    message: CollaborationMessage,
    participants: string[]
  ): Promise<void> {
    const batchSize = 20; // Process 20 participants at a time
    const batches: string[][] = [];
    
    // Split participants into batches
    for (let i = 0; i < participants.length; i += batchSize) {
      batches.push(participants.slice(i, i + batchSize));
    }

    // Process batches with slight delay to prevent overwhelming
    const promises = batches.map((batch, index) => 
      new Promise<void>((resolve, reject) => {
        setTimeout(async () => {
          try {
            // Send to each participant in the batch
            await Promise.allSettled(
              batch.map(participantId => 
                this.broadcastToSpecificUser(sessionId, message, participantId)
              )
            );
            resolve();
          } catch (error) {
            logger.error('Batch broadcast failed', { error, sessionId, batchIndex: index });
            reject(error);
          }
        }, index * 10); // 10ms delay between batches
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Sends message to a specific user directly
   */
  private async broadcastToSpecificUser(
    sessionId: string,
    message: CollaborationMessage,
    targetUserId: string
  ): Promise<void> {
    // Find the connection for the target user
    const targetConnection = Array.from(this.connections.values())
      .find(conn => conn.userId === targetUserId);

    if (targetConnection && targetConnection.readyState === 1) { // WebSocket.OPEN
      try {
        targetConnection.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Failed to send direct message', { 
          error, 
          sessionId, 
          targetUserId,
          connectionId: targetConnection.connectionId 
        });
        // Fallback to broadcast callback
        await this.broadcastCallback(sessionId, message, undefined);
      }
    } else {
      // User not connected directly, use broadcast callback
      await this.broadcastCallback(sessionId, message, undefined);
    }
  }

  /**
   * Joins a connection to a search session
   */
  async joinSearchSession(connectionId: string, sessionId: string): Promise<void> {
    // This would be handled by the main gateway
    logger.debug('Search session join requested', { connectionId, sessionId });
  }

  /**
   * Leaves a search session
   */
  async leaveSearchSession(connectionId: string, sessionId: string): Promise<void> {
    // This would be handled by the main gateway
    logger.debug('Search session leave requested', { connectionId, sessionId });
  }

  /**
   * Gets active search participants
   */
  async getActiveSearchParticipants(sessionId: string): Promise<string[]> {
    try {
      const participants = await this.searchService.getSessionParticipants(sessionId);
      return participants.filter(p => p.is_active).map(p => p.user_id);
    } catch (error) {
      logger.error('Failed to get active search participants', { error, sessionId });
      return [];
    }
  }

  /**
   * Updates search state with conflict detection
   */
  private async updateSearchState(
    sessionId: string,
    userId: string,
    stateKey: string,
    newValue: any
  ): Promise<void> {
    const update: SearchStateUpdate = {
      sessionId,
      userId,
      stateKey,
      newValue,
      timestamp: new Date()
    };

    await this.searchService.updateSearchState(update);
  }

  /**
   * Provides memory usage statistics
   */
  getMemoryStats(): {
    activeConnections: number;
    activeDebounceTimers: number;
    activeBatchProcessors: number;
    activeDebounceGroups: number;
    totalQueuedMessages: number;
  } {
    let totalQueuedMessages = 0;
    for (const queue of this.batchQueues.values()) {
      totalQueuedMessages += queue.length;
    }
    for (const group of this.debounceGroups.values()) {
      totalQueuedMessages += group.messages.length;
    }

    return {
      activeConnections: this.connections.size,
      activeDebounceTimers: this.debounceTimers.size,
      activeBatchProcessors: this.batchProcessors.size,
      activeDebounceGroups: this.debounceGroups.size,
      totalQueuedMessages
    };
  }

  /**
   * Cleans up resources with comprehensive logging and tracking
   */
  async shutdown(): Promise<void> {
    const stats = this.getMemoryStats();
    logger.info('Shutting down Search WebSocket handler', stats);

    // Clean up all active connections first
    const connectionIds = Array.from(this.connections.keys());
    for (const connectionId of connectionIds) {
      this.cleanupConnection(connectionId);
    }

    // Clear any remaining timers (should be none after connection cleanup)
    let remainingTimers = 0;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
      remainingTimers++;
    }
    this.debounceTimers.clear();

    for (const group of this.debounceGroups.values()) {
      clearTimeout(group.timer);
      remainingTimers++;
    }
    this.debounceGroups.clear();

    for (const timer of this.batchProcessors.values()) {
      clearTimeout(timer);
      remainingTimers++;
    }
    this.batchProcessors.clear();
    this.batchQueues.clear();

    // Clear all tracking maps
    this.connections.clear();
    this.connectionDebounceKeys.clear();
    this.connectionBatchKeys.clear();

    if (remainingTimers > 0) {
      logger.warn('Found untracked timers during shutdown', { remainingTimers });
    }

    logger.info('Search WebSocket handler shutdown completed');
  }
}