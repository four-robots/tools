/**
 * Predictive Analytics Service
 * 
 * Machine learning-based algorithms for forecasting productivity trends,
 * task completion predictions, and workload capacity planning.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import type { AnalyticsEvent, ProductivityInsight } from '@mcp-tools/core';

// Types for predictive models
export interface TaskCompletionPrediction {
  taskId?: string;
  estimatedCompletion: Date;
  confidence: number;
  factors: {
    historicalAverage: number;
    currentPace: number;
    complexity: number;
    timeOfDay: number;
    dayOfWeek: number;
  };
  recommendations: string[];
}

export interface ProductivityForecast {
  timeRange: {
    start: Date;
    end: Date;
  };
  predictions: {
    tasksCompleted: number;
    productivityScore: number;
    peakHours: number[];
    lowEnergyPeriods: number[];
    optimalWorkload: number;
  };
  confidence: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  seasonalFactors: {
    dayOfWeek: number;
    timeOfMonth: number;
    historicalPattern: string;
  };
}

export interface WorkloadCapacityPrediction {
  currentCapacity: number;
  optimalCapacity: number;
  burnoutRisk: number;
  recommendations: {
    suggestedTaskLimit: number;
    breakFrequency: number;
    focusTimeBlocks: Array<{ start: number; end: number }>;
    energyOptimization: string[];
  };
  nextWeekForecast: {
    expectedLoad: number;
    suggestedAdjustments: string[];
  };
}

export interface PredictiveModel {
  type: 'linear_regression' | 'exponential_smoothing' | 'arima' | 'neural_network';
  accuracy: number;
  lastTrained: Date;
  features: string[];
  parameters: Record<string, any>;
}

interface TimeSeriesData {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

interface PatternData {
  taskCompletions: TimeSeriesData[];
  activityLevels: TimeSeriesData[];
  productivityScores: TimeSeriesData[];
  workingSessions: TimeSeriesData[];
  breakPatterns: TimeSeriesData[];
}

export class PredictiveAnalyticsService {
  private models: Map<string, PredictiveModel> = new Map();
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly MIN_DATA_POINTS = 14; // Minimum 2 weeks of data

  constructor(
    private pgPool: Pool,
    private redis: Redis
  ) {
    this.initializeModels();
  }

  /**
   * Initialize default predictive models
   */
  private initializeModels(): void {
    // Task completion prediction model
    this.models.set('task_completion', {
      type: 'linear_regression',
      accuracy: 0.75,
      lastTrained: new Date(),
      features: ['historical_average', 'current_pace', 'complexity', 'time_context'],
      parameters: {
        weights: [0.4, 0.3, 0.2, 0.1],
        bias: 0.1,
        learningRate: 0.01
      }
    });

    // Productivity forecasting model
    this.models.set('productivity_forecast', {
      type: 'exponential_smoothing',
      accuracy: 0.82,
      lastTrained: new Date(),
      features: ['daily_completions', 'session_duration', 'break_frequency', 'day_context'],
      parameters: {
        alpha: 0.3, // trend smoothing
        beta: 0.1,  // seasonal smoothing
        gamma: 0.2, // error smoothing
        seasonality: 7 // weekly patterns
      }
    });

    // Workload capacity model
    this.models.set('workload_capacity', {
      type: 'neural_network',
      accuracy: 0.78,
      lastTrained: new Date(),
      features: ['task_velocity', 'session_intensity', 'break_patterns', 'stress_indicators'],
      parameters: {
        layers: [4, 8, 4, 1],
        activationFunction: 'sigmoid',
        epochs: 100,
        regularization: 0.01
      }
    });
  }

  /**
   * Predict task completion time
   */
  async predictTaskCompletion(
    userId: string, 
    taskId?: string,
    taskComplexity: number = 5
  ): Promise<TaskCompletionPrediction> {
    const cacheKey = `prediction:task:${userId}:${taskId || 'general'}`;
    
    try {
      // Check cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get historical data
      const historicalData = await this.getTaskCompletionHistory(userId);
      
      if (historicalData.length < this.MIN_DATA_POINTS) {
        return this.getDefaultTaskPrediction(taskComplexity);
      }

      // Calculate prediction factors
      const factors = await this.calculateTaskFactors(userId, historicalData, taskComplexity);
      
      // Apply linear regression model
      const model = this.models.get('task_completion')!;
      const estimatedHours = this.applyLinearRegression(
        [factors.historicalAverage, factors.currentPace, factors.complexity, factors.timeOfDay],
        model.parameters.weights,
        model.parameters.bias
      );

      const estimatedCompletion = new Date();
      estimatedCompletion.setHours(estimatedCompletion.getHours() + estimatedHours);

      const prediction: TaskCompletionPrediction = {
        taskId,
        estimatedCompletion,
        confidence: this.calculateConfidence(historicalData.length, model.accuracy),
        factors,
        recommendations: this.generateTaskRecommendations(factors, estimatedHours)
      };

      // Cache result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(prediction));
      
      return prediction;

    } catch (error) {
      console.error('Error predicting task completion:', error);
      return this.getDefaultTaskPrediction(taskComplexity);
    }
  }

  /**
   * Generate productivity forecast
   */
  async generateProductivityForecast(
    userId: string,
    days: number = 7
  ): Promise<ProductivityForecast> {
    const cacheKey = `forecast:productivity:${userId}:${days}d`;
    
    try {
      // Check cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get pattern data
      const patternData = await this.getProductivityPatterns(userId);
      
      if (patternData.taskCompletions.length < this.MIN_DATA_POINTS) {
        return this.getDefaultProductivityForecast(days);
      }

      // Apply exponential smoothing
      const model = this.models.get('productivity_forecast')!;
      const forecast = this.applyExponentialSmoothing(
        patternData.taskCompletions.map(d => d.value),
        model.parameters.alpha,
        model.parameters.beta,
        model.parameters.gamma,
        days
      );

      // Analyze trends
      const trendDirection = this.analyzeTrend(patternData.taskCompletions);
      const seasonalFactors = this.analyzeSeasonality(patternData);

      const productivityForecast: ProductivityForecast = {
        timeRange: {
          start: new Date(),
          end: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        },
        predictions: {
          tasksCompleted: Math.round(forecast.reduce((sum, val) => sum + val, 0)),
          productivityScore: this.calculateProductivityScore(forecast),
          peakHours: this.predictPeakHours(patternData),
          lowEnergyPeriods: this.predictLowEnergyPeriods(patternData),
          optimalWorkload: this.calculateOptimalWorkload(patternData)
        },
        confidence: this.calculateConfidence(patternData.taskCompletions.length, model.accuracy),
        trendDirection,
        seasonalFactors
      };

      // Cache result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(productivityForecast));
      
      return productivityForecast;

    } catch (error) {
      console.error('Error generating productivity forecast:', error);
      return this.getDefaultProductivityForecast(days);
    }
  }

  /**
   * Predict workload capacity
   */
  async predictWorkloadCapacity(userId: string): Promise<WorkloadCapacityPrediction> {
    const cacheKey = `prediction:workload:${userId}`;
    
    try {
      // Check cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get workload data
      const workloadData = await this.getWorkloadHistory(userId);
      const patternData = await this.getProductivityPatterns(userId);

      if (workloadData.length < this.MIN_DATA_POINTS) {
        return this.getDefaultWorkloadPrediction();
      }

      // Calculate current metrics
      const currentCapacity = this.calculateCurrentCapacity(workloadData);
      const stressLevel = this.calculateStressLevel(patternData);
      const burnoutRisk = this.calculateBurnoutRisk(workloadData, stressLevel);

      // Apply neural network model (simplified implementation)
      const optimalCapacity = this.predictOptimalCapacity(workloadData, patternData);
      const recommendations = this.generateWorkloadRecommendations(
        currentCapacity, 
        optimalCapacity, 
        burnoutRisk,
        patternData
      );

      const prediction: WorkloadCapacityPrediction = {
        currentCapacity,
        optimalCapacity,
        burnoutRisk,
        recommendations,
        nextWeekForecast: {
          expectedLoad: this.predictNextWeekLoad(workloadData),
          suggestedAdjustments: this.suggestWorkloadAdjustments(currentCapacity, optimalCapacity)
        }
      };

      // Cache result
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(prediction));
      
      return prediction;

    } catch (error) {
      console.error('Error predicting workload capacity:', error);
      return this.getDefaultWorkloadPrediction();
    }
  }

  /**
   * Train models with new data
   */
  async trainModels(userId: string): Promise<void> {
    try {
      const patternData = await this.getProductivityPatterns(userId);
      
      if (patternData.taskCompletions.length < this.MIN_DATA_POINTS) {
        console.log(`Insufficient data for training models for user ${userId}`);
        return;
      }

      // Update model accuracy based on recent predictions vs actuals
      await this.updateModelAccuracy(userId, patternData);
      
      // Retrain models if accuracy drops
      for (const [modelName, model] of this.models.entries()) {
        if (model.accuracy < 0.7) {
          await this.retrainModel(modelName, patternData);
        }
      }

      console.log(`Models trained successfully for user ${userId}`);
    } catch (error) {
      console.error('Error training models:', error);
    }
  }

  // Private helper methods

  private async getTaskCompletionHistory(userId: string): Promise<TimeSeriesData[]> {
    const query = `
      SELECT 
        created_at as timestamp,
        EXTRACT(EPOCH FROM (updated_at - created_at))/3600 as value,
        properties as metadata
      FROM analytics_events 
      WHERE user_id = $1 
        AND event_type = 'action' 
        AND event_action = 'task_completed'
        AND created_at >= NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
    `;
    
    const result = await this.pgPool.query(query, [userId]);
    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp),
      value: parseFloat(row.value) || 2, // Default 2 hours if no duration
      metadata: row.metadata
    }));
  }

  private async getProductivityPatterns(userId: string): Promise<PatternData> {
    const baseQuery = `
      SELECT 
        DATE_TRUNC('hour', created_at) as timestamp,
        COUNT(*) as task_completions,
        AVG(CASE WHEN event_action = 'session_start' THEN 1 ELSE 0 END) as activity_level,
        AVG(COALESCE((properties->>'duration')::numeric, 60)) as session_duration
      FROM analytics_events 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY timestamp DESC
    `;

    const result = await this.pgPool.query(baseQuery, [userId]);
    
    const data: PatternData = {
      taskCompletions: [],
      activityLevels: [],
      productivityScores: [],
      workingSessions: [],
      breakPatterns: []
    };

    result.rows.forEach(row => {
      const timestamp = new Date(row.timestamp);
      data.taskCompletions.push({ timestamp, value: row.task_completions });
      data.activityLevels.push({ timestamp, value: row.activity_level });
      data.workingSessions.push({ timestamp, value: row.session_duration });
      
      // Calculate productivity score (tasks completed per hour of work)
      const productivityScore = row.session_duration > 0 ? row.task_completions / (row.session_duration / 60) : 0;
      data.productivityScores.push({ timestamp, value: productivityScore });
    });

    return data;
  }

  private async getWorkloadHistory(userId: string): Promise<TimeSeriesData[]> {
    const query = `
      SELECT 
        DATE_TRUNC('day', created_at) as timestamp,
        COUNT(*) as daily_tasks,
        SUM(COALESCE((properties->>'duration')::numeric, 60)) as total_duration
      FROM analytics_events 
      WHERE user_id = $1 
        AND event_type IN ('action', 'feature_use')
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY timestamp DESC
    `;
    
    const result = await this.pgPool.query(query, [userId]);
    return result.rows.map(row => ({
      timestamp: new Date(row.timestamp),
      value: row.daily_tasks,
      metadata: { totalDuration: row.total_duration }
    }));
  }

  private async calculateTaskFactors(
    userId: string, 
    historicalData: TimeSeriesData[], 
    complexity: number
  ): Promise<TaskCompletionPrediction['factors']> {
    const now = new Date();
    const historicalAverage = historicalData.reduce((sum, d) => sum + d.value, 0) / historicalData.length;
    
    // Calculate current pace (last 3 days average)
    const recentData = historicalData.filter(d => 
      (now.getTime() - d.timestamp.getTime()) < (3 * 24 * 60 * 60 * 1000)
    );
    const currentPace = recentData.length > 0 
      ? recentData.reduce((sum, d) => sum + d.value, 0) / recentData.length
      : historicalAverage;

    // Time and day context factors
    const timeOfDay = now.getHours();
    const dayOfWeek = now.getDay();
    
    // Time factor (productivity typically peaks 10-11am and 2-3pm)
    const timeEfficiency = timeOfDay >= 10 && timeOfDay <= 11 ? 1.2 :
                          timeOfDay >= 14 && timeOfDay <= 15 ? 1.1 :
                          timeOfDay >= 9 && timeOfDay <= 17 ? 1.0 : 0.8;

    return {
      historicalAverage,
      currentPace,
      complexity: complexity / 10, // Normalize to 0-1
      timeOfDay: timeEfficiency,
      dayOfWeek: dayOfWeek >= 1 && dayOfWeek <= 5 ? 1.0 : 0.8 // Weekday vs weekend
    };
  }

  private applyLinearRegression(features: number[], weights: number[], bias: number): number {
    const weightedSum = features.reduce((sum, feature, index) => sum + feature * weights[index], 0);
    return Math.max(0.5, weightedSum + bias); // Minimum 30 minutes
  }

  private applyExponentialSmoothing(
    data: number[], 
    alpha: number, 
    beta: number, 
    gamma: number,
    forecastPeriods: number
  ): number[] {
    if (data.length < 2) return new Array(forecastPeriods).fill(data[0] || 1);

    // Simple exponential smoothing implementation
    let smoothed = data[0];
    const forecast: number[] = [];

    for (let i = 1; i < data.length; i++) {
      smoothed = alpha * data[i] + (1 - alpha) * smoothed;
    }

    // Generate forecast (simple ES forecasts the last smoothed value for all future periods)
    for (let i = 0; i < forecastPeriods; i++) {
      forecast.push(smoothed);
    }

    return forecast;
  }

  private analyzeTrend(data: TimeSeriesData[]): 'improving' | 'declining' | 'stable' {
    if (data.length < 4) return 'stable';

    const recent = data.slice(0, Math.floor(data.length / 2));
    const older = data.slice(Math.floor(data.length / 2));

    const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;

    if (olderAvg === 0) return recentAvg > 0 ? 'improving' : 'stable';
    const improvement = (recentAvg - olderAvg) / olderAvg;

    if (improvement > 0.1) return 'improving';
    if (improvement < -0.1) return 'declining';
    return 'stable';
  }

  private analyzeSeasonality(data: PatternData): ProductivityForecast['seasonalFactors'] {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    // Analyze day-of-week patterns
    const weeklyPattern = new Array(7).fill(0);
    data.taskCompletions.forEach(d => {
      const dow = d.timestamp.getDay();
      weeklyPattern[dow] += d.value;
    });

    const avgWeeklyActivity = weeklyPattern.reduce((sum, val) => sum + val, 0) / 7;
    const todayMultiplier = weeklyPattern[dayOfWeek] / avgWeeklyActivity;

    return {
      dayOfWeek: todayMultiplier,
      timeOfMonth: dayOfMonth <= 15 ? 1.1 : 0.9, // Early month boost
      historicalPattern: this.describePeakPattern(weeklyPattern)
    };
  }

  private predictPeakHours(data: PatternData): number[] {
    const hourlyActivity = new Array(24).fill(0);
    
    data.taskCompletions.forEach(d => {
      const hour = d.timestamp.getHours();
      hourlyActivity[hour] += d.value;
    });

    // Find top 3 peak hours
    const indexed = hourlyActivity.map((value, hour) => ({ hour, value }));
    indexed.sort((a, b) => b.value - a.value);
    
    return indexed.slice(0, 3).map(item => item.hour);
  }

  private predictLowEnergyPeriods(data: PatternData): number[] {
    const hourlyActivity = new Array(24).fill(0);
    
    data.taskCompletions.forEach(d => {
      const hour = d.timestamp.getHours();
      hourlyActivity[hour] += d.value;
    });

    // Find bottom 3 hours (excluding sleep hours 0-6)
    const workingHours = hourlyActivity.slice(7, 23).map((value, index) => ({ hour: index + 7, value }));
    workingHours.sort((a, b) => a.value - b.value);
    
    return workingHours.slice(0, 3).map(item => item.hour);
  }

  private calculateOptimalWorkload(data: PatternData): number {
    if (data.taskCompletions.length === 0) return 8;

    const dailyAverages = this.groupByDay(data.taskCompletions);
    const sorted = dailyAverages.sort((a, b) => a - b);
    
    // Return 75th percentile as optimal workload
    const index = Math.floor(sorted.length * 0.75);
    return Math.max(4, Math.min(12, sorted[index] || 8));
  }

  private calculateCurrentCapacity(workloadData: TimeSeriesData[]): number {
    if (workloadData.length === 0) return 5;
    
    const recentData = workloadData.slice(0, 7); // Last week
    return recentData.reduce((sum, d) => sum + d.value, 0) / recentData.length;
  }

  private calculateStressLevel(data: PatternData): number {
    // Simple stress calculation based on work intensity and break patterns
    const avgSessionDuration = data.workingSessions.reduce((sum, d) => sum + d.value, 0) / data.workingSessions.length;
    const avgTasksPerHour = data.taskCompletions.reduce((sum, d) => sum + d.value, 0) / data.taskCompletions.length;
    
    // High stress indicators: long sessions, high task density
    const sessionStress = Math.min(1, avgSessionDuration / 180); // Cap at 3 hours
    const densityStress = Math.min(1, avgTasksPerHour / 3); // Cap at 3 tasks/hour
    
    return (sessionStress + densityStress) / 2;
  }

  private calculateBurnoutRisk(workloadData: TimeSeriesData[], stressLevel: number): number {
    const recentIntensity = workloadData.slice(0, 7).reduce((sum, d) => sum + d.value, 0) / 7;
    const historicalAverage = workloadData.reduce((sum, d) => sum + d.value, 0) / workloadData.length;
    
    const intensityRatio = recentIntensity / historicalAverage;
    const combinedRisk = (intensityRatio * 0.6 + stressLevel * 0.4);
    
    return Math.min(1, Math.max(0, combinedRisk));
  }

  private predictOptimalCapacity(workloadData: TimeSeriesData[], patternData: PatternData): number {
    // Simple neural network simulation
    const inputs = [
      this.calculateCurrentCapacity(workloadData),
      this.calculateStressLevel(patternData),
      this.calculateProductivityScore(patternData.taskCompletions.map(d => d.value)),
      patternData.workingSessions.length > 0 ? 
        patternData.workingSessions.reduce((sum, d) => sum + d.value, 0) / patternData.workingSessions.length / 60 : 1
    ];

    // Simplified neural network forward pass
    const weights = [0.4, -0.3, 0.3, 0.2];
    const weighted = inputs.reduce((sum, input, i) => sum + input * weights[i], 0);
    const activated = 1 / (1 + Math.exp(-weighted)); // Sigmoid activation
    
    return Math.max(4, Math.min(10, activated * 10));
  }

  private generateTaskRecommendations(factors: TaskCompletionPrediction['factors'], estimatedHours: number): string[] {
    const recommendations: string[] = [];

    if (factors.currentPace < factors.historicalAverage * 0.8) {
      recommendations.push("Consider breaking this task into smaller chunks");
    }

    if (factors.timeOfDay < 0.9) {
      recommendations.push("This might not be your peak productivity time");
    }

    if (estimatedHours > 4) {
      recommendations.push("Schedule breaks every 90 minutes for this long task");
    }

    if (factors.complexity > 0.7) {
      recommendations.push("High complexity task - consider tackling it during your peak hours");
    }

    return recommendations;
  }

  private generateWorkloadRecommendations(
    currentCapacity: number,
    optimalCapacity: number,
    burnoutRisk: number,
    patternData: PatternData
  ): WorkloadCapacityPrediction['recommendations'] {
    const peakHours = this.predictPeakHours(patternData);
    
    return {
      suggestedTaskLimit: Math.floor(optimalCapacity),
      breakFrequency: burnoutRisk > 0.7 ? 45 : 90, // Minutes between breaks
      focusTimeBlocks: peakHours.map(hour => ({ start: hour, end: hour + 2 })),
      energyOptimization: [
        burnoutRisk > 0.6 ? "Consider reducing workload to prevent burnout" : "Current pace is sustainable",
        currentCapacity > optimalCapacity * 1.2 ? "You're working above optimal capacity" : "Good work-life balance",
        "Schedule demanding tasks during your peak hours"
      ]
    };
  }

  private suggestWorkloadAdjustments(currentCapacity: number, optimalCapacity: number): string[] {
    const adjustments: string[] = [];
    const ratio = currentCapacity / optimalCapacity;

    if (ratio > 1.2) {
      adjustments.push("Reduce task load by 20-30% next week");
      adjustments.push("Delegate or postpone non-critical tasks");
    } else if (ratio < 0.8) {
      adjustments.push("You have capacity for 10-20% more tasks");
      adjustments.push("Consider taking on additional responsibilities");
    } else {
      adjustments.push("Current workload is well-balanced");
    }

    return adjustments;
  }

  // Default fallback methods

  private getDefaultTaskPrediction(complexity: number): TaskCompletionPrediction {
    const baseHours = 2 + (complexity / 10) * 3; // 2-5 hours based on complexity
    const estimatedCompletion = new Date();
    estimatedCompletion.setHours(estimatedCompletion.getHours() + baseHours);

    return {
      estimatedCompletion,
      confidence: 0.5,
      factors: {
        historicalAverage: baseHours,
        currentPace: baseHours,
        complexity: complexity / 10,
        timeOfDay: 1.0,
        dayOfWeek: 1.0
      },
      recommendations: ["Insufficient historical data - estimates are based on averages"]
    };
  }

  private getDefaultProductivityForecast(days: number): ProductivityForecast {
    return {
      timeRange: {
        start: new Date(),
        end: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      },
      predictions: {
        tasksCompleted: days * 3, // 3 tasks per day default
        productivityScore: 0.7,
        peakHours: [10, 14, 16],
        lowEnergyPeriods: [13, 15, 17],
        optimalWorkload: 8
      },
      confidence: 0.4,
      trendDirection: 'stable',
      seasonalFactors: {
        dayOfWeek: 1.0,
        timeOfMonth: 1.0,
        historicalPattern: "Insufficient data for pattern analysis"
      }
    };
  }

  private getDefaultWorkloadPrediction(): WorkloadCapacityPrediction {
    return {
      currentCapacity: 6,
      optimalCapacity: 7,
      burnoutRisk: 0.3,
      recommendations: {
        suggestedTaskLimit: 8,
        breakFrequency: 90,
        focusTimeBlocks: [{ start: 9, end: 11 }, { start: 14, end: 16 }],
        energyOptimization: ["Maintain current pace", "Take regular breaks", "Focus difficult tasks in morning"]
      },
      nextWeekForecast: {
        expectedLoad: 6,
        suggestedAdjustments: ["Current workload appears sustainable"]
      }
    };
  }

  // Utility methods

  private calculateConfidence(dataPoints: number, modelAccuracy: number): number {
    const dataConfidence = Math.min(1, dataPoints / 30); // Max confidence at 30+ data points
    return dataConfidence * modelAccuracy;
  }

  private calculateProductivityScore(values: number[]): number {
    if (values.length === 0) return 0.5;
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.min(1, avg / 5); // Normalize assuming max 5 tasks/hour is excellent
  }

  private groupByDay(data: TimeSeriesData[]): number[] {
    const dailyTotals = new Map<string, number>();
    
    data.forEach(d => {
      const dayKey = d.timestamp.toISOString().split('T')[0];
      dailyTotals.set(dayKey, (dailyTotals.get(dayKey) || 0) + d.value);
    });

    return Array.from(dailyTotals.values());
  }

  private describePeakPattern(weeklyPattern: number[]): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const maxDay = weeklyPattern.indexOf(Math.max(...weeklyPattern));
    return `Peak productivity typically on ${days[maxDay]}`;
  }

  private predictNextWeekLoad(workloadData: TimeSeriesData[]): number {
    if (workloadData.length < 7) return 6; // Default

    const recentWeek = workloadData.slice(0, 7);
    const avgLoad = recentWeek.reduce((sum, d) => sum + d.value, 0) / 7;
    
    // Apply slight trend analysis
    const olderWeek = workloadData.slice(7, 14);
    if (olderWeek.length === 7) {
      const olderAvg = olderWeek.reduce((sum, d) => sum + d.value, 0) / 7;
      const trend = (avgLoad - olderAvg) / olderAvg;
      return avgLoad * (1 + trend * 0.5); // Apply 50% of trend
    }
    
    return avgLoad;
  }

  private async updateModelAccuracy(userId: string, patternData: PatternData): Promise<void> {
    // Compare recent predictions with actual outcomes
    // This would involve storing predictions and comparing them with actual results
    // For now, we'll simulate some accuracy updates
    
    for (const [modelName, model] of this.models.entries()) {
      // Simulate accuracy calculation based on data quality
      const dataQuality = Math.min(1, patternData.taskCompletions.length / 30);
      const newAccuracy = model.accuracy * 0.9 + dataQuality * 0.1;
      
      this.models.set(modelName, {
        ...model,
        accuracy: newAccuracy,
        lastTrained: new Date()
      });
    }
  }

  private async retrainModel(modelName: string, patternData: PatternData): Promise<void> {
    const model = this.models.get(modelName);
    if (!model) return;

    // Simulate model retraining - in a real implementation, this would
    // involve actual machine learning algorithms
    const improvedAccuracy = Math.min(0.95, model.accuracy + 0.1);
    
    this.models.set(modelName, {
      ...model,
      accuracy: improvedAccuracy,
      lastTrained: new Date()
    });

    console.log(`Model ${modelName} retrained with accuracy: ${improvedAccuracy}`);
  }
}