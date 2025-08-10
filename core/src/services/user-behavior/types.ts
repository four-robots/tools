/**
 * Internal types for user behavior services
 */

export interface BehaviorTrackingConfig {
  batchSize: number;
  flushInterval: number;
  retryAttempts: number;
  enableRealTimeProcessing: boolean;
  enablePrivacyMode: boolean;
  anonymizeIpAddresses: boolean;
  sessionTimeout: number; // in milliseconds
  maxEventsPerSession: number;
}

export interface PatternAnalysisConfig {
  minOccurrences: number;
  minConfidenceScore: number;
  significanceThreshold: number;
  analysisWindow: number; // days
  enableRealTimeAnalysis: boolean;
  patternTypes: string[];
}

export interface MLModelConfig {
  modelType: 'classification' | 'clustering' | 'regression' | 'recommendation';
  algorithm: string;
  hyperparameters: Record<string, any>;
  trainingSchedule: string; // cron expression
  retrainThreshold: number; // accuracy drop threshold
  featureSet: string[];
  maxTrainingDataAge: number; // days
}

export interface InsightGenerationConfig {
  enableAutomatedInsights: boolean;
  insightTypes: string[];
  minImpactScore: number;
  maxInsightsPerUser: number;
  insightRetentionPeriod: number; // days
  enableNotifications: boolean;
}

export interface PrivacyConfig {
  defaultRetentionPeriod: number; // days
  consentExpirationPeriod: number; // days
  anonymizationDelay: number; // days
  enableRightToForget: boolean;
  enableDataPortability: boolean;
  gdprCompliance: boolean;
  ccpaCompliance: boolean;
}

export interface BehaviorAnalyticsMetrics {
  totalEvents: number;
  uniqueUsers: number;
  avgSessionDuration: number;
  avgEventsPerSession: number;
  topEventTypes: { type: string; count: number }[];
  topPatterns: { type: string; count: number }[];
  userEngagement: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface ProcessingQueue {
  events: any[];
  patterns: any[];
  predictions: any[];
  insights: any[];
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  evictionCount: number;
  averageResponseTime: number;
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  queueSize: number;
  errorRate: number;
  lastError?: string;
}