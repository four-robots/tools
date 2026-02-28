import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { ProductivityInsight, AnalyticsEvent } from '@mcp-tools/core';
import { PredictiveAnalyticsService, TaskCompletionPrediction, ProductivityForecast, WorkloadCapacityPrediction } from './PredictiveAnalytics.js';

interface PatternData {
  userId: string;
  timeRange: { start: Date; end: Date };
  events: AnalyticsEvent[];
  userMetrics: any;
}

interface InsightPattern {
  type: string;
  confidence: number;
  data: Record<string, any>;
  recommendation?: string;
}

export class InsightsEngine {
  private db: Pool;
  private redis: Redis;
  private predictiveAnalytics: PredictiveAnalyticsService;

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
    this.predictiveAnalytics = new PredictiveAnalyticsService(db, redis);
  }

  /**
   * Generate comprehensive productivity insights for a user
   */
  async generateInsights(userId: string): Promise<ProductivityInsight[]> {
    try {
      // Get user data for analysis
      const patternData = await this.gatherPatternData(userId);
      
      // Run all insight algorithms including predictive ones
      const patterns = await Promise.all([
        this.analyzePeakProductivityHours(patternData),
        this.analyzeTaskCompletionPatterns(patternData),
        this.analyzeCollaborationStyle(patternData),
        this.analyzeFeatureUsagePatterns(patternData),
        this.analyzeProductivityTrends(patternData),
        this.analyzeFocusPatterns(patternData),
        this.analyzeWorkloadDistribution(patternData),
        this.analyzeProcrastinationPatterns(patternData),
        // New predictive insights
        this.generateTaskCompletionPredictions(userId),
        this.generateProductivityForecasts(userId),
        this.generateWorkloadCapacityInsights(userId)
      ]);

      // Filter high-confidence insights
      const validPatterns = patterns.filter(p => p.confidence >= 0.6);

      // Convert patterns to insights
      const insights = validPatterns.map(pattern => 
        this.patternToInsight(userId, pattern)
      );

      // Store insights in database
      for (const insight of insights) {
        await this.storeInsight(insight);
      }

      return insights;
    } catch (error) {
      console.error('Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Gather comprehensive pattern data for analysis
   */
  private async gatherPatternData(userId: string): Promise<PatternData> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days

    // Get user events
    const eventsResult = await this.db.query(`
      SELECT * FROM analytics_events 
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
      ORDER BY created_at ASC
    `, [userId, startDate, endDate]);

    // Get user metrics
    const metricsResult = await this.db.query(`
      SELECT * FROM user_analytics 
      WHERE user_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date ASC
    `, [userId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

    return {
      userId,
      timeRange: { start: startDate, end: endDate },
      events: eventsResult.rows,
      userMetrics: metricsResult.rows
    };
  }

  /**
   * Analyze peak productivity hours using advanced pattern recognition
   */
  private async analyzePeakProductivityHours(data: PatternData): Promise<InsightPattern> {
    const hourlyActivity = new Map<number, { count: number; completions: number }>();
    
    // Initialize all hours
    for (let hour = 0; hour < 24; hour++) {
      hourlyActivity.set(hour, { count: 0, completions: 0 });
    }

    // Analyze events by hour
    data.events.forEach(event => {
      const hour = new Date(event.created_at!).getHours();
      const activity = hourlyActivity.get(hour)!;
      activity.count++;
      
      if (event.event_action === 'complete_task' || 
          event.event_action === 'create_page' || 
          event.event_action === 'store_memory') {
        activity.completions++;
      }
    });

    // Calculate productivity scores
    const productivityScores = Array.from(hourlyActivity.entries()).map(([hour, activity]) => ({
      hour,
      score: activity.count > 0 ? activity.completions / activity.count : 0,
      activity: activity.count
    }));

    // Find peak hours (top 25% with significant activity)
    const significantHours = productivityScores.filter(h => h.activity >= 3);
    const sortedHours = [...significantHours].sort((a, b) => b.score - a.score);
    const peakHours = sortedHours.slice(0, Math.ceil(sortedHours.length * 0.25)).map(h => h.hour);

    const avgScore = significantHours.length > 0
      ? significantHours.reduce((sum, h) => sum + h.score, 0) / significantHours.length
      : 0;
    const confidence = Math.min(0.9, 0.3 + (significantHours.length / 24) * 0.6);

    let recommendation = '';
    if (peakHours.length > 0) {
      const peakRange = this.formatHourRange(peakHours);
      recommendation = `Schedule important tasks during ${peakRange} when your productivity is highest. Avoid meetings during these hours when possible.`;
    }

    return {
      type: 'peak_hours',
      confidence,
      data: {
        peakHours,
        avgProductivityScore: avgScore,
        hourlyBreakdown: Object.fromEntries(hourlyActivity),
        analysisWindow: '30 days'
      },
      recommendation
    };
  }

  /**
   * Analyze task completion patterns and identify optimization opportunities
   */
  private async analyzeTaskCompletionPatterns(data: PatternData): Promise<InsightPattern> {
    const taskEvents = data.events.filter(e => 
      e.event_category === 'kanban' && 
      (e.event_action === 'create_task' || e.event_action === 'complete_task')
    );

    const dailyStats = new Map<string, { created: number; completed: number }>();
    
    taskEvents.forEach(event => {
      const date = new Date(event.created_at!).toISOString().split('T')[0];
      if (!dailyStats.has(date)) {
        dailyStats.set(date, { created: 0, completed: 0 });
      }
      
      const stats = dailyStats.get(date)!;
      if (event.event_action === 'create_task') stats.created++;
      if (event.event_action === 'complete_task') stats.completed++;
    });

    // Calculate patterns
    const dailyData = Array.from(dailyStats.entries()).map(([date, stats]) => ({
      date: new Date(date),
      ...stats,
      completionRate: stats.created > 0 ? stats.completed / stats.created : 0
    }));

    // Find best performing days
    const avgCompletionRate = dailyData.reduce((sum, d) => sum + d.completionRate, 0) / dailyData.length;
    const bestDays = dailyData
      .filter(d => d.completionRate > avgCompletionRate * 1.2 && d.created >= 2)
      .map(d => d.date.toLocaleDateString('en-US', { weekday: 'long' }));

    // Identify procrastination patterns
    const lowProductivityDays = dailyData
      .filter(d => d.created > 0 && d.completionRate < 0.3)
      .length;

    const confidence = Math.min(0.85, 0.4 + (dailyData.length / 30) * 0.45);

    let recommendation = '';
    if (bestDays.length > 0) {
      const uniqueDays = [...new Set(bestDays)];
      recommendation = `You're most productive on ${uniqueDays.join(' and ')}. `;
    }
    
    if (lowProductivityDays > 3) {
      recommendation += `Consider breaking large tasks into smaller chunks to improve completion rates.`;
    }

    return {
      type: 'task_patterns',
      confidence,
      data: {
        avgCompletionRate,
        bestDays: [...new Set(bestDays)],
        totalTasksCreated: dailyData.reduce((sum, d) => sum + d.created, 0),
        totalTasksCompleted: dailyData.reduce((sum, d) => sum + d.completed, 0),
        lowProductivityDays,
        dailyTrend: dailyData.slice(-7) // Last 7 days
      },
      recommendation
    };
  }

  /**
   * Analyze collaboration style and team interaction patterns
   */
  private async analyzeCollaborationStyle(data: PatternData): Promise<InsightPattern> {
    const collaborationEvents = data.events.filter(e => 
      e.event_action.includes('share') || 
      e.event_action.includes('comment') || 
      e.event_action.includes('collaborate')
    );

    const soloWorkEvents = data.events.filter(e => 
      e.event_category === 'kanban' || 
      e.event_category === 'wiki' || 
      e.event_category === 'memory'
    ).length;

    const collaborationRatio = soloWorkEvents > 0 ? 
      collaborationEvents.length / soloWorkEvents : 0;

    let style = 'Independent Worker';
    let description = 'You prefer working independently with minimal collaboration';
    
    if (collaborationRatio > 0.3) {
      style = 'Collaborative Team Player';
      description = 'You actively engage in team collaboration and knowledge sharing';
    } else if (collaborationRatio > 0.1) {
      style = 'Selective Collaborator';
      description = 'You collaborate when needed but also work well independently';
    }

    const confidence = Math.min(0.8, 0.5 + Math.min(collaborationEvents.length / 20, 0.3));

    const recommendation = collaborationRatio < 0.05 ? 
      'Consider increasing collaboration through comments and sharing to enhance team communication.' :
      'Your collaboration style is well-balanced. Continue engaging with your team as needed.';

    return {
      type: 'collaboration_style',
      confidence,
      data: {
        style,
        description,
        collaborationRatio,
        collaborationEvents: collaborationEvents.length,
        soloWorkEvents,
        weeklyCollaboration: this.getWeeklyBreakdown(collaborationEvents)
      },
      recommendation
    };
  }

  /**
   * Analyze feature usage patterns to identify preferences and optimization opportunities
   */
  private async analyzeFeatureUsagePatterns(data: PatternData): Promise<InsightPattern> {
    const featureUsage = new Map<string, number>();
    
    data.events.forEach(event => {
      const category = event.event_category;
      featureUsage.set(category, (featureUsage.get(category) || 0) + 1);
    });

    const totalUsage = Array.from(featureUsage.values()).reduce((sum, count) => sum + count, 0);
    const featurePreferences = Array.from(featureUsage.entries())
      .map(([feature, count]) => ({
        feature,
        count,
        percentage: (count / totalUsage) * 100
      }))
      .sort((a, b) => b.count - a.count);

    const primaryFeature = featurePreferences[0];
    const underutilizedFeatures = featurePreferences.filter(f => f.percentage < 10);

    const confidence = Math.min(0.9, 0.6 + (totalUsage / 100) * 0.3);

    let recommendation = '';
    if (primaryFeature && primaryFeature.percentage > 70) {
      recommendation = `You heavily use ${primaryFeature.feature}. `;
    }
    
    if (underutilizedFeatures.length > 0) {
      const features = underutilizedFeatures.map(f => f.feature).join(', ');
      recommendation += `Consider exploring ${features} to enhance your productivity workflow.`;
    }

    return {
      type: 'feature_usage',
      confidence,
      data: {
        primaryFeature: primaryFeature?.feature,
        featureDistribution: Object.fromEntries(featureUsage),
        underutilizedFeatures: underutilizedFeatures.map(f => f.feature),
        totalInteractions: totalUsage,
        diversityScore: featurePreferences.length > 1 ? 
          1 - (Math.max(...featurePreferences.map(f => f.percentage)) / 100) : 0
      },
      recommendation
    };
  }

  /**
   * Analyze productivity trends over time
   */
  private async analyzeProductivityTrends(data: PatternData): Promise<InsightPattern> {
    const weeklyMetrics = this.groupByWeek(data.userMetrics);
    
    if (weeklyMetrics.length < 2) {
      return {
        type: 'productivity_trends',
        confidence: 0.3,
        data: { trend: 'insufficient_data' },
        recommendation: 'Continue using the system to generate trend insights.'
      };
    }

    // Calculate weekly productivity scores
    const weeklyScores = weeklyMetrics.map(week => {
      const completionRate = week.tasks_created > 0 ? week.tasks_completed / week.tasks_created : 0;
      const activityScore = (week.actions_performed || 0) / 7; // Daily average
      return (completionRate * 0.7) + (Math.min(activityScore / 10, 1) * 0.3);
    });

    // Calculate trend
    const firstHalf = weeklyScores.slice(0, Math.floor(weeklyScores.length / 2));
    const secondHalf = weeklyScores.slice(Math.floor(weeklyScores.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((sum, score) => sum + score, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, score) => sum + score, 0) / secondHalf.length;
    
    const trendPercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    
    let trendDirection = 'stable';
    let recommendation = '';
    
    if (trendPercentage > 10) {
      trendDirection = 'improving';
      recommendation = 'Great progress! Your productivity is trending upward. Keep up the momentum.';
    } else if (trendPercentage < -10) {
      trendDirection = 'declining';
      recommendation = 'Your productivity has declined recently. Consider reviewing your workflow and removing blockers.';
    } else {
      trendDirection = 'stable';
      recommendation = 'Your productivity is consistent. Look for opportunities to optimize your most frequent tasks.';
    }

    const confidence = Math.min(0.85, 0.5 + (weeklyMetrics.length / 8) * 0.35);

    return {
      type: 'productivity_trends',
      confidence,
      data: {
        trend: trendDirection,
        trendPercentage,
        weeklyScores,
        currentScore: weeklyScores[weeklyScores.length - 1],
        avgScore: weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length
      },
      recommendation
    };
  }

  /**
   * Analyze focus and deep work patterns
   */
  private async analyzeFocusPatterns(data: PatternData): Promise<InsightPattern> {
    // Group events by sessions (gaps > 30 minutes indicate new session)
    const sessions = this.identifyWorkSessions(data.events);
    const focusSessions = sessions.filter(s => s.duration > 30 && s.eventCount > 5);
    
    const avgFocusTime = focusSessions.length > 0 ? 
      focusSessions.reduce((sum, s) => sum + s.duration, 0) / focusSessions.length : 0;
    
    const longestSession = Math.max(...sessions.map(s => s.duration), 0);
    const focusScore = Math.min(avgFocusTime / 120, 1); // Normalized to 2 hours max

    const confidence = Math.min(0.8, 0.4 + (sessions.length / 20) * 0.4);

    let recommendation = '';
    if (avgFocusTime < 45) {
      recommendation = 'Consider implementing longer focus blocks. Try the Pomodoro Technique or time-blocking.';
    } else if (avgFocusTime > 180) {
      recommendation = 'You have excellent focus! Consider taking regular breaks to maintain energy levels.';
    } else {
      recommendation = 'Your focus patterns are healthy. Maintain consistent work sessions.';
    }

    return {
      type: 'focus_patterns',
      confidence,
      data: {
        avgFocusTime,
        longestSession,
        focusScore,
        totalSessions: sessions.length,
        focusSessions: focusSessions.length,
        avgSessionLength: sessions.length > 0 ? 
          sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length : 0
      },
      recommendation
    };
  }

  /**
   * Analyze workload distribution patterns
   */
  private async analyzeWorkloadDistribution(data: PatternData): Promise<InsightPattern> {
    const dailyWorkload = new Map<string, number>();
    
    data.events.forEach(event => {
      const date = new Date(event.created_at!).toISOString().split('T')[0];
      dailyWorkload.set(date, (dailyWorkload.get(date) || 0) + 1);
    });

    const workloads = Array.from(dailyWorkload.values());
    const avgWorkload = workloads.length > 0 ? workloads.reduce((sum, w) => sum + w, 0) / workloads.length : 0;
    const maxWorkload = workloads.length > 0 ? Math.max(...workloads) : 0;
    const minWorkload = workloads.length > 0 ? Math.min(...workloads) : 0;

    // Calculate workload variance
    const variance = workloads.length > 0 ? workloads.reduce((sum, w) => sum + Math.pow(w - avgWorkload, 2), 0) / workloads.length : 0;
    const consistency = 1 - Math.min(variance / (avgWorkload * avgWorkload), 1);

    const confidence = Math.min(0.8, 0.5 + (workloads.length / 30) * 0.3);

    let recommendation = '';
    if (consistency < 0.3) {
      recommendation = 'Your workload varies significantly. Consider distributing tasks more evenly across days.';
    } else if (maxWorkload > avgWorkload * 2) {
      recommendation = 'You have some very heavy workload days. Try to spread tasks more evenly.';
    } else {
      recommendation = 'Your workload distribution is well-balanced.';
    }

    return {
      type: 'workload_distribution',
      confidence,
      data: {
        avgDailyWorkload: avgWorkload,
        maxWorkload,
        minWorkload,
        consistency,
        workingDays: workloads.length,
        variance
      },
      recommendation
    };
  }

  /**
   * Analyze procrastination and delay patterns
   */
  private async analyzeProcrastinationPatterns(data: PatternData): Promise<InsightPattern> {
    // Look for patterns of task creation without completion
    const taskCreations = data.events.filter(e => e.event_action === 'create_task');
    const taskCompletions = data.events.filter(e => e.event_action === 'complete_task');
    
    const incompleteTasks = taskCreations.length - taskCompletions.length;
    const procrastinationScore = taskCreations.length > 0 ? 
      incompleteTasks / taskCreations.length : 0;

    // Analyze time gaps between related actions
    const sessionGaps = this.analyzeSessionGaps(data.events);
    const avgGap = sessionGaps.reduce((sum, gap) => sum + gap, 0) / sessionGaps.length;
    
    const confidence = Math.min(0.75, 0.4 + (taskCreations.length / 30) * 0.35);

    let recommendation = '';
    if (procrastinationScore > 0.6) {
      recommendation = 'You create many tasks but complete fewer. Try breaking tasks into smaller, actionable items.';
    } else if (avgGap > 4 * 60) { // 4 hours
      recommendation = 'You have long gaps between activities. Consider setting reminders or time blocks.';
    } else {
      recommendation = 'Your task completion patterns look healthy.';
    }

    return {
      type: 'procrastination_patterns',
      confidence,
      data: {
        incompleteTasks,
        procrastinationScore,
        avgSessionGap: avgGap,
        taskCompletionRate: 1 - procrastinationScore,
        totalTasksCreated: taskCreations.length
      },
      recommendation
    };
  }

  // Helper methods
  private formatHourRange(hours: number[]): string {
    if (hours.length === 0) return '';
    const sorted = hours.sort((a, b) => a - b);
    const formatHour = (h: number) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
    
    if (sorted.length === 1) return formatHour(sorted[0]);
    
    const ranges: string[] = [];
    let start = sorted[0];
    let end = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? formatHour(start) : `${formatHour(start)}-${formatHour(end)}`);
        start = end = sorted[i];
      }
    }
    ranges.push(start === end ? formatHour(start) : `${formatHour(start)}-${formatHour(end)}`);
    
    return ranges.join(', ');
  }

  private getWeeklyBreakdown(events: any[]): Record<string, number> {
    const weekly = new Map<string, number>();
    events.forEach(event => {
      const week = this.getWeekKey(new Date(event.created_at));
      weekly.set(week, (weekly.get(week) || 0) + 1);
    });
    return Object.fromEntries(weekly);
  }

  private groupByWeek(metrics: any[]): any[] {
    const weeks = new Map<string, any>();
    
    metrics.forEach(metric => {
      const week = this.getWeekKey(new Date(metric.date));
      if (!weeks.has(week)) {
        weeks.set(week, {
          week,
          tasks_created: 0,
          tasks_completed: 0,
          actions_performed: 0,
          count: 0
        });
      }
      
      const weekData = weeks.get(week)!;
      weekData.tasks_created += metric.tasks_created || 0;
      weekData.tasks_completed += metric.tasks_completed || 0;
      weekData.actions_performed += metric.actions_performed || 0;
      weekData.count++;
    });

    return Array.from(weeks.values()).sort((a, b) => a.week.localeCompare(b.week));
  }

  private getWeekKey(date: Date): string {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    return startOfWeek.toISOString().split('T')[0];
  }

  private identifyWorkSessions(events: any[]): Array<{duration: number, eventCount: number, startTime: Date, endTime: Date}> {
    if (events.length === 0) return [];

    const sortedEvents = [...events].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const sessions = [];
    let sessionStart = new Date(sortedEvents[0].created_at);
    let sessionEnd = sessionStart;
    let eventCount = 1;

    for (let i = 1; i < sortedEvents.length; i++) {
      const currentTime = new Date(sortedEvents[i].created_at);
      const gap = (currentTime.getTime() - sessionEnd.getTime()) / (1000 * 60); // minutes

      if (gap > 30) { // New session after 30 minutes
        sessions.push({
          duration: (sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60),
          eventCount,
          startTime: sessionStart,
          endTime: sessionEnd
        });
        
        sessionStart = currentTime;
        eventCount = 1;
      } else {
        eventCount++;
      }
      
      sessionEnd = currentTime;
    }

    // Add final session
    sessions.push({
      duration: (sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60),
      eventCount,
      startTime: sessionStart,
      endTime: sessionEnd
    });

    return sessions;
  }

  private analyzeSessionGaps(events: any[]): number[] {
    const gaps = [];
    const sortedEvents = [...events].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (let i = 1; i < sortedEvents.length; i++) {
      const gap = (new Date(sortedEvents[i].created_at).getTime() - 
                   new Date(sortedEvents[i-1].created_at).getTime()) / (1000 * 60 * 60); // hours
      if (gap < 24) gaps.push(gap); // Only consider gaps within same day
    }

    return gaps;
  }

  private patternToInsight(userId: string, pattern: InsightPattern): ProductivityInsight {
    const titles = {
      peak_hours: 'Peak Productivity Hours Identified',
      task_patterns: 'Task Completion Pattern Analysis',
      collaboration_style: 'Collaboration Style Assessment',
      feature_usage: 'Feature Usage Optimization',
      productivity_trends: 'Productivity Trend Analysis',
      focus_patterns: 'Focus and Deep Work Assessment',
      workload_distribution: 'Workload Distribution Analysis',
      procrastination_patterns: 'Task Completion Behavior'
    };

    return {
      userId,
      insightType: pattern.type as any,
      title: titles[pattern.type as keyof typeof titles] || pattern.type,
      description: this.generateDescription(pattern),
      recommendation: pattern.recommendation,
      confidenceScore: pattern.confidence,
      dataPoints: pattern.data,
      timePeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      timePeriodEnd: new Date(),
      isActive: true,
      isRead: false
    };
  }

  private generateDescription(pattern: InsightPattern): string {
    switch (pattern.type) {
      case 'peak_hours':
        const hours = pattern.data.peakHours.length;
        return `Analysis of your activity shows ${hours} peak productivity hour${hours !== 1 ? 's' : ''} with ${(pattern.data.avgProductivityScore * 100).toFixed(0)}% completion rate.`;
      
      case 'task_patterns':
        const rate = (pattern.data.avgCompletionRate * 100).toFixed(0);
        return `Your average task completion rate is ${rate}%. You've completed ${pattern.data.totalTasksCompleted} out of ${pattern.data.totalTasksCreated} tasks.`;
      
      case 'collaboration_style':
        return `${pattern.data.description} with a collaboration ratio of ${(pattern.data.collaborationRatio * 100).toFixed(0)}%.`;
      
      case 'feature_usage':
        const primary = pattern.data.primaryFeature;
        return `Your primary feature is ${primary}, representing your main workflow focus. You've had ${pattern.data.totalInteractions} total interactions.`;
      
      case 'productivity_trends':
        const trend = pattern.data.trend;
        const percentage = Math.abs(pattern.data.trendPercentage).toFixed(0);
        return `Your productivity is ${trend}${trend !== 'stable' ? ` by ${percentage}%` : ''} over the analysis period.`;
      
      default:
        return `Analysis completed with ${(pattern.confidence * 100).toFixed(0)}% confidence.`;
    }
  }

  private async storeInsight(insight: ProductivityInsight): Promise<void> {
    await this.db.query(`
      INSERT INTO productivity_insights (
        user_id, insight_type, title, description, recommendation,
        confidence_score, data_points, time_period_start, time_period_end,
        is_active, is_read
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (user_id, insight_type) 
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        recommendation = EXCLUDED.recommendation,
        confidence_score = EXCLUDED.confidence_score,
        data_points = EXCLUDED.data_points,
        time_period_start = EXCLUDED.time_period_start,
        time_period_end = EXCLUDED.time_period_end,
        updated_at = NOW()
    `, [
      insight.userId,
      insight.insightType,
      insight.title,
      insight.description,
      insight.recommendation,
      insight.confidenceScore,
      JSON.stringify(insight.dataPoints),
      insight.timePeriodStart,
      insight.timePeriodEnd,
      insight.isActive,
      insight.isRead
    ]);
  }

  /**
   * Generate task completion predictions and convert to insights
   */
  private async generateTaskCompletionPredictions(userId: string): Promise<InsightPattern> {
    try {
      const prediction = await this.predictiveAnalytics.predictTaskCompletion(userId);
      
      return {
        type: 'task_completion_prediction',
        confidence: prediction.confidence,
        data: {
          estimatedCompletion: prediction.estimatedCompletion,
          factors: prediction.factors,
          recommendations: prediction.recommendations
        },
        recommendation: prediction.recommendations.length > 0 ? prediction.recommendations[0] : undefined
      };
    } catch (error) {
      console.error('Error generating task completion predictions:', error);
      return {
        type: 'task_completion_prediction',
        confidence: 0,
        data: {},
        recommendation: 'Unable to generate task completion predictions'
      };
    }
  }

  /**
   * Generate productivity forecasts and convert to insights
   */
  private async generateProductivityForecasts(userId: string): Promise<InsightPattern> {
    try {
      const forecast = await this.predictiveAnalytics.generateProductivityForecast(userId, 7);
      
      let recommendation = '';
      if (forecast.trendDirection === 'improving') {
        recommendation = `Your productivity is trending upward! Expected ${forecast.predictions.tasksCompleted} tasks this week.`;
      } else if (forecast.trendDirection === 'declining') {
        recommendation = `Your productivity shows a declining trend. Consider adjusting your approach.`;
      } else {
        recommendation = `Your productivity is stable. Expected ${forecast.predictions.tasksCompleted} tasks this week.`;
      }

      return {
        type: 'productivity_forecast',
        confidence: forecast.confidence,
        data: {
          forecast: forecast.predictions,
          trendDirection: forecast.trendDirection,
          seasonalFactors: forecast.seasonalFactors,
          peakHours: forecast.predictions.peakHours,
          lowEnergyPeriods: forecast.predictions.lowEnergyPeriods
        },
        recommendation
      };
    } catch (error) {
      console.error('Error generating productivity forecasts:', error);
      return {
        type: 'productivity_forecast',
        confidence: 0,
        data: {},
        recommendation: 'Unable to generate productivity forecasts'
      };
    }
  }

  /**
   * Generate workload capacity insights
   */
  private async generateWorkloadCapacityInsights(userId: string): Promise<InsightPattern> {
    try {
      const capacity = await this.predictiveAnalytics.predictWorkloadCapacity(userId);
      
      let recommendation = '';
      if (capacity.burnoutRisk > 0.7) {
        recommendation = `High burnout risk detected! Consider reducing workload by ${Math.round((capacity.currentCapacity - capacity.optimalCapacity) * 100 / capacity.currentCapacity)}%.`;
      } else if (capacity.currentCapacity < capacity.optimalCapacity * 0.8) {
        recommendation = `You have capacity for more work. Consider increasing tasks by ${Math.round((capacity.optimalCapacity - capacity.currentCapacity) * 100 / capacity.currentCapacity)}%.`;
      } else {
        recommendation = 'Your current workload appears well-balanced.';
      }

      return {
        type: 'workload_capacity',
        confidence: 0.8, // Fixed confidence for capacity insights
        data: {
          currentCapacity: capacity.currentCapacity,
          optimalCapacity: capacity.optimalCapacity,
          burnoutRisk: capacity.burnoutRisk,
          recommendations: capacity.recommendations,
          nextWeekForecast: capacity.nextWeekForecast
        },
        recommendation
      };
    } catch (error) {
      console.error('Error generating workload capacity insights:', error);
      return {
        type: 'workload_capacity',
        confidence: 0,
        data: {},
        recommendation: 'Unable to generate workload capacity insights'
      };
    }
  }

  /**
   * Train predictive models
   */
  async trainPredictiveModels(userId: string): Promise<void> {
    await this.predictiveAnalytics.trainModels(userId);
  }

  /**
   * Get specific task completion prediction
   */
  async getTaskCompletionPrediction(userId: string, taskId?: string, complexity?: number): Promise<TaskCompletionPrediction> {
    return this.predictiveAnalytics.predictTaskCompletion(userId, taskId, complexity);
  }

  /**
   * Get productivity forecast
   */
  async getProductivityForecast(userId: string, days: number = 7): Promise<ProductivityForecast> {
    return this.predictiveAnalytics.generateProductivityForecast(userId, days);
  }

  /**
   * Get workload capacity prediction
   */
  async getWorkloadCapacityPrediction(userId: string): Promise<WorkloadCapacityPrediction> {
    return this.predictiveAnalytics.predictWorkloadCapacity(userId);
  }
}

export default InsightsEngine;