/**
 * Tenant Resource Service
 * 
 * Handles comprehensive tenant resource management including:
 * - Resource quota definition and enforcement
 * - Usage tracking and monitoring
 * - Billing and cost management
 * - Resource scaling and optimization
 * - Performance monitoring and alerts
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  TenantResourceQuota,
  TenantUsageMetric,
  TenantBillingRecord,
  TenantAlert,
  ResourceType,
  ResetPeriod,
  RESOURCE_TYPES
} from '../../shared/types/multi-tenant.js';
import { z } from 'zod';

interface ResourceUsageUpdate {
  resourceType: ResourceType;
  usage: number;
  metadata?: Record<string, any>;
}

interface QuotaConfiguration {
  resourceType: ResourceType;
  quotaLimit: number;
  softLimit?: number;
  hardLimit?: number;
  resetPeriod: ResetPeriod;
  alertThreshold?: number;
  isEnforced?: boolean;
}

interface UsageReport {
  tenantId: string;
  reportPeriod: {
    start: Date;
    end: Date;
  };
  resourceUsage: {
    resourceType: string;
    totalUsage: number;
    quotaLimit: number;
    utilizationPercentage: number;
    costUsd: number;
  }[];
  totalCost: number;
  quotaViolations: {
    resourceType: string;
    violationType: 'soft' | 'hard';
    timestamp: string;
  }[];
  recommendations: string[];
}

interface BillingPeriodSummary {
  tenantId: string;
  billingPeriod: {
    start: Date;
    end: Date;
  };
  usageSummary: Record<string, number>;
  costBreakdown: Record<string, number>;
  totalCost: number;
  currency: string;
}

export class TenantResourceService {
  private db: DatabaseConnectionPool;
  private quotaEnforcementEnabled: boolean;
  private billingEnabled: boolean;

  // Resource pricing per unit (in USD)
  private readonly RESOURCE_PRICING = {
    [RESOURCE_TYPES.STORAGE_GB]: 0.10,
    [RESOURCE_TYPES.API_CALLS_PER_DAY]: 0.001,
    [RESOURCE_TYPES.USERS]: 5.00,
    [RESOURCE_TYPES.SEARCH_REQUESTS_PER_HOUR]: 0.01,
    [RESOURCE_TYPES.FEDERATION_CONNECTIONS]: 10.00
  };

  constructor() {
    this.db = new DatabaseConnectionPool();
    this.quotaEnforcementEnabled = process.env.QUOTA_ENFORCEMENT_ENABLED !== 'false';
    this.billingEnabled = process.env.BILLING_ENABLED === 'true';
  }

  // ===================
  // QUOTA MANAGEMENT
  // ===================

  /**
   * Set resource quota for tenant
   */
  async setResourceQuota(
    tenantId: string,
    config: QuotaConfiguration,
    setBy: string
  ): Promise<TenantResourceQuota> {
    logger.info(`Setting resource quota for tenant ${tenantId}: ${config.resourceType} = ${config.quotaLimit}`);

    try {
      // Calculate next reset time
      const nextResetAt = this.calculateNextResetTime(config.resetPeriod);

      const [quota] = await this.db.db
        .insertInto('tenant_resource_quotas')
        .values({
          tenant_id: tenantId,
          resource_type: config.resourceType,
          quota_limit: config.quotaLimit,
          soft_limit: config.softLimit,
          hard_limit: config.hardLimit,
          reset_period: config.resetPeriod,
          next_reset_at: nextResetAt.toISOString(),
          alert_threshold: config.alertThreshold || 0.8,
          is_enforced: config.isEnforced !== false,
          metadata: JSON.stringify({ set_by: setBy })
        })
        .onConflict((oc) => oc
          .columns(['tenant_id', 'resource_type'])
          .doUpdateSet({
            quota_limit: config.quotaLimit,
            soft_limit: config.softLimit,
            hard_limit: config.hardLimit,
            reset_period: config.resetPeriod,
            next_reset_at: nextResetAt.toISOString(),
            alert_threshold: config.alertThreshold || 0.8,
            is_enforced: config.isEnforced !== false,
            updated_at: new Date().toISOString(),
            metadata: JSON.stringify({ set_by: setBy, updated_at: new Date().toISOString() })
          })
        )
        .returning([
          'id', 'tenant_id', 'resource_type', 'quota_limit',
          'current_usage', 'soft_limit', 'hard_limit',
          'reset_period', 'last_reset_at', 'next_reset_at',
          'alert_threshold', 'is_enforced', 'created_at', 'updated_at'
        ])
        .execute();

      // Log quota change
      await this.logResourceActivity(tenantId, 'quota_set', config.resourceType, quota.id, {
        new_limit: config.quotaLimit,
        previous_limit: null, // Would need to fetch previous value
        set_by: setBy
      });

      logger.info(`Successfully set resource quota for tenant ${tenantId}`);
      return quota as TenantResourceQuota;

    } catch (error) {
      logger.error('Failed to set resource quota:', error);
      throw new Error(`Failed to set resource quota: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get resource quotas for tenant
   */
  async getResourceQuotas(tenantId: string, resourceType?: ResourceType): Promise<TenantResourceQuota[]> {
    try {
      let query = this.db.db
        .selectFrom('tenant_resource_quotas')
        .selectAll()
        .where('tenant_id', '=', tenantId);

      if (resourceType) {
        query = query.where('resource_type', '=', resourceType);
      }

      const quotas = await query.execute();
      return quotas as TenantResourceQuota[];

    } catch (error) {
      logger.error('Failed to get resource quotas:', error);
      throw new Error(`Failed to get resource quotas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if resource usage is within quota (with atomic locking)
   */
  async checkResourceQuota(
    tenantId: string,
    resourceType: ResourceType,
    requestedUsage: number = 1
  ): Promise<{
    allowed: boolean;
    quota?: TenantResourceQuota;
    reason?: string;
    remainingQuota?: number;
  }> {
    try {
      // Use a transaction with row-level locking to prevent race conditions
      return await this.db.transaction(async (trx) => {
        // Lock the quota record for update to prevent concurrent modifications
        const quota = await trx
          .selectFrom('tenant_resource_quotas')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .where('resource_type', '=', resourceType)
          .forUpdate() // This prevents other transactions from reading/updating this row
          .executeTakeFirst();

        if (!quota) {
          // No quota defined - allow if quotas are not enforced globally
          return { allowed: !this.quotaEnforcementEnabled, reason: 'No quota defined' };
        }

        if (!quota.is_enforced) {
          return { allowed: true, quota: quota as TenantResourceQuota };
        }

        const projectedUsage = quota.current_usage + requestedUsage;
        
        // Check hard limit first
        if (quota.hard_limit && projectedUsage > quota.hard_limit) {
          return {
            allowed: false,
            quota: quota as TenantResourceQuota,
            reason: 'Hard limit exceeded',
            remainingQuota: Math.max(0, quota.hard_limit - quota.current_usage)
          };
        }

        // Check quota limit
        if (projectedUsage > quota.quota_limit) {
          return {
            allowed: false,
            quota: quota as TenantResourceQuota,
            reason: 'Quota limit exceeded',
            remainingQuota: Math.max(0, quota.quota_limit - quota.current_usage)
          };
        }

        return {
          allowed: true,
          quota: quota as TenantResourceQuota,
          remainingQuota: quota.quota_limit - quota.current_usage
        };
      });

    } catch (error) {
      logger.error('Failed to check resource quota:', error);
      // Default to deny if there's an error and enforcement is enabled
      return { 
        allowed: !this.quotaEnforcementEnabled, 
        reason: 'Error checking quota' 
      };
    }
  }

  // ===================
  // USAGE TRACKING
  // ===================

  /**
   * Record resource usage
   */
  async recordResourceUsage(
    tenantId: string,
    updates: ResourceUsageUpdate[]
  ): Promise<void> {
    logger.info(`Recording resource usage for tenant: ${tenantId}`);

    try {
      await this.db.transaction(async (trx) => {
        for (const update of updates) {
          // Update quota usage
          await trx
            .updateTable('tenant_resource_quotas')
            .set({
              current_usage: (eb) => eb('current_usage', '+', update.usage),
              updated_at: new Date().toISOString()
            })
            .where('tenant_id', '=', tenantId)
            .where('resource_type', '=', update.resourceType)
            .execute();

          // Record usage metric
          await trx
            .insertInto('tenant_usage_metrics')
            .values({
              tenant_id: tenantId,
              metric_name: update.resourceType,
              metric_value: update.usage,
              metric_unit: this.getResourceUnit(update.resourceType),
              measurement_period: 'real-time',
              period_start: new Date().toISOString(),
              period_end: new Date().toISOString(),
              metadata: JSON.stringify(update.metadata || {})
            })
            .execute();

          // Check for quota violations
          await this.checkAndCreateQuotaAlerts(trx, tenantId, update.resourceType);
        }
      });

      logger.info(`Successfully recorded resource usage for tenant: ${tenantId}`);

    } catch (error) {
      logger.error('Failed to record resource usage:', error);
      throw new Error(`Failed to record resource usage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get usage metrics for tenant
   */
  async getUsageMetrics(
    tenantId: string,
    options: {
      resourceType?: ResourceType;
      startDate?: Date;
      endDate?: Date;
      aggregationType?: 'sum' | 'average' | 'max' | 'min';
      groupBy?: 'hour' | 'day' | 'week' | 'month';
    } = {}
  ): Promise<TenantUsageMetric[]> {
    logger.info(`Getting usage metrics for tenant: ${tenantId}`);

    try {
      let query = this.db.db
        .selectFrom('tenant_usage_metrics')
        .selectAll()
        .where('tenant_id', '=', tenantId);

      if (options.resourceType) {
        query = query.where('metric_name', '=', options.resourceType);
      }

      if (options.startDate) {
        query = query.where('period_start', '>=', options.startDate.toISOString());
      }

      if (options.endDate) {
        query = query.where('period_end', '<=', options.endDate.toISOString());
      }

      if (options.aggregationType) {
        query = query.where('aggregation_type', '=', options.aggregationType);
      }

      const metrics = await query
        .orderBy('recorded_at', 'desc')
        .execute();

      return metrics as TenantUsageMetric[];

    } catch (error) {
      logger.error('Failed to get usage metrics:', error);
      throw new Error(`Failed to get usage metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate usage report
   */
  async generateUsageReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageReport> {
    logger.info(`Generating usage report for tenant ${tenantId}: ${startDate.toISOString()} - ${endDate.toISOString()}`);

    try {
      // Get resource usage data
      const usageData = await this.db.db
        .selectFrom('tenant_usage_metrics')
        .select(['metric_name', 'metric_value'])
        .where('tenant_id', '=', tenantId)
        .where('period_start', '>=', startDate.toISOString())
        .where('period_end', '<=', endDate.toISOString())
        .execute();

      // Get quotas for comparison
      const quotas = await this.getResourceQuotas(tenantId);
      const quotaMap = new Map(quotas.map(q => [q.resource_type, q]));

      // Aggregate usage by resource type
      const resourceUsageMap = new Map<string, number>();
      for (const usage of usageData) {
        const current = resourceUsageMap.get(usage.metric_name) || 0;
        resourceUsageMap.set(usage.metric_name, current + usage.metric_value);
      }

      // Build resource usage summary
      const resourceUsage = Array.from(resourceUsageMap.entries()).map(([resourceType, totalUsage]) => {
        const quota = quotaMap.get(resourceType);
        const quotaLimit = quota?.quota_limit || 0;
        const utilizationPercentage = quotaLimit > 0 ? (totalUsage / quotaLimit) * 100 : 0;
        const costUsd = totalUsage * (this.RESOURCE_PRICING[resourceType as ResourceType] || 0);

        return {
          resourceType,
          totalUsage,
          quotaLimit,
          utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
          costUsd: Math.round(costUsd * 100) / 100
        };
      });

      // Calculate total cost
      const totalCost = resourceUsage.reduce((sum, resource) => sum + resource.costUsd, 0);

      // Get quota violations
      const violations = await this.db.db
        .selectFrom('tenant_alerts')
        .select(['alert_data', 'created_at'])
        .where('tenant_id', '=', tenantId)
        .where('alert_type', 'in', ['quota_exceeded', 'quota_warning'])
        .where('created_at', '>=', startDate.toISOString())
        .where('created_at', '<=', endDate.toISOString())
        .execute();

      const quotaViolations = violations.map(v => {
        const alertData = JSON.parse(v.alert_data as string);
        return {
          resourceType: alertData.resource_type,
          violationType: alertData.violation_type || 'soft',
          timestamp: v.created_at
        };
      });

      // Generate recommendations
      const recommendations = this.generateRecommendations(resourceUsage, quotaViolations);

      return {
        tenantId,
        reportPeriod: { start: startDate, end: endDate },
        resourceUsage,
        totalCost: Math.round(totalCost * 100) / 100,
        quotaViolations,
        recommendations
      };

    } catch (error) {
      logger.error('Failed to generate usage report:', error);
      throw new Error(`Failed to generate usage report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // BILLING MANAGEMENT
  // ===================

  /**
   * Generate billing record for period
   */
  async generateBillingRecord(
    tenantId: string,
    billingPeriodStart: Date,
    billingPeriodEnd: Date
  ): Promise<TenantBillingRecord> {
    logger.info(`Generating billing record for tenant ${tenantId}: ${billingPeriodStart.toISOString()} - ${billingPeriodEnd.toISOString()}`);

    try {
      // Get usage data for the billing period
      const usageReport = await this.generateUsageReport(tenantId, billingPeriodStart, billingPeriodEnd);

      // Create usage summary
      const usageSummary: Record<string, number> = {};
      const costBreakdown: Record<string, number> = {};
      
      for (const resource of usageReport.resourceUsage) {
        usageSummary[resource.resourceType] = resource.totalUsage;
        costBreakdown[resource.resourceType] = resource.costUsd;
      }

      // Create billing record
      const [billingRecord] = await this.db.db
        .insertInto('tenant_billing_records')
        .values({
          tenant_id: tenantId,
          billing_period_start: billingPeriodStart.toISOString(),
          billing_period_end: billingPeriodEnd.toISOString(),
          usage_summary: JSON.stringify(usageSummary),
          cost_breakdown: JSON.stringify(costBreakdown),
          total_cost_usd: usageReport.totalCost,
          billing_status: 'draft'
        })
        .returning([
          'id', 'tenant_id', 'billing_period_start', 'billing_period_end',
          'usage_summary', 'cost_breakdown', 'total_cost_usd',
          'currency', 'billing_status', 'created_at', 'updated_at'
        ])
        .execute();

      // Log billing record creation
      await this.logResourceActivity(tenantId, 'billing_record_generated', 'billing', billingRecord.id, {
        billing_period: `${billingPeriodStart.toISOString()} - ${billingPeriodEnd.toISOString()}`,
        total_cost: usageReport.totalCost
      });

      logger.info(`Successfully generated billing record for tenant: ${tenantId}`);
      return billingRecord as TenantBillingRecord;

    } catch (error) {
      logger.error('Failed to generate billing record:', error);
      throw new Error(`Failed to generate billing record: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get billing records for tenant
   */
  async getBillingRecords(
    tenantId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      limit?: number;
    } = {}
  ): Promise<TenantBillingRecord[]> {
    try {
      let query = this.db.db
        .selectFrom('tenant_billing_records')
        .selectAll()
        .where('tenant_id', '=', tenantId);

      if (options.startDate) {
        query = query.where('billing_period_start', '>=', options.startDate.toISOString());
      }

      if (options.endDate) {
        query = query.where('billing_period_end', '<=', options.endDate.toISOString());
      }

      if (options.status) {
        query = query.where('billing_status', '=', options.status);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const records = await query
        .orderBy('billing_period_start', 'desc')
        .execute();

      return records as TenantBillingRecord[];

    } catch (error) {
      logger.error('Failed to get billing records:', error);
      throw new Error(`Failed to get billing records: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // QUOTA RESET AND MAINTENANCE
  // ===================

  /**
   * Reset quotas based on their reset periods
   */
  async resetExpiredQuotas(): Promise<number> {
    logger.info('Resetting expired quotas');

    try {
      const expiredQuotas = await this.db.db
        .selectFrom('tenant_resource_quotas')
        .select(['id', 'tenant_id', 'resource_type', 'reset_period'])
        .where('next_reset_at', '<=', new Date().toISOString())
        .where('is_enforced', '=', true)
        .execute();

      let resetCount = 0;

      for (const quota of expiredQuotas) {
        const nextResetAt = this.calculateNextResetTime(quota.reset_period as ResetPeriod);

        await this.db.db
          .updateTable('tenant_resource_quotas')
          .set({
            current_usage: 0,
            last_reset_at: new Date().toISOString(),
            next_reset_at: nextResetAt.toISOString(),
            updated_at: new Date().toISOString()
          })
          .where('id', '=', quota.id)
          .execute();

        // Log quota reset
        await this.logResourceActivity(quota.tenant_id, 'quota_reset', quota.resource_type, quota.id, {
          reset_period: quota.reset_period,
          next_reset_at: nextResetAt.toISOString()
        });

        resetCount++;
      }

      logger.info(`Successfully reset ${resetCount} expired quotas`);
      return resetCount;

    } catch (error) {
      logger.error('Failed to reset expired quotas:', error);
      throw new Error(`Failed to reset expired quotas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up old usage metrics
   */
  async cleanupOldMetrics(retentionDays: number = 90): Promise<number> {
    logger.info(`Cleaning up usage metrics older than ${retentionDays} days`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.db.db
        .deleteFrom('tenant_usage_metrics')
        .where('recorded_at', '<', cutoffDate.toISOString())
        .execute();

      const deletedCount = result.length || 0;
      logger.info(`Successfully cleaned up ${deletedCount} old usage metrics`);
      return deletedCount;

    } catch (error) {
      logger.error('Failed to cleanup old metrics:', error);
      throw new Error(`Failed to cleanup old metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // MONITORING AND ALERTS
  // ===================

  /**
   * Check all tenant quotas and create alerts for violations
   */
  async monitorQuotaUsage(): Promise<void> {
    logger.info('Monitoring quota usage across all tenants');

    try {
      const quotas = await this.db.db
        .selectFrom('tenant_resource_quotas')
        .selectAll()
        .where('is_enforced', '=', true)
        .execute();

      for (const quota of quotas) {
        await this.checkAndCreateQuotaAlerts(this.db.db, quota.tenant_id, quota.resource_type as ResourceType);
      }

      logger.info('Completed quota usage monitoring');

    } catch (error) {
      logger.error('Failed to monitor quota usage:', error);
      throw new Error(`Failed to monitor quota usage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Get resource utilization summary for tenant
   */
  async getResourceUtilization(tenantId: string): Promise<{
    resourceType: string;
    currentUsage: number;
    quotaLimit: number;
    utilizationPercentage: number;
    status: 'ok' | 'warning' | 'critical';
  }[]> {
    try {
      const quotas = await this.getResourceQuotas(tenantId);

      return quotas.map(quota => {
        const utilizationPercentage = quota.quota_limit > 0 
          ? (quota.current_usage / quota.quota_limit) * 100 
          : 0;

        let status: 'ok' | 'warning' | 'critical' = 'ok';
        if (utilizationPercentage >= 100) {
          status = 'critical';
        } else if (utilizationPercentage >= (quota.alert_threshold * 100)) {
          status = 'warning';
        }

        return {
          resourceType: quota.resource_type,
          currentUsage: quota.current_usage,
          quotaLimit: quota.quota_limit,
          utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
          status
        };
      });

    } catch (error) {
      logger.error('Failed to get resource utilization:', error);
      throw new Error(`Failed to get resource utilization: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private calculateNextResetTime(resetPeriod: ResetPeriod): Date {
    const now = new Date();
    const nextReset = new Date(now);

    switch (resetPeriod) {
      case 'hourly':
        nextReset.setHours(now.getHours() + 1, 0, 0, 0);
        break;
      case 'daily':
        nextReset.setDate(now.getDate() + 1);
        nextReset.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        const daysUntilMonday = (8 - now.getDay()) % 7;
        nextReset.setDate(now.getDate() + (daysUntilMonday || 7));
        nextReset.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        nextReset.setMonth(now.getMonth() + 1, 1);
        nextReset.setHours(0, 0, 0, 0);
        break;
      case 'yearly':
        nextReset.setFullYear(now.getFullYear() + 1, 0, 1);
        nextReset.setHours(0, 0, 0, 0);
        break;
    }

    return nextReset;
  }

  private getResourceUnit(resourceType: ResourceType): string {
    switch (resourceType) {
      case RESOURCE_TYPES.STORAGE_GB: return 'GB';
      case RESOURCE_TYPES.API_CALLS_PER_DAY: return 'calls';
      case RESOURCE_TYPES.USERS: return 'users';
      case RESOURCE_TYPES.SEARCH_REQUESTS_PER_HOUR: return 'requests';
      case RESOURCE_TYPES.FEDERATION_CONNECTIONS: return 'connections';
      default: return 'units';
    }
  }

  private async checkAndCreateQuotaAlerts(
    trx: any,
    tenantId: string,
    resourceType: ResourceType
  ): Promise<void> {
    try {
      const quota = await trx
        .selectFrom('tenant_resource_quotas')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('resource_type', '=', resourceType)
        .executeTakeFirst();

      if (!quota || !quota.is_enforced) return;

      const utilizationPercentage = quota.quota_limit > 0 
        ? quota.current_usage / quota.quota_limit 
        : 0;

      // Check for quota exceeded
      if (utilizationPercentage >= 1.0) {
        await this.createQuotaAlert(trx, tenantId, resourceType, 'critical', 'Quota Exceeded', {
          current_usage: quota.current_usage,
          quota_limit: quota.quota_limit,
          utilization_percentage: utilizationPercentage * 100
        });
      }
      // Check for approaching quota limit
      else if (utilizationPercentage >= quota.alert_threshold) {
        await this.createQuotaAlert(trx, tenantId, resourceType, 'warning', 'Quota Warning', {
          current_usage: quota.current_usage,
          quota_limit: quota.quota_limit,
          utilization_percentage: utilizationPercentage * 100,
          threshold_percentage: quota.alert_threshold * 100
        });
      }

    } catch (error) {
      logger.error('Failed to check quota alerts:', error);
    }
  }

  private async createQuotaAlert(
    trx: any,
    tenantId: string,
    resourceType: string,
    severity: 'warning' | 'critical',
    title: string,
    alertData: Record<string, any>
  ): Promise<void> {
    try {
      // Check if similar alert already exists and is active
      const existingAlert = await trx
        .selectFrom('tenant_alerts')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('alert_type', '=', severity === 'critical' ? 'quota_exceeded' : 'quota_warning')
        .where('status', '=', 'active')
        .where('alert_data', 'like', `%"resource_type":"${resourceType}"%`)
        .executeTakeFirst();

      if (existingAlert) return; // Don't create duplicate alerts

      await trx
        .insertInto('tenant_alerts')
        .values({
          tenant_id: tenantId,
          alert_type: severity === 'critical' ? 'quota_exceeded' : 'quota_warning',
          severity,
          title,
          message: `Resource ${resourceType} usage is at ${Math.round(alertData.utilization_percentage)}% of quota`,
          alert_data: JSON.stringify({ resource_type: resourceType, ...alertData })
        })
        .execute();

    } catch (error) {
      logger.error('Failed to create quota alert:', error);
    }
  }

  private generateRecommendations(
    resourceUsage: any[],
    quotaViolations: any[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for high utilization
    for (const resource of resourceUsage) {
      if (resource.utilizationPercentage > 90) {
        recommendations.push(`Consider increasing quota for ${resource.resourceType} (currently at ${resource.utilizationPercentage}%)`);
      }
    }

    // Check for frequent violations
    const violationsByResource = new Map();
    for (const violation of quotaViolations) {
      const count = violationsByResource.get(violation.resourceType) || 0;
      violationsByResource.set(violation.resourceType, count + 1);
    }

    for (const [resourceType, count] of violationsByResource) {
      if (count > 3) {
        recommendations.push(`Frequent quota violations for ${resourceType} (${count} violations) - consider upgrading tier`);
      }
    }

    // Cost optimization recommendations
    const highCostResources = resourceUsage
      .filter(r => r.costUsd > 100)
      .sort((a, b) => b.costUsd - a.costUsd);

    if (highCostResources.length > 0) {
      recommendations.push(`Review usage of high-cost resources: ${highCostResources.map(r => r.resourceType).join(', ')}`);
    }

    return recommendations;
  }

  private async logResourceActivity(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: tenantId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          action_details: JSON.stringify(details)
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log resource activity:', error);
    }
  }
}