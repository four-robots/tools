/**
 * Tenant Service Factory
 * 
 * Creates tenant-aware wrappers for existing services, providing:
 * - Automatic tenant context injection
 * - Tenant isolation enforcement
 * - Cross-tenant access control
 * - Resource quota checking
 * - Audit logging for multi-tenant operations
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { TenantContext, RESOURCE_TYPES } from '../../shared/types/multi-tenant.js';
import { TenantResourceService } from './tenant-resource-service.js';
import { TenantAuthenticationService } from './tenant-authentication-service.js';
import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';

/**
 * Wrapper interface for tenant-aware services
 */
interface TenantAwareService<T> {
  withTenant(tenantContext: TenantContext): T;
  withCrossTenantAccess(tenantContext: TenantContext, targetTenantIds: string[]): T;
  checkQuota(resourceType: string, usage?: number): Promise<boolean>;
}

/**
 * Base class for creating tenant-aware service wrappers
 */
export abstract class TenantAwareServiceWrapper<T> implements TenantAwareService<T> {
  protected tenantContext: TenantContext | null = null;
  protected crossTenantTargets: string[] = [];
  protected resourceService: TenantResourceService;
  protected authService: TenantAuthenticationService;
  protected db: DatabaseConnectionPool;

  constructor() {
    this.resourceService = new TenantResourceService();
    this.authService = new TenantAuthenticationService();
    this.db = new DatabaseConnectionPool();
  }

  /**
   * Set tenant context for all operations
   */
  withTenant(tenantContext: TenantContext): T {
    this.tenantContext = tenantContext;
    return this as unknown as T;
  }

  /**
   * Enable cross-tenant access for operations
   */
  withCrossTenantAccess(tenantContext: TenantContext, targetTenantIds: string[]): T {
    this.tenantContext = tenantContext;
    this.crossTenantTargets = targetTenantIds;
    return this as unknown as T;
  }

  /**
   * Check resource quota before operation
   */
  async checkQuota(resourceType: string, usage: number = 1): Promise<boolean> {
    if (!this.tenantContext?.tenant_id) return true;

    const quotaCheck = await this.resourceService.checkResourceQuota(
      this.tenantContext.tenant_id,
      resourceType as any,
      usage
    );

    return quotaCheck.allowed;
  }

  /**
   * Validate tenant context is set
   */
  protected ensureTenantContext(): TenantContext {
    if (!this.tenantContext) {
      throw new Error('Tenant context required - call withTenant() first');
    }
    return this.tenantContext;
  }

  /**
   * Set database context for RLS
   */
  protected async setDatabaseContext(): Promise<void> {
    const context = this.ensureTenantContext();
    
    try {
      await this.db.db
        .raw('SET app.current_tenant_id = ?', [context.tenant_id])
        .execute();

      if (context.user_id) {
        await this.db.db
          .raw('SET app.current_user_id = ?', [context.user_id])
          .execute();
      }
    } catch (error) {
      logger.error('Failed to set database context:', error);
    }
  }

  /**
   * Check if cross-tenant access is allowed
   */
  protected async validateCrossTenantAccess(targetTenantId: string, resourceType: string): Promise<boolean> {
    const context = this.ensureTenantContext();
    
    if (targetTenantId === context.tenant_id) return true;

    return await this.authService.hasCrossTenantAccess(
      context.tenant_id!,
      targetTenantId,
      resourceType,
      'read'
    );
  }

  /**
   * Log tenant activity
   */
  protected async logActivity(
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, any>
  ): Promise<void> {
    const context = this.ensureTenantContext();
    
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: context.tenant_id!,
          user_id: context.user_id,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          action_details: JSON.stringify(details),
          is_cross_tenant: this.crossTenantTargets.length > 0
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log tenant activity:', error);
    }
  }
}

/**
 * Tenant-aware Kanban Service Wrapper
 */
export class TenantAwareKanbanService extends TenantAwareServiceWrapper<TenantAwareKanbanService> {
  constructor(private kanbanService: any) {
    super();
  }

  /**
   * Create board with tenant isolation
   */
  async createBoard(boardData: any): Promise<any> {
    await this.setDatabaseContext();
    
    // Check quota
    const quotaAllowed = await this.checkQuota(RESOURCE_TYPES.STORAGE_GB, 0.1); // Estimate board size
    if (!quotaAllowed) {
      throw new Error('Storage quota exceeded');
    }

    const context = this.ensureTenantContext();
    const boardWithTenant = {
      ...boardData,
      tenant_id: context.tenant_id
    };

    const result = await this.kanbanService.createBoard(boardWithTenant);
    
    await this.logActivity('board_created', 'board', result.id, {
      board_name: boardData.name
    });

    return result;
  }

  /**
   * Get boards with tenant filtering
   */
  async getBoards(filters?: any): Promise<any[]> {
    await this.setDatabaseContext();
    const context = this.ensureTenantContext();

    const tenantFilters = {
      ...filters,
      tenant_id: context.tenant_id
    };

    return await this.kanbanService.getBoards(tenantFilters);
  }

  /**
   * Get board with cross-tenant support
   */
  async getBoard(boardId: string): Promise<any> {
    await this.setDatabaseContext();
    
    const board = await this.kanbanService.getBoard(boardId);
    if (!board) return null;

    // Check if cross-tenant access is needed
    const context = this.ensureTenantContext();
    if (board.tenant_id !== context.tenant_id) {
      const accessAllowed = await this.validateCrossTenantAccess(board.tenant_id, 'kanban_operations');
      if (!accessAllowed) {
        throw new Error('Cross-tenant access denied');
      }
    }

    return board;
  }
}

/**
 * Tenant-aware Wiki Service Wrapper
 */
export class TenantAwareWikiService extends TenantAwareServiceWrapper<TenantAwareWikiService> {
  constructor(private wikiService: any) {
    super();
  }

  /**
   * Create page with tenant isolation
   */
  async createPage(pageData: any): Promise<any> {
    await this.setDatabaseContext();
    
    // Check quota
    const quotaAllowed = await this.checkQuota(RESOURCE_TYPES.STORAGE_GB, 0.01);
    if (!quotaAllowed) {
      throw new Error('Storage quota exceeded');
    }

    const context = this.ensureTenantContext();
    const pageWithTenant = {
      ...pageData,
      tenant_id: context.tenant_id
    };

    const result = await this.wikiService.createPage(pageWithTenant);
    
    await this.logActivity('page_created', 'page', result.id, {
      page_title: pageData.title
    });

    return result;
  }

  /**
   * Search pages with tenant filtering
   */
  async searchPages(query: string, filters?: any): Promise<any[]> {
    await this.setDatabaseContext();
    
    // Check quota
    const quotaAllowed = await this.checkQuota(RESOURCE_TYPES.SEARCH_REQUESTS_PER_HOUR, 1);
    if (!quotaAllowed) {
      throw new Error('Search quota exceeded');
    }

    const context = this.ensureTenantContext();
    
    // Add tenant filtering
    const tenantFilters = {
      ...filters,
      tenant_id: this.crossTenantTargets.length > 0 
        ? [...this.crossTenantTargets, context.tenant_id]
        : [context.tenant_id]
    };

    const results = await this.wikiService.searchPages(query, tenantFilters);
    
    await this.logActivity('pages_searched', 'search', query, {
      query,
      results_count: results.length,
      cross_tenant: this.crossTenantTargets.length > 0
    });

    return results;
  }
}

/**
 * Tenant-aware Memory Service Wrapper
 */
export class TenantAwareMemoryService extends TenantAwareServiceWrapper<TenantAwareMemoryService> {
  constructor(private memoryService: any) {
    super();
  }

  /**
   * Store memory with tenant isolation
   */
  async storeMemory(memoryData: any): Promise<any> {
    await this.setDatabaseContext();
    
    const quotaAllowed = await this.checkQuota(RESOURCE_TYPES.STORAGE_GB, 0.001);
    if (!quotaAllowed) {
      throw new Error('Storage quota exceeded');
    }

    const context = this.ensureTenantContext();
    const memoryWithTenant = {
      ...memoryData,
      tenant_id: context.tenant_id
    };

    const result = await this.memoryService.storeMemory(memoryWithTenant);
    
    await this.logActivity('memory_stored', 'memory', result.id, {
      content_length: memoryData.content?.length || 0
    });

    return result;
  }

  /**
   * Search memories with tenant filtering
   */
  async searchMemories(query: string, options?: any): Promise<any[]> {
    await this.setDatabaseContext();
    
    const quotaAllowed = await this.checkQuota(RESOURCE_TYPES.SEARCH_REQUESTS_PER_HOUR, 1);
    if (!quotaAllowed) {
      throw new Error('Search quota exceeded');
    }

    const context = this.ensureTenantContext();
    
    const tenantOptions = {
      ...options,
      tenant_id: this.crossTenantTargets.length > 0 
        ? [...this.crossTenantTargets, context.tenant_id]
        : [context.tenant_id]
    };

    const results = await this.memoryService.searchMemories(query, tenantOptions);
    
    await this.logActivity('memories_searched', 'search', query, {
      query,
      results_count: results.length
    });

    return results;
  }
}

/**
 * Service Factory for creating tenant-aware wrappers
 */
export class TenantServiceFactory {
  private static instance: TenantServiceFactory;
  private services = new Map<string, any>();

  private constructor() {}

  static getInstance(): TenantServiceFactory {
    if (!TenantServiceFactory.instance) {
      TenantServiceFactory.instance = new TenantServiceFactory();
    }
    return TenantServiceFactory.instance;
  }

  /**
   * Register a service for tenant-aware wrapping
   */
  registerService<T>(name: string, service: T, wrapperClass: new (service: T) => any): void {
    this.services.set(name, { service, wrapperClass });
  }

  /**
   * Get tenant-aware service
   */
  getService<T>(name: string, tenantContext: TenantContext): T {
    const serviceConfig = this.services.get(name);
    if (!serviceConfig) {
      throw new Error(`Service ${name} not registered`);
    }

    const wrapper = new serviceConfig.wrapperClass(serviceConfig.service);
    return wrapper.withTenant(tenantContext);
  }

  /**
   * Get service with cross-tenant access
   */
  getServiceWithCrossTenantAccess<T>(
    name: string, 
    tenantContext: TenantContext, 
    targetTenantIds: string[]
  ): T {
    const serviceConfig = this.services.get(name);
    if (!serviceConfig) {
      throw new Error(`Service ${name} not registered`);
    }

    const wrapper = new serviceConfig.wrapperClass(serviceConfig.service);
    return wrapper.withCrossTenantAccess(tenantContext, targetTenantIds);
  }

  /**
   * Initialize default service registrations
   */
  static async initializeDefault(): Promise<void> {
    const factory = TenantServiceFactory.getInstance();
    
    try {
      // Import and register services dynamically
      const { KanbanService } = await import('../kanban/service.js');
      const { WikiService } = await import('../wiki/service.js');
      const { MemoryService } = await import('../memory/service.js');

      factory.registerService('kanban', new KanbanService(), TenantAwareKanbanService);
      factory.registerService('wiki', new WikiService(), TenantAwareWikiService);
      factory.registerService('memory', new MemoryService(), TenantAwareMemoryService);

      logger.info('Tenant service factory initialized with default services');
    } catch (error) {
      logger.error('Failed to initialize tenant service factory:', error);
    }
  }
}

// Convenience functions for easy service access
export const getTenantAwareService = <T>(name: string, tenantContext: TenantContext): T => {
  return TenantServiceFactory.getInstance().getService<T>(name, tenantContext);
};

export const getCrossTenantService = <T>(
  name: string, 
  tenantContext: TenantContext, 
  targetTenantIds: string[]
): T => {
  return TenantServiceFactory.getInstance().getServiceWithCrossTenantAccess<T>(
    name, 
    tenantContext, 
    targetTenantIds
  );
};

// TenantServiceFactory is already exported above as a class declaration