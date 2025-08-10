/**
 * Basic Collaboration Tests
 * 
 * Simple tests to validate that the collaboration services
 * are properly structured and can be instantiated.
 */

import { Pool } from 'pg';
import { CollaborationSessionService } from '../session-service.js';
import { EventBroadcastingService } from '../event-service.js';
import { PresenceService } from '../presence-service.js';

describe('Collaboration Services Basic Tests', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  } as unknown as Pool;

  describe('Service Instantiation', () => {
    it('should instantiate CollaborationSessionService', () => {
      expect(() => new CollaborationSessionService(mockPool)).not.toThrow();
    });

    it('should instantiate EventBroadcastingService', () => {
      expect(() => new EventBroadcastingService(mockPool)).not.toThrow();
    });

    it('should instantiate PresenceService', () => {
      expect(() => new PresenceService(mockPool)).not.toThrow();
    });
  });

  describe('Service Methods', () => {
    let sessionService: CollaborationSessionService;
    let eventService: EventBroadcastingService;
    let presenceService: PresenceService;

    beforeEach(() => {
      sessionService = new CollaborationSessionService(mockPool);
      eventService = new EventBroadcastingService(mockPool);
      presenceService = new PresenceService(mockPool);
      jest.clearAllMocks();
    });

    it('should have expected methods on CollaborationSessionService', () => {
      expect(typeof sessionService.createSession).toBe('function');
      expect(typeof sessionService.getSession).toBe('function');
      expect(typeof sessionService.updateSession).toBe('function');
      expect(typeof sessionService.deleteSession).toBe('function');
      expect(typeof sessionService.listActiveSessions).toBe('function');
      expect(typeof sessionService.addParticipant).toBe('function');
      expect(typeof sessionService.updateParticipant).toBe('function');
      expect(typeof sessionService.removeParticipant).toBe('function');
      expect(typeof sessionService.getSessionParticipants).toBe('function');
      expect(typeof sessionService.validatePermission).toBe('function');
    });

    it('should have expected methods on EventBroadcastingService', () => {
      expect(typeof eventService.broadcastEvent).toBe('function');
      expect(typeof eventService.getEventHistory).toBe('function');
      expect(typeof eventService.markEventDelivered).toBe('function');
      expect(typeof eventService.replayEvents).toBe('function');
    });

    it('should have expected methods on PresenceService', () => {
      expect(typeof presenceService.updatePresence).toBe('function');
      expect(typeof presenceService.getSessionPresence).toBe('function');
      expect(typeof presenceService.getUserPresence).toBe('function');
      expect(typeof presenceService.removePresence).toBe('function');
      expect(typeof presenceService.updateHeartbeat).toBe('function');
    });
  });

  describe('Type Validation', () => {
    it('should export collaboration types', async () => {
      const types = await import('../../../shared/types/collaboration.js');
      
      expect(types.CollaborationSessionType).toBeDefined();
      expect(types.ParticipantRole).toBeDefined();
      expect(types.PresenceStatus).toBeDefined();
      expect(types.EventCategory).toBeDefined();
      expect(types.DeliveryStatus).toBeDefined();
      expect(types.CollaborationSessionSchema).toBeDefined();
      expect(types.SessionParticipantSchema).toBeDefined();
      expect(types.CollaborationEventSchema).toBeDefined();
      expect(types.UserPresenceSchema).toBeDefined();
      expect(types.CollaborationMessageSchema).toBeDefined();
    });

    it('should validate CollaborationSessionType enum values', async () => {
      const { CollaborationSessionType } = await import('../../../shared/types/collaboration.js');
      
      const validTypes = ['search', 'analysis', 'review', 'kanban', 'wiki', 'memory', 'codebase'];
      
      for (const type of validTypes) {
        expect(() => CollaborationSessionType.parse(type)).not.toThrow();
      }
      
      expect(() => CollaborationSessionType.parse('invalid')).toThrow();
    });

    it('should validate ParticipantRole enum values', async () => {
      const { ParticipantRole } = await import('../../../shared/types/collaboration.js');
      
      const validRoles = ['owner', 'moderator', 'participant', 'observer'];
      
      for (const role of validRoles) {
        expect(() => ParticipantRole.parse(role)).not.toThrow();
      }
      
      expect(() => ParticipantRole.parse('invalid')).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      (mockPool.query as jest.Mock).mockRejectedValue(mockError);

      const sessionService = new CollaborationSessionService(mockPool);

      await expect(sessionService.getSession('any-id')).rejects.toThrow();
      expect(mockPool.query).toHaveBeenCalled();
    });
  });
});