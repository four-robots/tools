/**
 * Tests for path traversal prevention patterns.
 *
 * Bug: `path.join(base, userInput)` does NOT prevent traversal.
 * `path.join('/uploads', '../etc/passwd')` resolves to `/etc/passwd`.
 *
 * Fix: Use `path.resolve()` and verify the resolved path starts with
 * the expected base directory.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

describe('path traversal safety', () => {
  describe('path.join does NOT prevent traversal', () => {
    it('should demonstrate path.join allows ../ sequences', () => {
      const base = '/app/uploads';
      const malicious = '../../../etc/passwd';
      const joined = path.join(base, malicious);

      // path.join resolves ../ but doesn't restrict to base
      expect(joined).not.toContain('/app/uploads');
      expect(joined).toContain('etc/passwd');
    });
  });

  describe('safe path resolution pattern', () => {
    const resolveUploadPath = (relativePath: string): string => {
      const uploadsBase = path.resolve('/app/uploads');
      const resolved = path.resolve(uploadsBase, relativePath);
      if (!resolved.startsWith(uploadsBase + path.sep) && resolved !== uploadsBase) {
        throw new Error('Path traversal detected');
      }
      return resolved;
    };

    it('should allow normal relative paths', () => {
      const result = resolveUploadPath('wiki/attachments/2025/01/file.jpg');
      expect(result).toContain('uploads');
      expect(result).toContain('file.jpg');
    });

    it('should reject ../ traversal attempts', () => {
      expect(() => resolveUploadPath('../../../etc/passwd')).toThrow('Path traversal detected');
    });

    it('should reject encoded traversal attempts', () => {
      // After decoding, this would be ../
      const decoded = decodeURIComponent('..%2F..%2Fetc%2Fpasswd');
      expect(() => resolveUploadPath(decoded)).toThrow('Path traversal detected');
    });

    it('should reject absolute path injection', () => {
      expect(() => resolveUploadPath('/etc/passwd')).toThrow('Path traversal detected');
    });

    it('should allow nested subdirectories within uploads', () => {
      const result = resolveUploadPath('wiki/attachments/2025/06/abc123.png');
      expect(result).toContain('uploads');
    });
  });

  describe('hardcoded secret detection', () => {
    it('should demonstrate why empty string is safer than default-secret', () => {
      // With a hardcoded 'default-secret', crypto operations silently produce
      // weak encryption that anyone who reads the source code can break.
      // With empty string '', the code can detect the missing config and
      // either warn or disable the feature entirely.
      const secret = process.env.NONEXISTENT_VAR || '';
      expect(secret).toBe('');
      expect(!!secret).toBe(false); // Falsy — can be detected
    });
  });
});
