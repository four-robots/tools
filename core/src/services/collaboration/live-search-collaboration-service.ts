/**
 * Live Search Collaboration Service
 * 
 * Comprehensive service for managing real-time collaborative search sessions,
 * including state synchronization, conflict resolution, annotations, and 
 * multi-user search coordination.
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import {
  CollaborativeSearchSession,
  SearchSessionParticipant,
  SharedSearchState,
  CollaborativeSearchEvent,
  SearchAnnotation,
  SearchStateUpdate,
  SearchConflictResolution,
  CollaborativeSearchSessionSchema,
  SearchSessionParticipantSchema,
  SharedSearchStateSchema,
  CollaborativeSearchEventSchema,
  SearchAnnotationSchema,
  SearchStateUpdateSchema,
  SearchConflictResolutionSchema,
  LiveSearchCollaborationService as ILiveSearchCollaborationService,
  SearchSessionRole,
  SearchEventType,
  AnnotationType,
  ConflictResolutionStrategy
} from '../../shared/types/live-search-collaboration.js';
import { CollaborationSessionService } from './session-service.js';
import { logger } from '../../utils/logger.js';
import { InputSanitizer } from '../../utils/sanitizer.js';

export class LiveSearchCollaborationService implements ILiveSearchCollaborationService {
  constructor(
    private db: Pool,
    private collaborationService: CollaborationSessionService
  ) {}

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Creates a new collaborative search session
   */
  async createSearchSession(
    sessionData: Omit<CollaborativeSearchSession, 'id' | 'created_at' | 'updated_at'>
  ): Promise<CollaborativeSearchSession> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Sanitize session data
      const sanitizedSessionData = {
        ...sessionData,
        session_name: InputSanitizer.sanitizePlainText(sessionData.session_name)
      };

      const validatedData = CollaborativeSearchSessionSchema.omit({
        id: true,
        created_at: true,
        updated_at: true
      }).parse(sanitizedSessionData);

      // Create base collaboration session first
      const baseSession = await this.collaborationService.createSession({
        workspace_id: validatedData.workspace_id,
        session_name: validatedData.session_name,
        session_type: 'search',
        created_by: validatedData.created_by,
        is_active: validatedData.is_active,
        settings: validatedData.search_settings,
        max_participants: validatedData.max_participants,
        allow_anonymous: validatedData.allow_anonymous_search,
        require_approval: validatedData.require_moderation,
        context_data: { searchSession: true },
        shared_state: validatedData.current_search_state,
        activity_summary: {}
      });

      // Create specialized search session
      const result = await client.query(
        `INSERT INTO collaborative_search_sessions (
          collaboration_session_id, workspace_id, session_name, created_by,
          is_active, is_persistent, search_settings, max_participants,
          allow_anonymous_search, require_moderation, current_search_state,
          search_history, shared_annotations, performance_metrics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          baseSession.id,
          validatedData.workspace_id,
          validatedData.session_name,
          validatedData.created_by,
          validatedData.is_active,
          validatedData.is_persistent,
          JSON.stringify(validatedData.search_settings),
          validatedData.max_participants,
          validatedData.allow_anonymous_search,
          validatedData.require_moderation,
          JSON.stringify(validatedData.current_search_state),
          JSON.stringify(validatedData.search_history),
          JSON.stringify(validatedData.shared_annotations),
          JSON.stringify(validatedData.performance_metrics)
        ]
      );

      const searchSession = this.mapRowToSearchSession(result.rows[0]);

      // Initialize shared search state
      await this.initializeSearchState(client, searchSession.id, validatedData.created_by);

      await client.query('COMMIT');

      logger.info('Collaborative search session created', {
        sessionId: searchSession.id,
        workspaceId: searchSession.workspace_id,
        createdBy: searchSession.created_by
      });

      return searchSession;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create collaborative search session', { error, sessionData });
      throw new Error(`Failed to create search session: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a collaborative search session by ID
   */
  async getSearchSession(id: string): Promise<CollaborativeSearchSession | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM collaborative_search_sessions WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSearchSession(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get collaborative search session', { error, sessionId: id });
      throw new Error(`Failed to get search session: ${error.message}`);
    }
  }

  /**
   * Gets complete search session details in a single efficient query
   */
  async getSearchSessionDetails(id: string): Promise<{
    session: CollaborativeSearchSession | null;
    participants: SearchSessionParticipant[];
    searchState: Record<string, SharedSearchState>;
    annotations: SearchAnnotation[];
    stats: {
      participantCount: number;
      activeParticipants: number;
      annotationCount: number;
      searchStateKeys: number;
    };
  }> {
    const client = await this.db.connect();
    
    try {
      // Execute all queries in parallel for efficiency
      const [sessionResult, participantsResult, stateResult, annotationsResult] = await Promise.all([
        client.query('SELECT * FROM collaborative_search_sessions WHERE id = $1', [id]),
        client.query(`
          SELECT 
            ssp.id, ssp.search_session_id, ssp.user_id, ssp.role, ssp.joined_at, 
            ssp.last_search_at, ssp.is_active, ssp.can_initiate_search, ssp.can_modify_filters,
            ssp.can_annotate_results, ssp.can_bookmark_results, ssp.can_invite_participants,
            ssp.search_query_count, ssp.filter_change_count, ssp.annotation_count,
            ssp.total_search_time_ms, ssp.current_query, ssp.active_filters,
            ssp.cursor_position, ssp.selected_results,
            u.name as user_name, u.email as user_email, u.avatar_url, u.display_name, u.timezone
          FROM search_session_participants ssp 
          JOIN users u ON ssp.user_id = u.id 
          WHERE ssp.search_session_id = $1 
          ORDER BY ssp.joined_at ASC
        `, [id]),
        client.query(`
          SELECT * FROM shared_search_state 
          WHERE search_session_id = $1 
          ORDER BY last_modified_at DESC
        `, [id]),
        client.query(`
          SELECT sa.*, u.name as user_name, u.email as user_email 
          FROM search_annotations sa 
          JOIN users u ON sa.user_id = u.id 
          WHERE sa.search_session_id = $1 AND sa.is_shared = true
          ORDER BY sa.created_at DESC
        `, [id])
      ]);

      if (sessionResult.rows.length === 0) {
        return {
          session: null,
          participants: [],
          searchState: {},
          annotations: [],
          stats: { participantCount: 0, activeParticipants: 0, annotationCount: 0, searchStateKeys: 0 }
        };
      }

      const session = this.mapRowToSearchSession(sessionResult.rows[0]);
      const participants = participantsResult.rows.map(row => this.mapRowToSearchParticipant(row));
      const annotations = annotationsResult.rows.map(row => this.mapRowToSearchAnnotation(row));

      const searchState: Record<string, SharedSearchState> = {};
      stateResult.rows.forEach(row => {
        const state = this.mapRowToSearchState(row);
        searchState[state.state_key] = state;
      });

      const stats = {
        participantCount: participants.length,
        activeParticipants: participants.filter(p => p.is_active).length,
        annotationCount: annotations.length,
        searchStateKeys: Object.keys(searchState).length
      };

      return {
        session,
        participants,
        searchState,
        annotations,
        stats
      };
    } catch (error) {
      logger.error('Failed to get search session details', { error, sessionId: id });
      throw new Error(`Failed to get search session details: ${error.message}`);
    } finally {
      client.release();
    }
  }

  // Allowlisted fields for search session updates
  private static readonly SEARCH_SESSION_UPDATE_FIELDS = new Set([
    'workspace_id', 'session_name', 'is_active', 'is_persistent',
    'search_settings', 'max_participants', 'allow_anonymous_search',
    'require_moderation', 'current_search_state', 'search_history',
    'shared_annotations', 'performance_metrics'
  ]);

  private static readonly JSON_FIELDS = new Set([
    'search_settings', 'current_search_state', 'search_history',
    'shared_annotations', 'performance_metrics'
  ]);

  /**
   * Updates a collaborative search session
   */
  async updateSearchSession(
    id: string, 
    updates: Partial<CollaborativeSearchSession>
  ): Promise<CollaborativeSearchSession> {
    try {
      // Sanitize updates
      const sanitizedUpdates = {
        ...updates,
        ...(updates.session_name && { session_name: InputSanitizer.sanitizePlainText(updates.session_name) })
      };
      
      const validatedUpdates = CollaborativeSearchSessionSchema.partial().parse(sanitizedUpdates);

      // Build dynamic update query with field allowlisting
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCounter = 1;

      Object.entries(validatedUpdates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at' && LiveSearchCollaborationService.SEARCH_SESSION_UPDATE_FIELDS.has(key)) {
          if (LiveSearchCollaborationService.JSON_FIELDS.has(key)) {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(value);
          }
          paramCounter++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Always update updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);

      const result = await this.db.query(
        `UPDATE collaborative_search_sessions 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramCounter} 
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        throw new Error('Search session not found');
      }

      const session = this.mapRowToSearchSession(result.rows[0]);

      logger.info('Collaborative search session updated', {
        sessionId: id,
        updatedFields: Object.keys(validatedUpdates)
      });

      return session;
    } catch (error) {
      logger.error('Failed to update collaborative search session', { error, sessionId: id, updates });
      throw new Error(`Failed to update search session: ${error.message}`);
    }
  }

  /**
   * Deletes a collaborative search session and all related data
   */
  async deleteSearchSession(id: string): Promise<void> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Get collaboration session ID first
      const sessionResult = await client.query(
        'SELECT collaboration_session_id FROM collaborative_search_sessions WHERE id = $1',
        [id]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Search session not found');
      }

      const collaborationSessionId = sessionResult.rows[0].collaboration_session_id;

      // Delete search session (cascades to related tables)
      await client.query(
        'DELETE FROM collaborative_search_sessions WHERE id = $1',
        [id]
      );

      // Delete base collaboration session
      await this.collaborationService.deleteSession(collaborationSessionId);

      await client.query('COMMIT');

      logger.info('Collaborative search session deleted', { sessionId: id });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete collaborative search session', { error, sessionId: id });
      throw new Error(`Failed to delete search session: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Lists active collaborative search sessions with participant counts (optimized)
   */
  async listActiveSearchSessions(workspaceId?: string): Promise<CollaborativeSearchSession[]> {
    try {
      let query = `
        SELECT css.*, 
               COUNT(ssp.id) as participant_count,
               COUNT(ssp.id) FILTER (WHERE ssp.is_active = true) as active_participant_count
        FROM collaborative_search_sessions css
        LEFT JOIN search_session_participants ssp ON css.id = ssp.search_session_id
        WHERE css.is_active = true`;
      
      const params: any[] = [];

      if (workspaceId) {
        query += ' AND css.workspace_id = $1';
        params.push(workspaceId);
      }

      query += `
        GROUP BY css.id, css.collaboration_session_id, css.workspace_id, css.session_name,
                 css.created_by, css.created_at, css.updated_at, css.is_active, css.is_persistent,
                 css.search_settings, css.max_participants, css.allow_anonymous_search,
                 css.require_moderation, css.current_search_state, css.search_history,
                 css.shared_annotations, css.performance_metrics
        ORDER BY css.updated_at DESC`;

      const result = await this.db.query(query, params);

      return result.rows.map(row => {
        const session = this.mapRowToSearchSession(row);
        // Add computed fields
        (session as any).participant_count = parseInt(row.participant_count) || 0;
        (session as any).active_participant_count = parseInt(row.active_participant_count) || 0;
        return session;
      });
    } catch (error) {
      logger.error('Failed to list active search sessions', { error, workspaceId });
      throw new Error(`Failed to list active search sessions: ${error.message}`);
    }
  }

  // ============================================================================
  // Participant Management
  // ============================================================================

  /**
   * Joins a user to a collaborative search session
   */
  async joinSearchSession(
    sessionId: string, 
    userId: string, 
    role: SearchSessionRole = 'searcher'
  ): Promise<SearchSessionParticipant> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Check if session exists and is active
      const sessionCheck = await client.query(
        'SELECT id, max_participants FROM collaborative_search_sessions WHERE id = $1 AND is_active = true',
        [sessionId]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Search session not found or inactive');
      }

      // Check current participant count
      const participantCount = await client.query(
        'SELECT COUNT(*) as count FROM search_session_participants WHERE search_session_id = $1 AND is_active = true',
        [sessionId]
      );

      const currentCount = parseInt(participantCount.rows[0].count);
      const maxParticipants = sessionCheck.rows[0].max_participants;

      if (currentCount >= maxParticipants) {
        throw new Error(`Search session has reached maximum capacity of ${maxParticipants} participants`);
      }

      // Check for existing participant
      const existingParticipant = await client.query(
        'SELECT id FROM search_session_participants WHERE search_session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      if (existingParticipant.rows.length > 0) {
        throw new Error('User is already a participant in this search session');
      }

      // Create participant
      const result = await client.query(
        `INSERT INTO search_session_participants (
          search_session_id, user_id, role, is_active,
          can_initiate_search, can_modify_filters, can_annotate_results,
          can_bookmark_results, can_invite_participants,
          search_query_count, filter_change_count, annotation_count,
          total_search_time_ms, active_filters, cursor_position, selected_results
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          sessionId, userId, role, true,
          true, true, true, true, role === 'moderator',
          0, 0, 0, 0,
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify([])
        ]
      );

      const participant = this.mapRowToSearchParticipant(result.rows[0]);

      await client.query('COMMIT');

      logger.info('User joined collaborative search session', {
        sessionId,
        userId,
        role
      });

      return participant;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to join search session', { error, sessionId, userId, role });
      throw new Error(`Failed to join search session: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Removes a user from a collaborative search session
   */
  async leaveSearchSession(sessionId: string, userId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM search_session_participants WHERE search_session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error('User is not a participant in this search session');
      }

      logger.info('User left collaborative search session', {
        sessionId,
        userId
      });
    } catch (error) {
      logger.error('Failed to leave search session', { error, sessionId, userId });
      throw new Error(`Failed to leave search session: ${error.message}`);
    }
  }

  // Allowlisted fields for participant updates
  private static readonly PARTICIPANT_UPDATE_FIELDS = new Set([
    'role', 'is_active', 'can_initiate_search', 'can_modify_filters',
    'can_annotate_results', 'can_bookmark_results', 'can_invite_participants',
    'search_query_count', 'filter_change_count', 'annotation_count',
    'total_search_time_ms', 'current_query', 'active_filters',
    'cursor_position', 'selected_results'
  ]);

  private static readonly PARTICIPANT_JSON_FIELDS = new Set([
    'active_filters', 'cursor_position', 'selected_results'
  ]);

  /**
   * Updates a search session participant
   */
  async updateParticipant(
    participantId: string, 
    updates: Partial<SearchSessionParticipant>
  ): Promise<SearchSessionParticipant> {
    try {
      const validatedUpdates = SearchSessionParticipantSchema.partial().parse(updates);

      // Build dynamic update query with field allowlisting
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCounter = 1;

      Object.entries(validatedUpdates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'joined_at' && LiveSearchCollaborationService.PARTICIPANT_UPDATE_FIELDS.has(key)) {
          if (LiveSearchCollaborationService.PARTICIPANT_JSON_FIELDS.has(key)) {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(value);
          }
          paramCounter++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Always update last_search_at if query-related fields are updated
      if (Object.keys(validatedUpdates).some(key => 
        ['current_query', 'active_filters', 'search_query_count'].includes(key))) {
        updateFields.push(`last_search_at = CURRENT_TIMESTAMP`);
      }

      updateValues.push(participantId);

      const result = await this.db.query(
        `UPDATE search_session_participants 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramCounter} 
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        throw new Error('Search participant not found');
      }

      const participant = this.mapRowToSearchParticipant(result.rows[0]);

      logger.info('Search session participant updated', {
        participantId,
        updatedFields: Object.keys(validatedUpdates)
      });

      return participant;
    } catch (error) {
      logger.error('Failed to update search participant', { error, participantId, updates });
      throw new Error(`Failed to update search participant: ${error.message}`);
    }
  }

  /**
   * Gets all participants for a collaborative search session (optimized with JOIN)
   */
  async getSessionParticipants(sessionId: string): Promise<SearchSessionParticipant[]> {
    try {
      const result = await this.db.query(
        `SELECT 
           ssp.id, ssp.search_session_id, ssp.user_id, ssp.role, ssp.joined_at, 
           ssp.last_search_at, ssp.is_active, ssp.can_initiate_search, ssp.can_modify_filters,
           ssp.can_annotate_results, ssp.can_bookmark_results, ssp.can_invite_participants,
           ssp.search_query_count, ssp.filter_change_count, ssp.annotation_count,
           ssp.total_search_time_ms, ssp.current_query, ssp.active_filters,
           ssp.cursor_position, ssp.selected_results,
           u.name as user_name, u.email as user_email,
           u.avatar_url, u.display_name, u.timezone
         FROM search_session_participants ssp 
         JOIN users u ON ssp.user_id = u.id 
         WHERE ssp.search_session_id = $1 
         ORDER BY ssp.joined_at ASC`,
        [sessionId]
      );

      return result.rows.map(row => this.mapRowToSearchParticipant(row));
    } catch (error) {
      logger.error('Failed to get search session participants', { error, sessionId });
      throw new Error(`Failed to get search session participants: ${error.message}`);
    }
  }

  // ============================================================================
  // Search State Synchronization
  // ============================================================================

  /**
   * Updates search state with conflict resolution
   */
  async updateSearchState(update: SearchStateUpdate): Promise<SharedSearchState> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      const validatedUpdate = SearchStateUpdateSchema.parse(update);
      
      // Generate state hash for conflict detection
      const stateHash = this.generateStateHash(validatedUpdate.newValue);
      
      // Check for existing state
      const existingState = await client.query(
        'SELECT * FROM shared_search_state WHERE search_session_id = $1 AND state_key = $2',
        [validatedUpdate.sessionId, validatedUpdate.stateKey]
      );

      let result;
      
      if (existingState.rows.length === 0) {
        // Create new state
        result = await client.query(
          `INSERT INTO shared_search_state (
            search_session_id, state_key, state_value, last_modified_by,
            version, state_hash, conflict_resolution, change_source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            validatedUpdate.sessionId,
            validatedUpdate.stateKey,
            JSON.stringify(validatedUpdate.newValue),
            validatedUpdate.userId,
            1,
            stateHash,
            validatedUpdate.conflictResolution || 'last_write_wins',
            'user'
          ]
        );
      } else {
        // Update existing state with versioning
        const currentState = existingState.rows[0];
        const newVersion = currentState.version + 1;
        
        result = await client.query(
          `UPDATE shared_search_state 
           SET state_value = $1, last_modified_by = $2, last_modified_at = CURRENT_TIMESTAMP,
               version = $3, state_hash = $4, previous_value = $5
           WHERE search_session_id = $6 AND state_key = $7
           RETURNING *`,
          [
            JSON.stringify(validatedUpdate.newValue),
            validatedUpdate.userId,
            newVersion,
            stateHash,
            JSON.stringify(currentState.state_value),
            validatedUpdate.sessionId,
            validatedUpdate.stateKey
          ]
        );
      }

      const searchState = this.mapRowToSearchState(result.rows[0]);

      await client.query('COMMIT');

      logger.info('Search state updated', {
        sessionId: validatedUpdate.sessionId,
        stateKey: validatedUpdate.stateKey,
        userId: validatedUpdate.userId,
        version: searchState.version
      });

      return searchState;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update search state', { error, update });
      throw new Error(`Failed to update search state: ${error.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Gets search state by session ID and key
   */
  async getSearchState(sessionId: string, stateKey: string): Promise<SharedSearchState | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM shared_search_state WHERE search_session_id = $1 AND state_key = $2',
        [sessionId, stateKey]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSearchState(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get search state', { error, sessionId, stateKey });
      throw new Error(`Failed to get search state: ${error.message}`);
    }
  }

  /**
   * Synchronizes all search state for a session
   */
  async syncSearchState(sessionId: string): Promise<Record<string, SharedSearchState>> {
    try {
      const result = await this.db.query(
        'SELECT * FROM shared_search_state WHERE search_session_id = $1 ORDER BY last_modified_at DESC',
        [sessionId]
      );

      const stateMap: Record<string, SharedSearchState> = {};
      
      result.rows.forEach(row => {
        const state = this.mapRowToSearchState(row);
        stateMap[state.state_key] = state;
      });

      return stateMap;
    } catch (error) {
      logger.error('Failed to sync search state', { error, sessionId });
      throw new Error(`Failed to sync search state: ${error.message}`);
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Broadcasts a search collaboration event
   */
  async broadcastSearchEvent(
    eventData: Omit<CollaborativeSearchEvent, 'id' | 'created_at'>
  ): Promise<CollaborativeSearchEvent> {
    try {
      const validatedData = CollaborativeSearchEventSchema.omit({
        id: true,
        created_at: true
      }).parse(eventData);

      const result = await this.db.query(
        `INSERT INTO collaborative_search_events (
          search_session_id, collaboration_event_id, user_id, search_event_type,
          search_event_data, sequence_number, client_timestamp,
          query_before, query_after, filters_before, filters_after,
          affected_results, debounce_group_id, is_debounced, batch_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          validatedData.search_session_id,
          validatedData.collaboration_event_id,
          validatedData.user_id,
          validatedData.search_event_type,
          JSON.stringify(validatedData.search_event_data),
          validatedData.sequence_number,
          validatedData.client_timestamp,
          validatedData.query_before,
          validatedData.query_after,
          JSON.stringify(validatedData.filters_before),
          JSON.stringify(validatedData.filters_after),
          JSON.stringify(validatedData.affected_results),
          validatedData.debounce_group_id,
          validatedData.is_debounced,
          validatedData.batch_id
        ]
      );

      const event = this.mapRowToSearchEvent(result.rows[0]);

      logger.info('Search collaboration event broadcasted', {
        eventId: event.id,
        sessionId: event.search_session_id,
        eventType: event.search_event_type,
        userId: event.user_id
      });

      return event;
    } catch (error) {
      logger.error('Failed to broadcast search event', { error, eventData });
      throw new Error(`Failed to broadcast search event: ${error.message}`);
    }
  }

  /**
   * Gets search event history for a session
   */
  async getSearchEventHistory(
    sessionId: string, 
    fromSequence: number = 1, 
    limit: number = 100
  ): Promise<CollaborativeSearchEvent[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM collaborative_search_events 
         WHERE search_session_id = $1 AND sequence_number >= $2 
         ORDER BY sequence_number ASC 
         LIMIT $3`,
        [sessionId, fromSequence, limit]
      );

      return result.rows.map(row => this.mapRowToSearchEvent(row));
    } catch (error) {
      logger.error('Failed to get search event history', { error, sessionId, fromSequence, limit });
      throw new Error(`Failed to get search event history: ${error.message}`);
    }
  }

  // ============================================================================
  // Annotations
  // ============================================================================

  /**
   * Creates a search result annotation
   */
  async createAnnotation(
    annotationData: Omit<SearchAnnotation, 'id' | 'created_at' | 'updated_at'>
  ): Promise<SearchAnnotation> {
    try {
      // First sanitize the input data
      const sanitizedData = InputSanitizer.sanitizeAnnotationData(annotationData);
      
      const validatedData = SearchAnnotationSchema.omit({
        id: true,
        created_at: true,
        updated_at: true
      }).parse({
        ...annotationData,
        annotation_text: sanitizedData.annotation_text || annotationData.annotation_text,
        selected_text: sanitizedData.selected_text || annotationData.selected_text,
        result_url: sanitizedData.result_url || annotationData.result_url,
        annotation_data: sanitizedData.annotation_data || annotationData.annotation_data,
        text_selection: sanitizedData.text_selection || annotationData.text_selection,
        mentions: sanitizedData.mentions || annotationData.mentions
      });

      const result = await this.db.query(
        `INSERT INTO search_annotations (
          search_session_id, user_id, result_id, result_type, result_url,
          annotation_type, annotation_text, annotation_data, text_selection,
          selected_text, is_shared, is_resolved, parent_annotation_id, mentions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          validatedData.search_session_id,
          validatedData.user_id,
          validatedData.result_id,
          validatedData.result_type,
          validatedData.result_url,
          validatedData.annotation_type,
          validatedData.annotation_text,
          JSON.stringify(validatedData.annotation_data),
          JSON.stringify(validatedData.text_selection),
          validatedData.selected_text,
          validatedData.is_shared,
          validatedData.is_resolved,
          validatedData.parent_annotation_id,
          JSON.stringify(validatedData.mentions)
        ]
      );

      const annotation = this.mapRowToSearchAnnotation(result.rows[0]);

      logger.info('Search annotation created', {
        annotationId: annotation.id,
        sessionId: annotation.search_session_id,
        userId: annotation.user_id,
        type: annotation.annotation_type
      });

      return annotation;
    } catch (error) {
      logger.error('Failed to create search annotation', { error, annotationData });
      throw new Error(`Failed to create search annotation: ${error.message}`);
    }
  }

  // Allowlisted fields for annotation updates
  private static readonly ANNOTATION_UPDATE_FIELDS = new Set([
    'result_id', 'result_type', 'result_url', 'annotation_type',
    'annotation_text', 'annotation_data', 'text_selection',
    'selected_text', 'is_shared', 'is_resolved', 'resolved_by',
    'parent_annotation_id', 'mentions'
  ]);

  private static readonly ANNOTATION_JSON_FIELDS = new Set([
    'annotation_data', 'text_selection', 'mentions'
  ]);

  /**
   * Updates a search annotation
   */
  async updateAnnotation(
    id: string, 
    updates: Partial<SearchAnnotation>
  ): Promise<SearchAnnotation> {
    try {
      // Sanitize the updates
      const sanitizedUpdates = InputSanitizer.sanitizeAnnotationData(updates);
      
      const validatedUpdates = SearchAnnotationSchema.partial().parse({
        ...updates,
        annotation_text: sanitizedUpdates.annotation_text || updates.annotation_text,
        selected_text: sanitizedUpdates.selected_text || updates.selected_text,
        result_url: sanitizedUpdates.result_url || updates.result_url,
        annotation_data: sanitizedUpdates.annotation_data || updates.annotation_data,
        text_selection: sanitizedUpdates.text_selection || updates.text_selection,
        mentions: sanitizedUpdates.mentions || updates.mentions
      });

      // Build dynamic update query with field allowlisting
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCounter = 1;

      Object.entries(validatedUpdates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at' && LiveSearchCollaborationService.ANNOTATION_UPDATE_FIELDS.has(key)) {
          if (LiveSearchCollaborationService.ANNOTATION_JSON_FIELDS.has(key)) {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(value);
          }
          paramCounter++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Always update updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);

      const result = await this.db.query(
        `UPDATE search_annotations 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramCounter} 
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        throw new Error('Search annotation not found');
      }

      const annotation = this.mapRowToSearchAnnotation(result.rows[0]);

      logger.info('Search annotation updated', {
        annotationId: id,
        updatedFields: Object.keys(validatedUpdates)
      });

      return annotation;
    } catch (error) {
      logger.error('Failed to update search annotation', { error, annotationId: id, updates });
      throw new Error(`Failed to update search annotation: ${error.message}`);
    }
  }

  /**
   * Deletes a search annotation
   */
  async deleteAnnotation(id: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM search_annotations WHERE id = $1',
        [id]
      );

      if (result.rowCount === 0) {
        throw new Error('Search annotation not found');
      }

      logger.info('Search annotation deleted', { annotationId: id });
    } catch (error) {
      logger.error('Failed to delete search annotation', { error, annotationId: id });
      throw new Error(`Failed to delete search annotation: ${error.message}`);
    }
  }

  /**
   * Gets all annotations for a search session
   */
  async getSessionAnnotations(sessionId: string): Promise<SearchAnnotation[]> {
    try {
      const result = await this.db.query(
        `SELECT sa.*, u.name as user_name, u.email as user_email 
         FROM search_annotations sa 
         JOIN users u ON sa.user_id = u.id 
         WHERE sa.search_session_id = $1 AND sa.is_shared = true
         ORDER BY sa.created_at DESC`,
        [sessionId]
      );

      return result.rows.map(row => this.mapRowToSearchAnnotation(row));
    } catch (error) {
      logger.error('Failed to get session annotations', { error, sessionId });
      throw new Error(`Failed to get session annotations: ${error.message}`);
    }
  }

  // ============================================================================
  // Conflict Resolution
  // ============================================================================

  /**
   * Detects conflicts in search state using version-based detection
   */
  async detectConflicts(sessionId: string, stateKey: string): Promise<SearchConflictResolution[]> {
    try {
      // Get recent state changes within a much smaller conflict window (5 seconds)
      // and use version-based conflict detection for better accuracy
      const result = await this.db.query(
        `WITH recent_changes AS (
          SELECT *, 
                 ROW_NUMBER() OVER (PARTITION BY last_modified_by ORDER BY version DESC) as user_rank,
                 COUNT(*) OVER (PARTITION BY version) as version_count
          FROM shared_search_state 
          WHERE search_session_id = $1 AND state_key = $2 
          AND last_modified_at > NOW() - INTERVAL '5 seconds'
        )
        SELECT * FROM recent_changes 
        WHERE user_rank = 1  -- Most recent change per user
        ORDER BY version DESC, last_modified_at DESC`,
        [sessionId, stateKey]
      );

      if (result.rows.length <= 1) {
        return [];
      }

      const conflicts: SearchConflictResolution[] = [];
      const latestState = result.rows[0];
      const conflictingStates = result.rows.slice(1);
      
      // Check for true conflicts: different users modifying within the same version range
      const versionWindow = 2; // Allow version difference of 2
      
      for (const conflictingState of conflictingStates) {
        const versionDiff = Math.abs(latestState.version - conflictingState.version);
        const timeDiff = Math.abs(
          new Date(latestState.last_modified_at).getTime() - 
          new Date(conflictingState.last_modified_at).getTime()
        );
        
        // Only consider it a conflict if:
        // 1. Different users made changes
        // 2. Version difference is small (concurrent edits)
        // 3. Time difference is small (within 5 seconds)
        // 4. State values are actually different
        if (latestState.last_modified_by !== conflictingState.last_modified_by &&
            versionDiff <= versionWindow &&
            timeDiff <= 5000 &&
            latestState.state_hash !== conflictingState.state_hash) {
          
          conflicts.push({
            conflictId: crypto.randomUUID(),
            sessionId,
            stateKey,
            conflictingValues: [
              {
                userId: latestState.last_modified_by,
                value: latestState.state_value,
                timestamp: new Date(latestState.last_modified_at)
              },
              {
                userId: conflictingState.last_modified_by,
                value: conflictingState.state_value,
                timestamp: new Date(conflictingState.last_modified_at)
              }
            ],
            resolutionStrategy: latestState.conflict_resolution as ConflictResolutionStrategy
          });
        }
      }

      if (conflicts.length > 0) {
        logger.info('Search state conflicts detected', {
          sessionId,
          stateKey,
          conflictCount: conflicts.length,
          conflictIds: conflicts.map(c => c.conflictId)
        });
      }

      return conflicts;
    } catch (error) {
      logger.error('Failed to detect conflicts', { error, sessionId, stateKey });
      throw new Error(`Failed to detect conflicts: ${error.message}`);
    }
  }

  /**
   * Resolves a search state conflict
   */
  async resolveConflict(conflictId: string, resolution: SearchConflictResolution): Promise<void> {
    try {
      const validatedResolution = SearchConflictResolutionSchema.parse(resolution);

      if (!validatedResolution.resolvedValue) {
        throw new Error('Resolved value is required');
      }

      // Update the state with the resolved value
      await this.updateSearchState({
        sessionId: validatedResolution.sessionId,
        userId: validatedResolution.resolvedBy || 'system',
        stateKey: validatedResolution.stateKey,
        newValue: validatedResolution.resolvedValue,
        timestamp: new Date(),
        conflictResolution: validatedResolution.resolutionStrategy
      });

      logger.info('Search conflict resolved', {
        conflictId,
        sessionId: validatedResolution.sessionId,
        stateKey: validatedResolution.stateKey,
        strategy: validatedResolution.resolutionStrategy
      });
    } catch (error) {
      logger.error('Failed to resolve conflict', { error, conflictId, resolution });
      throw new Error(`Failed to resolve conflict: ${error.message}`);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Initializes default search state for a new session
   */
  private async initializeSearchState(
    client: any, 
    sessionId: string, 
    userId: string
  ): Promise<void> {
    const defaultStates = [
      { key: 'query', value: { text: '', timestamp: new Date().toISOString() } },
      { key: 'filters', value: {} },
      { key: 'sort', value: { field: 'relevance', direction: 'desc' } },
      { key: 'pagination', value: { page: 1, limit: 20 } }
    ];

    for (const state of defaultStates) {
      const stateHash = this.generateStateHash(state.value);
      
      await client.query(
        `INSERT INTO shared_search_state (
          search_session_id, state_key, state_value, last_modified_by,
          version, state_hash, conflict_resolution, change_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          state.key,
          JSON.stringify(state.value),
          userId,
          1,
          stateHash,
          'last_write_wins',
          'system'
        ]
      );
    }
  }

  /**
   * Generates SHA-256 hash of state value for conflict detection
   */
  private generateStateHash(stateValue: any): string {
    const serialized = JSON.stringify(stateValue, Object.keys(stateValue).sort());
    return createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Maps database row to CollaborativeSearchSession object
   */
  private mapRowToSearchSession(row: any): CollaborativeSearchSession {
    return {
      id: row.id,
      collaboration_session_id: row.collaboration_session_id,
      workspace_id: row.workspace_id,
      session_name: row.session_name,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_active: row.is_active,
      is_persistent: row.is_persistent,
      search_settings: row.search_settings || {},
      max_participants: row.max_participants,
      allow_anonymous_search: row.allow_anonymous_search,
      require_moderation: row.require_moderation,
      current_search_state: row.current_search_state || {},
      search_history: row.search_history || [],
      shared_annotations: row.shared_annotations || {},
      performance_metrics: row.performance_metrics || {}
    };
  }

  /**
   * Maps database row to SearchSessionParticipant object
   */
  private mapRowToSearchParticipant(row: any): SearchSessionParticipant {
    return {
      id: row.id,
      search_session_id: row.search_session_id,
      user_id: row.user_id,
      role: row.role as SearchSessionRole,
      joined_at: new Date(row.joined_at),
      last_search_at: new Date(row.last_search_at),
      is_active: row.is_active,
      can_initiate_search: row.can_initiate_search,
      can_modify_filters: row.can_modify_filters,
      can_annotate_results: row.can_annotate_results,
      can_bookmark_results: row.can_bookmark_results,
      can_invite_participants: row.can_invite_participants,
      search_query_count: row.search_query_count,
      filter_change_count: row.filter_change_count,
      annotation_count: row.annotation_count,
      total_search_time_ms: row.total_search_time_ms,
      current_query: row.current_query,
      active_filters: row.active_filters || {},
      cursor_position: row.cursor_position || {},
      selected_results: row.selected_results || []
    };
  }

  /**
   * Maps database row to SharedSearchState object
   */
  private mapRowToSearchState(row: any): SharedSearchState {
    return {
      id: row.id,
      search_session_id: row.search_session_id,
      state_key: row.state_key,
      state_value: row.state_value,
      last_modified_by: row.last_modified_by,
      last_modified_at: new Date(row.last_modified_at),
      version: row.version,
      state_hash: row.state_hash,
      conflict_resolution: row.conflict_resolution as ConflictResolutionStrategy,
      change_source: row.change_source,
      previous_value: row.previous_value,
      change_reason: row.change_reason
    };
  }

  /**
   * Maps database row to CollaborativeSearchEvent object
   */
  private mapRowToSearchEvent(row: any): CollaborativeSearchEvent {
    return {
      id: row.id,
      search_session_id: row.search_session_id,
      collaboration_event_id: row.collaboration_event_id,
      user_id: row.user_id,
      search_event_type: row.search_event_type as SearchEventType,
      search_event_data: row.search_event_data,
      sequence_number: row.sequence_number,
      created_at: new Date(row.created_at),
      client_timestamp: row.client_timestamp ? new Date(row.client_timestamp) : undefined,
      query_before: row.query_before,
      query_after: row.query_after,
      filters_before: row.filters_before,
      filters_after: row.filters_after,
      affected_results: row.affected_results || [],
      debounce_group_id: row.debounce_group_id,
      is_debounced: row.is_debounced,
      batch_id: row.batch_id
    };
  }

  /**
   * Maps database row to SearchAnnotation object
   */
  private mapRowToSearchAnnotation(row: any): SearchAnnotation {
    return {
      id: row.id,
      search_session_id: row.search_session_id,
      user_id: row.user_id,
      result_id: row.result_id,
      result_type: row.result_type,
      result_url: row.result_url,
      annotation_type: row.annotation_type as AnnotationType,
      annotation_text: row.annotation_text,
      annotation_data: row.annotation_data || {},
      text_selection: row.text_selection || {},
      selected_text: row.selected_text,
      is_shared: row.is_shared,
      is_resolved: row.is_resolved,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at ? new Date(row.resolved_at) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      parent_annotation_id: row.parent_annotation_id,
      mentions: row.mentions || []
    };
  }
}