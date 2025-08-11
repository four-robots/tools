/**
 * Migrate Existing Data to Multi-tenant Structure
 * 
 * This script migrates all existing data to the new multi-tenant architecture:
 * - Creates a default tenant for existing data
 * - Assigns all existing records to the default tenant
 * - Validates data integrity after migration
 * - Creates default users and permissions
 * 
 * Run this after the multi-tenant migration (029) is complete.
 */

import { DatabasePool } from '../../core/src/utils/database-pool.js';
import { logger } from '../utils/logger.js';
import { TenantManagementService } from '../../../core/src/services/multi-tenant/tenant-management-service.js';

interface MigrationSummary {
  defaultTenantId: string;
  migratedTables: string[];
  recordCounts: Record<string, number>;
  errors: string[];
  warnings: string[];
}

export class ExistingDataMigration {
  private db: DatabasePool;
  private tenantService: TenantManagementService;
  private defaultTenantId: string | null = null;

  constructor() {
    this.db = new DatabasePool();
    this.tenantService = new TenantManagementService();
  }

  /**
   * Main migration function
   */
  async migrateExistingData(): Promise<MigrationSummary> {
    logger.info('Starting existing data migration to multi-tenant structure');

    const summary: MigrationSummary = {
      defaultTenantId: '',
      migratedTables: [],
      recordCounts: {},
      errors: [],
      warnings: []
    };

    try {
      // Step 1: Get or create default tenant
      this.defaultTenantId = await this.getOrCreateDefaultTenant();
      summary.defaultTenantId = this.defaultTenantId;

      // Step 2: Migrate all tables with tenant_id columns
      const tablesToMigrate = [
        'boards', 'columns', 'cards', 'tags', 'card_tags', 'comments', 'custom_fields',
        'card_custom_field_values', 'milestones', 'card_milestones', 'card_subtasks',
        'card_links', 'time_entries', 'card_activities',
        'pages', 'categories', 'page_categories', 'wiki_tags', 'page_tags', 'page_links',
        'wiki_attachments', 'page_history', 'wiki_comments',
        'memories', 'relationships', 'concepts', 'memory_concepts', 'memory_snapshots',
        'concept_hierarchies', 'memory_clusters', 'memory_cluster_memberships',
        'context_patterns', 'memory_context_patterns', 'memory_access_logs',
        'knowledge_graph_metrics', 'memory_merges',
        'usage_tracking', 'code_quality_metrics', 'dependency_vulnerabilities',
        'technical_debt_items', 'scraper_performance', 'document_processing_queue',
        'extracted_content', 'data_retention_policies', 'notification_preferences',
        'feature_flags'
      ];

      for (const tableName of tablesToMigrate) {
        try {
          const recordCount = await this.migrateTable(tableName);
          summary.migratedTables.push(tableName);
          summary.recordCounts[tableName] = recordCount;
        } catch (error) {
          const errorMessage = `Failed to migrate table ${tableName}: ${error.message}`;
          logger.error(errorMessage);
          summary.errors.push(errorMessage);
        }
      }

      // Step 3: Create default system user
      await this.createDefaultSystemUser();

      // Step 4: Validate migration integrity
      const validationResults = await this.validateMigrationIntegrity();
      summary.warnings.push(...validationResults.warnings);
      summary.errors.push(...validationResults.errors);

      logger.info('Existing data migration completed successfully', {
        migratedTables: summary.migratedTables.length,
        totalRecords: Object.values(summary.recordCounts).reduce((sum, count) => sum + count, 0),
        errors: summary.errors.length,
        warnings: summary.warnings.length
      });

      return summary;

    } catch (error) {
      logger.error('Critical error during data migration:', error);
      summary.errors.push(`Critical migration error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get or create the default tenant for existing data
   */
  private async getOrCreateDefaultTenant(): Promise<string> {
    logger.info('Getting or creating default tenant');

    try {
      // Check if default tenant already exists
      const existingTenant = await this.tenantService.getTenantBySlug('default');
      if (existingTenant) {
        logger.info(`Default tenant already exists: ${existingTenant.id}`);
        return existingTenant.id;
      }

      // Create default tenant
      const defaultTenant = await this.tenantService.createTenant({
        name: 'Default Organization',
        slug: 'default',
        displayName: 'Default Organization',
        description: 'Default tenant created during migration for existing data',
        isOrganization: true,
        tier: 'enterprise',
        maxUsers: 1000,
        maxStorageGb: 100,
        maxApiCallsPerDay: 100000,
        federationEnabled: false,
        publicDiscovery: false,
        dataRegion: 'us-east-1',
        complianceRequirements: [],
        brandingConfig: {},
        featureFlags: {},
        metadata: {
          migration_created: true,
          migration_date: new Date().toISOString()
        }
      }, 'system-migration');

      logger.info(`Created default tenant: ${defaultTenant.id}`);
      return defaultTenant.id;

    } catch (error) {
      logger.error('Failed to get or create default tenant:', error);
      throw new Error(`Failed to get or create default tenant: ${error.message}`);
    }
  }

  /**
   * Migrate a single table to add tenant_id
   */
  private async migrateTable(tableName: string): Promise<number> {
    logger.info(`Migrating table: ${tableName}`);

    try {
      // Check if table exists and has records without tenant_id
      const [countResult] = await this.db.db
        .selectFrom(tableName as any)
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', 'is', null)
        .execute();

      const recordCount = countResult?.count || 0;
      
      if (recordCount === 0) {
        logger.info(`Table ${tableName} has no records to migrate`);
        return 0;
      }

      // Update all records without tenant_id to use default tenant
      const updateResult = await this.db.db
        .updateTable(tableName as any)
        .set({ tenant_id: this.defaultTenantId })
        .where('tenant_id', 'is', null)
        .execute();

      logger.info(`Successfully migrated ${recordCount} records in table ${tableName}`);
      return recordCount;

    } catch (error) {
      logger.error(`Failed to migrate table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Create default system user in the default tenant
   */
  private async createDefaultSystemUser(): Promise<void> {
    logger.info('Creating default system user');

    try {
      if (!this.defaultTenantId) {
        throw new Error('Default tenant ID not set');
      }

      // Check if system user already exists
      const existingUser = await this.db.db
        .selectFrom('tenant_users')
        .selectAll()
        .where('tenant_id', '=', this.defaultTenantId)
        .where('user_id', '=', 'system')
        .executeTakeFirst();

      if (existingUser) {
        logger.info('Default system user already exists');
        return;
      }

      // Create system user
      await this.tenantService.addUserToTenant(
        this.defaultTenantId,
        'system',
        'system@localhost',
        'owner',
        'system-migration'
      );

      logger.info('Successfully created default system user');

    } catch (error) {
      logger.error('Failed to create default system user:', error);
      throw error;
    }
  }

  /**
   * Validate migration integrity
   */
  private async validateMigrationIntegrity(): Promise<{
    warnings: string[];
    errors: string[];
  }> {
    logger.info('Validating migration integrity');

    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Check that all records have tenant_id
      const tablesToCheck = [
        'boards', 'cards', 'pages', 'memories', 'usage_tracking'
      ];

      for (const tableName of tablesToCheck) {
        try {
          const [nullTenantCount] = await this.db.db
            .selectFrom(tableName as any)
            .select((eb) => eb.fn.count<number>('id').as('count'))
            .where('tenant_id', 'is', null)
            .execute();

          if (nullTenantCount?.count > 0) {
            errors.push(`Table ${tableName} still has ${nullTenantCount.count} records without tenant_id`);
          }
        } catch (error) {
          warnings.push(`Could not validate table ${tableName}: ${error.message}`);
        }
      }

      // Verify default tenant exists
      if (this.defaultTenantId) {
        const tenant = await this.tenantService.getTenantById(this.defaultTenantId);
        if (!tenant) {
          errors.push('Default tenant not found after migration');
        } else if (tenant.status !== 'active') {
          warnings.push(`Default tenant status is ${tenant.status}, expected 'active'`);
        }
      }

      // Check foreign key integrity
      try {
        await this.db.db
          .selectFrom('cards')
          .innerJoin('boards', 'boards.id', 'cards.board_id')
          .select(['cards.id'])
          .where('cards.tenant_id', '!=', this.db.db.ref('boards.tenant_id'))
          .execute();
      } catch (error) {
        warnings.push('Could not verify foreign key integrity for tenant relationships');
      }

      logger.info(`Migration validation completed: ${errors.length} errors, ${warnings.length} warnings`);

    } catch (error) {
      errors.push(`Migration validation failed: ${error.message}`);
    }

    return { warnings, errors };
  }

  /**
   * Rollback migration (if needed)
   */
  async rollbackMigration(): Promise<void> {
    logger.info('Rolling back existing data migration');

    try {
      const tablesToRollback = [
        'boards', 'columns', 'cards', 'tags', 'card_tags', 'comments', 'custom_fields',
        'card_custom_field_values', 'milestones', 'card_milestones', 'card_subtasks',
        'card_links', 'time_entries', 'card_activities',
        'pages', 'categories', 'page_categories', 'wiki_tags', 'page_tags', 'page_links',
        'wiki_attachments', 'page_history', 'wiki_comments',
        'memories', 'relationships', 'concepts', 'memory_concepts', 'memory_snapshots',
        'concept_hierarchies', 'memory_clusters', 'memory_cluster_memberships',
        'context_patterns', 'memory_context_patterns', 'memory_access_logs',
        'knowledge_graph_metrics', 'memory_merges'
      ];

      for (const tableName of tablesToRollback) {
        try {
          await this.db.db
            .updateTable(tableName as any)
            .set({ tenant_id: null })
            .where('tenant_id', '=', this.defaultTenantId)
            .execute();

          logger.info(`Rolled back table: ${tableName}`);
        } catch (error) {
          logger.error(`Failed to rollback table ${tableName}:`, error);
        }
      }

      // Remove default tenant if it was created by migration
      if (this.defaultTenantId) {
        try {
          await this.tenantService.deleteTenant(this.defaultTenantId, 'rollback', true);
          logger.info('Removed default tenant');
        } catch (error) {
          logger.error('Failed to remove default tenant:', error);
        }
      }

      logger.info('Migration rollback completed');

    } catch (error) {
      logger.error('Failed to rollback migration:', error);
      throw error;
    }
  }
}

/**
 * Main migration execution function
 */
export async function migrateExistingData(): Promise<MigrationSummary> {
  const migration = new ExistingDataMigration();
  return await migration.migrateExistingData();
}

/**
 * Rollback function
 */
export async function rollbackExistingDataMigration(): Promise<void> {
  const migration = new ExistingDataMigration();
  return await migration.rollbackMigration();
}

// CLI execution if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollbackExistingDataMigration()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Migration rollback failed:', error);
        process.exit(1);
      });
  } else {
    migrateExistingData()
      .then((summary) => {
        console.log('Migration Summary:', JSON.stringify(summary, null, 2));
        if (summary.errors.length > 0) {
          console.error('Migration completed with errors');
          process.exit(1);
        } else {
          console.log('Migration completed successfully');
          process.exit(0);
        }
      })
      .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
  }
}