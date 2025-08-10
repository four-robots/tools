/**
 * Collaboration Session Service Tests
 * 
 * Unit tests for the CollaborationSessionService to validate
 * session management, participant handling, and permissions.
 */

import { Pool } from 'pg';
import { CollaborationSessionService } from '../session-service.js';
import { CollaborationSessionType, ParticipantRole } from '../../../shared/types/collaboration.js';

// Mock database pool
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
} as unknown as Pool;

describe('CollaborationSessionService', () => {
  let service: CollaborationSessionService;

  beforeEach(() => {
    service = new CollaborationSessionService(mockPool);
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new collaboration session', async () => {
      const mockSessionData = {
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        session_name: 'Test Session',
        session_type: 'search' as CollaborationSessionType,
        created_by: '550e8400-e29b-41d4-a716-446655440001',
        is_active: true,
        settings: {},
        max_participants: 50,
        allow_anonymous: false,
        require_approval: false,
        context_data: {},
        shared_state: {},
        activity_summary: {}
      };

      const mockSessionResult = {
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440002',
          workspace_id: '550e8400-e29b-41d4-a716-446655440000',
          session_name: 'Test Session',
          session_type: 'search',
          created_by: '550e8400-e29b-41d4-a716-446655440001',
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
          settings: '{}',
          max_participants: 50,
          allow_anonymous: false,
          require_approval: false,
          context_data: '{}',
          shared_state: '{}',
          activity_summary: '{}'
        }]
      };

      const mockParticipantResult = {
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440003',
          session_id: '550e8400-e29b-41d4-a716-446655440002',
          user_id: '550e8400-e29b-41d4-a716-446655440001',
          role: 'owner',
          joined_at: new Date(),
          last_seen_at: new Date(),
          is_active: true,
          permissions: '{"is_creator": true}',
          can_invite_others: true,
          can_modify_session: true,
          can_broadcast_events: true,
          event_count: 0,
          total_active_time_ms: 0
        }]
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce(mockSessionResult) // Session creation
        .mockResolvedValueOnce(mockParticipantResult); // Add creator as owner

      const result = await service.createSession(mockSessionData);

      expect(result).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440002',
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        session_name: 'Test Session',
        session_type: 'search',
        created_by: '550e8400-e29b-41d4-a716-446655440001',
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
        is_active: true,
        settings: {},
        max_participants: 50,
        allow_anonymous: false,
        require_approval: false,
        context_data: {},
        shared_state: {},
        activity_summary: {}
      });

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO collaboration_sessions'), expect.any(Array));
      expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO session_participants'), expect.any(Array));
    });

    it('should validate session data', async () => {
      const invalidData = {
        workspace_id: 'not-a-uuid',
        session_name: '',
        session_type: 'invalid-type' as CollaborationSessionType,
        created_by: 'user-123'
      } as any;

      await expect(service.createSession(invalidData)).rejects.toThrow();
    });
  });

  describe('getSession', () => {
    it('should retrieve a session by ID', async () => {
      const mockResult = {
        rows: [{
          id: 'session-456',
          workspace_id: 'workspace-123',
          session_name: 'Test Session',
          session_type: 'search',
          created_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
          settings: '{}',
          max_participants: 50,
          allow_anonymous: false,
          require_approval: false,
          context_data: '{}',
          shared_state: '{}',
          activity_summary: '{}'
        }]
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.getSession('session-456');

      expect(result).toBeDefined();
      expect(result?.id).toBe('session-456');
      expect(result?.session_name).toBe('Test Session');
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM collaboration_sessions WHERE id = $1', ['session-456']);
    });

    it('should return null for non-existent session', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await service.getSession('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('addParticipant', () => {
    it('should add a participant to a session', async () => {
      const mockParticipantData = {
        session_id: 'session-456',
        user_id: 'user-789',
        role: 'participant' as ParticipantRole,
        is_active: true,
        permissions: {},
        can_invite_others: false,
        can_modify_session: false,
        can_broadcast_events: true,
        event_count: 0,
        total_active_time_ms: 0
      };

      const mockSessionCheck = {
        rows: [{
          id: 'session-456',
          max_participants: 50
        }]
      };

      const mockParticipantCount = {
        rows: [{ count: '5' }]
      };

      const mockExistingCheck = {
        rows: []
      };

      const mockParticipantResult = {
        rows: [{
          id: 'participant-999',
          session_id: 'session-456',
          user_id: 'user-789',
          role: 'participant',
          joined_at: new Date(),
          last_seen_at: new Date(),
          is_active: true,
          permissions: '{}',
          can_invite_others: false,
          can_modify_session: false,
          can_broadcast_events: true,
          event_count: 0,
          total_active_time_ms: 0
        }]
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce(mockSessionCheck) // Session exists check
        .mockResolvedValueOnce(mockParticipantCount) // Participant count check
        .mockResolvedValueOnce(mockExistingCheck) // Existing participant check
        .mockResolvedValueOnce(mockParticipantResult); // Add participant

      const result = await service.addParticipant(mockParticipantData);

      expect(result).toBeDefined();
      expect(result.session_id).toBe('session-456');
      expect(result.user_id).toBe('user-789');
      expect(result.role).toBe('participant');
      expect(mockPool.query).toHaveBeenCalledTimes(4);
    });

    it('should throw error when session is at capacity', async () => {
      const mockParticipantData = {
        session_id: 'session-456',
        user_id: 'user-789',
        role: 'participant' as ParticipantRole,
        is_active: true,
        permissions: {},
        can_invite_others: false,
        can_modify_session: false,
        can_broadcast_events: true,
        event_count: 0,
        total_active_time_ms: 0
      };

      const mockSessionCheck = {
        rows: [{
          id: 'session-456',
          max_participants: 2
        }]
      };

      const mockParticipantCount = {
        rows: [{ count: '2' }]
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce(mockSessionCheck)
        .mockResolvedValueOnce(mockParticipantCount);

      await expect(service.addParticipant(mockParticipantData)).rejects.toThrow('Session has reached maximum capacity');
    });
  });

  describe('validatePermission', () => {
    it('should validate user permissions', async () => {
      const mockResult = {
        rows: [{
          role: 'owner',
          can_invite_others: true,
          can_modify_session: true,
          can_broadcast_events: true,
          permissions: '{}'
        }]
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const canInvite = await service.validatePermission('session-456', 'user-123', 'invite');
      const canModify = await service.validatePermission('session-456', 'user-123', 'modify');
      const canBroadcast = await service.validatePermission('session-456', 'user-123', 'broadcast');
      const canModerate = await service.validatePermission('session-456', 'user-123', 'moderate');

      expect(canInvite).toBe(true);
      expect(canModify).toBe(true);
      expect(canBroadcast).toBe(true);
      expect(canModerate).toBe(true);
    });

    it('should deny permissions for non-participants', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const canInvite = await service.validatePermission('session-456', 'user-999', 'invite');
      const canModify = await service.validatePermission('session-456', 'user-999', 'modify');

      expect(canInvite).toBe(false);
      expect(canModify).toBe(false);
    });
  });

  describe('updateSession', () => {
    it('should update session properties', async () => {
      const updates = {
        session_name: 'Updated Session Name',
        max_participants: 100
      };

      const mockResult = {
        rows: [{
          id: 'session-456',
          workspace_id: 'workspace-123',
          session_name: 'Updated Session Name',
          session_type: 'search',
          created_by: 'user-123',
          created_at: new Date(),
          updated_at: new Date(),
          is_active: true,
          settings: '{}',
          max_participants: 100,
          allow_anonymous: false,
          require_approval: false,
          context_data: '{}',
          shared_state: '{}',
          activity_summary: '{}'
        }]
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.updateSession('session-456', updates);

      expect(result.session_name).toBe('Updated Session Name');
      expect(result.max_participants).toBe(100);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE collaboration_sessions'),
        expect.any(Array)
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      await service.deleteSession('session-456');

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM collaboration_sessions WHERE id = $1',
        ['session-456']
      );
    });

    it('should throw error for non-existent session', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      await expect(service.deleteSession('non-existent')).rejects.toThrow('Session not found');
    });
  });
});