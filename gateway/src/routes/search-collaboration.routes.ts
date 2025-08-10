/**
 * Search Collaboration API Routes
 * 
 * REST endpoints for managing collaborative search sessions, participants,
 * search state, annotations, and real-time search coordination.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  LiveSearchCollaborationService,
  CollaborativeSearchSessionSchema,
  SearchSessionParticipantSchema,
  SearchAnnotationSchema,
  SearchStateUpdateSchema,
  SearchConflictResolutionSchema,
  SearchSessionRole,
  AnnotationType,
  ConflictResolutionStrategy
} from '@mcp-tools/core';
import { logger } from '../utils/logger.js';
import { SearchRateLimiter } from '../middleware/search-rate-limiter.js';
import { z } from 'zod';
import crypto from 'crypto';
import Redis from 'ioredis';

// Request validation schemas
const CreateSearchSessionSchema = z.object({
  workspace_id: z.string().uuid(),
  session_name: z.string().min(1).max(255),
  is_persistent: z.boolean().optional(),
  search_settings: z.record(z.unknown()).optional(),
  max_participants: z.number().int().min(1).max(100).optional(),
  allow_anonymous_search: z.boolean().optional(),
  require_moderation: z.boolean().optional()
});

const UpdateSearchSessionSchema = CreateSearchSessionSchema.partial();

const JoinSearchSessionSchema = z.object({
  role: z.enum(['searcher', 'observer', 'moderator']).optional()
});

const UpdateSearchParticipantSchema = z.object({
  role: z.enum(['searcher', 'observer', 'moderator']).optional(),
  can_initiate_search: z.boolean().optional(),
  can_modify_filters: z.boolean().optional(),
  can_annotate_results: z.boolean().optional(),
  can_bookmark_results: z.boolean().optional(),
  can_invite_participants: z.boolean().optional()
});

const CreateAnnotationSchema = z.object({
  result_id: z.string().uuid(),
  result_type: z.string().min(1).max(50),
  result_url: z.string().optional(),
  annotation_type: z.enum(['highlight', 'note', 'bookmark', 'flag', 'question', 'suggestion']),
  annotation_text: z.string().optional(),
  annotation_data: z.record(z.unknown()).optional(),
  text_selection: z.record(z.unknown()).optional(),
  selected_text: z.string().optional(),
  is_shared: z.boolean().optional(),
  parent_annotation_id: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).optional()
});

const UpdateAnnotationSchema = z.object({
  annotation_text: z.string().optional(),
  annotation_data: z.record(z.unknown()).optional(),
  text_selection: z.record(z.unknown()).optional(),
  selected_text: z.string().optional(),
  is_resolved: z.boolean().optional(),
  resolved_by: z.string().uuid().optional()
});

const UpdateSearchStateSchema = z.object({
  state_key: z.string().min(1).max(100),
  new_value: z.record(z.unknown()),
  conflict_resolution: z.enum(['last_write_wins', 'merge', 'manual']).optional()
});

const ConflictResolutionRequestSchema = z.object({
  conflict_id: z.string().uuid(),
  resolution_strategy: z.enum(['last_write_wins', 'merge', 'manual']),
  resolved_value: z.record(z.unknown()),
  state_key: z.string().min(1).max(100)
});

const SearchHistoryQuerySchema = z.object({
  from_sequence: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  event_types: z.array(z.enum(['query_update', 'filter_change', 'result_highlight', 'annotation_add'])).optional(),
  user_id: z.string().uuid().optional()
});

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export function createSearchCollaborationRoutes(
  searchService: LiveSearchCollaborationService
): Router {
  const router = Router();

  // Initialize rate limiter (will be set up by the main gateway)
  let rateLimiter: SearchRateLimiter;
  
  // Middleware to get rate limiter from app locals
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!rateLimiter && req.app.locals.redis) {
      rateLimiter = new SearchRateLimiter(req.app.locals.redis as Redis);
    }
    next();
  });

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

  // Helper function to check if user is session participant
  const checkParticipant = async (sessionId: string, userId: string): Promise<boolean> => {
    try {
      const participants = await searchService.getSessionParticipants(sessionId);
      return participants.some(p => p.user_id === userId && p.is_active);
    } catch {
      return false;
    }
  };

  // Search Session Management Routes

  /**
   * GET /search-sessions - List collaborative search sessions
   */
  router.get('/search-sessions', requireAuth, rateLimiter?.createRequestLimiter() || ((req, res, next) => next()), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { workspace_id } = req.query;
      
      let sessions;
      if (workspace_id && typeof workspace_id === 'string') {
        sessions = await searchService.listActiveSearchSessions(workspace_id);
      } else {
        sessions = await searchService.listActiveSearchSessions();
      }

      // Filter to only show sessions the user participates in or created
      const userSessions = [];
      for (const session of sessions) {
        if (session.created_by === req.user!.id || await checkParticipant(session.id, req.user!.id)) {
          userSessions.push(session);
        }
      }

      res.json({
        sessions: userSessions,
        total: userSessions.length
      });

    } catch (error) {
      logger.error('Failed to list search sessions', { error, userId: req.user!.id });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve search sessions'
        }
      });
    }
  });

  /**
   * POST /search-sessions - Create a new collaborative search session
   */
  router.post('/search-sessions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = CreateSearchSessionSchema.parse(req.body);

      const session = await searchService.createSearchSession({
        ...validatedData,
        collaboration_session_id: crypto.randomUUID(), // This would be created by the base collaboration service
        created_by: req.user!.id,
        is_active: true,
        search_settings: validatedData.search_settings || {},
        current_search_state: {},
        search_history: [],
        shared_annotations: {},
        performance_metrics: {}
      });

      logger.info('Collaborative search session created', {
        sessionId: session.id,
        userId: req.user!.id,
        workspaceId: session.workspace_id
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

      logger.error('Failed to create search session', { error, userId: req.user!.id });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create search session'
        }
      });
    }
  });

  /**
   * GET /search-sessions/:id - Get search session details (optimized)
   */
  router.get('/search-sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      
      // Use the optimized batch method to get all data efficiently
      const { session, participants, searchState, annotations, stats } = 
        await searchService.getSearchSessionDetails(sessionId);

      if (!session) {
        return res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Search session not found'
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
            message: 'Not authorized to view this search session'
          }
        });
      }

      res.json({
        session,
        participants,
        searchState,
        annotations,
        stats
      });

    } catch (error) {
      logger.error('Failed to get search session details', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve search session'
        }
      });
    }
  });

  /**
   * PUT /search-sessions/:id - Update search session
   */
  router.put('/search-sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = UpdateSearchSessionSchema.parse(req.body);

      // Check if user is the creator or has moderator permissions
      const session = await searchService.getSearchSession(sessionId);
      if (!session) {
        return res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Search session not found'
          }
        });
      }

      const participants = await searchService.getSessionParticipants(sessionId);
      const participant = participants.find(p => p.user_id === req.user!.id);
      const isCreator = session.created_by === req.user!.id;
      const isModerator = participant?.role === 'moderator';

      if (!isCreator && !isModerator) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to modify this search session'
          }
        });
      }

      const updatedSession = await searchService.updateSearchSession(sessionId, validatedData);

      logger.info('Search session updated', {
        sessionId,
        userId: req.user!.id,
        updatedFields: Object.keys(validatedData)
      });

      res.json({ session: updatedSession });

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

      logger.error('Failed to update search session', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update search session'
        }
      });
    }
  });

  /**
   * DELETE /search-sessions/:id - Delete search session
   */
  router.delete('/search-sessions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;

      // Check if user is the creator
      const session = await searchService.getSearchSession(sessionId);
      if (!session) {
        return res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Search session not found'
          }
        });
      }

      if (session.created_by !== req.user!.id) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Only session creator can delete search sessions'
          }
        });
      }

      await searchService.deleteSearchSession(sessionId);

      logger.info('Search session deleted', {
        sessionId,
        userId: req.user!.id
      });

      res.status(204).send();

    } catch (error) {
      logger.error('Failed to delete search session', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete search session'
        }
      });
    }
  });

  // Participant Management Routes

  /**
   * POST /search-sessions/:id/join - Join a search session
   */
  router.post('/search-sessions/:id/join', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = JoinSearchSessionSchema.parse(req.body);
      const role = validatedData.role || 'searcher';

      // Check session participation limits
      if (rateLimiter) {
        const { canJoin, reason } = await rateLimiter.checkSessionParticipationLimits(req.user!.id, sessionId);
        if (!canJoin) {
          return res.status(429).json({
            error: {
              code: 'SESSION_LIMIT_EXCEEDED',
              message: reason || 'Cannot join session due to limits'
            }
          });
        }
      }

      const participant = await searchService.joinSearchSession(sessionId, req.user!.id, role);

      // Track session join for rate limiting
      if (rateLimiter) {
        await rateLimiter.trackSessionJoin(req.user!.id, sessionId);
      }

      logger.info('User joined search session', {
        sessionId,
        userId: req.user!.id,
        role
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

      logger.error('Failed to join search session', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });

      // Handle specific error messages
      if (error.message.includes('maximum capacity')) {
        return res.status(409).json({
          error: {
            code: 'SESSION_FULL',
            message: error.message
          }
        });
      }

      if (error.message.includes('already a participant')) {
        return res.status(409).json({
          error: {
            code: 'ALREADY_PARTICIPANT',
            message: error.message
          }
        });
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to join search session'
        }
      });
    }
  });

  /**
   * POST /search-sessions/:id/leave - Leave a search session
   */
  router.post('/search-sessions/:id/leave', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;

      await searchService.leaveSearchSession(sessionId, req.user!.id);

      // Track session leave for rate limiting
      if (rateLimiter) {
        await rateLimiter.trackSessionLeave(req.user!.id, sessionId);
      }

      logger.info('User left search session', {
        sessionId,
        userId: req.user!.id
      });

      res.status(204).send();

    } catch (error) {
      logger.error('Failed to leave search session', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });

      if (error.message.includes('not a participant')) {
        return res.status(404).json({
          error: {
            code: 'NOT_PARTICIPANT',
            message: error.message
          }
        });
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to leave search session'
        }
      });
    }
  });

  /**
   * PUT /search-sessions/:id/participants/:userId - Update participant
   */
  router.put('/search-sessions/:id/participants/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const participantUserId = req.params.userId;
      const validatedData = UpdateSearchParticipantSchema.parse(req.body);

      // Check permissions - moderators can update others, users can update themselves
      const participants = await searchService.getSessionParticipants(sessionId);
      const requesterParticipant = participants.find(p => p.user_id === req.user!.id);
      const targetParticipant = participants.find(p => p.user_id === participantUserId);

      if (!targetParticipant) {
        return res.status(404).json({
          error: {
            code: 'PARTICIPANT_NOT_FOUND',
            message: 'Participant not found in this search session'
          }
        });
      }

      const isModerator = requesterParticipant?.role === 'moderator';
      const isSelfUpdate = participantUserId === req.user!.id;

      if (!isModerator && !isSelfUpdate) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to update this participant'
          }
        });
      }

      const updatedParticipant = await searchService.updateParticipant(targetParticipant.id, validatedData);

      logger.info('Search session participant updated', {
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

      logger.error('Failed to update search participant', { 
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

  // Search State Management Routes

  /**
   * PUT /search-sessions/:id/state - Update search state
   */
  router.put('/search-sessions/:id/state', requireAuth, rateLimiter?.createStateUpdateLimiter() || ((req, res, next) => next()), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = UpdateSearchStateSchema.parse(req.body);

      // Check if user is a participant
      if (!(await checkParticipant(sessionId, req.user!.id))) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to update search state in this session'
          }
        });
      }

      const searchState = await searchService.updateSearchState({
        sessionId,
        userId: req.user!.id,
        stateKey: validatedData.state_key,
        newValue: validatedData.new_value,
        timestamp: new Date(),
        conflictResolution: validatedData.conflict_resolution
      });

      logger.debug('Search state updated', {
        sessionId,
        userId: req.user!.id,
        stateKey: validatedData.state_key,
        version: searchState.version
      });

      res.json({ searchState });

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

      logger.error('Failed to update search state', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update search state'
        }
      });
    }
  });

  /**
   * GET /search-sessions/:id/state - Get current search state
   */
  router.get('/search-sessions/:id/state', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const { state_key } = req.query;

      // Check if user is a participant
      if (!(await checkParticipant(sessionId, req.user!.id))) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to view search state in this session'
          }
        });
      }

      if (state_key && typeof state_key === 'string') {
        const searchState = await searchService.getSearchState(sessionId, state_key);
        res.json({ searchState });
      } else {
        const searchState = await searchService.syncSearchState(sessionId);
        res.json({ searchState });
      }

    } catch (error) {
      logger.error('Failed to get search state', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve search state'
        }
      });
    }
  });

  // Annotation Management Routes

  /**
   * POST /search-sessions/:id/annotations - Create search annotation
   */
  router.post('/search-sessions/:id/annotations', requireAuth, rateLimiter?.createAnnotationLimiter() || ((req, res, next) => next()), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = CreateAnnotationSchema.parse(req.body);

      // Check if user is a participant with annotation permissions
      const participants = await searchService.getSessionParticipants(sessionId);
      const participant = participants.find(p => p.user_id === req.user!.id);

      if (!participant || !participant.can_annotate_results) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to create annotations in this session'
          }
        });
      }

      const annotation = await searchService.createAnnotation({
        ...validatedData,
        search_session_id: sessionId,
        user_id: req.user!.id
      });

      logger.info('Search annotation created', {
        sessionId,
        annotationId: annotation.id,
        userId: req.user!.id,
        type: annotation.annotation_type
      });

      res.status(201).json({ annotation });

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

      logger.error('Failed to create annotation', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create annotation'
        }
      });
    }
  });

  /**
   * PUT /search-sessions/:id/annotations/:annotationId - Update annotation
   */
  router.put('/search-sessions/:id/annotations/:annotationId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const annotationId = req.params.annotationId;
      const validatedData = UpdateAnnotationSchema.parse(req.body);

      // Check if user is a participant and can modify the annotation
      const annotations = await searchService.getSessionAnnotations(sessionId);
      const annotation = annotations.find(a => a.id === annotationId);

      if (!annotation) {
        return res.status(404).json({
          error: {
            code: 'ANNOTATION_NOT_FOUND',
            message: 'Annotation not found'
          }
        });
      }

      // Users can edit their own annotations, moderators can edit any
      const participants = await searchService.getSessionParticipants(sessionId);
      const participant = participants.find(p => p.user_id === req.user!.id);
      const isModerator = participant?.role === 'moderator';
      const isOwner = annotation.user_id === req.user!.id;

      if (!isModerator && !isOwner) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to update this annotation'
          }
        });
      }

      const updatedAnnotation = await searchService.updateAnnotation(annotationId, validatedData);

      logger.info('Search annotation updated', {
        sessionId,
        annotationId,
        userId: req.user!.id,
        updatedFields: Object.keys(validatedData)
      });

      res.json({ annotation: updatedAnnotation });

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

      logger.error('Failed to update annotation', { 
        error, 
        sessionId: req.params.id, 
        annotationId: req.params.annotationId,
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update annotation'
        }
      });
    }
  });

  /**
   * DELETE /search-sessions/:id/annotations/:annotationId - Delete annotation
   */
  router.delete('/search-sessions/:id/annotations/:annotationId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const annotationId = req.params.annotationId;

      // Check if user is a participant and can delete the annotation
      const annotations = await searchService.getSessionAnnotations(sessionId);
      const annotation = annotations.find(a => a.id === annotationId);

      if (!annotation) {
        return res.status(404).json({
          error: {
            code: 'ANNOTATION_NOT_FOUND',
            message: 'Annotation not found'
          }
        });
      }

      // Users can delete their own annotations, moderators can delete any
      const participants = await searchService.getSessionParticipants(sessionId);
      const participant = participants.find(p => p.user_id === req.user!.id);
      const isModerator = participant?.role === 'moderator';
      const isOwner = annotation.user_id === req.user!.id;

      if (!isModerator && !isOwner) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to delete this annotation'
          }
        });
      }

      await searchService.deleteAnnotation(annotationId);

      logger.info('Search annotation deleted', {
        sessionId,
        annotationId,
        userId: req.user!.id
      });

      res.status(204).send();

    } catch (error) {
      logger.error('Failed to delete annotation', { 
        error, 
        sessionId: req.params.id, 
        annotationId: req.params.annotationId,
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete annotation'
        }
      });
    }
  });

  // Event History Routes

  /**
   * GET /search-sessions/:id/events - Get search event history
   */
  router.get('/search-sessions/:id/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedQuery = SearchHistoryQuerySchema.parse(req.query);

      // Check if user is a participant
      if (!(await checkParticipant(sessionId, req.user!.id))) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to view events in this search session'
          }
        });
      }

      let events = await searchService.getSearchEventHistory(
        sessionId, 
        validatedQuery.from_sequence, 
        validatedQuery.limit
      );

      // Filter by event types if specified
      if (validatedQuery.event_types) {
        events = events.filter(event => validatedQuery.event_types!.includes(event.search_event_type));
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

      logger.error('Failed to get search event history', { 
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

  // Conflict Resolution Routes

  /**
   * GET /search-sessions/:id/conflicts - Detect search state conflicts
   */
  router.get('/search-sessions/:id/conflicts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const { state_key } = req.query;

      // Check if user is a participant
      if (!(await checkParticipant(sessionId, req.user!.id))) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to view conflicts in this search session'
          }
        });
      }

      if (!state_key || typeof state_key !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'state_key query parameter is required'
          }
        });
      }

      const conflicts = await searchService.detectConflicts(sessionId, state_key);

      res.json({
        conflicts,
        total: conflicts.length
      });

    } catch (error) {
      logger.error('Failed to detect conflicts', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to detect conflicts'
        }
      });
    }
  });

  /**
   * POST /search-sessions/:id/conflicts/resolve - Resolve search state conflict
   */
  router.post('/search-sessions/:id/conflicts/resolve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.params.id;
      const validatedData = ConflictResolutionRequestSchema.parse(req.body);

      // Check if user is a participant with moderator role for manual resolutions
      const participants = await searchService.getSessionParticipants(sessionId);
      const participant = participants.find(p => p.user_id === req.user!.id);

      if (!participant) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Not authorized to resolve conflicts in this search session'
          }
        });
      }

      if (validatedData.resolution_strategy === 'manual' && participant.role !== 'moderator') {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'Only moderators can perform manual conflict resolution'
          }
        });
      }

      await searchService.resolveConflict(validatedData.conflict_id, {
        conflictId: validatedData.conflict_id,
        sessionId: sessionId,
        stateKey: validatedData.state_key,
        conflictingValues: [], // This would be populated from the actual conflict detection
        resolutionStrategy: validatedData.resolution_strategy,
        resolvedValue: validatedData.resolved_value,
        resolvedBy: req.user!.id,
        resolvedAt: new Date()
      });

      logger.info('Search conflict resolved', {
        sessionId,
        conflictId: validatedData.conflict_id,
        resolvedBy: req.user!.id,
        strategy: validatedData.resolution_strategy
      });

      res.json({
        message: 'Conflict resolved successfully',
        conflictId: validatedData.conflict_id,
        strategy: validatedData.resolution_strategy
      });

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

      logger.error('Failed to resolve conflict', { 
        error, 
        sessionId: req.params.id, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to resolve conflict'
        }
      });
    }
  });

  // Rate Limiting Status Route

  /**
   * GET /rate-limit-status - Get current rate limit status for user
   */
  router.get('/rate-limit-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!rateLimiter) {
        return res.json({
          error: 'Rate limiting not configured'
        });
      }

      const stats = await rateLimiter.getStats(req.user!.id);

      res.json({
        userId: req.user!.id,
        rateLimits: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get rate limit status', { 
        error, 
        userId: req.user!.id 
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve rate limit status'
        }
      });
    }
  });

  return router;
}