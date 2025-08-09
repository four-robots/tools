/**
 * Custom migration provider that loads migrations from code
 * instead of files, ensuring all migrations are bundled in the container
 */

import { MigrationProvider, Migration } from 'kysely';
import { logger } from '../utils/logger.js';

// Import consolidated migration
import { initialSchemaComplete } from '../migrations/001_initial_schema_complete.js';
import * as scraperTables from '../migrations/002_scraper_tables.js';
import * as unifiedSearchFoundation from '../migrations/003_unified_search_foundation.js';
import { apiDocumentationDiscovery } from '../migrations/011_api_documentation_discovery.js';
import { codeRepositoryManagement } from '../migrations/012_code_repository_management.js';
import { codeAnalysis } from '../migrations/013_code_analysis.js';

/**
 * Migration registry that maps migration names to their implementations
 * 
 * Note: Since this app hasn't been released yet, we've consolidated all 
 * migrations into a single comprehensive schema migration for simplicity.
 */
const MIGRATION_REGISTRY: Record<string, Migration> = {
  '001_initial_schema_complete': initialSchemaComplete,
  '002_scraper_tables': scraperTables,
  '003_unified_search_foundation': unifiedSearchFoundation,
  '011_api_documentation_discovery': apiDocumentationDiscovery,
  '012_code_repository_management': codeRepositoryManagement,
  '013_code_analysis': codeAnalysis
};

/**
 * Custom migration provider that loads migrations from memory
 * This ensures all migrations are available in the container without
 * requiring file system access
 */
export class CodeMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    logger.info(`Loading ${Object.keys(MIGRATION_REGISTRY).length} migrations from registry`);
    
    // Validate all migrations have required methods
    for (const [name, migration] of Object.entries(MIGRATION_REGISTRY)) {
      if (!migration.up || typeof migration.up !== 'function') {
        throw new Error(`Migration ${name} is missing required 'up' method`);
      }
      
      if (!migration.down || typeof migration.down !== 'function') {
        throw new Error(`Migration ${name} is missing required 'down' method`);
      }
    }
    
    logger.debug('All migrations validated successfully');
    return MIGRATION_REGISTRY;
  }
}

/**
 * Factory function to create migration provider instance
 */
export function createMigrationProvider(): MigrationProvider {
  return new CodeMigrationProvider();
}

/**
 * Get list of available migration names in execution order
 */
export function getMigrationNames(): string[] {
  return Object.keys(MIGRATION_REGISTRY).sort();
}

/**
 * Get specific migration by name
 */
export function getMigration(name: string): Migration | undefined {
  return MIGRATION_REGISTRY[name];
}

/**
 * Validate migration registry integrity
 */
export function validateMigrationRegistry(): void {
  const names = getMigrationNames();
  
  // Check for proper naming convention
  for (const name of names) {
    if (!/^\d{3}_[a-z_]+$/.test(name)) {
      throw new Error(`Migration ${name} does not follow naming convention: 001_migration_name`);
    }
  }
  
  // Validate sequential numbering
  for (let i = 0; i < names.length; i++) {
    const expectedNumber = String(i + 1).padStart(3, '0');
    const name = names[i];
    if (!name.startsWith(`${expectedNumber}_`)) {
      throw new Error(`Migration ${name} should be numbered ${expectedNumber}_, found: ${name}`);
    }
  }
  
  logger.info(`Migration registry validated: ${names.length} migrations ready for execution`);
}