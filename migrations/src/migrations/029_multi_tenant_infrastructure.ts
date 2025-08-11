/**
 * Multi-tenant Search Infrastructure Migration
 * 
 * This migration implements comprehensive multi-tenant architecture with:
 * - Tenant management and hierarchy
 * - Data isolation with row-level security (RLS) 
 * - Cross-tenant federation capabilities
 * - Tenant resource quotas and monitoring
 * - Complete audit trails for compliance
 * 
 * Database: PostgreSQL 12+ (required for RLS and UUID support)
 * Architecture: Multi-tenant with complete data isolation
 * 
 * Created: January 2025
 * Implements: Work Item 4.2.1 - Multi-tenant Search Infrastructure
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const multiTenantInfrastructure: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 029_multi_tenant_infrastructure (up)');
    logger.info('Creating multi-tenant architecture with complete data isolation');

    // ===================
    // TENANT CORE TABLES
    // ===================
    
    logger.info('Creating tenant core tables...');

    // Tenants table - main tenant registry
    await db.schema
      .createTable('tenants')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('slug', 'varchar(100)', (col) => col.notNull().unique())
      .addColumn('display_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
      .addColumn('tier', 'varchar(50)', (col) => col.notNull().defaultTo('standard'))
      .addColumn('parent_tenant_id', 'uuid')
      .addColumn('root_tenant_id', 'uuid')
      .addColumn('tenant_path', 'text', (col) => col.notNull().defaultTo(''))
      .addColumn('depth_level', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('is_organization', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('max_users', 'integer', (col) => col.defaultTo(100))
      .addColumn('max_storage_gb', 'integer', (col) => col.defaultTo(10))
      .addColumn('max_api_calls_per_day', 'integer', (col) => col.defaultTo(10000))
      .addColumn('federation_enabled', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('public_discovery', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('encryption_key_id', 'varchar(255)')
      .addColumn('data_region', 'varchar(50)', (col) => col.notNull().defaultTo('us-east-1'))
      .addColumn('compliance_requirements', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('branding_config', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('feature_flags', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('suspended_at', 'timestamp')
      .addColumn('deleted_at', 'timestamp')
      .addColumn('created_by', 'varchar(255)')
      .addForeignKeyConstraint('fk_tenants_parent', ['parent_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('restrict'))
      .addForeignKeyConstraint('fk_tenants_root', ['root_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Tenant users table - manages user membership in tenants
    await db.schema
      .createTable('tenant_users')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('user_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('email', 'varchar(255)', (col) => col.notNull())
      .addColumn('role', 'varchar(50)', (col) => col.notNull().defaultTo('member'))
      .addColumn('permissions', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
      .addColumn('joined_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('last_active_at', 'timestamp')
      .addColumn('invited_by', 'varchar(255)')
      .addColumn('invitation_accepted_at', 'timestamp')
      .addColumn('suspended_at', 'timestamp')
      .addColumn('suspended_by', 'varchar(255)')
      .addColumn('suspension_reason', 'text')
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_users_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_tenant_users', ['tenant_id', 'user_id'])
      .execute();

    // Tenant configurations table - tenant-specific settings
    await db.schema
      .createTable('tenant_configurations')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('config_category', 'varchar(100)', (col) => col.notNull())
      .addColumn('config_key', 'varchar(255)', (col) => col.notNull())
      .addColumn('config_value', 'jsonb', (col) => col.notNull())
      .addColumn('config_type', 'varchar(50)', (col) => col.notNull().defaultTo('user'))
      .addColumn('is_encrypted', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('is_inheritable', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('validation_schema', 'jsonb')
      .addColumn('description', 'text')
      .addColumn('created_by', 'varchar(255)')
      .addColumn('updated_by', 'varchar(255)')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_configurations_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_tenant_configurations', ['tenant_id', 'config_category', 'config_key'])
      .execute();

    // ===================
    // FEDERATION TABLES
    // ===================
    
    logger.info('Creating federation tables...');

    // Cross-tenant permissions table - manages federation relationships
    await db.schema
      .createTable('cross_tenant_permissions')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('target_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('permission_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('resource_types', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('access_level', 'varchar(50)', (col) => col.notNull().defaultTo('read'))
      .addColumn('conditions', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('pending'))
      .addColumn('expires_at', 'timestamp')
      .addColumn('granted_by', 'varchar(255)')
      .addColumn('granted_at', 'timestamp')
      .addColumn('requested_by', 'varchar(255)')
      .addColumn('requested_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('revoked_by', 'varchar(255)')
      .addColumn('revoked_at', 'timestamp')
      .addColumn('revocation_reason', 'text')
      .addColumn('usage_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('last_used_at', 'timestamp')
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_cross_tenant_permissions_source', ['source_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_cross_tenant_permissions_target', ['target_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_cross_tenant_permissions', ['source_tenant_id', 'target_tenant_id', 'permission_type'])
      .execute();

    // Tenant discovery table - manages tenant discovery for federation
    await db.schema
      .createTable('tenant_discovery')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('discoverable_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('discovery_tags', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('description', 'text')
      .addColumn('contact_info', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('capabilities', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('public_metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('discovery_enabled', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('auto_approve_requests', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('allowed_request_types', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('discovery_score', 'decimal', (col) => col.defaultTo(0.0))
      .addColumn('search_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('last_searched_at', 'timestamp')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_discovery_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Federation invitations table - manages cross-tenant collaboration invitations
    await db.schema
      .createTable('federation_invitations')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('inviting_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('invited_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('invitation_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('message', 'text')
      .addColumn('proposed_permissions', 'jsonb', (col) => col.notNull())
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('sent'))
      .addColumn('expires_at', 'timestamp', (col) => col.notNull())
      .addColumn('invited_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('responded_by', 'varchar(255)')
      .addColumn('response_message', 'text')
      .addColumn('responded_at', 'timestamp')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_invitations_inviting', ['inviting_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_federation_invitations_invited', ['invited_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // ===================
    // RESOURCE MANAGEMENT
    // ===================
    
    logger.info('Creating resource management tables...');

    // Tenant resource quotas table
    await db.schema
      .createTable('tenant_resource_quotas')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('resource_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('quota_limit', 'bigint', (col) => col.notNull())
      .addColumn('current_usage', 'bigint', (col) => col.notNull().defaultTo(0))
      .addColumn('soft_limit', 'bigint')
      .addColumn('hard_limit', 'bigint')
      .addColumn('reset_period', 'varchar(50)', (col) => col.defaultTo('monthly'))
      .addColumn('last_reset_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('next_reset_at', 'timestamp')
      .addColumn('alert_threshold', 'decimal', (col) => col.defaultTo(0.8))
      .addColumn('is_enforced', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_resource_quotas_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_tenant_resource_quotas', ['tenant_id', 'resource_type'])
      .execute();

    // Tenant usage metrics table
    await db.schema
      .createTable('tenant_usage_metrics')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('metric_name', 'varchar(100)', (col) => col.notNull())
      .addColumn('metric_value', 'decimal', (col) => col.notNull())
      .addColumn('metric_unit', 'varchar(50)', (col) => col.notNull())
      .addColumn('measurement_period', 'varchar(50)', (col) => col.notNull())
      .addColumn('period_start', 'timestamp', (col) => col.notNull())
      .addColumn('period_end', 'timestamp', (col) => col.notNull())
      .addColumn('aggregation_type', 'varchar(50)', (col) => col.notNull().defaultTo('sum'))
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('recorded_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_usage_metrics_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Tenant billing records table
    await db.schema
      .createTable('tenant_billing_records')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('billing_period_start', 'timestamp', (col) => col.notNull())
      .addColumn('billing_period_end', 'timestamp', (col) => col.notNull())
      .addColumn('usage_summary', 'jsonb', (col) => col.notNull())
      .addColumn('cost_breakdown', 'jsonb', (col) => col.notNull())
      .addColumn('total_cost_usd', 'decimal', (col) => col.notNull())
      .addColumn('currency', 'varchar(3)', (col) => col.notNull().defaultTo('USD'))
      .addColumn('billing_status', 'varchar(50)', (col) => col.notNull().defaultTo('draft'))
      .addColumn('invoice_id', 'varchar(255)')
      .addColumn('payment_status', 'varchar(50)')
      .addColumn('payment_date', 'timestamp')
      .addColumn('notes', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_billing_records_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // ===================
    // AUDIT AND MONITORING
    // ===================
    
    logger.info('Creating audit and monitoring tables...');

    // Tenant audit logs table
    await db.schema
      .createTable('tenant_audit_logs')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('actor_tenant_id', 'uuid')
      .addColumn('user_id', 'varchar(255)')
      .addColumn('action', 'varchar(100)', (col) => col.notNull())
      .addColumn('resource_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('resource_id', 'varchar(255)')
      .addColumn('resource_path', 'text')
      .addColumn('action_details', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('ip_address', 'inet')
      .addColumn('user_agent', 'text')
      .addColumn('session_id', 'varchar(255)')
      .addColumn('request_id', 'varchar(255)')
      .addColumn('is_cross_tenant', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('severity_level', 'varchar(20)', (col) => col.notNull().defaultTo('info'))
      .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('success'))
      .addColumn('error_message', 'text')
      .addColumn('duration_ms', 'integer')
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_audit_logs_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_tenant_audit_logs_actor', ['actor_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('set null'))
      .execute();

    // Tenant alerts table
    await db.schema
      .createTable('tenant_alerts')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('alert_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('severity', 'varchar(20)', (col) => col.notNull().defaultTo('medium'))
      .addColumn('title', 'varchar(255)', (col) => col.notNull())
      .addColumn('message', 'text', (col) => col.notNull())
      .addColumn('alert_data', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
      .addColumn('acknowledged_by', 'varchar(255)')
      .addColumn('acknowledged_at', 'timestamp')
      .addColumn('resolved_by', 'varchar(255)')
      .addColumn('resolved_at', 'timestamp')
      .addColumn('resolution_notes', 'text')
      .addColumn('notification_sent', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('notification_channels', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_alerts_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Tenant api keys table
    await db.schema
      .createTable('tenant_api_keys')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('key_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('key_hash', 'varchar(255)', (col) => col.notNull())
      .addColumn('key_prefix', 'varchar(20)', (col) => col.notNull())
      .addColumn('permissions', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('scopes', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('rate_limit_per_minute', 'integer', (col) => col.defaultTo(100))
      .addColumn('rate_limit_per_day', 'integer', (col) => col.defaultTo(10000))
      .addColumn('allowed_ips', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
      .addColumn('expires_at', 'timestamp')
      .addColumn('last_used_at', 'timestamp')
      .addColumn('usage_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_tenant_api_keys_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_tenant_api_keys_hash', ['key_hash'])
      .execute();

    // ===================
    // ADD TENANT COLUMNS TO EXISTING TABLES
    // ===================
    
    logger.info('Adding tenant_id columns to existing tables...');

    // List of all tables that need tenant_id column for RLS
    const tablesToUpdate = [
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

    for (const table of tablesToUpdate) {
      logger.info(`Adding tenant_id column to ${table} table`);
      await db.schema
        .alterTable(table)
        .addColumn('tenant_id', 'uuid')
        .execute();

      // Add foreign key constraint
      await db.schema
        .alterTable(table)
        .addForeignKeyConstraint(`fk_${table}_tenant`, ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('restrict'))
        .execute();

      // Create index for performance
      await db.schema
        .createIndex(`idx_${table}_tenant_id`)
        .on(table)
        .column('tenant_id')
        .execute();
    }

    // ===================
    // SECURE RLS VALIDATION FUNCTION
    // ===================
    
    logger.info('Creating secure tenant validation function...');

    // Create secure validation function that prevents SQL injection
    await sql`
      CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS uuid AS $$
      DECLARE
        tenant_setting TEXT;
        tenant_id UUID;
      BEGIN
        -- Get the setting with proper error handling
        BEGIN
          tenant_setting := current_setting('app.current_tenant_id', true);
        EXCEPTION
          WHEN OTHERS THEN
            RAISE EXCEPTION 'Tenant context not properly configured: %', SQLERRM;
        END;
        
        -- Validate the setting is not null or empty
        IF tenant_setting IS NULL OR tenant_setting = '' THEN
          RAISE EXCEPTION 'Tenant context not set - access denied';
        END IF;
        
        -- Validate UUID format with explicit casting
        BEGIN
          tenant_id := tenant_setting::uuid;
        EXCEPTION
          WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid tenant ID format - access denied';
          WHEN OTHERS THEN
            RAISE EXCEPTION 'Tenant ID validation failed: %', SQLERRM;
        END;
        
        -- Additional security check - verify tenant exists and is active
        IF NOT EXISTS (
          SELECT 1 FROM tenants 
          WHERE id = tenant_id 
          AND status = 'active' 
          AND deleted_at IS NULL
        ) THEN
          RAISE EXCEPTION 'Invalid or inactive tenant - access denied';
        END IF;
        
        RETURN tenant_id;
      EXCEPTION
        WHEN OTHERS THEN
          -- Log the security violation attempt
          RAISE EXCEPTION 'Tenant security validation failed: %', SQLERRM;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
    `.execute(db);

    // Create helper function for cross-tenant validation
    await sql`
      CREATE OR REPLACE FUNCTION validate_cross_tenant_access(
        source_tenant_id UUID, 
        target_tenant_id UUID, 
        resource_type TEXT
      ) RETURNS BOOLEAN AS $$
      BEGIN
        -- Self-access is always allowed
        IF source_tenant_id = target_tenant_id THEN
          RETURN TRUE;
        END IF;
        
        -- Check if cross-tenant permission exists and is valid
        RETURN EXISTS (
          SELECT 1 FROM cross_tenant_permissions 
          WHERE source_tenant_id = validate_cross_tenant_access.source_tenant_id
            AND target_tenant_id = validate_cross_tenant_access.target_tenant_id
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > NOW())
            AND resource_type = ANY(resource_types::text[])
        );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
    `.execute(db);

    // ===================
    // ROW LEVEL SECURITY POLICIES
    // ===================
    
    logger.info('Enabling Row Level Security and creating policies...');

    // Enable RLS on all tenant-scoped tables
    for (const table of tablesToUpdate) {
      await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(db);
    }

    // Enable RLS on tenant management tables
    const tenantTables = [
      'tenants', 'tenant_users', 'tenant_configurations', 'cross_tenant_permissions',
      'tenant_discovery', 'federation_invitations', 'tenant_resource_quotas',
      'tenant_usage_metrics', 'tenant_billing_records', 'tenant_audit_logs',
      'tenant_alerts', 'tenant_api_keys'
    ];

    for (const table of tenantTables) {
      await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(db);
    }

    // Create RLS policies for tenant isolation using secure function
    for (const table of tablesToUpdate) {
      // Policy for tenant members to access their own data
      await sql`
        CREATE POLICY ${sql.identifier(`tenant_isolation_${table}`)} ON ${sql.table(table)}
        FOR ALL
        TO PUBLIC
        USING (tenant_id = get_current_tenant_id())
        WITH CHECK (tenant_id = get_current_tenant_id())
      `.execute(db);

      // Policy for cross-tenant federation access
      await sql`
        CREATE POLICY ${sql.identifier(`federation_access_${table}`)} ON ${sql.table(table)}
        FOR SELECT
        TO PUBLIC
        USING (validate_cross_tenant_access(get_current_tenant_id(), tenant_id, '${table}'))
      `.execute(db);
    }

    // Tenant management table policies using secure functions
    await sql`
      CREATE POLICY tenant_self_access ON tenants
      FOR ALL TO PUBLIC
      USING (id = get_current_tenant_id())
      WITH CHECK (id = get_current_tenant_id())
    `.execute(db);

    await sql`
      CREATE POLICY tenant_users_access ON tenant_users
      FOR ALL TO PUBLIC
      USING (tenant_id = get_current_tenant_id())
      WITH CHECK (tenant_id = get_current_tenant_id())
    `.execute(db);

    // ===================
    // PERFORMANCE INDEXES
    // ===================
    
    logger.info('Creating performance indexes...');

    // Tenant core indexes
    await db.schema
      .createIndex('idx_tenants_slug')
      .on('tenants')
      .column('slug')
      .execute();

    await db.schema
      .createIndex('idx_tenants_parent_id')
      .on('tenants')
      .column('parent_tenant_id')
      .execute();

    await db.schema
      .createIndex('idx_tenants_status')
      .on('tenants')
      .column('status')
      .execute();

    await db.schema
      .createIndex('idx_tenant_users_user_id')
      .on('tenant_users')
      .column('user_id')
      .execute();

    await db.schema
      .createIndex('idx_tenant_users_email')
      .on('tenant_users')
      .column('email')
      .execute();

    // Federation indexes
    await db.schema
      .createIndex('idx_cross_tenant_permissions_source_target')
      .on('cross_tenant_permissions')
      .columns(['source_tenant_id', 'target_tenant_id'])
      .execute();

    await db.schema
      .createIndex('idx_cross_tenant_permissions_status_expires')
      .on('cross_tenant_permissions')
      .columns(['status', 'expires_at'])
      .execute();

    // Resource management indexes
    await db.schema
      .createIndex('idx_tenant_resource_quotas_resource_type')
      .on('tenant_resource_quotas')
      .column('resource_type')
      .execute();

    await db.schema
      .createIndex('idx_tenant_usage_metrics_period')
      .on('tenant_usage_metrics')
      .columns(['period_start', 'period_end'])
      .execute();

    // Audit indexes
    await db.schema
      .createIndex('idx_tenant_audit_logs_created_at')
      .on('tenant_audit_logs')
      .column('created_at')
      .execute();

    await db.schema
      .createIndex('idx_tenant_audit_logs_action_resource')
      .on('tenant_audit_logs')
      .columns(['action', 'resource_type'])
      .execute();

    // ADDITIONAL SECURITY AND PERFORMANCE INDEXES
    logger.info('Creating additional security and performance indexes...');

    // Composite index for tenant audit logs - critical for security monitoring
    await db.schema
      .createIndex('idx_tenant_audit_tenant_action_created')
      .on('tenant_audit_logs')
      .columns(['tenant_id', 'action', 'created_at'])
      .execute();

    // Cross-tenant permissions lookup optimization
    await db.schema
      .createIndex('idx_cross_tenant_permissions_lookup')
      .on('cross_tenant_permissions')
      .columns(['source_tenant_id', 'target_tenant_id', 'status'])
      .where('status', '=', 'active')
      .execute();

    // Active cross-tenant permissions with expiration check
    await db.schema
      .createIndex('idx_cross_tenant_active_expires')
      .on('cross_tenant_permissions')
      .columns(['status', 'expires_at'])
      .where('status', '=', 'active')
      .execute();

    // API key performance indexes
    await db.schema
      .createIndex('idx_tenant_api_keys_tenant_status')
      .on('tenant_api_keys')
      .columns(['tenant_id', 'status'])
      .execute();

    await db.schema
      .createIndex('idx_tenant_api_keys_prefix_status')
      .on('tenant_api_keys')
      .columns(['key_prefix', 'status'])
      .execute();

    // Tenant discovery performance
    await db.schema
      .createIndex('idx_tenant_discovery_enabled')
      .on('tenant_discovery')
      .columns(['discovery_enabled', 'discovery_score'])
      .where('discovery_enabled', '=', true)
      .execute();

    // Billing and usage indexes
    await db.schema
      .createIndex('idx_tenant_usage_metrics_tenant_period')
      .on('tenant_usage_metrics')
      .columns(['tenant_id', 'measurement_period', 'recorded_at'])
      .execute();

    await db.schema
      .createIndex('idx_tenant_billing_records_tenant_period')
      .on('tenant_billing_records')
      .columns(['tenant_id', 'billing_period_start', 'billing_period_end'])
      .execute();

    // Alert management indexes
    await db.schema
      .createIndex('idx_tenant_alerts_tenant_type_status')
      .on('tenant_alerts')
      .columns(['tenant_id', 'alert_type', 'status'])
      .execute();

    await db.schema
      .createIndex('idx_tenant_alerts_severity_created')
      .on('tenant_alerts')
      .columns(['severity', 'created_at'])
      .where('status', '=', 'active')
      .execute();

    // JWT token management indexes
    await db.schema
      .createIndex('idx_jwt_token_metadata_tenant_user_created')
      .on('jwt_token_metadata')
      .columns(['tenant_id', 'user_id', 'created_at'])
      .execute();

    // Resource quota monitoring indexes
    await db.schema
      .createIndex('idx_tenant_resource_quotas_usage_alert')
      .on('tenant_resource_quotas')
      .columns(['tenant_id', 'resource_type', 'current_usage', 'alert_threshold'])
      .where('is_enforced', '=', true)
      .execute();

    // Federation invitations index
    await db.schema
      .createIndex('idx_federation_invitations_invited_status')
      .on('federation_invitations')
      .columns(['invited_tenant_id', 'status', 'expires_at'])
      .execute();

    // JWT token management tables for authentication service
    logger.info('Creating JWT token management tables...');
    
    // Revoked tokens table for JWT blacklisting
    await db.schema
      .createTable('revoked_tokens')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('token_id', 'varchar(255)', (col) => col.notNull().unique())
      .addColumn('revoked_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('revoked_by', 'varchar(255)')
      .addColumn('reason', 'varchar(500)')
      .execute();

    // JWT token metadata for tracking
    await db.schema
      .createTable('jwt_token_metadata')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('token_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('user_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('session_id', 'varchar(255)')
      .addColumn('ip_address', 'inet')
      .addColumn('user_agent', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('expires_at', 'timestamp')
      .addForeignKeyConstraint('fk_jwt_token_metadata_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Indexes for JWT token tables
    await db.schema
      .createIndex('idx_revoked_tokens_token_id')
      .on('revoked_tokens')
      .column('token_id')
      .execute();

    await db.schema
      .createIndex('idx_jwt_token_metadata_tenant_user')
      .on('jwt_token_metadata')
      .columns(['tenant_id', 'user_id'])
      .execute();

    await db.schema
      .createIndex('idx_jwt_token_metadata_expires_at')
      .on('jwt_token_metadata')
      .column('expires_at')
      .execute();

    // ===================
    // DEFAULT TENANT CREATION
    // ===================
    
    logger.info('Creating default tenant for existing data migration...');

    // Create a default tenant for existing data
    await db
      .insertInto('tenants')
      .values({
        id: sql`gen_random_uuid()`,
        name: 'Default Organization',
        slug: 'default',
        display_name: 'Default Organization',
        description: 'Default tenant created during migration for existing data',
        status: 'active',
        tier: 'enterprise',
        is_organization: true,
        federation_enabled: false,
        public_discovery: false,
        created_by: 'system-migration'
      })
      .execute();

    logger.info('Migration 029_multi_tenant_infrastructure completed successfully');
    logger.info('Multi-tenant architecture created with complete data isolation');
    logger.info('Row Level Security enabled on all tenant-scoped tables');
    logger.info('Federation infrastructure ready for cross-tenant collaboration');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 029_multi_tenant_infrastructure (down)');
    logger.info('Rolling back multi-tenant architecture');

    // Remove tenant_id columns from existing tables
    const tablesToUpdate = [
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

    // Disable RLS and drop policies
    for (const table of tablesToUpdate) {
      await sql`ALTER TABLE ${sql.table(table)} DISABLE ROW LEVEL SECURITY`.execute(db);
      await db.schema.dropIndex(`idx_${table}_tenant_id`).ifExists().execute();
      await db.schema.alterTable(table).dropConstraint(`fk_${table}_tenant`).ifExists().execute();
      await db.schema.alterTable(table).dropColumn('tenant_id').ifExists().execute();
    }

    // Drop tenant management tables
    const tenantTables = [
      'tenant_api_keys',
      'tenant_alerts', 
      'tenant_audit_logs',
      'tenant_billing_records',
      'tenant_usage_metrics',
      'tenant_resource_quotas',
      'federation_invitations',
      'tenant_discovery',
      'cross_tenant_permissions',
      'tenant_configurations',
      'tenant_users',
      'tenants'
    ];

    for (const table of tenantTables) {
      await db.schema.dropTable(table).ifExists().execute();
    }

    logger.info('Migration 029_multi_tenant_infrastructure rollback completed');
    logger.info('Multi-tenant architecture removed');
  }
};