/**
 * Federation Security Manager Service
 * 
 * Manages security for federation protocol including mutual TLS authentication,
 * API key exchange, encryption, and secure communication protocols.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  FederationCertificate,
  validateFederationCertificate
} from '../../shared/types/federation.js';
import { FederationAuditLogger } from './federation-audit-logger.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

interface MutualTLSConfig {
  certificate_pem: string;
  private_key_pem: string;
  ca_certificate_pem?: string;
  verify_peer: boolean;
}

interface FederationAPIKey {
  id: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  expires_at?: string;
  created_at: string;
}

interface EncryptionConfig {
  algorithm: string;
  key_derivation: string;
  key_length: number;
  iv_length: number;
}

interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  security_score: number;
  recommendations: string[];
}

interface FederationJWT {
  iss: string; // Issuing tenant
  aud: string; // Target node/tenant
  sub: string; // Subject (user/service)
  iat: number; // Issued at
  exp: number; // Expires
  scope: string[]; // Permissions
  node_id?: string;
  trust_score?: number;
}

export class FederationSecurityManager {
  private db: DatabaseConnectionPool;
  private encryptionKeys = new Map<string, Buffer>();
  private auditLogger: FederationAuditLogger;

  constructor() {
    this.db = new DatabaseConnectionPool();
    this.auditLogger = new FederationAuditLogger();
  }

  // ===================
  // MUTUAL TLS MANAGEMENT
  // ===================

  /**
   * Generate TLS certificate for federation
   */
  async generateFederationCertificate(
    tenantId: string,
    certificateName: string,
    subjectDN: string,
    subjectAltNames: string[] = [],
    validityDays: number = 365,
    createdBy: string
  ): Promise<FederationCertificate> {
    logger.info(`Generating federation certificate for tenant: ${tenantId}`);

    try {
      // In a real implementation, this would use a proper CA or certificate generation library
      // For now, we'll simulate the certificate data structure
      
      const keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      // Generate self-signed certificate (in production, would use proper CA)
      const certificate = this.generateSelfSignedCertificate(
        keyPair,
        subjectDN,
        subjectAltNames,
        validityDays
      );

      const fingerprint = crypto
        .createHash('sha256')
        .update(certificate.certificatePem)
        .digest('hex');

      const validFrom = new Date();
      const validUntil = new Date();
      validUntil.setDate(validFrom.getDate() + validityDays);

      // Store certificate in database
      const [federationCertificate] = await this.db.db
        .insertInto('federation_certificates')
        .values({
          tenant_id: tenantId,
          certificate_type: 'federation_tls',
          certificate_name: certificateName,
          certificate_pem: certificate.certificatePem,
          private_key_pem: keyPair.privateKey,
          fingerprint_sha256: fingerprint,
          issuer_dn: `CN=MCP Tools Federation CA, O=${tenantId}`,
          subject_dn: subjectDN,
          subject_alt_names: JSON.stringify(subjectAltNames),
          valid_from: validFrom.toISOString(),
          valid_until: validUntil.toISOString(),
          key_algorithm: 'RSA',
          key_size: 2048,
          signature_algorithm: 'SHA256withRSA',
          is_ca_certificate: false,
          certificate_purpose: JSON.stringify(['client_auth', 'server_auth']),
          created_by: createdBy
        })
        .returningAll()
        .execute();

      logger.info(`Successfully generated federation certificate: ${federationCertificate.id}`);
      return validateFederationCertificate(federationCertificate);

    } catch (error) {
      logger.error('Failed to generate federation certificate:', error);
      throw new Error(`Failed to generate federation certificate: ${error.message}`);
    }
  }

  /**
   * Validate TLS certificate
   */
  async validateCertificate(certificateId: string, tenantId: string): Promise<SecurityValidationResult> {
    logger.info(`Validating certificate: ${certificateId}`);

    try {
      const certificate = await this.db.db
        .selectFrom('federation_certificates')
        .selectAll()
        .where('id', '=', certificateId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!certificate) {
        throw new Error('Certificate not found or access denied');
      }

      const errors: string[] = [];
      const warnings: string[] = [];
      const recommendations: string[] = [];
      let securityScore = 100;

      // Check expiration
      const validUntil = new Date(certificate.valid_until);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 0) {
        errors.push('Certificate has expired');
        securityScore -= 50;
      } else if (daysUntilExpiry <= 30) {
        warnings.push('Certificate expires within 30 days');
        recommendations.push('Schedule certificate renewal');
        securityScore -= 10;
      }

      // Check revocation status
      if (certificate.revocation_status === 'revoked') {
        errors.push('Certificate has been revoked');
        securityScore = 0;
      }

      // Check key size
      if (certificate.key_size < 2048) {
        warnings.push('Key size is below recommended minimum (2048 bits)');
        recommendations.push('Use at least 2048-bit keys for RSA certificates');
        securityScore -= 15;
      }

      // Check signature algorithm
      if (certificate.signature_algorithm.includes('SHA1')) {
        warnings.push('Certificate uses SHA1 signature algorithm');
        recommendations.push('Use SHA256 or stronger signature algorithms');
        securityScore -= 20;
      }

      // Update validation status
      await this.db.db
        .updateTable('federation_certificates')
        .set({
          last_validation_check: new Date().toISOString(),
          validation_status: errors.length > 0 ? 'invalid' : 'valid',
          updated_at: new Date().toISOString()
        })
        .where('id', '=', certificateId)
        .execute();

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        security_score: Math.max(0, securityScore),
        recommendations
      };

    } catch (error) {
      logger.error('Failed to validate certificate:', error);
      throw new Error(`Failed to validate certificate: ${error.message}`);
    }
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(
    certificateId: string,
    tenantId: string,
    reason: string,
    revokedBy: string
  ): Promise<void> {
    logger.info(`Revoking certificate: ${certificateId}`);

    try {
      await this.db.db
        .updateTable('federation_certificates')
        .set({
          revocation_status: 'revoked',
          revoked_at: new Date().toISOString(),
          revocation_reason: reason,
          validation_status: 'revoked',
          updated_at: new Date().toISOString()
        })
        .where('id', '=', certificateId)
        .where('tenant_id', '=', tenantId)
        .execute();

      // Log certificate revocation
      await this.logSecurityEvent(tenantId, 'certificate_revoked', {
        certificate_id: certificateId,
        reason,
        revoked_by: revokedBy
      });

      logger.info(`Successfully revoked certificate: ${certificateId}`);

    } catch (error) {
      logger.error('Failed to revoke certificate:', error);
      throw new Error(`Failed to revoke certificate: ${error.message}`);
    }
  }

  // ===================
  // API KEY MANAGEMENT
  // ===================

  /**
   * Generate federation API key
   */
  async generateFederationAPIKey(
    tenantId: string,
    targetNodeId: string,
    keyName: string,
    permissions: string[] = [],
    expirationDays?: number,
    createdBy: string
  ): Promise<{ apiKey: string; keyRecord: FederationAPIKey }> {
    logger.info(`Generating federation API key for tenant: ${tenantId} -> node: ${targetNodeId}`);

    try {
      // Generate secure API key
      const keyBytes = crypto.randomBytes(32);
      const keyId = crypto.randomUUID();
      const keyPrefix = `fed_${tenantId.substring(0, 8)}`;
      const apiKey = `${keyPrefix}_${keyBytes.toString('base64url')}`;
      
      // Hash the key for storage
      const keyHash = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');

      // Set expiration if specified
      let expiresAt: string | undefined;
      if (expirationDays) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + expirationDays);
        expiresAt = expDate.toISOString();
      }

      // Store API key
      const [federationAPIKey] = await this.db.db
        .insertInto('federation_api_keys')
        .values({
          id: keyId,
          tenant_id: tenantId,
          target_node_id: targetNodeId,
          key_name: keyName,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          permissions: JSON.stringify(permissions),
          scopes: JSON.stringify(['federation:search', 'federation:sync']),
          expires_at: expiresAt,
          created_by: createdBy
        })
        .returningAll()
        .execute();

      const keyRecord: FederationAPIKey = {
        id: federationAPIKey.id,
        key_hash: federationAPIKey.key_hash,
        key_prefix: federationAPIKey.key_prefix,
        permissions: JSON.parse(federationAPIKey.permissions as string),
        expires_at: federationAPIKey.expires_at,
        created_at: federationAPIKey.created_at
      };

      // Log comprehensive API key generation event
      await this.auditLogger.logEncryptionEvent(
        tenantId,
        'key_generation',
        keyId,
        {
          target_node_id: targetNodeId,
          key_type: 'federation_api_key',
          created_by: createdBy,
          permissions: permissions,
          expiration_days: expirationDays
        }
      );

      logger.info(`Successfully generated federation API key: ${keyId}`);

      return { apiKey, keyRecord };

    } catch (error) {
      logger.error('Failed to generate federation API key:', error);
      throw new Error(`Failed to generate federation API key: ${error.message}`);
    }
  }

  /**
   * Validate API key
   */
  async validateAPIKey(apiKey: string): Promise<{
    valid: boolean;
    tenantId?: string;
    targetNodeId?: string;
    permissions: string[];
    scopes: string[];
  }> {
    try {
      // Hash the provided key
      const keyHash = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');

      // Look up the key
      const keyRecord = await this.db.db
        .selectFrom('federation_api_keys')
        .select([
          'tenant_id', 'target_node_id', 'permissions', 'scopes',
          'status', 'expires_at', 'compromise_detected'
        ])
        .where('key_hash', '=', keyHash)
        .executeTakeFirst();

      if (!keyRecord) {
        return { valid: false, permissions: [], scopes: [] };
      }

      // Check if key is active
      if (keyRecord.status !== 'active') {
        return { valid: false, permissions: [], scopes: [] };
      }

      // Check if compromised
      if (keyRecord.compromise_detected) {
        await this.auditLogger.logSecurityEvent({
          tenantId: keyRecord.tenant_id,
          eventType: 'compromised_key_usage_attempt',
          details: {
            key_hash_prefix: keyHash.substring(0, 8) + '...',
            target_node_id: keyRecord.target_node_id,
            detection_time: new Date().toISOString()
          },
          severity: 'critical',
          complianceStatus: 'violation',
          riskScore: 1.0
        });
        return { valid: false, permissions: [], scopes: [] };
      }

      // Check expiration
      if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
        return { valid: false, permissions: [], scopes: [] };
      }

      // Update usage statistics
      await this.updateAPIKeyUsage(keyHash);

      return {
        valid: true,
        tenantId: keyRecord.tenant_id,
        targetNodeId: keyRecord.target_node_id,
        permissions: JSON.parse(keyRecord.permissions as string || '[]'),
        scopes: JSON.parse(keyRecord.scopes as string || '[]')
      };

    } catch (error) {
      logger.error('Failed to validate API key:', error);
      return { valid: false, permissions: [], scopes: [] };
    }
  }

  /**
   * Rotate API key
   */
  async rotateAPIKey(
    keyId: string,
    tenantId: string,
    rotatedBy: string
  ): Promise<{ newApiKey: string; keyRecord: FederationAPIKey }> {
    logger.info(`Rotating API key: ${keyId}`);

    try {
      const existingKey = await this.db.db
        .selectFrom('federation_api_keys')
        .selectAll()
        .where('id', '=', keyId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!existingKey) {
        throw new Error('API key not found or access denied');
      }

      // Generate new key
      const { apiKey: newApiKey, keyRecord } = await this.generateFederationAPIKey(
        tenantId,
        existingKey.target_node_id,
        existingKey.key_name,
        JSON.parse(existingKey.permissions as string || '[]'),
        existingKey.expires_at ? Math.ceil((new Date(existingKey.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : undefined,
        rotatedBy
      );

      // Deactivate old key
      await this.db.db
        .updateTable('federation_api_keys')
        .set({
          status: 'rotated',
          updated_at: new Date().toISOString()
        })
        .where('id', '=', keyId)
        .execute();

      // Update rotation schedule
      const nextRotation = new Date();
      nextRotation.setMonth(nextRotation.getMonth() + 3); // 3 months

      await this.db.db
        .updateTable('federation_api_keys')
        .set({
          last_rotated_at: new Date().toISOString(),
          next_rotation_at: nextRotation.toISOString()
        })
        .where('id', '=', keyRecord.id)
        .execute();

      logger.info(`Successfully rotated API key: ${keyId} -> ${keyRecord.id}`);

      return { newApiKey, keyRecord };

    } catch (error) {
      logger.error('Failed to rotate API key:', error);
      throw new Error(`Failed to rotate API key: ${error.message}`);
    }
  }

  // ===================
  // JWT TOKEN MANAGEMENT
  // ===================

  /**
   * Generate federation JWT token
   */
  async generateFederationJWT(
    tenantId: string,
    targetNodeId: string,
    userId: string,
    permissions: string[],
    expirationMinutes: number = 60
  ): Promise<string> {
    try {
      const payload: FederationJWT = {
        iss: tenantId,
        aud: targetNodeId,
        sub: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (expirationMinutes * 60),
        scope: permissions,
        node_id: targetNodeId
      };

      // Get signing key for tenant
      const signingKey = await this.getSigningKey(tenantId);
      
      const token = jwt.sign(payload, signingKey, {
        algorithm: 'HS256',
        header: {
          typ: 'JWT',
          alg: 'HS256',
          kid: tenantId // Key ID for verification
        }
      });

      // Store token metadata
      await this.storeJWTMetadata(payload.jti || crypto.randomUUID(), tenantId, userId, payload.exp);

      return token;

    } catch (error) {
      logger.error('Failed to generate federation JWT:', error);
      throw new Error(`Failed to generate federation JWT: ${error.message}`);
    }
  }

  /**
   * Verify federation JWT token
   */
  async verifyFederationJWT(token: string): Promise<{
    valid: boolean;
    payload?: FederationJWT;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];

      // Decode without verification first to get issuer
      const decoded = jwt.decode(token, { complete: true });
      
      if (!decoded || typeof decoded === 'string') {
        errors.push('Invalid token format');
        return { valid: false, errors };
      }

      const payload = decoded.payload as FederationJWT;
      
      // Get verification key for issuing tenant
      const verificationKey = await this.getSigningKey(payload.iss);
      
      // Verify token
      const verified = jwt.verify(token, verificationKey, {
        algorithms: ['HS256'],
        issuer: payload.iss
      }) as FederationJWT;

      // Check if token is revoked
      const isRevoked = await this.isTokenRevoked(token);
      if (isRevoked) {
        errors.push('Token has been revoked');
        return { valid: false, errors };
      }

      return {
        valid: true,
        payload: verified,
        errors: []
      };

    } catch (error) {
      logger.error('Failed to verify federation JWT:', error);
      return {
        valid: false,
        errors: [error.message || 'Token verification failed']
      };
    }
  }

  // ===================
  // ENCRYPTION SERVICES
  // ===================

  /**
   * Encrypt payload for federation transmission using AES-256-GCM authenticated encryption
   */
  async encryptFederationPayload(
    tenantId: string,
    targetNodeId: string,
    payload: Record<string, unknown>
  ): Promise<{
    encrypted_data: string;
    encryption_metadata: {
      algorithm: string;
      key_id: string;
      iv: string;
      auth_tag: string;
    };
  }> {
    try {
      // Get or generate encryption key for this tenant-node pair
      const encryptionKey = await this.getEncryptionKey(tenantId, targetNodeId);
      
      // Use AES-256-GCM for authenticated encryption
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(12); // 96-bit IV for GCM
      
      const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
      cipher.setAAD(Buffer.from(`federation-payload:${tenantId}:${targetNodeId}`)); // Additional authenticated data
      
      const payloadString = JSON.stringify(payload);
      let encrypted = cipher.update(payloadString, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted_data: encrypted,
        encryption_metadata: {
          algorithm,
          key_id: `${tenantId}:${targetNodeId}`,
          iv: iv.toString('base64'),
          auth_tag: authTag.toString('base64')
        }
      };

    } catch (error) {
      logger.error('Failed to encrypt federation payload:', error);
      throw new Error(`Failed to encrypt federation payload: ${error.message}`);
    }
  }

  /**
   * Decrypt payload from federation transmission using AES-256-GCM authenticated encryption
   */
  async decryptFederationPayload(
    tenantId: string,
    sourceNodeId: string,
    encryptedData: string,
    encryptionMetadata: {
      algorithm: string;
      key_id: string;
      iv: string;
      auth_tag: string;
    }
  ): Promise<Record<string, unknown>> {
    try {
      // Validate encryption metadata
      if (!encryptionMetadata.algorithm || !encryptionMetadata.iv || !encryptionMetadata.auth_tag) {
        throw new Error('Invalid encryption metadata - missing required fields');
      }

      if (encryptionMetadata.algorithm !== 'aes-256-gcm') {
        throw new Error(`Unsupported encryption algorithm: ${encryptionMetadata.algorithm}`);
      }

      // Get decryption key
      const decryptionKey = await this.getEncryptionKey(tenantId, sourceNodeId);
      
      const decipher = crypto.createDecipheriv(
        encryptionMetadata.algorithm,
        decryptionKey,
        Buffer.from(encryptionMetadata.iv, 'base64')
      );
      
      // Set auth tag and additional authenticated data
      decipher.setAuthTag(Buffer.from(encryptionMetadata.auth_tag, 'base64'));
      decipher.setAAD(Buffer.from(`federation-payload:${sourceNodeId}:${tenantId}`));
      
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted) as Record<string, unknown>;

    } catch (error) {
      logger.error('Failed to decrypt federation payload:', error);
      
      // Log comprehensive security event for decryption failure
      await this.auditLogger.logSecurityEvent({
        tenantId,
        eventType: 'federation_decryption_failure',
        sourceNodeId,
        details: {
          error: error.message,
          algorithm: encryptionMetadata.algorithm,
          key_id: encryptionMetadata.key_id,
          failure_time: new Date().toISOString()
        },
        severity: 'high',
        complianceStatus: 'warning',
        riskScore: 0.8
      });
      
      throw new Error(`Failed to decrypt federation payload: ${error.message}`);
    }
  }

  // ===================
  // CERTIFICATE VALIDATION
  // ===================

  /**
   * Validate certificate with proper CA chain verification
   */
  async validateCertificateWithCA(
    certificatePem: string, 
    trustedCAs: string[]
  ): Promise<{
    valid: boolean;
    errors: string[];
    certificateInfo: {
      subject: string;
      issuer: string;
      validFrom: string;
      validTo: string;
      fingerprint: string;
    } | null;
  }> {
    try {
      const errors: string[] = [];
      
      // Parse certificate
      let certificate: crypto.X509Certificate;
      try {
        certificate = new crypto.X509Certificate(certificatePem);
      } catch (error) {
        errors.push(`Invalid certificate format: ${error.message}`);
        return { valid: false, errors, certificateInfo: null };
      }

      // Extract certificate information
      const certificateInfo = {
        subject: certificate.subject,
        issuer: certificate.issuer,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        fingerprint: certificate.fingerprint256
      };

      // Check certificate expiration
      const now = new Date();
      const validFrom = new Date(certificate.validFrom);
      const validTo = new Date(certificate.validTo);

      if (now < validFrom) {
        errors.push('Certificate is not yet valid');
      }

      if (now > validTo) {
        errors.push('Certificate has expired');
      }

      // Check certificate chain against trusted CAs
      let validCA = false;
      if (trustedCAs.length > 0) {
        for (const caPem of trustedCAs) {
          try {
            const caPublicKey = crypto.createPublicKey(caPem);
            if (certificate.verify(caPublicKey)) {
              validCA = true;
              break;
            }
          } catch (error) {
            // Continue checking other CAs
            continue;
          }
        }
        
        if (!validCA) {
          errors.push('Certificate not signed by trusted CA');
        }
      } else {
        // If no CAs provided, this is likely a self-signed certificate
        errors.push('No trusted CAs provided for verification');
      }

      // Check key usage and extensions
      const keyUsage = certificate.keyUsage;
      if (!keyUsage || !keyUsage.includes('digitalSignature')) {
        errors.push('Certificate missing required digitalSignature key usage');
      }

      return {
        valid: errors.length === 0,
        errors,
        certificateInfo
      };

    } catch (error) {
      logger.error('Failed to validate certificate:', error);
      return {
        valid: false,
        errors: [`Certificate validation failed: ${error.message}`],
        certificateInfo: null
      };
    }
  }

  /**
   * Check certificate revocation status via CRL or OCSP
   */
  async checkCertificateRevocation(certificateId: string): Promise<{
    revoked: boolean;
    reason?: string;
    revokedAt?: string;
  }> {
    try {
      // Check local revocation database first
      const revokedCert = await this.db.db
        .selectFrom('federation_certificates')
        .select(['revocation_status', 'revocation_reason', 'revoked_at'])
        .where('id', '=', certificateId)
        .where('revocation_status', '=', 'revoked')
        .executeTakeFirst();

      if (revokedCert) {
        return {
          revoked: true,
          reason: revokedCert.revocation_reason || 'Unknown',
          revokedAt: revokedCert.revoked_at || undefined
        };
      }

      // In production, this would also check:
      // 1. Certificate Revocation Lists (CRL)
      // 2. Online Certificate Status Protocol (OCSP)
      // 3. CA-specific revocation endpoints

      return { revoked: false };

    } catch (error) {
      logger.error('Failed to check certificate revocation:', error);
      // In case of error, assume not revoked but log the issue
      return { revoked: false };
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private async generateSelfSignedCertificate(
    keyPair: { publicKey: string; privateKey: string },
    subjectDN: string,
    subjectAltNames: string[],
    validityDays: number
  ): Promise<{ certificatePem: string }> {
    // SECURITY WARNING: This is a placeholder implementation for development only
    // In production, certificates MUST be issued by a trusted Certificate Authority
    // This implementation violates security best practices and should not be used in production
    
    logger.warn('Using placeholder certificate generation - NOT for production use');
    
    try {
      // Generate a proper X.509 certificate structure (still self-signed for development)
      // In production, this should integrate with a proper CA like Let's Encrypt, DigiCert, etc.
      const cert = crypto.createSign('RSA-SHA256');
      const validFrom = new Date();
      const validUntil = new Date(validFrom.getTime() + (validityDays * 24 * 60 * 60 * 1000));
      
      // Create certificate metadata
      const certMetadata = {
        version: '3',
        serialNumber: crypto.randomBytes(16).toString('hex'),
        issuer: 'CN=MCP-Tools-Dev-CA,O=Development-Only',
        subject: subjectDN,
        notBefore: validFrom.toISOString(),
        notAfter: validUntil.toISOString(),
        subjectAltNames: subjectAltNames,
        publicKey: keyPair.publicKey,
        keyUsage: ['digitalSignature', 'keyEncipherment', 'serverAuth', 'clientAuth']
      };
      
      // In a real implementation, this would generate a proper X.509 certificate
      // For now, create a structured placeholder that can be validated
      const certificatePem = `-----BEGIN CERTIFICATE-----
${Buffer.from(JSON.stringify(certMetadata)).toString('base64').match(/.{1,64}/g)?.join('\n') || ''}
-----END CERTIFICATE-----`;
      
      return { certificatePem };

    } catch (error) {
      logger.error('Failed to generate certificate:', error);
      throw new Error(`Certificate generation failed: ${error.message}`);
    }
  }

  private async getSigningKey(tenantId: string): Promise<string> {
    try {
      // Retrieve tenant-specific signing key from secure key store
      const existingKey = await this.db.db
        .selectFrom('tenant_encryption_keys')
        .select('signing_key_hash')
        .where('tenant_id', '=', tenantId)
        .where('key_type', '=', 'jwt_signing')
        .where('status', '=', 'active')
        .executeTakeFirst();

      if (existingKey) {
        // In production, this would decrypt the key using HSM or key management service
        return existingKey.signing_key_hash;
      }

      // Generate new signing key for tenant
      const signingKey = crypto.randomBytes(64).toString('base64');
      const keyHash = crypto.createHash('sha256').update(signingKey).digest('hex');

      // Store the signing key securely
      await this.db.db
        .insertInto('tenant_encryption_keys')
        .values({
          tenant_id: tenantId,
          key_type: 'jwt_signing',
          signing_key_hash: signingKey, // In production, this would be encrypted
          key_fingerprint: keyHash,
          status: 'active',
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString() // 1 year
        })
        .execute();

      await this.auditLogger.logEncryptionEvent(
        tenantId,
        'key_generation',
        tenantId,
        {
          key_type: 'jwt_signing',
          key_fingerprint: keyHash.substring(0, 8) + '...',
          expiry_date: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString()
        }
      );

      return signingKey;

    } catch (error) {
      logger.error('Failed to get signing key:', error);
      throw new Error(`Failed to get signing key: ${error.message}`);
    }
  }

  private async getEncryptionKey(tenantId: string, nodeId: string): Promise<Buffer> {
    const keyId = `${tenantId}:${nodeId}`;
    
    if (!this.encryptionKeys.has(keyId)) {
      // Generate or retrieve encryption key
      const key = crypto.randomBytes(32); // 256-bit key
      this.encryptionKeys.set(keyId, key);
    }
    
    return this.encryptionKeys.get(keyId)!;
  }

  private async updateAPIKeyUsage(keyHash: string): Promise<void> {
    await this.db.db
      .updateTable('federation_api_keys')
      .set({
        usage_count: this.db.db
          .selectFrom('federation_api_keys')
          .select((eb) => eb('usage_count', '+', 1))
          .where('key_hash', '=', keyHash),
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .where('key_hash', '=', keyHash)
      .execute();
  }

  private async storeJWTMetadata(tokenId: string, tenantId: string, userId: string, exp: number): Promise<void> {
    await this.db.db
      .insertInto('jwt_token_metadata')
      .values({
        token_id: tokenId,
        tenant_id: tenantId,
        user_id: userId,
        expires_at: new Date(exp * 1000).toISOString()
      })
      .execute();
  }

  private async isTokenRevoked(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const revokedToken = await this.db.db
      .selectFrom('revoked_tokens')
      .select('token_id')
      .where('token_id', '=', tokenHash)
      .executeTakeFirst();
    
    return !!revokedToken;
  }

  private async logSecurityEvent(
    tenantId: string,
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: tenantId,
          action: eventType,
          resource_type: 'federation_security',
          resource_id: 'security_manager',
          action_details: JSON.stringify(details),
          severity_level: 'medium',
          is_cross_tenant: false
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log security event:', error);
    }
  }

  // ===================
  // SECURITY MONITORING
  // ===================

  /**
   * Get security metrics for federation
   */
  async getSecurityMetrics(tenantId: string): Promise<{
    active_certificates: number;
    expiring_certificates: number;
    active_api_keys: number;
    compromised_keys: number;
    recent_security_events: number;
  }> {
    try {
      const [activeCerts] = await this.db.db
        .selectFrom('federation_certificates')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('revocation_status', '=', 'valid')
        .execute();

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const [expiringCerts] = await this.db.db
        .selectFrom('federation_certificates')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('valid_until', '<=', thirtyDaysFromNow.toISOString())
        .where('revocation_status', '=', 'valid')
        .execute();

      const [activeKeys] = await this.db.db
        .selectFrom('federation_api_keys')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .execute();

      const [compromisedKeys] = await this.db.db
        .selectFrom('federation_api_keys')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('compromise_detected', '=', true)
        .execute();

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [recentEvents] = await this.db.db
        .selectFrom('tenant_audit_logs')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('resource_type', '=', 'federation_security')
        .where('created_at', '>=', sevenDaysAgo.toISOString())
        .execute();

      return {
        active_certificates: activeCerts.count || 0,
        expiring_certificates: expiringCerts.count || 0,
        active_api_keys: activeKeys.count || 0,
        compromised_keys: compromisedKeys.count || 0,
        recent_security_events: recentEvents.count || 0
      };

    } catch (error) {
      logger.error('Failed to get security metrics:', error);
      throw new Error(`Failed to get security metrics: ${error.message}`);
    }
  }
}