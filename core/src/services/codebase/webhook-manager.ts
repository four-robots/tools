/**
 * Webhook Manager Service
 * 
 * Centralized webhook management for repository synchronization.
 * Handles webhook creation, management, and payload processing across
 * all supported Git providers.
 */

import crypto from 'crypto';
import { DatabaseManager } from '../../utils/database.js';
import type { GitProvider } from './git-providers/index.js';
import type { 
  RepositoryWebhook,
  FileChange,
  Repository
} from '../../shared/types/repository.js';

/**
 * Webhook delivery status
 */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  deliveredAt: Date;
  successful: boolean;
  statusCode?: number;
  errorMessage?: string;
  payload: any;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  events: string[];
  secret?: string;
  active: boolean;
}

/**
 * Webhook processing result
 */
export interface WebhookProcessingResult {
  processed: boolean;
  repositoryId?: string;
  fileChanges: FileChange[];
  triggerSync: boolean;
  error?: string;
}

/**
 * Centralized webhook management service
 */
export class WebhookManager {
  private readonly db: DatabaseManager;
  private readonly webhookSecret: string;
  private readonly baseWebhookUrl: string;

  constructor(
    db: DatabaseManager,
    webhookSecret: string = process.env.WEBHOOK_SECRET || 'default-secret',
    baseWebhookUrl: string = process.env.BASE_WEBHOOK_URL || 'http://localhost:3001'
  ) {
    this.db = db;
    this.webhookSecret = webhookSecret;
    this.baseWebhookUrl = baseWebhookUrl;
  }

  /**
   * Setup webhook for a repository using its Git provider
   */
  async setupWebhook(
    repositoryId: string,
    provider: GitProvider,
    config: WebhookConfig = { events: ['push'], active: true }
  ): Promise<string> {
    try {
      // Get repository information
      const repository = await this.getRepository(repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      // Check if provider supports webhooks
      if (!provider.supportsWebhooks()) {
        throw new Error(`Provider ${provider.name} does not support webhooks`);
      }

      // Generate webhook URL and secret
      const webhookUrl = `${this.baseWebhookUrl}/api/webhooks/repository/${repositoryId}`;
      const secret = config.secret || this.generateWebhookSecret();

      // Create webhook with provider
      let providerWebhookId: string;
      
      if ('createWebhook' in provider) {
        providerWebhookId = await (provider as any).createWebhook(
          repository.url,
          webhookUrl,
          secret,
          config.events
        );
      } else {
        throw new Error(`Provider ${provider.name} does not implement webhook creation`);
      }

      // Store webhook in database
      const webhookId = crypto.randomUUID();
      await this.db.kysely
        .insertInto('repository_webhooks')
        .values({
          id: webhookId,
          repository_id: repositoryId,
          webhook_id: providerWebhookId,
          webhook_url: webhookUrl,
          secret,
          events: JSON.stringify(config.events),
          is_active: config.active,
          created_at: new Date(),
          updated_at: new Date(),
          delivery_count: 0,
          error_count: 0
        })
        .execute();

      return webhookId;
    } catch (error) {
      throw new Error(`Failed to setup webhook for repository ${repositoryId}: ${error.message}`);
    }
  }

  /**
   * Remove webhook for a repository
   */
  async removeWebhook(repositoryId: string, webhookId: string, provider: GitProvider): Promise<void> {
    try {
      // Get webhook information
      const webhook = await this.getWebhook(webhookId);
      if (!webhook) {
        throw new Error(`Webhook not found: ${webhookId}`);
      }

      // Get repository information
      const repository = await this.getRepository(repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      // Delete webhook from provider if it has the method
      if (webhook.webhookId && 'deleteWebhook' in provider) {
        try {
          await (provider as any).deleteWebhook(repository.url, webhook.webhookId);
        } catch (providerError) {
          console.warn(`Failed to delete webhook from provider: ${providerError.message}`);
          // Continue with database cleanup even if provider deletion fails
        }
      }

      // Remove from database
      await this.db.kysely
        .deleteFrom('repository_webhooks')
        .where('id', '=', webhookId)
        .execute();

    } catch (error) {
      throw new Error(`Failed to remove webhook ${webhookId}: ${error.message}`);
    }
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhookPayload(
    repositoryId: string,
    payload: any,
    headers: Record<string, string>,
    provider: GitProvider
  ): Promise<WebhookProcessingResult> {
    try {
      // Get repository and webhook information
      const repository = await this.getRepository(repositoryId);
      if (!repository) {
        return {
          processed: false,
          fileChanges: [],
          triggerSync: false,
          error: `Repository not found: ${repositoryId}`
        };
      }

      const webhooks = await this.getRepositoryWebhooks(repositoryId);
      if (webhooks.length === 0) {
        return {
          processed: false,
          fileChanges: [],
          triggerSync: false,
          error: `No webhooks configured for repository: ${repositoryId}`
        };
      }

      // Verify webhook signature if secret is provided
      const webhook = webhooks[0]; // Use first active webhook
      if (webhook.secret && !this.verifyWebhookSignature(payload, headers, webhook.secret)) {
        await this.recordWebhookDelivery(webhook.id, false, 401, 'Invalid signature');
        return {
          processed: false,
          fileChanges: [],
          triggerSync: false,
          error: 'Invalid webhook signature'
        };
      }

      // Parse payload using provider
      const fileChanges = provider.parseWebhookData(payload);
      
      // Record successful delivery
      await this.recordWebhookDelivery(webhook.id, true, 200);

      // Determine if sync should be triggered
      const triggerSync = fileChanges.length > 0;

      return {
        processed: true,
        repositoryId,
        fileChanges,
        triggerSync
      };

    } catch (error) {
      console.error('Webhook processing failed:', error);
      return {
        processed: false,
        fileChanges: [],
        triggerSync: false,
        error: error.message
      };
    }
  }

  /**
   * Get webhook delivery statistics
   */
  async getWebhookStats(repositoryId: string): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    errorCount: number;
    lastDelivery?: Date;
    successRate: number;
  }> {
    try {
      const webhooks = await this.getRepositoryWebhooks(repositoryId);
      
      let totalDeliveries = 0;
      let successfulDeliveries = 0;
      let errorCount = 0;
      let lastDelivery: Date | undefined;

      for (const webhook of webhooks) {
        totalDeliveries += webhook.deliveryCount;
        successfulDeliveries += (webhook.deliveryCount - webhook.errorCount);
        errorCount += webhook.errorCount;
        
        if (webhook.lastDeliveryAt && (!lastDelivery || webhook.lastDeliveryAt > lastDelivery)) {
          lastDelivery = webhook.lastDeliveryAt;
        }
      }

      const successRate = totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) : 1;

      return {
        totalDeliveries,
        successfulDeliveries,
        errorCount,
        lastDelivery,
        successRate
      };
    } catch (error) {
      throw new Error(`Failed to get webhook stats: ${error.message}`);
    }
  }

  /**
   * List all webhooks for a repository
   */
  async getRepositoryWebhooks(repositoryId: string): Promise<RepositoryWebhook[]> {
    const result = await this.db.kysely
      .selectFrom('repository_webhooks')
      .selectAll()
      .where('repository_id', '=', repositoryId)
      .where('is_active', '=', true)
      .execute();

    return result.map(row => ({
      id: row.id,
      repositoryId: row.repository_id,
      webhookId: row.webhook_id || undefined,
      webhookUrl: row.webhook_url,
      secret: row.secret || undefined,
      events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events || [],
      isActive: row.is_active,
      lastDeliveryAt: row.last_delivery_at || undefined,
      deliveryCount: row.delivery_count,
      errorCount: row.error_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Update webhook configuration
   */
  async updateWebhookConfig(
    webhookId: string,
    config: Partial<WebhookConfig>
  ): Promise<void> {
    const updates: any = {
      updated_at: new Date()
    };

    if (config.events !== undefined) {
      updates.events = JSON.stringify(config.events);
    }

    if (config.active !== undefined) {
      updates.is_active = config.active;
    }

    if (config.secret !== undefined) {
      updates.secret = config.secret;
    }

    await this.db.kysely
      .updateTable('repository_webhooks')
      .set(updates)
      .where('id', '=', webhookId)
      .execute();
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  /**
   * Get repository by ID
   */
  private async getRepository(repositoryId: string): Promise<Repository | null> {
    const result = await this.db.kysely
      .selectFrom('code_repositories')
      .selectAll()
      .where('id', '=', repositoryId)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      url: result.url,
      provider: result.provider as any,
      accessTokenEncrypted: result.access_token_encrypted,
      defaultBranch: result.default_branch,
      description: result.description,
      language: result.language,
      starsCount: result.stars_count,
      forksCount: result.forks_count,
      sizeKb: result.size_kb,
      lastSyncAt: result.last_sync_at,
      syncStatus: result.sync_status as any,
      syncError: result.sync_error,
      settings: result.settings || {},
      webhookSecret: result.webhook_secret,
      isActive: result.is_active,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  /**
   * Get webhook by ID
   */
  private async getWebhook(webhookId: string): Promise<RepositoryWebhook | null> {
    const result = await this.db.kysely
      .selectFrom('repository_webhooks')
      .selectAll()
      .where('id', '=', webhookId)
      .executeTakeFirst();

    if (!result) return null;

    return {
      id: result.id,
      repositoryId: result.repository_id,
      webhookId: result.webhook_id || undefined,
      webhookUrl: result.webhook_url,
      secret: result.secret || undefined,
      events: typeof result.events === 'string' ? JSON.parse(result.events) : result.events || [],
      isActive: result.is_active,
      lastDeliveryAt: result.last_delivery_at || undefined,
      deliveryCount: result.delivery_count,
      errorCount: result.error_count,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    };
  }

  /**
   * Generate a secure webhook secret
   */
  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(
    payload: any,
    headers: Record<string, string>,
    secret: string
  ): boolean {
    try {
      const signature = headers['x-hub-signature-256'] || headers['x-gitlab-token'] || headers['x-bitbucket-signature'];
      
      if (!signature) {
        return false;
      }

      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      // Handle different signature formats
      if (signature.startsWith('sha256=')) {
        return crypto.timingSafeEqual(
          Buffer.from(signature.slice(7)),
          Buffer.from(expectedSignature)
        );
      }

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.warn('Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Record webhook delivery attempt
   */
  private async recordWebhookDelivery(
    webhookId: string,
    successful: boolean,
    statusCode: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      // Update webhook statistics
      const updateQuery = this.db.kysely
        .updateTable('repository_webhooks')
        .set({
          delivery_count: this.db.kysely.raw('delivery_count + 1'),
          last_delivery_at: new Date(),
          updated_at: new Date()
        })
        .where('id', '=', webhookId);

      if (!successful) {
        updateQuery.set({
          error_count: this.db.kysely.raw('error_count + 1')
        });
      }

      await updateQuery.execute();
    } catch (error) {
      console.error('Failed to record webhook delivery:', error);
    }
  }
}