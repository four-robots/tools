/**
 * Collaboration API Routes
 * 
 * REST endpoints for session management, event querying, and collaboration
 * system administration for the WebSocket collaboration gateway.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  CollaborationSessionService,
  EventBroadcastingService, 
  PresenceService,
  CollaborationSessionSchema,
  SessionParticipantSchema
} from '@mcp-tools/core';
import { WebSocketCollaborationGateway } from '../collaboration/websocket-gateway.js';
import { ConnectionManager } from '../collaboration/connection-manager.js';
import { RateLimiter } from '../collaboration/rate-limiter.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

// Request validation schemas
const CreateSessionSchema = z.object({
  workspace_id: z.string().uuid(),
  session_name: z.string().min(1).max(255),
  session_type: z.enum(['search', 'analysis', 'review', 'kanban', 'wiki', 'memory', 'codebase']),
  expires_at: z.string().datetime().optional(),
  max_participants: z.number().int().min(1).max(1000).optional(),
  allow_anonymous: z.boolean().optional(),
  require_approval: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
  context_data: z.record(z.unknown()).optional()
});

const UpdateSessionSchema = CreateSessionSchema.partial();

const AddParticipantSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['owner', 'moderator', 'participant', 'observer']).optional(),
  can_invite_others: z.boolean().optional(),
  can_modify_session: z.boolean().optional(),
  can_broadcast_events: z.boolean().optional(),
  permissions: z.record(z.unknown()).optional()
});

const UpdateParticipantSchema = AddParticipantSchema.partial();

const EventHistorySchema = z.object({
  from_sequence: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  event_types: z.array(z.string()).optional(),
  user_id: z.string().uuid().optional()
});

const PresenceUpdateSchema = z.object({
  status: z.enum(['online', 'idle', 'busy', 'offline', 'away']).optional(),
  custom_status_text: z.string().max(255).optional(),
  current_location: z.record(z.unknown()).optional(),
  cursor_position: z.record(z.unknown()).optional(),
  active_tools: z.array(z.string()).optional()
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export function createCollaborationRoutes(
  sessionService: CollaborationSessionService,
  eventService: EventBroadcastingService,
  presenceService: PresenceService,
  gateway: WebSocketCollaborationGateway,
  connectionManager: ConnectionManager,
  rateLimiter: RateLimiter
): Router {
  const router = Router();

  // Middleware to extract user info from request
  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }
    next();
  };

  // Session Management Routes

  /**
   * GET /sessions - List collaboration sessions
   */
  router.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspace_id, active_only = 'true' } = req.query;

      let sessions;
      if (workspace_id && typeof workspace_id === 'string') {
        sessions = await sessionService.listActiveSessions(workspace_id);
      } else {
        sessions = await sessionService.listActiveSessions();
      }

      // Filter by active status if requested
      if (active_only === 'true') {
        sessions = sessions.filter(session => session.is_active);
      }

      res.json({
        sessions,
        total: sessions.length
      });

    } catch (error) {
      logger.error('Failed to list collaboration sessions', { error, userId: req.user!.id });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve sessions'
        }
      });
    }
  });

  /**
   * POST /sessions - Create a new collaboration session
   */
  router.post('/sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = CreateSessionSchema.parse(req.body);

      const session = await sessionService.createSession({
        ...validatedData,
        created_by: req.user!.id,
        expires_at: validatedData.expires_at ? new Date(validatedData.expires_at) : undefined,
        is_active: true,
        settings: validatedData.settings || {},
        context_data: validatedData.context_data || {},
        shared_state: {},
        activity_summary: {}
      });

      logger.info('Collaboration session created', {
        sessionId: session.id,
        userId: req.user!.id,
        sessionType: session.session_type
      });

      res.status(201).json({ session });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          }
        });
      }

      logger.error('Failed to create collaboration session', { error, userId: req.user!.id });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create session'
        }
      });
    }
  });

  /**
   * GET /sessions/:id - Get session details
   */
  router.get('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      
      const [session, participants, presence, stats] = await Promise.all([
        sessionService.getSession(sessionId),
        sessionService.getSessionParticipants(sessionId),
        presenceService.getSessionPresence(sessionId),
        presenceService.getSessionPresenceStats(sessionId)
      ]);

      if (!session) {
        return res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found'
          }
        });
      }

      // Check if user is a participant or creator
      const isParticipant = participants.some(p => p.user_id === req.user!.id);
      const isCreator = session.created_by === req.user!.id;

      if (!isParticipant && !isCreator) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to view this session'
          }
        });
      }

      res.json({
        session,
        participants,
        presence,
        stats
      });

    } catch (error) {
      logger.error('Failed to get session details', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve session'
        }
      });
    }
  });

  /**
   * PUT /sessions/:id - Update session
   */
  router.put('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = UpdateSessionSchema.parse(req.body);

      // Check if user can modify session
      const canModify = await sessionService.validatePermission(sessionId, req.user!.id, 'modify');
      if (!canModify) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to modify this session'
          }
        });
      }

      const updates: any = { ...validatedData };
      if (validatedData.expires_at) {
        updates.expires_at = new Date(validatedData.expires_at);
      }

      const session = await sessionService.updateSession(sessionId, updates);

      logger.info('Collaboration session updated', {
        sessionId,
        userId: req.user!.id,
        updatedFields: Object.keys(validatedData)
      });

      res.json({ session });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          }
        });
      }

      logger.error('Failed to update session', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update session'
        }
      });
    }
  });

  /**
   * DELETE /sessions/:id - Delete session
   */
  router.delete('/sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;

      // Check if user can modify session (owners and moderators can delete)
      const canModify = await sessionService.validatePermission(sessionId, req.user!.id, 'modify');
      if (!canModify) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to delete this session'
          }
        });
      }

      await sessionService.deleteSession(sessionId);

      logger.info('Collaboration session deleted', {
        sessionId,
        userId: req.user!.id
      });

      res.status(204).send();

    } catch (error) {
      logger.error('Failed to delete session', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete session'
        }
      });
    }
  });

  // Participant Management Routes

  /**
   * POST /sessions/:id/participants - Add participant to session
   */
  router.post('/sessions/:id/participants', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = AddParticipantSchema.parse(req.body);

      // Check if user can invite others
      const canInvite = await sessionService.validatePermission(sessionId, req.user!.id, 'invite');
      if (!canInvite) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to add participants to this session'
          }
        });
      }

      const participant = await sessionService.addParticipant({
        session_id: sessionId,
        user_id: validatedData.user_id,
        role: validatedData.role || 'participant',
        is_active: true,
        permissions: validatedData.permissions || {},
        can_invite_others: validatedData.can_invite_others || false,
        can_modify_session: validatedData.can_modify_session || false,
        can_broadcast_events: validatedData.can_broadcast_events ?? true,
        event_count: 0,
        total_active_time_ms: 0
      });

      logger.info('Participant added to session', {
        sessionId,
        participantUserId: validatedData.user_id,
        addedBy: req.user!.id
      });

      res.status(201).json({ participant });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          }
        });
      }

      logger.error('Failed to add participant', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to add participant'
        }
      });
    }
  });

  /**
   * PUT /sessions/:id/participants/:userId - Update participant
   */
  router.put('/sessions/:id/participants/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const participantUserId = req.params.userId;
      const validatedData = UpdateParticipantSchema.parse(req.body);

      // Check if user can moderate or if they're updating themselves
      const canModerate = await sessionService.validatePermission(sessionId, req.user!.id, 'moderate');
      const isSelfUpdate = participantUserId === req.user!.id;

      if (!canModerate && !isSelfUpdate) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to update this participant'
          }
        });
      }

      // Find participant by user_id and session_id
      const participants = await sessionService.getSessionParticipants(sessionId);
      const participant = participants.find(p => p.user_id === participantUserId);

      if (!participant) {
        return res.status(404).json({
          error: {
            code: 'PARTICIPANT_NOT_FOUND',
            message: 'Participant not found in this session'
          }
        });
      }

      const updatedParticipant = await sessionService.updateParticipant(participant.id, validatedData);

      logger.info('Participant updated', {
        sessionId,
        participantUserId,
        updatedBy: req.user!.id,
        updatedFields: Object.keys(validatedData)
      });

      res.json({ participant: updatedParticipant });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          }
        });
      }

      logger.error('Failed to update participant', { 
        error, 
        sessionId: req.params.id, 
        participantUserId: req.params.userId,
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update participant'
        }
      });
    }
  });

  /**
   * DELETE /sessions/:id/participants/:userId - Remove participant
   */
  router.delete('/sessions/:id/participants/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const participantUserId = req.params.userId;

      // Check if user can moderate or if they're removing themselves
      const canModerate = await sessionService.validatePermission(sessionId, req.user!.id, 'moderate');
      const isSelfRemoval = participantUserId === req.user!.id;

      if (!canModerate && !isSelfRemoval) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to remove this participant'
          }
        });
      }

      await sessionService.removeParticipant(sessionId, participantUserId);

      logger.info('Participant removed from session', {
        sessionId,
        participantUserId,
        removedBy: req.user!.id
      });

      res.status(204).send();

    } catch (error) {
      logger.error('Failed to remove participant', { 
        error, 
        sessionId: req.params.id, 
        participantUserId: req.params.userId,
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to remove participant'
        }
      });
    }
  });

  // Event Management Routes

  /**
   * GET /sessions/:id/events - Get event history
   */
  router.get('/sessions/:id/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedQuery = EventHistorySchema.parse(req.query);

      // Check if user is a participant
      const participants = await sessionService.getSessionParticipants(sessionId);
      const isParticipant = participants.some(p => p.user_id === req.user!.id);

      if (!isParticipant) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to view events in this session'
          }
        });
      }

      let events = await eventService.getEventHistory(
        sessionId, 
        validatedQuery.from_sequence, 
        validatedQuery.limit
      );

      // Filter by event types if specified
      if (validatedQuery.event_types) {
        events = events.filter(event => validatedQuery.event_types!.includes(event.event_type));
      }

      // Filter by user if specified
      if (validatedQuery.user_id) {
        events = events.filter(event => event.user_id === validatedQuery.user_id);
      }

      res.json({
        events,
        total: events.length,
        hasMore: events.length === validatedQuery.limit
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors
          }
        });
      }

      logger.error('Failed to get event history', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve events'
        }
      });
    }
  });

  /**
   * POST /sessions/:id/events/replay - Replay events from timestamp
   */
  router.post('/sessions/:id/events/replay', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const { from_timestamp } = req.body;

      if (!from_timestamp) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'from_timestamp is required'
          }
        });
      }

      // Check if user is a participant
      const participants = await sessionService.getSessionParticipants(sessionId);
      const isParticipant = participants.some(p => p.user_id === req.user!.id);

      if (!isParticipant) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to replay events in this session'
          }
        });
      }

      const events = await eventService.replayEvents(sessionId, new Date(from_timestamp));

      res.json({
        events,
        total: events.length,
        replayFrom: from_timestamp
      });

    } catch (error) {
      logger.error('Failed to replay events', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to replay events'
        }
      });
    }
  });

  // Presence Management Routes

  /**
   * GET /sessions/:id/presence - Get session presence
   */
  router.get('/sessions/:id/presence', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;

      // Check if user is a participant
      const participants = await sessionService.getSessionParticipants(sessionId);
      const isParticipant = participants.some(p => p.user_id === req.user!.id);

      if (!isParticipant) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to view presence in this session'
          }
        });
      }

      const [presence, stats] = await Promise.all([
        presenceService.getSessionPresence(sessionId),
        presenceService.getSessionPresenceStats(sessionId)
      ]);

      res.json({
        presence,
        stats
      });

    } catch (error) {
      logger.error('Failed to get session presence', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve presence'
        }
      });
    }
  });

  /**
   * PUT /sessions/:id/presence - Update user presence
   */
  router.put('/sessions/:id/presence', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = PresenceUpdateSchema.parse(req.body);

      // Check if user is a participant
      const participants = await sessionService.getSessionParticipants(sessionId);
      const isParticipant = participants.some(p => p.user_id === req.user!.id);

      if (!isParticipant) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to update presence in this session'
          }
        });
      }

      // Build presence update
      const updateData: any = {
        user_id: req.user!.id,
        session_id: sessionId,
        last_activity: new Date(),
        connection_count: 1,
        connection_ids: [],
        last_heartbeat: new Date(),
        joined_session_at: new Date()
      };

      if (validatedData.status) {
        updateData.status = validatedData.status;
      }

      if (validatedData.custom_status_text) {
        updateData.custom_status_text = validatedData.custom_status_text;
      }

      if (validatedData.current_location) {
        updateData.current_location = validatedData.current_location;
      }

      if (validatedData.cursor_position) {
        updateData.cursor_position = validatedData.cursor_position;
      }

      if (validatedData.active_tools) {
        updateData.active_tools = validatedData.active_tools;
      }

      const presence = await presenceService.updatePresence(updateData);

      logger.debug('User presence updated via API', {
        sessionId,
        userId: req.user!.id,
        updatedFields: Object.keys(validatedData)
      });

      res.json({ presence });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors
          }
        });
      }

      logger.error('Failed to update presence', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update presence'
        }
      });
    }
  });

  // System Administration Routes

  /**
   * GET /admin/stats - Get collaboration system statistics
   */
  router.get('/admin/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Note: In production, you'd want to check for admin permissions here
      
      const [
        connectionStats,
        rateLimitStats,
        stalePresenceCount
      ] = await Promise.all([
        connectionManager.getConnectionStats(),
        rateLimiter.getStats(60),
        presenceService.cleanupStalePresence(60) // Get stale presence older than 60 minutes
      ]);

      res.json({
        connections: connectionStats,
        rateLimiting: rateLimitStats,
        presence: {
          staleRecords: stalePresenceCount
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get admin stats', { error, userId: req.user!.id });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve statistics'
        }
      });
    }
  });

  /**
   * POST /admin/cleanup - Perform system cleanup
   */
  router.post('/admin/cleanup', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Note: In production, you'd want to check for admin permissions here

      const [
        stalePresenceCleanup,
        rateLimitCleanup
      ] = await Promise.all([
        presenceService.cleanupStalePresence(10),
        rateLimiter.cleanup(24)
      ]);

      logger.info('System cleanup performed', {
        userId: req.user!.id,
        stalePresenceCleanup,
        rateLimitCleanup
      });

      res.json({
        message: 'Cleanup completed',
        results: {
          stalePresenceRecords: stalePresenceCleanup,
          rateLimitKeys: rateLimitCleanup
        }
      });

    } catch (error) {
      logger.error('Failed to perform cleanup', { error, userId: req.user!.id });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to perform cleanup'
        }
      });
    }
  });

  return router;
}