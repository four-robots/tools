import { EventEncryptionService, EventEncryptionError } from '../event-encryption-service';
import crypto from 'crypto';

describe('EventEncryption Security Tests', () => {
  let encryptionService: EventEncryptionService;

  beforeEach(() => {
    // Use a test encryption key
    process.env.EVENT_ENCRYPTION_KEY = 'test-encryption-key-for-security-tests';
    process.env.EVENT_ENCRYPTION_SALT = crypto.randomBytes(32).toString('hex');
    encryptionService = new EventEncryptionService();
  });

  afterEach(() => {
    delete process.env.EVENT_ENCRYPTION_KEY;
    delete process.env.EVENT_ENCRYPTION_SALT;
  });

  describe('Secure Encryption/Decryption', () => {
    test('encrypts and decrypts sensitive data correctly', () => {
      const sensitiveData = {
        email: 'user@example.com',
        password: 'secret123',
        personalData: { ssn: '123-45-6789' }
      };

      const encrypted = encryptionService.encryptSensitiveData(sensitiveData);
      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.data).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.algorithm).toBe('aes-256-gcm');

      const decrypted = encryptionService.decryptSensitiveData(encrypted);
      expect(decrypted).toEqual(sensitiveData);
    });

    test('fails gracefully with invalid auth tags', () => {
      const sensitiveData = { password: 'secret123' };
      const encrypted = encryptionService.encryptSensitiveData(sensitiveData);
      
      // Tamper with the auth tag
      const tamperedEncrypted = {
        ...encrypted,
        authTag: 'invalid_auth_tag_' + crypto.randomBytes(8).toString('hex')
      };

      expect(() => {
        encryptionService.decryptSensitiveData(tamperedEncrypted);
      }).toThrow(EventEncryptionError);
    });

    test('handles non-sensitive data without encryption', () => {
      const nonSensitiveData = {
        userId: 'user123',
        action: 'click',
        timestamp: new Date().toISOString()
      };

      const result = encryptionService.encryptSensitiveData(nonSensitiveData);
      expect(result.encrypted).toBe(false);
      expect(JSON.parse(result.data)).toEqual(nonSensitiveData);

      const decrypted = encryptionService.decryptSensitiveData(result);
      expect(decrypted).toEqual(nonSensitiveData);
    });

    test('generates different outputs for same input', () => {
      const sensitiveData = { password: 'same-password' };
      
      const encrypted1 = encryptionService.encryptSensitiveData(sensitiveData);
      const encrypted2 = encryptionService.encryptSensitiveData(sensitiveData);
      
      // Different IVs should produce different ciphertexts
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
      
      // But both should decrypt to the same data
      const decrypted1 = encryptionService.decryptSensitiveData(encrypted1);
      const decrypted2 = encryptionService.decryptSensitiveData(encrypted2);
      expect(decrypted1).toEqual(sensitiveData);
      expect(decrypted2).toEqual(sensitiveData);
    });

    test('throws error with missing encryption fields', () => {
      const incompleteEncryptedData = {
        encrypted: true,
        data: 'some-encrypted-data',
        iv: 'some-iv'
        // Missing authTag
      };

      expect(() => {
        encryptionService.decryptSensitiveData(incompleteEncryptedData as any);
      }).toThrow(EventEncryptionError);
    });

    test('throws error with invalid IV', () => {
      const sensitiveData = { password: 'secret123' };
      const encrypted = encryptionService.encryptSensitiveData(sensitiveData);
      
      // Tamper with the IV
      const tamperedEncrypted = {
        ...encrypted,
        iv: 'invalid_iv_length'
      };

      expect(() => {
        encryptionService.decryptSensitiveData(tamperedEncrypted);
      }).toThrow(EventEncryptionError);
    });

    test('throws error with tampered ciphertext', () => {
      const sensitiveData = { password: 'secret123' };
      const encrypted = encryptionService.encryptSensitiveData(sensitiveData);
      
      // Tamper with the encrypted data
      const tamperedEncrypted = {
        ...encrypted,
        data: encrypted.data.slice(0, -2) + 'xx' // Change last 2 characters
      };

      expect(() => {
        encryptionService.decryptSensitiveData(tamperedEncrypted);
      }).toThrow(EventEncryptionError);
    });
  });

  describe('Selective Encryption', () => {
    test('encrypts event data selectively based on sensitivity', () => {
      const mixedData = {
        userId: 'user123',
        action: 'login',
        email: 'user@example.com', // sensitive
        timestamp: new Date().toISOString()
      };

      const result = encryptionService.encryptEventDataIfSensitive(mixedData);
      expect(result.isEncrypted).toBe(true);
      expect(result.eventData._encrypted).toBeDefined();
      expect(result.eventData.userId).toBe('user123'); // non-sensitive data preserved
      expect(result.eventData.action).toBe('login');
      expect(result.eventData.email).toBeUndefined(); // sensitive data encrypted
    });

    test('does not encrypt non-sensitive event data', () => {
      const nonSensitiveData = {
        userId: 'user123',
        action: 'click',
        timestamp: new Date().toISOString()
      };

      const result = encryptionService.encryptEventDataIfSensitive(nonSensitiveData);
      expect(result.isEncrypted).toBe(false);
      expect(result.eventData).toEqual(nonSensitiveData);
      expect(result.eventData._encrypted).toBeUndefined();
    });

    test('decrypts event data with encrypted portions', () => {
      const mixedData = {
        userId: 'user123',
        email: 'user@example.com',
        personalData: { ssn: '123-45-6789' }
      };

      const encrypted = encryptionService.encryptEventDataIfSensitive(mixedData);
      const decrypted = encryptionService.decryptEventDataIfEncrypted(encrypted.eventData);
      
      expect(decrypted.userId).toBe('user123');
      expect(decrypted.email).toBe('user@example.com');
      expect(decrypted.personalData).toEqual({ ssn: '123-45-6789' });
      expect(decrypted._encrypted).toBeUndefined();
    });
  });

  describe('Sensitive Data Detection', () => {
    test('detects sensitive field names', () => {
      const sensitiveFieldData = {
        password: 'secret123',
        apiKey: 'key-123',
        email: 'user@example.com'
      };

      expect(encryptionService.isSensitiveData(sensitiveFieldData)).toBe(true);
    });

    test('detects PII patterns', () => {
      const piiData = {
        userInfo: 'Contact: john.doe@example.com or 123-45-6789'
      };

      expect(encryptionService.isSensitiveData(piiData)).toBe(true);
    });

    test('identifies non-sensitive data', () => {
      const nonSensitiveData = {
        userId: 'user123',
        action: 'click',
        timestamp: new Date().toISOString(),
        count: 42
      };

      expect(encryptionService.isSensitiveData(nonSensitiveData)).toBe(false);
    });
  });

  describe('Key Management', () => {
    test('throws error in production without encryption key', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.EVENT_ENCRYPTION_KEY;

      expect(() => {
        new EventEncryptionService();
      }).toThrow(EventEncryptionError);

      process.env.NODE_ENV = originalEnv;
    });

    test('accepts custom master key', () => {
      const customKey = crypto.randomBytes(32).toString('hex');
      const service = new EventEncryptionService(customKey);
      
      const sensitiveData = { password: 'secret123' };
      const encrypted = service.encryptSensitiveData(sensitiveData);
      const decrypted = service.decryptSensitiveData(encrypted);
      
      expect(decrypted).toEqual(sensitiveData);
    });

    test('supports key rotation', async () => {
      const originalData = { password: 'secret123' };
      const encrypted = encryptionService.encryptSensitiveData(originalData);
      
      // Rotate to new key
      const newMasterKey = crypto.randomBytes(32).toString('hex');
      await encryptionService.rotateEncryptionKey(newMasterKey);
      
      // Should be able to encrypt with new key
      const newEncrypted = encryptionService.encryptSensitiveData(originalData);
      const newDecrypted = encryptionService.decryptSensitiveData(newEncrypted);
      
      expect(newDecrypted).toEqual(originalData);
      
      // Note: In production, old encrypted data would need re-encryption
      // This test just verifies the key rotation mechanism works
    });
  });

  describe('Error Handling', () => {
    test('handles empty data gracefully', () => {
      // Empty objects are non-sensitive, so they should not be encrypted
      const result = encryptionService.encryptSensitiveData({});
      expect(result.encrypted).toBe(false);
      expect(JSON.parse(result.data)).toEqual({});
    });

    test('handles malformed JSON in encrypted data', () => {
      const malformedEncrypted = {
        encrypted: true,
        data: 'not-valid-hex',
        iv: crypto.randomBytes(12).toString('hex'),
        authTag: crypto.randomBytes(16).toString('hex')
      };

      expect(() => {
        encryptionService.decryptSensitiveData(malformedEncrypted);
      }).toThrow(EventEncryptionError);
    });

    test('provides encryption service status', () => {
      const status = encryptionService.getEncryptionStatus();
      
      expect(status.isEnabled).toBe(true);
      expect(status.algorithm).toBe('aes-256-gcm');
      expect(status.version).toBe(1);
      expect(status.keyStrength).toBe(256);
    });
  });

  describe('Version Compatibility', () => {
    test('handles version mismatch gracefully', () => {
      const encryptedWithBadVersion = {
        encrypted: true,
        data: crypto.randomBytes(32).toString('hex'),
        iv: crypto.randomBytes(12).toString('hex'),
        authTag: crypto.randomBytes(16).toString('hex'),
        version: 999
      };

      expect(() => {
        encryptionService.decryptSensitiveData(encryptedWithBadVersion);
      }).toThrow(EventEncryptionError);
      expect(() => {
        encryptionService.decryptSensitiveData(encryptedWithBadVersion);
      }).toThrow(/Unsupported encryption version/);
    });

    test('handles missing version field', () => {
      const sensitiveData = { password: 'secret123' };
      const encrypted = encryptionService.encryptSensitiveData(sensitiveData);
      
      // Remove version field to simulate older format
      delete encrypted.version;
      
      // Should still decrypt successfully
      const decrypted = encryptionService.decryptSensitiveData(encrypted);
      expect(decrypted).toEqual(sensitiveData);
    });
  });

  describe('Performance and Security Characteristics', () => {
    test('encryption produces reasonable output size', () => {
      const testData = { 
        email: 'user@example.com',
        data: 'a'.repeat(1000) // 1KB of data
      };

      const encrypted = encryptionService.encryptSensitiveData(testData);
      const originalSize = JSON.stringify(testData).length;
      const encryptedSize = encrypted.data.length;
      
      // Encrypted size should be reasonable (not excessively larger)
      expect(encryptedSize).toBeLessThanOrEqual(originalSize * 2);
      expect(encryptedSize).toBeGreaterThan(originalSize);
    });

    test('encryption is fast enough for production use', () => {
      const testData = { 
        email: 'user@example.com',
        password: 'secret123',
        personalData: { name: 'John Doe' }
      };

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        const encrypted = encryptionService.encryptSensitiveData(testData);
        encryptionService.decryptSensitiveData(encrypted);
      }
      const end = Date.now();
      
      const timePerOperation = (end - start) / 200; // 100 encrypt + 100 decrypt
      expect(timePerOperation).toBeLessThan(10); // Should be under 10ms per operation
    });
  });

  describe('Edge Cases - Safety Fixes', () => {
    test('should throw EventEncryptionError for malformed unencrypted data', () => {
      // Previously, decryptSensitiveData with encrypted=false called
      // JSON.parse without try/catch. Malformed data would throw a
      // generic SyntaxError instead of a descriptive EventEncryptionError.
      const malformedData = {
        encrypted: false,
        data: '{invalid json!!!',
        algorithm: 'none' as const,
      };

      expect(() => encryptionService.decryptSensitiveData(malformedData as any))
        .toThrow(EventEncryptionError);
      expect(() => encryptionService.decryptSensitiveData(malformedData as any))
        .toThrow('Failed to parse unencrypted data as JSON');
    });

    test('should handle valid unencrypted data without error', () => {
      const validData = {
        encrypted: false,
        data: '{"key": "value"}',
        algorithm: 'none' as const,
      };

      const result = encryptionService.decryptSensitiveData(validData as any);
      expect(result).toEqual({ key: 'value' });
    });

    test('should handle empty object as unencrypted data', () => {
      const emptyObjectData = {
        encrypted: false,
        data: '{}',
        algorithm: 'none' as const,
      };

      const result = encryptionService.decryptSensitiveData(emptyObjectData as any);
      expect(result).toEqual({});
    });
  });
});