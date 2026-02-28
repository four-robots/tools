import { z } from 'zod';
import type { Kysely } from 'kysely';
import { CronJob } from 'cron';
import {
  type SearchSchedule,
  type ScheduledSearch,
  type SearchExecution,
  SearchScheduleSchema,
} from '../../shared/types/saved-search.js';

/**
 * Search Scheduler Service
 * 
 * Handles automated search execution including:
 * - Schedule creation and management
 * - Cron job orchestration
 * - Execution history tracking
 * - Notification delivery
 * - Error handling and retries
 */
export class SearchSchedulerService {
  private activeJobs = new Map<string, CronJob>();
  
  constructor(
    private db: Kysely<any>,
    private notificationService?: any // Injectable notification service
  ) {
    // Initialize existing schedules on startup
    this.initializeExistingSchedules();
  }

  /**
   * Schedule a search for automated execution
   */
  async scheduleSearch(
    searchId: string,
    schedule: Omit<SearchSchedule, 'id' | 'searchId' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<ScheduledSearch> {
    // Validate search access
    await this.validateSearchAccess(searchId, userId);

    const scheduleData = {
      search_id: searchId,
      schedule_type: schedule.scheduleType,
      cron_expression: schedule.cronExpression || this.generateCronExpression(schedule.scheduleType),
      timezone: schedule.timezone,
      is_active: schedule.isActive,
      next_execution_at: this.calculateNextExecution(schedule),
      max_executions: schedule.maxExecutions,
      notification_settings: JSON.stringify(schedule.notificationSettings),
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [scheduledSearch] = await this.db
      .insertInto('search_schedules')
      .values(scheduleData)
      .returning('*')
      .execute();

    const transformedSchedule = this.transformScheduleFromDb(scheduledSearch);

    // Start the cron job if active
    if (transformedSchedule.isActive) {
      await this.startCronJob(transformedSchedule);
    }

    // Get the full scheduled search with search details
    return this.getScheduledSearchById(transformedSchedule.id, userId);
  }

  /**
   * Update an existing search schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<Omit<SearchSchedule, 'id' | 'searchId' | 'createdBy' | 'createdAt'>>,
    userId: string
  ): Promise<ScheduledSearch> {
    const existingSchedule = await this.getScheduleById(scheduleId);
    await this.validateSearchAccess(existingSchedule.searchId, userId);

    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.scheduleType !== undefined) {
      updateData.schedule_type = updates.scheduleType;
      updateData.cron_expression = updates.cronExpression || 
        this.generateCronExpression(updates.scheduleType);
    }
    if (updates.cronExpression !== undefined) updateData.cron_expression = updates.cronExpression;
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.maxExecutions !== undefined) updateData.max_executions = updates.maxExecutions;
    if (updates.notificationSettings !== undefined) {
      updateData.notification_settings = JSON.stringify(updates.notificationSettings);
    }

    // Recalculate next execution if schedule changed
    if (updates.scheduleType || updates.cronExpression || updates.timezone) {
      const tempSchedule = { ...existingSchedule, ...updates };
      updateData.next_execution_at = this.calculateNextExecution(tempSchedule);
    }

    const [updatedSchedule] = await this.db
      .updateTable('search_schedules')
      .set(updateData)
      .where('id', '=', scheduleId)
      .returning('*')
      .execute();

    const transformedSchedule = this.transformScheduleFromDb(updatedSchedule);

    // Restart cron job with new settings
    this.stopCronJob(scheduleId);
    if (transformedSchedule.isActive) {
      await this.startCronJob(transformedSchedule);
    }

    return this.getScheduledSearchById(scheduleId, userId);
  }

  /**
   * Delete a search schedule
   */
  async deleteSchedule(scheduleId: string, userId: string): Promise<void> {
    const schedule = await this.getScheduleById(scheduleId);
    await this.validateSearchAccess(schedule.searchId, userId);

    // Stop the cron job
    this.stopCronJob(scheduleId);

    // Delete from database
    await this.db
      .deleteFrom('search_schedules')
      .where('id', '=', scheduleId)
      .execute();
  }

  /**
   * Get all scheduled searches for a user
   */
  async getScheduledSearches(userId: string): Promise<ScheduledSearch[]> {
    const results = await this.db
      .selectFrom('search_schedules')
      .innerJoin('saved_searches', 'search_schedules.search_id', 'saved_searches.id')
      .selectAll('search_schedules')
      .select([
        'saved_searches.name as search_name',
        'saved_searches.description as search_description',
        'saved_searches.query_data',
        'saved_searches.owner_id',
        'saved_searches.is_public',
        'saved_searches.is_favorite',
        'saved_searches.execution_count',
        'saved_searches.last_executed_at',
        'saved_searches.tags',
        'saved_searches.metadata',
        'saved_searches.created_at as search_created_at',
        'saved_searches.updated_at as search_updated_at',
      ])
      .where('saved_searches.owner_id', '=', userId)
      .orderBy('search_schedules.created_at', 'desc')
      .execute();

    return results.map(row => this.transformScheduledSearchFromDb(row));
  }

  /**
   * Get execution history for a scheduled search
   */
  async getExecutionHistory(
    scheduleId: string, 
    userId: string,
    limit: number = 50
  ): Promise<SearchExecution[]> {
    const schedule = await this.getScheduleById(scheduleId);
    await this.validateSearchAccess(schedule.searchId, userId);

    const results = await this.db
      .selectFrom('search_executions')
      .selectAll()
      .where('schedule_id', '=', scheduleId)
      .orderBy('executed_at', 'desc')
      .limit(limit)
      .execute();

    return results.map(row => this.transformExecutionFromDb(row));
  }

  /**
   * Execute a scheduled search immediately (manual trigger)
   */
  async executeScheduledSearch(scheduleId: string, userId: string): Promise<SearchExecution> {
    const scheduledSearch = await this.getScheduledSearchById(scheduleId, userId);
    
    return this.executeSearch(scheduledSearch.search, scheduledSearch, 'manual', userId);
  }

  /**
   * Get next execution time for active schedules
   */
  async getUpcomingExecutions(userId: string, hours: number = 24): Promise<Array<{
    schedule: ScheduledSearch;
    nextExecution: Date;
  }>> {
    const cutoffTime = new Date(Date.now() + (hours * 60 * 60 * 1000));
    
    const results = await this.db
      .selectFrom('search_schedules')
      .innerJoin('saved_searches', 'search_schedules.search_id', 'saved_searches.id')
      .selectAll('search_schedules')
      .select([
        'saved_searches.name as search_name',
        'saved_searches.description as search_description',
        'saved_searches.query_data',
        'saved_searches.owner_id',
        'saved_searches.is_public',
        'saved_searches.is_favorite',
        'saved_searches.execution_count',
        'saved_searches.last_executed_at',
        'saved_searches.tags',
        'saved_searches.metadata',
        'saved_searches.created_at as search_created_at',
        'saved_searches.updated_at as search_updated_at',
      ])
      .where('saved_searches.owner_id', '=', userId)
      .where('search_schedules.is_active', '=', true)
      .where('search_schedules.next_execution_at', '<=', cutoffTime)
      .where('search_schedules.next_execution_at', '>', new Date())
      .orderBy('search_schedules.next_execution_at', 'asc')
      .execute();

    return results.map(row => ({
      schedule: this.transformScheduledSearchFromDb(row),
      nextExecution: row.next_execution_at,
    }));
  }

  // ============================================================================
  // BACKGROUND EXECUTION METHODS
  // ============================================================================

  /**
   * Initialize existing schedules on service startup
   */
  private async initializeExistingSchedules(): Promise<void> {
    const activeSchedules = await this.db
      .selectFrom('search_schedules')
      .selectAll()
      .where('is_active', '=', true)
      .where((eb) => eb.or([
        eb('max_executions', 'is', null),
        eb('execution_count', '<', eb.ref('max_executions'))
      ]))
      .execute();

    for (const schedule of activeSchedules) {
      const transformedSchedule = this.transformScheduleFromDb(schedule);
      await this.startCronJob(transformedSchedule);
    }

    console.log(`Initialized ${activeSchedules.length} active scheduled searches`);
  }

  /**
   * Start a cron job for a schedule
   */
  private async startCronJob(schedule: SearchSchedule): Promise<void> {
    if (this.activeJobs.has(schedule.id)) {
      this.stopCronJob(schedule.id);
    }

    try {
      const cronJob = new CronJob(
        schedule.cronExpression!,
        async () => {
          await this.executeCronJob(schedule.id);
        },
        null,
        true,
        schedule.timezone
      );

      this.activeJobs.set(schedule.id, cronJob);
      console.log(`Started cron job for schedule ${schedule.id}: ${schedule.cronExpression}`);
    } catch (error) {
      console.error(`Failed to start cron job for schedule ${schedule.id}:`, error);
      
      // Mark schedule as inactive if cron expression is invalid
      await this.db
        .updateTable('search_schedules')
        .set({ is_active: false })
        .where('id', '=', schedule.id)
        .execute();
    }
  }

  /**
   * Stop a cron job
   */
  private stopCronJob(scheduleId: string): void {
    const job = this.activeJobs.get(scheduleId);
    if (job) {
      job.stop();
      this.activeJobs.delete(scheduleId);
      console.log(`Stopped cron job for schedule ${scheduleId}`);
    }
  }

  /**
   * Execute a cron job (called by cron scheduler)
   */
  private async executeCronJob(scheduleId: string): Promise<void> {
    try {
      const schedule = await this.getScheduleById(scheduleId);
      const savedSearch = await this.getSavedSearchById(schedule.searchId);
      
      // Check if we've reached max executions
      if (schedule.maxExecutions && schedule.executionCount >= schedule.maxExecutions) {
        await this.deactivateSchedule(scheduleId, 'Max executions reached');
        return;
      }

      const scheduledSearch: ScheduledSearch = {
        ...schedule,
        search: savedSearch,
      };

      await this.executeSearch(savedSearch, scheduledSearch, 'scheduled');
      
      // Update next execution time
      await this.updateNextExecution(scheduleId, schedule);
      
    } catch (error) {
      console.error(`Error executing scheduled search ${scheduleId}:`, error);
      
      // Record the failed execution
      await this.db
        .insertInto('search_executions')
        .values({
          search_id: (await this.getScheduleById(scheduleId)).searchId,
          schedule_id: scheduleId,
          execution_type: 'scheduled',
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .execute();
    }
  }

  /**
   * Execute a search (either manual or scheduled)
   */
  private async executeSearch(
    savedSearch: any,
    scheduledSearch: ScheduledSearch,
    executionType: 'manual' | 'scheduled',
    userId?: string
  ): Promise<SearchExecution> {
    const executionStart = Date.now();
    
    try {
      // Execute the actual search (integrate with unified search service)
      const results = await this.simulateSearchExecution(savedSearch.queryData);
      
      const executionTime = Date.now() - executionStart;
      
      // Record successful execution
      const [execution] = await this.db
        .insertInto('search_executions')
        .values({
          search_id: savedSearch.id,
          schedule_id: scheduledSearch.id,
          execution_type: executionType,
          result_count: results.totalResults,
          execution_time_ms: executionTime,
          status: 'success',
          executed_by: userId,
        })
        .returning('*')
        .execute();

      // Update schedule execution count
      if (executionType === 'scheduled') {
        await this.db
          .updateTable('search_schedules')
          .set({
            execution_count: this.db.fn.coalesce(
              this.db.raw('execution_count + 1'),
              1
            ),
            last_execution_at: new Date(),
          })
          .where('id', '=', scheduledSearch.id)
          .execute();
      }

      // Send notifications if configured
      await this.sendNotifications(scheduledSearch, execution, results);
      
      return this.transformExecutionFromDb(execution);
      
    } catch (error) {
      const executionTime = Date.now() - executionStart;
      
      // Record failed execution
      const [execution] = await this.db
        .insertInto('search_executions')
        .values({
          search_id: savedSearch.id,
          schedule_id: scheduledSearch.id,
          execution_type: executionType,
          execution_time_ms: executionTime,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          executed_by: userId,
        })
        .returning('*')
        .execute();

      // Send error notification
      await this.sendErrorNotification(scheduledSearch, error);
      
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async getScheduleById(scheduleId: string): Promise<SearchSchedule> {
    const result = await this.db
      .selectFrom('search_schedules')
      .selectAll()
      .where('id', '=', scheduleId)
      .executeTakeFirst();

    if (!result) {
      throw new Error('Schedule not found');
    }

    return this.transformScheduleFromDb(result);
  }

  private async getScheduledSearchById(scheduleId: string, userId: string): Promise<ScheduledSearch> {
    const result = await this.db
      .selectFrom('search_schedules')
      .innerJoin('saved_searches', 'search_schedules.search_id', 'saved_searches.id')
      .selectAll('search_schedules')
      .select([
        'saved_searches.name as search_name',
        'saved_searches.description as search_description',
        'saved_searches.query_data',
        'saved_searches.owner_id',
        'saved_searches.is_public',
        'saved_searches.is_favorite',
        'saved_searches.execution_count',
        'saved_searches.last_executed_at',
        'saved_searches.tags',
        'saved_searches.metadata',
        'saved_searches.created_at as search_created_at',
        'saved_searches.updated_at as search_updated_at',
      ])
      .where('search_schedules.id', '=', scheduleId)
      .where('saved_searches.owner_id', '=', userId)
      .executeTakeFirst();

    if (!result) {
      throw new Error('Scheduled search not found or access denied');
    }

    return this.transformScheduledSearchFromDb(result);
  }

  private async getSavedSearchById(searchId: string): Promise<any> {
    const result = await this.db
      .selectFrom('saved_searches')
      .selectAll()
      .where('id', '=', searchId)
      .executeTakeFirst();

    if (!result) {
      throw new Error('Saved search not found');
    }

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      queryData: JSON.parse(result.query_data),
      ownerId: result.owner_id,
      isPublic: result.is_public,
      isFavorite: result.is_favorite,
      executionCount: result.execution_count,
      lastExecutedAt: result.last_executed_at,
      tags: result.tags || [],
      metadata: result.metadata || {},
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  private async validateSearchAccess(searchId: string, userId: string): Promise<void> {
    const search = await this.db
      .selectFrom('saved_searches')
      .select('owner_id')
      .where('id', '=', searchId)
      .executeTakeFirst();

    if (!search) {
      throw new Error('Search not found');
    }

    if (search.owner_id !== userId) {
      throw new Error('Access denied');
    }
  }

  private generateCronExpression(scheduleType: string): string {
    const expressions = {
      'daily': '0 9 * * *',     // 9 AM daily
      'weekly': '0 9 * * 1',    // 9 AM on Mondays
      'monthly': '0 9 1 * *',   // 9 AM on 1st of month
    };
    
    return expressions[scheduleType as keyof typeof expressions] || '0 9 * * *';
  }

  private calculateNextExecution(schedule: Partial<SearchSchedule>): Date | undefined {
    if (schedule.scheduleType === 'once') {
      return undefined; // Will be set manually
    }

    // For other schedule types, calculate based on current time and cron expression
    // This is a simplified calculation - in production, use a proper cron parser
    const now = new Date();
    
    switch (schedule.scheduleType) {
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow;
        
      case 'weekly':
        const nextWeek = new Date(now);
        const daysUntilMonday = (1 - now.getDay() + 7) % 7;
        nextWeek.setDate(now.getDate() + (daysUntilMonday || 7));
        nextWeek.setHours(9, 0, 0, 0);
        return nextWeek;
        
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1, 1);
        nextMonth.setHours(9, 0, 0, 0);
        return nextMonth;
        
      default:
        return undefined;
    }
  }

  private async updateNextExecution(scheduleId: string, schedule: SearchSchedule): Promise<void> {
    const nextExecution = this.calculateNextExecution(schedule);
    
    if (nextExecution) {
      await this.db
        .updateTable('search_schedules')
        .set({ next_execution_at: nextExecution })
        .where('id', '=', scheduleId)
        .execute();
    }
  }

  private async deactivateSchedule(scheduleId: string, reason: string): Promise<void> {
    await this.db
      .updateTable('search_schedules')
      .set({ 
        is_active: false,
        updated_at: new Date()
      })
      .where('id', '=', scheduleId)
      .execute();

    this.stopCronJob(scheduleId);
    console.log(`Deactivated schedule ${scheduleId}: ${reason}`);
  }

  private async sendNotifications(
    scheduledSearch: ScheduledSearch, 
    execution: any, 
    results: any
  ): Promise<void> {
    if (!this.notificationService) return;

    const settings = scheduledSearch.notificationSettings;
    
    if (settings.notifyOnSuccess && execution.status === 'success') {
      await this.notificationService.sendSearchExecutionNotification({
        search: scheduledSearch.search,
        execution,
        results: settings.includeResults ? results.results.slice(0, settings.maxResultsToInclude) : undefined,
        recipients: settings.emailRecipients,
        webhookUrl: settings.webhookUrl,
      });
    }
  }

  private async sendErrorNotification(scheduledSearch: ScheduledSearch, error: any): Promise<void> {
    if (!this.notificationService) return;

    const settings = scheduledSearch.notificationSettings;
    
    if (settings.notifyOnFailure) {
      await this.notificationService.sendSearchErrorNotification({
        search: scheduledSearch.search,
        error: error instanceof Error ? error.message : String(error),
        recipients: settings.emailRecipients,
        webhookUrl: settings.webhookUrl,
      });
    }
  }

  private async simulateSearchExecution(queryData: any): Promise<any> {
    // This would integrate with the actual unified search service
    // For now, return mock results
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    
    return {
      results: [],
      totalResults: Math.floor(Math.random() * 100),
      executionTime: Math.floor(Math.random() * 1000) + 100,
    };
  }

  private transformScheduleFromDb(row: any): SearchSchedule {
    return {
      id: row.id,
      searchId: row.search_id,
      scheduleType: row.schedule_type,
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      isActive: row.is_active,
      nextExecutionAt: row.next_execution_at,
      lastExecutionAt: row.last_execution_at,
      executionCount: row.execution_count || 0,
      maxExecutions: row.max_executions,
      notificationSettings: row.notification_settings ? JSON.parse(row.notification_settings) : {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private transformScheduledSearchFromDb(row: any): ScheduledSearch {
    return {
      id: row.id,
      searchId: row.search_id,
      scheduleType: row.schedule_type,
      cronExpression: row.cron_expression,
      timezone: row.timezone,
      isActive: row.is_active,
      nextExecutionAt: row.next_execution_at,
      lastExecutionAt: row.last_execution_at,
      executionCount: row.execution_count || 0,
      maxExecutions: row.max_executions,
      notificationSettings: row.notification_settings ? JSON.parse(row.notification_settings) : {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      search: {
        id: row.search_id,
        name: row.search_name,
        description: row.search_description,
        queryData: JSON.parse(row.query_data),
        ownerId: row.owner_id,
        isPublic: row.is_public,
        isFavorite: row.is_favorite,
        executionCount: row.execution_count,
        lastExecutedAt: row.last_executed_at,
        tags: row.tags || [],
        metadata: row.metadata || {},
        createdAt: row.search_created_at,
        updatedAt: row.search_updated_at,
      },
    };
  }

  private transformExecutionFromDb(row: any): SearchExecution {
    return {
      id: row.id,
      searchId: row.search_id,
      scheduleId: row.schedule_id,
      executionType: row.execution_type,
      resultCount: row.result_count,
      executionTimeMs: row.execution_time_ms,
      status: row.status,
      errorMessage: row.error_message,
      executedBy: row.executed_by,
      executedAt: row.executed_at,
    };
  }
}