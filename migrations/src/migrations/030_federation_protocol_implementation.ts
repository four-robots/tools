/**
 * Federation Protocol Implementation Migration
 * 
 * This migration implements the comprehensive federation protocol system for:
 * - Federation discovery protocol and service registry
 * - Secure inter-organization communication
 * - Distributed search orchestration
 * - Content syndication framework
 * - Federation governance and compliance
 * 
 * Database: PostgreSQL 12+ (builds on multi-tenant infrastructure)
 * Architecture: Distributed federation with zero-trust security
 * 
 * Created: January 2025
 * Implements: Work Item 4.2.2 - Federation Protocol Implementation
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const federationProtocolImplementation: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 030_federation_protocol_implementation (up)');
    logger.info('Creating federation protocol system with distributed search capabilities');

    // ===================
    // FEDERATION NODES AND DISCOVERY
    // ===================
    
    logger.info('Creating federation node registry tables...');

    // Federation nodes table - registry of remote MCP Tools instances
    await db.schema
      .createTable('federation_nodes')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('node_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('node_type', 'varchar(50)', (col) => col.notNull().defaultTo('mcp_tools'))
      .addColumn('organization_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('primary_endpoint', 'text', (col) => col.notNull())
      .addColumn('websocket_endpoint', 'text')
      .addColumn('api_version', 'varchar(20)', (col) => col.notNull().defaultTo('v1'))
      .addColumn('supported_protocols', 'jsonb', (col) => col.notNull().defaultTo('["http", "websocket"]'))
      .addColumn('capabilities', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('geographic_region', 'varchar(50)')
      .addColumn('data_classification', 'varchar(50)', (col) => col.notNull().defaultTo('general'))
      .addColumn('compliance_certifications', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('trust_score', 'decimal', (col) => col.notNull().defaultTo(0.0))
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('pending'))
      .addColumn('health_check_interval', 'integer', (col) => col.notNull().defaultTo(300))
      .addColumn('last_health_check', 'timestamp')
      .addColumn('health_status', 'varchar(50)', (col) => col.notNull().defaultTo('unknown'))
      .addColumn('response_time_ms', 'integer')
      .addColumn('uptime_percentage', 'decimal', (col) => col.defaultTo(0.0))
      .addColumn('authentication_method', 'varchar(50)', (col) => col.notNull().defaultTo('mutual_tls'))
      .addColumn('tls_certificate_fingerprint', 'varchar(255)')
      .addColumn('api_key_hash', 'varchar(255)')
      .addColumn('public_key', 'text')
      .addColumn('encryption_algorithm', 'varchar(50)', (col) => col.notNull().defaultTo('AES-256-GCM'))
      .addColumn('federation_metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('contact_information', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('verified_at', 'timestamp')
      .addColumn('verified_by', 'varchar(255)')
      .addUniqueConstraint('uk_federation_nodes_endpoint', ['primary_endpoint'])
      .execute();

    // Federation protocols table - supported communication protocols
    await db.schema
      .createTable('federation_protocols')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('node_id', 'uuid', (col) => col.notNull())
      .addColumn('protocol_name', 'varchar(100)', (col) => col.notNull())
      .addColumn('protocol_version', 'varchar(20)', (col) => col.notNull())
      .addColumn('endpoint_url', 'text', (col) => col.notNull())
      .addColumn('protocol_config', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('supported_operations', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('rate_limits', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('security_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('is_primary', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('is_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_protocols_node', ['node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_federation_protocols', ['node_id', 'protocol_name'])
      .execute();

    // Federation network topology - maps federation relationships
    await db.schema
      .createTable('federation_network_topology')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_node_id', 'uuid', (col) => col.notNull())
      .addColumn('target_node_id', 'uuid', (col) => col.notNull())
      .addColumn('relationship_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('connection_status', 'varchar(50)', (col) => col.notNull().defaultTo('pending'))
      .addColumn('routing_priority', 'integer', (col) => col.notNull().defaultTo(100))
      .addColumn('average_latency_ms', 'integer')
      .addColumn('bandwidth_mbps', 'integer')
      .addColumn('reliability_score', 'decimal', (col) => col.defaultTo(0.0))
      .addColumn('last_connection_test', 'timestamp')
      .addColumn('connection_metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_topology_source', ['source_node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_federation_topology_target', ['target_node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_federation_topology', ['source_node_id', 'target_node_id', 'relationship_type'])
      .execute();

    // ===================
    // DISTRIBUTED SEARCH ORCHESTRATION
    // ===================
    
    logger.info('Creating distributed search orchestration tables...');

    // Cross-organization searches table - tracks distributed queries
    await db.schema
      .createTable('cross_org_searches')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('search_session_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('originating_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('search_query', 'text', (col) => col.notNull())
      .addColumn('search_type', 'varchar(50)', (col) => col.notNull().defaultTo('unified'))
      .addColumn('search_scope', 'varchar(50)', (col) => col.notNull().defaultTo('federated'))
      .addColumn('target_nodes', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('search_filters', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('aggregation_strategy', 'varchar(50)', (col) => col.notNull().defaultTo('merge_rank'))
      .addColumn('max_results_per_node', 'integer', (col) => col.notNull().defaultTo(50))
      .addColumn('search_timeout_ms', 'integer', (col) => col.notNull().defaultTo(10000))
      .addColumn('privacy_level', 'varchar(50)', (col) => col.notNull().defaultTo('standard'))
      .addColumn('data_retention_policy', 'varchar(50)', (col) => col.notNull().defaultTo('7_days'))
      .addColumn('initiated_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('initiated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('completed_at', 'timestamp')
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('executing'))
      .addColumn('total_results_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('nodes_contacted', 'integer', (col) => col.defaultTo(0))
      .addColumn('nodes_responded', 'integer', (col) => col.defaultTo(0))
      .addColumn('execution_time_ms', 'integer')
      .addColumn('error_details', 'jsonb')
      .addColumn('search_metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addForeignKeyConstraint('fk_cross_org_searches_tenant', ['originating_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Search node responses table - tracks responses from each federation node
    await db.schema
      .createTable('search_node_responses')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('search_id', 'uuid', (col) => col.notNull())
      .addColumn('node_id', 'uuid', (col) => col.notNull())
      .addColumn('response_status', 'varchar(50)', (col) => col.notNull())
      .addColumn('results_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('response_time_ms', 'integer')
      .addColumn('results_data', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('ranking_metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('error_code', 'varchar(100)')
      .addColumn('error_message', 'text')
      .addColumn('partial_results', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('cache_hit', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('response_metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('received_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_search_node_responses_search', ['search_id'], 'cross_org_searches', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_search_node_responses_node', ['node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_search_node_responses', ['search_id', 'node_id'])
      .execute();

    // Search result aggregation table - stores final aggregated results
    await db.schema
      .createTable('search_result_aggregation')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('search_id', 'uuid', (col) => col.notNull())
      .addColumn('aggregated_results', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('result_ranking', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('deduplication_stats', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('performance_metrics', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('quality_scores', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('aggregation_algorithm', 'varchar(100)', (col) => col.notNull())
      .addColumn('aggregation_time_ms', 'integer')
      .addColumn('total_unique_results', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('duplicates_removed', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_search_result_aggregation_search', ['search_id'], 'cross_org_searches', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_search_result_aggregation_search', ['search_id'])
      .execute();

    // ===================
    // CONTENT SYNDICATION FRAMEWORK
    // ===================
    
    logger.info('Creating content syndication tables...');

    // Content syndication rules table - defines sharing policies
    await db.schema
      .createTable('content_syndication_rules')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('rule_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('rule_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('content_types', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('sharing_scope', 'varchar(50)', (col) => col.notNull().defaultTo('selective'))
      .addColumn('target_organizations', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('content_filters', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('permission_level', 'varchar(50)', (col) => col.notNull().defaultTo('read'))
      .addColumn('sync_frequency', 'varchar(50)', (col) => col.notNull().defaultTo('real_time'))
      .addColumn('data_classification', 'varchar(50)', (col) => col.notNull().defaultTo('public'))
      .addColumn('retention_period_days', 'integer', (col) => col.defaultTo(365))
      .addColumn('encryption_required', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('audit_trail_required', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('approval_workflow', 'varchar(50)', (col) => col.notNull().defaultTo('automatic'))
      .addColumn('compliance_tags', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('approved_by', 'varchar(255)')
      .addColumn('approved_at', 'timestamp')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_content_syndication_rules_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Syndicated content table - tracks shared content
    await db.schema
      .createTable('syndicated_content')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('source_content_id', 'varchar(255)', (col) => col.notNull())
      .addColumn('source_content_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('syndication_rule_id', 'uuid', (col) => col.notNull())
      .addColumn('content_hash', 'varchar(255)', (col) => col.notNull())
      .addColumn('content_summary', 'text')
      .addColumn('content_metadata', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('sharing_permissions', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('target_nodes', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('sync_status', 'varchar(50)', (col) => col.notNull().defaultTo('pending'))
      .addColumn('last_sync_attempt', 'timestamp')
      .addColumn('last_successful_sync', 'timestamp')
      .addColumn('sync_error_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('last_sync_error', 'text')
      .addColumn('version_number', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('change_detection_hash', 'varchar(255)')
      .addColumn('expires_at', 'timestamp')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_syndicated_content_tenant', ['source_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_syndicated_content_rule', ['syndication_rule_id'], 'content_syndication_rules', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_syndicated_content', ['source_tenant_id', 'source_content_id', 'source_content_type'])
      .execute();

    // Syndication webhooks table - manages real-time sync notifications
    await db.schema
      .createTable('syndication_webhooks')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('syndicated_content_id', 'uuid', (col) => col.notNull())
      .addColumn('target_node_id', 'uuid', (col) => col.notNull())
      .addColumn('webhook_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('delivery_status', 'varchar(50)', (col) => col.notNull().defaultTo('pending'))
      .addColumn('attempts_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('max_attempts', 'integer', (col) => col.notNull().defaultTo(3))
      .addColumn('next_attempt_at', 'timestamp')
      .addColumn('last_attempt_at', 'timestamp')
      .addColumn('response_status_code', 'integer')
      .addColumn('response_body', 'text')
      .addColumn('response_time_ms', 'integer')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('delivered_at', 'timestamp')
      .addForeignKeyConstraint('fk_syndication_webhooks_content', ['syndicated_content_id'], 'syndicated_content', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_syndication_webhooks_node', ['target_node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // ===================
    // FEDERATION GOVERNANCE AND COMPLIANCE
    // ===================
    
    logger.info('Creating federation governance tables...');

    // Federation compliance policies table
    await db.schema
      .createTable('federation_compliance_policies')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('policy_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('policy_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('regulatory_framework', 'varchar(100)', (col) => col.notNull())
      .addColumn('jurisdiction', 'varchar(100)', (col) => col.notNull())
      .addColumn('data_categories', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('processing_restrictions', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('retention_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('consent_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('cross_border_restrictions', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('audit_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('violation_penalties', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('enforcement_level', 'varchar(50)', (col) => col.notNull().defaultTo('strict'))
      .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('effective_date', 'timestamp', (col) => col.notNull())
      .addColumn('expiry_date', 'timestamp')
      .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('approved_by', 'varchar(255)')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_compliance_policies_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Data sovereignty controls table
    await db.schema
      .createTable('data_sovereignty_controls')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('data_category', 'varchar(100)', (col) => col.notNull())
      .addColumn('geographic_restrictions', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('allowed_jurisdictions', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('blocked_jurisdictions', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('transit_restrictions', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('storage_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('encryption_requirements', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('access_control_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('audit_trail_requirements', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('breach_notification_rules', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('data_residency_proof', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('compliance_certifications_required', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('is_enforced', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('violation_action', 'varchar(50)', (col) => col.notNull().defaultTo('block'))
      .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_data_sovereignty_controls_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_data_sovereignty_controls', ['tenant_id', 'data_category'])
      .execute();

    // Cross-organization audit trails table
    await db.schema
      .createTable('cross_org_audit_trails')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('target_tenant_id', 'uuid')
      .addColumn('target_node_id', 'uuid')
      .addColumn('activity_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('resource_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('resource_id', 'varchar(255)')
      .addColumn('action_performed', 'varchar(100)', (col) => col.notNull())
      .addColumn('data_categories_involved', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('jurisdictions_involved', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('compliance_policies_applied', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('consent_records', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('data_minimization_applied', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('encryption_details', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('access_controls_applied', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('purpose_limitation', 'text')
      .addColumn('retention_policy_id', 'varchar(255)')
      .addColumn('legal_basis', 'varchar(100)')
      .addColumn('user_id', 'varchar(255)')
      .addColumn('user_role', 'varchar(100)')
      .addColumn('ip_address', 'inet')
      .addColumn('user_agent', 'text')
      .addColumn('session_id', 'varchar(255)')
      .addColumn('request_id', 'varchar(255)')
      .addColumn('api_endpoint', 'text')
      .addColumn('request_payload_hash', 'varchar(255)')
      .addColumn('response_payload_hash', 'varchar(255)')
      .addColumn('processing_time_ms', 'integer')
      .addColumn('compliance_status', 'varchar(50)', (col) => col.notNull().defaultTo('compliant'))
      .addColumn('violation_details', 'jsonb')
      .addColumn('risk_score', 'decimal', (col) => col.defaultTo(0.0))
      .addColumn('privacy_impact_score', 'decimal', (col) => col.defaultTo(0.0))
      .addColumn('automated_decision_involved', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('human_review_required', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('blockchain_hash', 'varchar(255)')
      .addColumn('timestamp', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_cross_org_audit_trails_source', ['source_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_cross_org_audit_trails_target', ['target_tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('set null'))
      .addForeignKeyConstraint('fk_cross_org_audit_trails_node', ['target_node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('set null'))
      .execute();

    // ===================
    // SECURITY AND ENCRYPTION
    // ===================
    
    logger.info('Creating security and encryption tables...');

    // Federation certificates table - manages TLS certificates
    await db.schema
      .createTable('federation_certificates')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('certificate_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('certificate_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('certificate_pem', 'text', (col) => col.notNull())
      .addColumn('private_key_pem', 'text')
      .addColumn('certificate_chain_pem', 'text')
      .addColumn('fingerprint_sha256', 'varchar(255)', (col) => col.notNull())
      .addColumn('issuer_dn', 'text', (col) => col.notNull())
      .addColumn('subject_dn', 'text', (col) => col.notNull())
      .addColumn('subject_alt_names', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('valid_from', 'timestamp', (col) => col.notNull())
      .addColumn('valid_until', 'timestamp', (col) => col.notNull())
      .addColumn('key_algorithm', 'varchar(50)', (col) => col.notNull())
      .addColumn('key_size', 'integer', (col) => col.notNull())
      .addColumn('signature_algorithm', 'varchar(50)', (col) => col.notNull())
      .addColumn('is_ca_certificate', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('certificate_purpose', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('revocation_status', 'varchar(50)', (col) => col.notNull().defaultTo('valid'))
      .addColumn('revoked_at', 'timestamp')
      .addColumn('revocation_reason', 'varchar(100)')
      .addColumn('auto_renewal_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('renewal_threshold_days', 'integer', (col) => col.notNull().defaultTo(30))
      .addColumn('last_validation_check', 'timestamp')
      .addColumn('validation_status', 'varchar(50)', (col) => col.notNull().defaultTo('valid'))
      .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_certificates_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_federation_certificates_fingerprint', ['fingerprint_sha256'])
      .execute();

    // Federation API keys table - secure key exchange
    await db.schema
      .createTable('federation_api_keys')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('target_node_id', 'uuid', (col) => col.notNull())
      .addColumn('key_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('key_type', 'varchar(50)', (col) => col.notNull().defaultTo('federation'))
      .addColumn('key_hash', 'varchar(255)', (col) => col.notNull())
      .addColumn('key_prefix', 'varchar(20)', (col) => col.notNull())
      .addColumn('encryption_key_id', 'varchar(255)')
      .addColumn('permissions', 'jsonb', (col) => col.notNull().defaultTo('[]'))
      .addColumn('scopes', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('allowed_operations', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('rate_limit_per_minute', 'integer', (col) => col.defaultTo(100))
      .addColumn('rate_limit_per_hour', 'integer', (col) => col.defaultTo(1000))
      .addColumn('rate_limit_per_day', 'integer', (col) => col.defaultTo(10000))
      .addColumn('allowed_ip_ranges', 'jsonb', (col) => col.defaultTo('[]'))
      .addColumn('geo_restrictions', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
      .addColumn('expires_at', 'timestamp')
      .addColumn('last_used_at', 'timestamp')
      .addColumn('usage_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('rotation_schedule', 'varchar(50)', (col) => col.defaultTo('quarterly'))
      .addColumn('last_rotated_at', 'timestamp')
      .addColumn('next_rotation_at', 'timestamp')
      .addColumn('auto_rotation_enabled', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('compromise_detected', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('compromise_details', 'jsonb')
      .addColumn('created_by', 'varchar(255)', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_api_keys_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_federation_api_keys_node', ['target_node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_federation_api_keys_hash', ['key_hash'])
      .execute();

    // ===================
    // PERFORMANCE MONITORING
    // ===================
    
    logger.info('Creating performance monitoring tables...');

    // Federation performance metrics table
    await db.schema
      .createTable('federation_performance_metrics')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('node_id', 'uuid', (col) => col.notNull())
      .addColumn('metric_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('metric_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('metric_value', 'decimal', (col) => col.notNull())
      .addColumn('metric_unit', 'varchar(50)', (col) => col.notNull())
      .addColumn('measurement_window_start', 'timestamp', (col) => col.notNull())
      .addColumn('measurement_window_end', 'timestamp', (col) => col.notNull())
      .addColumn('aggregation_method', 'varchar(50)', (col) => col.notNull().defaultTo('average'))
      .addColumn('sample_count', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('percentile_data', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('threshold_breached', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('alert_triggered', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('recorded_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_performance_metrics_node', ['node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Circuit breaker states table
    await db.schema
      .createTable('federation_circuit_breakers')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('tenant_id', 'uuid', (col) => col.notNull())
      .addColumn('target_node_id', 'uuid', (col) => col.notNull())
      .addColumn('circuit_name', 'varchar(255)', (col) => col.notNull())
      .addColumn('operation_type', 'varchar(100)', (col) => col.notNull())
      .addColumn('current_state', 'varchar(50)', (col) => col.notNull().defaultTo('closed'))
      .addColumn('failure_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('success_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('failure_threshold', 'integer', (col) => col.notNull().defaultTo(5))
      .addColumn('success_threshold', 'integer', (col) => col.notNull().defaultTo(3))
      .addColumn('timeout_ms', 'integer', (col) => col.notNull().defaultTo(5000))
      .addColumn('recovery_timeout_ms', 'integer', (col) => col.notNull().defaultTo(60000))
      .addColumn('last_failure_at', 'timestamp')
      .addColumn('last_success_at', 'timestamp')
      .addColumn('opened_at', 'timestamp')
      .addColumn('half_open_at', 'timestamp')
      .addColumn('next_attempt_at', 'timestamp')
      .addColumn('consecutive_failures', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('consecutive_successes', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('configuration', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('last_state_change_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_federation_circuit_breakers_tenant', ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_federation_circuit_breakers_node', ['target_node_id'], 'federation_nodes', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_federation_circuit_breakers', ['tenant_id', 'target_node_id', 'operation_type'])
      .execute();

    // ===================
    // ADD TENANT_ID TO FEDERATION TABLES
    // ===================
    
    logger.info('Adding tenant_id columns to federation tables for RLS...');

    // Add tenant_id to federation tables that need tenant isolation
    const federationTablesToUpdate = [
      'federation_nodes',
      'federation_protocols', 
      'federation_network_topology',
      'cross_org_searches',
      'search_node_responses',
      'search_result_aggregation',
      'syndicated_content',
      'syndication_webhooks',
      'cross_org_audit_trails',
      'federation_performance_metrics',
      'federation_circuit_breakers'
    ];

    for (const table of federationTablesToUpdate) {
      // Skip tables that already have tenant_id
      if (!['cross_org_searches', 'syndicated_content', 'cross_org_audit_trails', 'federation_circuit_breakers'].includes(table)) {
        await db.schema
          .alterTable(table)
          .addColumn('tenant_id', 'uuid')
          .execute();

        // Add foreign key constraint
        await db.schema
          .alterTable(table)
          .addForeignKeyConstraint(`fk_${table}_tenant`, ['tenant_id'], 'tenants', ['id'], (cb) => cb.onDelete('restrict'))
          .execute();
      }

      // Create index for performance
      await db.schema
        .createIndex(`idx_${table}_tenant_id`)
        .on(table)
        .column('tenant_id')
        .execute();
    }

    // ===================
    // POPULATE TENANT_ID BEFORE ENABLING RLS
    // ===================
    
    logger.info('Populating tenant_id values before enabling RLS policies...');

    // First, ensure there's a default tenant for migration purposes
    const defaultTenantId = 'default-tenant-id';
    
    // Insert default tenant if it doesn't exist (for migration purposes only)
    await db
      .insertInto('tenants')
      .values({
        id: defaultTenantId,
        name: 'Default Migration Tenant',
        domain: 'migration.local',
        status: 'active',
        plan: 'enterprise',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();

    // Populate tenant_id for all federation tables that need it
    const tablesToPopulate = [
      'federation_nodes',
      'federation_protocols', 
      'federation_network_topology',
      'search_node_responses',
      'search_result_aggregation',
      'federation_performance_metrics'
    ];

    for (const table of tablesToPopulate) {
      logger.info(`Populating tenant_id for table: ${table}`);
      
      // Update all rows without tenant_id to use default tenant
      await sql`
        UPDATE ${sql.table(table)} 
        SET tenant_id = ${defaultTenantId} 
        WHERE tenant_id IS NULL
      `.execute(db);
      
      // Make tenant_id NOT NULL after populating
      await db.schema
        .alterTable(table)
        .alterColumn('tenant_id', (col) => col.setNotNull())
        .execute();
    }

    // ===================
    // RLS POLICIES FOR FEDERATION TABLES
    // ===================
    
    logger.info('Enabling RLS and creating policies for federation tables...');

    // Enable RLS on all federation tables
    const allFederationTables = [
      ...federationTablesToUpdate,
      'content_syndication_rules',
      'federation_compliance_policies', 
      'data_sovereignty_controls',
      'federation_certificates',
      'federation_api_keys'
    ];

    for (const table of allFederationTables) {
      // Enable RLS first
      await sql`ALTER TABLE ${sql.table(table)} ENABLE ROW LEVEL SECURITY`.execute(db);

      // Verify tenant_id column exists and is populated before creating policy
      const [columnExists] = await db
        .selectFrom('information_schema.columns' as any)
        .select((eb) => eb.fn.count<number>('column_name').as('count'))
        .where('table_name', '=', table)
        .where('column_name', '=', 'tenant_id')
        .execute();

      if (columnExists.count > 0) {
        // Create tenant isolation policy only if tenant_id column exists
        await sql`
          CREATE POLICY ${sql.identifier(`tenant_isolation_${table}`)} ON ${sql.table(table)}
          FOR ALL
          TO PUBLIC
          USING (tenant_id = get_current_tenant_id())
          WITH CHECK (tenant_id = get_current_tenant_id())
        `.execute(db);
        
        logger.info(`Created RLS policy for table: ${table}`);
      } else {
        logger.warn(`Skipping RLS policy for table ${table} - tenant_id column not found`);
      }
    }

    // ===================
    // PERFORMANCE INDEXES
    // ===================
    
    logger.info('Creating comprehensive performance indexes...');

    // Federation nodes indexes
    await db.schema
      .createIndex('idx_federation_nodes_status_health')
      .on('federation_nodes')
      .columns(['status', 'health_status'])
      .execute();

    await db.schema
      .createIndex('idx_federation_nodes_region_type')
      .on('federation_nodes')
      .columns(['geographic_region', 'node_type'])
      .execute();

    await db.schema
      .createIndex('idx_federation_nodes_trust_score')
      .on('federation_nodes')
      .column('trust_score')
      .execute();

    // Search orchestration indexes
    await db.schema
      .createIndex('idx_cross_org_searches_session_status')
      .on('cross_org_searches')
      .columns(['search_session_id', 'status'])
      .execute();

    await db.schema
      .createIndex('idx_cross_org_searches_tenant_initiated')
      .on('cross_org_searches')
      .columns(['originating_tenant_id', 'initiated_at'])
      .execute();

    await db.schema
      .createIndex('idx_search_node_responses_search_node')
      .on('search_node_responses')
      .columns(['search_id', 'node_id', 'response_status'])
      .execute();

    // Syndication indexes
    await db.schema
      .createIndex('idx_syndicated_content_hash_sync')
      .on('syndicated_content')
      .columns(['content_hash', 'sync_status'])
      .execute();

    await db.schema
      .createIndex('idx_syndicated_content_tenant_type')
      .on('syndicated_content')
      .columns(['source_tenant_id', 'source_content_type'])
      .execute();

    await db.schema
      .createIndex('idx_syndication_webhooks_status_attempts')
      .on('syndication_webhooks')
      .columns(['delivery_status', 'next_attempt_at'])
      .where('delivery_status', '!=', 'delivered')
      .execute();

    // Security and compliance indexes
    await db.schema
      .createIndex('idx_federation_certificates_valid_until')
      .on('federation_certificates')
      .columns(['valid_until', 'auto_renewal_enabled'])
      .execute();

    await db.schema
      .createIndex('idx_federation_api_keys_expires_rotation')
      .on('federation_api_keys')
      .columns(['expires_at', 'next_rotation_at'])
      .execute();

    await db.schema
      .createIndex('idx_cross_org_audit_trails_timestamp_type')
      .on('cross_org_audit_trails')
      .columns(['timestamp', 'activity_type'])
      .execute();

    await db.schema
      .createIndex('idx_cross_org_audit_trails_compliance_risk')
      .on('cross_org_audit_trails')
      .columns(['compliance_status', 'risk_score'])
      .execute();

    // Performance monitoring indexes
    await db.schema
      .createIndex('idx_federation_performance_metrics_node_recorded')
      .on('federation_performance_metrics')
      .columns(['node_id', 'recorded_at'])
      .execute();

    await db.schema
      .createIndex('idx_federation_circuit_breakers_state_next_attempt')
      .on('federation_circuit_breakers')
      .columns(['current_state', 'next_attempt_at'])
      .execute();

    logger.info('Migration 030_federation_protocol_implementation completed successfully');
    logger.info('Federation protocol system created with distributed search capabilities');
    logger.info('Secure inter-organization communication infrastructure ready');
    logger.info('Content syndication framework with governance controls enabled');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 030_federation_protocol_implementation (down)');
    logger.info('Rolling back federation protocol system');

    // Remove tenant_id columns from federation tables
    const federationTablesToUpdate = [
      'federation_nodes',
      'federation_protocols', 
      'federation_network_topology',
      'search_node_responses',
      'search_result_aggregation',
      'federation_performance_metrics'
    ];

    for (const table of federationTablesToUpdate) {
      await sql`ALTER TABLE ${sql.table(table)} DISABLE ROW LEVEL SECURITY`.execute(db);
      await db.schema.dropIndex(`idx_${table}_tenant_id`).ifExists().execute();
      await db.schema.alterTable(table).dropConstraint(`fk_${table}_tenant`).ifExists().execute();
      await db.schema.alterTable(table).dropColumn('tenant_id').ifExists().execute();
    }

    // Drop federation protocol tables in reverse order
    const federationTables = [
      'federation_circuit_breakers',
      'federation_performance_metrics',
      'federation_api_keys',
      'federation_certificates',
      'cross_org_audit_trails',
      'data_sovereignty_controls',
      'federation_compliance_policies',
      'syndication_webhooks',
      'syndicated_content',
      'content_syndication_rules',
      'search_result_aggregation',
      'search_node_responses',
      'cross_org_searches',
      'federation_network_topology',
      'federation_protocols',
      'federation_nodes'
    ];

    for (const table of federationTables) {
      await db.schema.dropTable(table).ifExists().execute();
    }

    logger.info('Migration 030_federation_protocol_implementation rollback completed');
    logger.info('Federation protocol system removed');
  }
};