import crypto from 'crypto';
import { logger } from '../../utils/logger';

export interface EncryptedData {
  encrypted: boolean;
  data: string;
  iv?: string;
  authTag?: string;
  algorithm?: string;
  version?: number;
}

export class EventEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventEncryptionError';
  }
}

export interface EncryptionConfig {
  algorithm: string;
  keyDerivationIterations: number;
  ivLength: number;
  tagLength: number;
  saltLength: number;
}

export class EventEncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_DERIVATION_ITERATIONS = 100000;
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly TAG_LENGTH = 16; // 128 bits for GCM
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly ENCRYPTION_VERSION = 1;

  private readonly config: EncryptionConfig;
  private readonly encryptionKey: Buffer;

  constructor(private readonly masterKey?: string) {
    this.config = {
      algorithm: EventEncryptionService.ALGORITHM,
      keyDerivationIterations: EventEncryptionService.KEY_DERIVATION_ITERATIONS,
      ivLength: EventEncryptionService.IV_LENGTH,
      tagLength: EventEncryptionService.TAG_LENGTH,
      saltLength: EventEncryptionService.SALT_LENGTH
    };

    // Derive encryption key from master key or environment
    const key = masterKey || process.env.EVENT_ENCRYPTION_KEY || this.generateFallbackKey();
    this.encryptionKey = this.deriveKey(key);

    logger.info('Event encryption service initialized', {
      algorithm: this.config.algorithm,
      keyLength: this.encryptionKey.length * 8
    });
  }

  /**
   * Encrypts sensitive event data using AES-256-GCM
   */
  encryptSensitiveData(data: Record<string, unknown>): EncryptedData {
    if (!this.isSensitiveData(data)) {
      return { encrypted: false, data: JSON.stringify(data) };
    }

    try {
      if (!data || Object.keys(data).length === 0) {
        throw new EventEncryptionError('No data provided for encryption');
      }

      const plaintext = JSON.stringify(data);
      const iv = crypto.randomBytes(12); // 96-bit IV for GCM
      
      // Use proper GCM mode with explicit IV
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      const result: EncryptedData = {
        encrypted: true,
        data: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm',
        version: EventEncryptionService.ENCRYPTION_VERSION
      };

      logger.debug('Event data encrypted successfully', {
        dataSize: plaintext.length,
        encryptedSize: encrypted.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to encrypt event data', {
        error: error instanceof Error ? error.message : String(error),
        dataKeys: Object.keys(data)
      });
      throw new EventEncryptionError(`Event encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypts sensitive event data using AES-256-GCM
   */
  decryptSensitiveData(encryptedData: EncryptedData): Record<string, unknown> {
    if (!encryptedData.encrypted) {
      try {
        return JSON.parse(encryptedData.data);
      } catch {
        throw new EventEncryptionError('Failed to parse unencrypted data as JSON');
      }
    }

    try {
      if (!encryptedData.data || !encryptedData.iv || !encryptedData.authTag) {
        throw new EventEncryptionError('Missing required encrypted data fields');
      }

      // Validate version compatibility if present
      if (encryptedData.version && encryptedData.version !== EventEncryptionService.ENCRYPTION_VERSION) {
        throw new EventEncryptionError(`Unsupported encryption version: ${encryptedData.version}`);
      }

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm', 
        this.encryptionKey, 
        Buffer.from(encryptedData.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const data = JSON.parse(decrypted);

      logger.debug('Event data decrypted successfully', {
        encryptedSize: encryptedData.data.length,
        decryptedSize: decrypted.length
      });

      return data;

    } catch (error) {
      logger.error('Failed to decrypt event data', {
        error: error instanceof Error ? error.message : String(error),
        encryptedDataPresent: !!encryptedData.data,
        version: encryptedData.version
      });
      throw new EventEncryptionError(`Event decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Determines if event data contains sensitive information that should be encrypted
   */
  isSensitiveData(eventData: Record<string, unknown>): boolean {
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'privateKey',
      'email', 'phone', 'ssn', 'creditCard', 'bankAccount',
      'personalData', 'pii', 'userDetails', 'authentication',
      'session', 'cookie', 'authorization'
    ];

    const dataString = JSON.stringify(eventData).toLowerCase();
    
    return sensitiveFields.some(field => 
      dataString.includes(field.toLowerCase())
    ) || this.containsPotentialPII(eventData);
  }

  /**
   * Encrypts event data selectively based on sensitivity
   */
  encryptEventDataIfSensitive(eventData: Record<string, unknown>): {
    eventData: Record<string, unknown>;
    isEncrypted: boolean;
  } {
    if (!this.isSensitiveData(eventData)) {
      return {
        eventData,
        isEncrypted: false
      };
    }

    // Separate sensitive and non-sensitive data
    const { sensitive, nonSensitive } = this.separateSensitiveData(eventData);
    
    if (Object.keys(sensitive).length === 0) {
      return {
        eventData,
        isEncrypted: false
      };
    }

    // Encrypt only the sensitive portion
    const encryptedSensitive = this.encryptSensitiveData(sensitive);

    return {
      eventData: {
        ...nonSensitive,
        _encrypted: encryptedSensitive
      },
      isEncrypted: true
    };
  }

  /**
   * Decrypts event data if it contains encrypted portions
   */
  decryptEventDataIfEncrypted(eventData: Record<string, unknown>): Record<string, unknown> {
    if (!eventData._encrypted) {
      return eventData;
    }

    const encryptedData = eventData._encrypted as EncryptedData;
    const decryptedSensitive = this.decryptSensitiveData(encryptedData);

    // Remove the encrypted placeholder and merge with decrypted data
    const { _encrypted, ...nonSensitiveData } = eventData;
    
    return {
      ...nonSensitiveData,
      ...decryptedSensitive
    };
  }

  /**
   * Rotates encryption key (for key rotation policies)
   */
  async rotateEncryptionKey(newMasterKey: string): Promise<void> {
    try {
      const newKey = this.deriveKey(newMasterKey);
      
      // In production, this would involve re-encrypting existing data
      logger.warn('Encryption key rotation initiated', {
        timestamp: new Date().toISOString(),
        keyLength: newKey.length * 8
      });

      // Update the key (in production, this would be more complex)
      Object.defineProperty(this, 'encryptionKey', {
        value: newKey,
        writable: false
      });

      logger.info('Encryption key rotation completed successfully');

    } catch (error) {
      logger.error('Failed to rotate encryption key', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Key rotation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets encryption service status
   */
  getEncryptionStatus(): {
    isEnabled: boolean;
    algorithm: string;
    version: number;
    keyStrength: number;
  } {
    return {
      isEnabled: true,
      algorithm: this.config.algorithm,
      version: EventEncryptionService.ENCRYPTION_VERSION,
      keyStrength: this.encryptionKey.length * 8
    };
  }

  private deriveKey(masterKey: string): Buffer {
    // Use dynamic salt from environment or generate one
    const saltHex = process.env.EVENT_ENCRYPTION_SALT || crypto.randomBytes(32).toString('hex');
    const salt = Buffer.from(saltHex, 'hex');
    
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      this.config.keyDerivationIterations,
      32, // 256 bits for AES-256
      'sha256'
    );
  }

  private generateFallbackKey(): string {
    if (process.env.NODE_ENV === 'production') {
      throw new EventEncryptionError('EVENT_ENCRYPTION_KEY must be set in production environment');
    }
    logger.warn('Using generated fallback encryption key - set EVENT_ENCRYPTION_KEY environment variable for production');
    return crypto.randomBytes(32).toString('hex');
  }

  private containsPotentialPII(data: Record<string, unknown>): boolean {
    // Check for patterns that might contain PII
    const patterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card format
      /\b\d{3}-\d{3}-\d{4}\b/ // Phone number format
    ];

    const dataString = JSON.stringify(data);
    return patterns.some(pattern => pattern.test(dataString));
  }

  private separateSensitiveData(data: Record<string, unknown>): {
    sensitive: Record<string, unknown>;
    nonSensitive: Record<string, unknown>;
  } {
    const sensitiveFields = [
      'password', 'token', 'apiKey', 'secret', 'privateKey',
      'email', 'phone', 'personalData', 'userDetails', 
      'authentication', 'authorization'
    ];

    const sensitive: Record<string, unknown> = {};
    const nonSensitive: Record<string, unknown> = {};

    Object.entries(data).forEach(([key, value]) => {
      const isSensitiveField = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );

      if (isSensitiveField || (typeof value === 'string' && this.containsPotentialPII({ [key]: value }))) {
        sensitive[key] = value;
      } else {
        nonSensitive[key] = value;
      }
    });

    return { sensitive, nonSensitive };
  }
}

// Export singleton instance
export const eventEncryptionService = new EventEncryptionService();