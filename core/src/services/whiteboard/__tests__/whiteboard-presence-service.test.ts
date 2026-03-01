/**
 * Tests for whiteboard-presence-service bug fixes.
 *
 * Bug 1: joinWhiteboard() referenced `sanitizedWhiteboardId` and `sanitizedSessionId`
 * which were not defined in that method's scope (they existed in updatePresenceStatus).
 * Fix: Use the raw `whiteboardId` and `sessionId` parameters for logging.
 *
 * Bug 2: validateWhiteboardId, validateCustomStatus, validateActivityInfo were called
 * but never imported.
 * Fix: Added import from ../../utils/input-validation.js
 */

import { validateWhiteboardId, validateCustomStatus, validateActivityInfo } from '../../../utils/input-validation.js';

describe('whiteboard-presence-service validation imports', () => {
  describe('validateWhiteboardId', () => {
    it('should accept valid whiteboard IDs', () => {
      const result = validateWhiteboardId('wb-12345');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });

    it('should reject empty whiteboard IDs', () => {
      const result = validateWhiteboardId('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateCustomStatus', () => {
    it('should accept valid custom status text', () => {
      const result = validateCustomStatus('Working on design');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });

    it('should sanitize HTML in custom status', () => {
      const result = validateCustomStatus('<script>alert("xss")</script>');
      expect(result.sanitized).not.toContain('<script>');
    });
  });

  describe('validateActivityInfo', () => {
    it('should accept valid activity info', () => {
      const result = validateActivityInfo({
        type: 'drawing',
        description: 'Drawing shapes',
        timestamp: Date.now(),
      });
      expect(result.valid).toBe(true);
    });
  });
});
