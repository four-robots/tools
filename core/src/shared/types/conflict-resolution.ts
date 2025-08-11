/**
 * Conflict Resolution Types - Intelligent merge strategies for concurrent edits
 * 
 * Comprehensive type definitions for the conflict resolution engine that handles
 * concurrent modifications in collaborative search sessions, annotations, and
 * multi-user content modifications with intelligent merge algorithms and
 * user-friendly resolution interfaces.
 */

import { z } from 'zod';

// Conflict Detection and Resolution Core Types
export const ConflictType = z.enum([
  'content_modification',
  'search_query_change',
  'filter_modification',
  'annotation_overlap',
  'cursor_collision',
  'state_divergence',
  'semantic_conflict',
  'structural_conflict'
]);

export const MergeStrategy = z.enum([
  'three_way_merge',
  'operational_transformation',
  'last_writer_wins',
  'user_priority_based',
  'ai_assisted_merge',
  'manual_resolution',
  'custom_rule_based'
]);

export const ConflictStatus = z.enum([
  'detected',
  'analyzing',
  'auto_resolving',
  'awaiting_user_input',
  'resolved_automatically',
  'resolved_manually',
  'resolution_failed',
  'escalated'
]);

export const ResolutionDecision = z.enum([
  'accept_mine',
  'accept_theirs',
  'accept_merged',
  'accept_custom',
  'reject_all',
  'escalate'
]);

// Vector Clock for Conflict Detection
export const VectorClockSchema = z.object({
  userId: z.string().uuid(),
  timestamp: z.date(),
  logicalClock: z.number().int().min(0),
  sessionId: z.string().uuid(),
  nodeId: z.string().optional() // For distributed systems
});

// Content Version for Three-Way Merge
export const ContentVersionSchema = z.object({
  id: z.string().uuid(),
  contentId: z.string().uuid(), // Reference to original content
  content: z.string(),
  contentHash: z.string().min(64).max(64), // SHA-256 hash
  vectorClock: VectorClockSchema,
  parentVersionId: z.string().uuid().optional(),
  
  // Metadata
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  createdAt: z.date(),
  contentType: z.enum(['search_query', 'filter_definition', 'annotation', 'document', 'structured_data']),
  
  // Conflict resolution context
  isConflictResolution: z.boolean().default(false),
  originalConflictId: z.string().uuid().optional(),
  mergeStrategy: MergeStrategy.optional()
});

// Operational Transformation Operation
export const OperationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['insert', 'delete', 'retain', 'replace', 'move']),
  position: z.number().int().min(0),
  content: z.string().optional(),
  length: z.number().int().min(0).optional(),
  attributes: z.record(z.unknown()).default({}),
  
  // Context for semantic understanding
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional(),
  semanticType: z.enum(['text', 'query_term', 'filter_condition', 'annotation_tag', 'structural_element']).optional(),
  
  // Authorship
  userId: z.string().uuid(),
  timestamp: z.date(),
  sessionId: z.string().uuid()
});

// Conflict Detection Result
export const ConflictDetectionSchema = z.object({
  id: z.string().uuid(),
  conflictType: ConflictType,
  contentId: z.string().uuid(),
  sessionId: z.string().uuid(),
  
  // Conflicting versions
  baseVersion: ContentVersionSchema,
  versionA: ContentVersionSchema, // First conflicting version
  versionB: ContentVersionSchema, // Second conflicting version
  additionalVersions: z.array(ContentVersionSchema).default([]), // For multi-way conflicts
  
  // Conflict analysis
  detectedAt: z.date(),
  conflictHash: z.string(), // Unique identifier for this specific conflict
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  complexityScore: z.number().min(0).max(1), // 0 = simple, 1 = very complex
  
  // Affected regions
  conflictRegions: z.array(z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    type: z.enum(['overlap', 'adjacent', 'dependent', 'semantic']),
    description: z.string()
  })).default([]),
  
  // Participants
  involvedUsers: z.array(z.string().uuid()),
  
  // Auto-resolution potential
  canAutoResolve: z.boolean(),
  recommendedStrategy: MergeStrategy,
  confidence: z.number().min(0).max(1), // Confidence in auto-resolution
  
  // Status
  status: ConflictStatus.default('detected'),
  resolutionDeadline: z.date().optional(),
  
  // Metadata
  metadata: z.record(z.unknown()).default({})
});

// Merge Result
export const MergeResultSchema = z.object({
  id: z.string().uuid(),
  conflictId: z.string().uuid(),
  strategy: MergeStrategy,
  
  // Result content
  mergedContent: z.string(),
  mergedContentHash: z.string(),
  mergedVersion: ContentVersionSchema,
  
  // Merge statistics
  successfulMerges: z.number().int().min(0),
  conflictingRegions: z.number().int().min(0),
  manualInterventions: z.number().int().min(0),
  
  // Quality metrics
  confidenceScore: z.number().min(0).max(1),
  semanticCoherence: z.number().min(0).max(1).optional(),
  syntacticCorrectness: z.number().min(0).max(1).optional(),
  
  // Resolution details
  appliedOperations: z.array(OperationSchema),
  rejectedOperations: z.array(OperationSchema),
  
  // Timestamps
  startedAt: z.date(),
  completedAt: z.date(),
  
  // User involvement
  requiresUserReview: z.boolean().default(false),
  userReviewInstructions: z.string().optional()
});

// Conflict Resolution Session
export const ConflictResolutionSessionSchema = z.object({
  id: z.string().uuid(),
  conflictId: z.string().uuid(),
  sessionId: z.string().uuid(), // Parent collaboration session
  
  // Participants
  moderatorId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()),
  observerIds: z.array(z.string().uuid()).default([]),
  
  // Session lifecycle
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  
  // Resolution state
  status: z.enum(['created', 'in_progress', 'voting', 'completed', 'expired', 'escalated']),
  currentStep: z.enum(['analysis', 'strategy_selection', 'manual_resolution', 'review', 'voting', 'finalization']),
  
  // Resolution data
  proposedSolutions: z.array(z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    strategy: MergeStrategy,
    content: z.string(),
    rationale: z.string(),
    votes: z.array(z.object({
      userId: z.string().uuid(),
      vote: z.enum(['approve', 'reject', 'abstain']),
      timestamp: z.date(),
      comment: z.string().optional()
    })),
    createdAt: z.date()
  })).default([]),
  
  finalDecision: ResolutionDecision.optional(),
  selectedSolutionId: z.string().uuid().optional(),
  
  // Audit trail
  events: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['created', 'started', 'solution_proposed', 'vote_cast', 'decision_made', 'completed', 'escalated']),
    userId: z.string().uuid(),
    timestamp: z.date(),
    data: z.record(z.unknown()).default({})
  })).default([]),
  
  // Configuration
  settings: z.object({
    allowVoting: z.boolean().default(true),
    requireUnanimous: z.boolean().default(false),
    votingTimeoutMs: z.number().int().min(0).default(300000), // 5 minutes
    autoResolveAfterTimeout: z.boolean().default(true),
    allowExternalModerators: z.boolean().default(false)
  }).default({})
});

// Conflict Resolution Rules
export const ConflictResolutionRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string(),
  
  // Rule scope
  workspaceId: z.string().uuid().optional(), // Workspace-specific rule
  sessionTypes: z.array(z.string()).default([]), // Applicable session types
  contentTypes: z.array(z.string()).default([]), // Applicable content types
  
  // Rule conditions
  conditions: z.object({
    conflictTypes: z.array(ConflictType),
    userRoles: z.array(z.string()).default([]),
    severityThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    complexityThreshold: z.number().min(0).max(1).optional(),
    participantCount: z.object({
      min: z.number().int().min(1).optional(),
      max: z.number().int().min(1).optional()
    }).optional()
  }),
  
  // Resolution configuration
  resolution: z.object({
    strategy: MergeStrategy,
    priority: z.number().int().min(1).max(100).default(50),
    timeoutMs: z.number().int().min(0).default(300000),
    allowManualOverride: z.boolean().default(true),
    requiresApproval: z.boolean().default(false),
    notifyUsers: z.boolean().default(true),
    
    // Custom rule parameters
    parameters: z.record(z.unknown()).default({})
  }),
  
  // Rule metadata
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  isActive: z.boolean().default(true),
  usageCount: z.number().int().min(0).default(0),
  successRate: z.number().min(0).max(1).default(0)
});

// AI-Assisted Resolution Context
export const AIResolutionContextSchema = z.object({
  conflictId: z.string().uuid(),
  
  // Content analysis
  contentType: z.enum(['search_query', 'filter_definition', 'annotation', 'document', 'structured_data']),
  semanticContext: z.record(z.unknown()).default({}),
  syntacticAnalysis: z.record(z.unknown()).default({}),
  
  // Historical data
  similarConflicts: z.array(z.object({
    conflictId: z.string().uuid(),
    similarityScore: z.number().min(0).max(1),
    resolution: MergeResultSchema,
    outcome: z.enum(['successful', 'failed', 'partial'])
  })).default([]),
  
  // User preferences
  userPreferences: z.array(z.object({
    userId: z.string().uuid(),
    preferredStrategies: z.array(MergeStrategy),
    riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']),
    previousDecisions: z.array(z.object({
      conflictType: ConflictType,
      decision: ResolutionDecision,
      satisfaction: z.number().min(1).max(5).optional()
    }))
  })).default([]),
  
  // LLM prompts and responses
  llmRequests: z.array(z.object({
    id: z.string().uuid(),
    timestamp: z.date(),
    prompt: z.string(),
    response: z.string(),
    model: z.string(),
    tokensUsed: z.number().int().min(0),
    confidence: z.number().min(0).max(1),
    processingTimeMs: z.number().int().min(0)
  })).default([])
});

// Conflict Resolution Analytics
export const ConflictResolutionAnalyticsSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  
  // Time period
  periodStart: z.date(),
  periodEnd: z.date(),
  
  // Conflict statistics
  totalConflicts: z.number().int().min(0),
  resolvedConflicts: z.number().int().min(0),
  autoResolvedConflicts: z.number().int().min(0),
  manualResolvedConflicts: z.number().int().min(0),
  escalatedConflicts: z.number().int().min(0),
  failedResolutions: z.number().int().min(0),
  
  // Performance metrics
  averageResolutionTime: z.number().min(0), // milliseconds
  averageUserSatisfaction: z.number().min(1).max(5),
  resolutionSuccessRate: z.number().min(0).max(1),
  
  // Conflict type breakdown
  conflictTypeStats: z.record(z.object({
    count: z.number().int().min(0),
    averageResolutionTime: z.number().min(0),
    successRate: z.number().min(0).max(1),
    mostCommonStrategy: MergeStrategy
  })).default({}),
  
  // User participation
  userParticipationStats: z.record(z.object({
    conflictsInvolved: z.number().int().min(0),
    resolutionsInitiated: z.number().int().min(0),
    votesCase: z.number().int().min(0),
    averageSatisfaction: z.number().min(1).max(5)
  })).default({}),
  
  // Strategy effectiveness
  strategyEffectiveness: z.record(z.object({
    usageCount: z.number().int().min(0),
    successRate: z.number().min(0).max(1),
    averageTime: z.number().min(0),
    userSatisfaction: z.number().min(1).max(5)
  })).default({}),
  
  calculatedAt: z.date()
});

// Export TypeScript types from Zod schemas
export type ConflictType = z.infer<typeof ConflictType>;
export type MergeStrategy = z.infer<typeof MergeStrategy>;
export type ConflictStatus = z.infer<typeof ConflictStatus>;
export type ResolutionDecision = z.infer<typeof ResolutionDecision>;
export type VectorClock = z.infer<typeof VectorClockSchema>;
export type ContentVersion = z.infer<typeof ContentVersionSchema>;
export type Operation = z.infer<typeof OperationSchema>;
export type ConflictDetection = z.infer<typeof ConflictDetectionSchema>;
export type MergeResult = z.infer<typeof MergeResultSchema>;
export type ConflictResolutionSession = z.infer<typeof ConflictResolutionSessionSchema>;
export type ConflictResolutionRule = z.infer<typeof ConflictResolutionRuleSchema>;
export type AIResolutionContext = z.infer<typeof AIResolutionContextSchema>;
export type ConflictResolutionAnalytics = z.infer<typeof ConflictResolutionAnalyticsSchema>;

// Service Interfaces for Dependency Injection
export interface ConflictDetectionService {
  detectConflicts(contentId: string, sessionId: string): Promise<ConflictDetection[]>;
  analyzeConflict(conflictId: string): Promise<ConflictDetection>;
  updateConflictStatus(conflictId: string, status: ConflictStatus): Promise<ConflictDetection>;
  getActiveConflicts(sessionId: string): Promise<ConflictDetection[]>;
  getConflictHistory(contentId: string, limit?: number): Promise<ConflictDetection[]>;
}

export interface MergeStrategyEngine {
  executeMerge(conflictId: string, strategy: MergeStrategy, options?: Record<string, unknown>): Promise<MergeResult>;
  evaluateStrategies(conflictId: string): Promise<Array<{ strategy: MergeStrategy; confidence: number; estimated_time: number }>>;
  threeWayMerge(base: ContentVersion, versionA: ContentVersion, versionB: ContentVersion): Promise<MergeResult>;
  operationalTransform(operations: Operation[]): Promise<Operation[]>;
  customRuleMerge(conflictId: string, ruleId: string): Promise<MergeResult>;
}

export interface ConflictResolutionOrchestrator {
  startResolution(conflictId: string, moderatorId: string): Promise<ConflictResolutionSession>;
  joinResolution(sessionId: string, userId: string, role: 'participant' | 'observer'): Promise<void>;
  proposeSolution(sessionId: string, userId: string, strategy: MergeStrategy, content: string, rationale: string): Promise<string>;
  castVote(sessionId: string, solutionId: string, userId: string, vote: 'approve' | 'reject' | 'abstain', comment?: string): Promise<void>;
  finalizeResolution(sessionId: string, decision: ResolutionDecision, selectedSolutionId?: string): Promise<MergeResult>;
  escalateResolution(sessionId: string, reason: string): Promise<void>;
}

export interface OperationalTransformEngine {
  transformOperation(op: Operation, againstOp: Operation): Promise<Operation>;
  transformOperationList(ops: Operation[], againstOps: Operation[]): Promise<Operation[]>;
  applyOperation(content: string, op: Operation): Promise<string>;
  invertOperation(op: Operation): Promise<Operation>;
  composeOperations(ops: Operation[]): Promise<Operation>;
}

export interface ConflictNotificationService {
  notifyConflictDetected(conflict: ConflictDetection): Promise<void>;
  notifyResolutionRequired(resolutionSession: ConflictResolutionSession): Promise<void>;
  notifyResolutionCompleted(resolutionSession: ConflictResolutionSession, result: MergeResult): Promise<void>;
  notifyVotingRequired(resolutionSession: ConflictResolutionSession, solutionId: string): Promise<void>;
  subscribeToConflictUpdates(userId: string, sessionId: string, callback: (event: any) => void): Promise<void>;
}

export interface AIAssistedMergeService {
  analyzeSemantic(conflict: ConflictDetection): Promise<AIResolutionContext>;
  generateMergeSuggestions(context: AIResolutionContext): Promise<Array<{ strategy: MergeStrategy; content: string; rationale: string; confidence: number }>>;
  validateMergeResult(result: MergeResult): Promise<{ valid: boolean; issues: string[]; suggestions: string[] }>;
  learnFromResolution(resolutionSession: ConflictResolutionSession, result: MergeResult, userFeedback?: { satisfaction: number; comments: string }): Promise<void>;
}

// WebSocket Message Extensions for Conflict Resolution
export const ConflictResolutionMessageSchema = z.object({
  type: z.enum([
    'conflict_detected',
    'conflict_resolution_started',
    'conflict_solution_proposed',
    'conflict_vote_cast',
    'conflict_resolution_completed',
    'conflict_escalated',
    'conflict_auto_resolved',
    'merge_operation_applied',
    'resolution_session_joined',
    'resolution_session_left'
  ]),
  conflictId: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  data: z.record(z.unknown()).default({}),
  timestamp: z.date(),
  messageId: z.string().uuid(),
  requiresAck: z.boolean().default(false)
});

export type ConflictResolutionMessage = z.infer<typeof ConflictResolutionMessageSchema>;

// Error Types
export class ConflictResolutionError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ConflictResolutionError';
  }
}

export class ConflictDetectionError extends ConflictResolutionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT_DETECTION_ERROR', 400, details);
    this.name = 'ConflictDetectionError';
  }
}

export class MergeStrategyError extends ConflictResolutionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MERGE_STRATEGY_ERROR', 400, details);
    this.name = 'MergeStrategyError';
  }
}

export class OperationalTransformError extends ConflictResolutionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'OPERATIONAL_TRANSFORM_ERROR', 400, details);
    this.name = 'OperationalTransformError';
  }
}

export class ResolutionSessionError extends ConflictResolutionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'RESOLUTION_SESSION_ERROR', 400, details);
    this.name = 'ResolutionSessionError';
  }
}

export class AIAssistedMergeError extends ConflictResolutionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AI_ASSISTED_MERGE_ERROR', 500, details);
    this.name = 'AIAssistedMergeError';
  }
}