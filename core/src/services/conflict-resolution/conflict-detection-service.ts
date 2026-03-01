/**
 * Conflict Detection Service
 * 
 * Advanced conflict detection engine that identifies concurrent modifications
 * using vector clocks, content hashing, and semantic analysis. Provides
 * real-time detection of conflicts across collaborative sessions with
 * intelligent severity assessment and resolution recommendations.
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { 
  ConflictDetection,
  ConflictDetectionSchema,
  ConflictType,
  ConflictStatus,
  MergeStrategy,
  ContentVersion,
  ContentVersionSchema,
  VectorClock,
  VectorClockSchema,
  ConflictDetectionService as IConflictDetectionService,
  ConflictDetectionError
} from '../../shared/types/conflict-resolution.js';
import { logger } from '../../utils/logger.js';

interface ConflictAnalysisResult {
  hasConflict: boolean;
  conflictType: ConflictType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  complexityScore: number;
  conflictRegions: Array<{
    start: number;
    end: number;
    type: 'overlap' | 'adjacent' | 'dependent' | 'semantic';
    description: string;
  }>;
  canAutoResolve: boolean;
  recommendedStrategy: MergeStrategy;
  confidence: number;
}

export class ConflictDetectionService implements IConflictDetectionService {
  constructor(private db: Pool) {}

  /**
   * Detects conflicts for a specific content item within a session
   */
  async detectConflicts(contentId: string, sessionId: string): Promise<ConflictDetection[]> {
    try {
      logger.debug('Starting conflict detection', { contentId, sessionId });

      // Get all recent versions of the content
      const versions = await this.getRecentContentVersions(contentId, sessionId);
      
      if (versions.length < 2) {
        logger.debug('Insufficient versions for conflict detection', { 
          contentId, 
          versionCount: versions.length 
        });
        return [];
      }

      const conflicts: ConflictDetection[] = [];

      // Check for conflicts between all version pairs
      for (let i = 0; i < versions.length; i++) {
        for (let j = i + 1; j < versions.length; j++) {
          const versionA = versions[i];
          const versionB = versions[j];

          // Skip if versions are from the same user (sequential edits)
          if (versionA.userId === versionB.userId) {
            continue;
          }

          // Find common base version
          const baseVersion = await this.findCommonBaseVersion(versionA, versionB);
          if (!baseVersion) {
            logger.warn('No common base version found', { 
              versionAId: versionA.id, 
              versionBId: versionB.id 
            });
            continue;
          }

          // Analyze for conflicts
          const analysisResult = await this.analyzeVersionConflict(
            baseVersion, 
            versionA, 
            versionB
          );

          if (analysisResult.hasConflict) {
            // Check if this conflict already exists
            const existingConflict = await this.findExistingConflict(
              contentId, 
              versionA.id, 
              versionB.id
            );

            if (!existingConflict) {
              const conflict = await this.createConflictDetection(
                contentId,
                sessionId,
                baseVersion,
                versionA,
                versionB,
                analysisResult
              );
              conflicts.push(conflict);
            }
          }
        }
      }

      logger.info('Conflict detection completed', { 
        contentId, 
        sessionId, 
        conflictsFound: conflicts.length 
      });

      return conflicts;

    } catch (error) {
      logger.error('Failed to detect conflicts', { error, contentId, sessionId });
      throw new ConflictDetectionError(`Failed to detect conflicts: ${error instanceof Error ? error.message : String(error)}`, {
        contentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Analyzes a specific conflict in detail
   */
  async analyzeConflict(conflictId: string): Promise<ConflictDetection> {
    try {
      const result = await this.db.query(
        `SELECT cd.*, 
          bv.content as base_content, bv.content_hash as base_content_hash,
          av.content as version_a_content, av.content_hash as version_a_content_hash,
          bv.content as version_b_content, bv.content_hash as version_b_content_hash
         FROM conflict_detections cd
         JOIN content_versions bv ON cd.base_version_id = bv.id
         JOIN content_versions av ON cd.version_a_id = av.id
         JOIN content_versions bv ON cd.version_b_id = bv.id
         WHERE cd.id = $1`,
        [conflictId]
      );

      if (result.rows.length === 0) {
        throw new ConflictDetectionError('Conflict not found', { conflictId });
      }

      const row = result.rows[0];
      const conflict = this.mapRowToConflict(row);

      // Perform enhanced analysis
      const enhancedAnalysis = await this.performEnhancedAnalysis(conflict);
      
      // Update conflict with enhanced analysis if needed
      if (enhancedAnalysis.confidence !== conflict.confidence ||
          enhancedAnalysis.complexityScore !== conflict.complexityScore) {
        await this.updateConflictAnalysis(conflictId, enhancedAnalysis);
        conflict.confidence = enhancedAnalysis.confidence;
        conflict.complexityScore = enhancedAnalysis.complexityScore;
      }

      logger.debug('Conflict analysis completed', { conflictId, confidence: conflict.confidence });
      return conflict;

    } catch (error) {
      logger.error('Failed to analyze conflict', { error, conflictId });
      throw new ConflictDetectionError(`Failed to analyze conflict: ${error instanceof Error ? error.message : String(error)}`, {
        conflictId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Updates conflict status
   */
  async updateConflictStatus(conflictId: string, status: ConflictStatus): Promise<ConflictDetection> {
    try {
      const result = await this.db.query(
        `UPDATE conflict_detections 
         SET status = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING *`,
        [status, conflictId]
      );

      if (result.rows.length === 0) {
        throw new ConflictDetectionError('Conflict not found', { conflictId });
      }

      const conflict = this.mapRowToConflict(result.rows[0]);
      
      logger.info('Conflict status updated', { conflictId, status });
      return conflict;

    } catch (error) {
      logger.error('Failed to update conflict status', { error, conflictId, status });
      throw new ConflictDetectionError(`Failed to update conflict status: ${error instanceof Error ? error.message : String(error)}`, {
        conflictId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Gets all active conflicts for a session
   */
  async getActiveConflicts(sessionId: string): Promise<ConflictDetection[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM conflict_detections 
         WHERE session_id = $1 
         AND status IN ('detected', 'analyzing', 'awaiting_user_input')
         ORDER BY detected_at DESC`,
        [sessionId]
      );

      const conflicts = result.rows.map(row => this.mapRowToConflict(row));
      
      logger.debug('Retrieved active conflicts', { sessionId, count: conflicts.length });
      return conflicts;

    } catch (error) {
      logger.error('Failed to get active conflicts', { error, sessionId });
      throw new ConflictDetectionError(`Failed to get active conflicts: ${error instanceof Error ? error.message : String(error)}`, {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Gets conflict history for a content item
   */
  async getConflictHistory(contentId: string, limit: number = 50): Promise<ConflictDetection[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM conflict_detections 
         WHERE content_id = $1 
         ORDER BY detected_at DESC 
         LIMIT $2`,
        [contentId, limit]
      );

      const conflicts = result.rows.map(row => this.mapRowToConflict(row));
      
      logger.debug('Retrieved conflict history', { contentId, count: conflicts.length });
      return conflicts;

    } catch (error) {
      logger.error('Failed to get conflict history', { error, contentId });
      throw new ConflictDetectionError(`Failed to get conflict history: ${error instanceof Error ? error.message : String(error)}`, {
        contentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Stores a new content version
   */
  async storeContentVersion(
    contentId: string,
    content: string,
    userId: string,
    sessionId: string,
    contentType: 'search_query' | 'filter_definition' | 'annotation' | 'document' | 'structured_data',
    parentVersionId?: string
  ): Promise<ContentVersion> {
    try {
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      const vectorClock = await this.createVectorClock(userId, sessionId);

      const result = await this.db.query(
        `INSERT INTO content_versions (
          content_id, content, content_hash, parent_version_id,
          vector_clock_user_id, vector_clock_timestamp, vector_clock_logical, 
          vector_clock_session_id, vector_clock_node_id,
          user_id, session_id, content_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          contentId, content, contentHash, parentVersionId,
          vectorClock.userId, vectorClock.timestamp, vectorClock.logicalClock,
          vectorClock.sessionId, vectorClock.nodeId,
          userId, sessionId, contentType
        ]
      );

      const version = this.mapRowToContentVersion(result.rows[0]);
      
      logger.debug('Content version stored', { 
        versionId: version.id, 
        contentId, 
        userId, 
        contentHash 
      });
      
      return version;

    } catch (error) {
      logger.error('Failed to store content version', { error, contentId, userId });
      throw new ConflictDetectionError(`Failed to store content version: ${error instanceof Error ? error.message : String(error)}`, {
        contentId,
        userId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Gets recent content versions for conflict detection
   */
  private async getRecentContentVersions(
    contentId: string, 
    sessionId: string, 
    limit: number = 10
  ): Promise<ContentVersion[]> {
    const result = await this.db.query(
      `SELECT * FROM content_versions 
       WHERE content_id = $1 AND session_id = $2 
       ORDER BY created_at DESC 
       LIMIT $3`,
      [contentId, sessionId, limit]
    );

    return result.rows.map(row => this.mapRowToContentVersion(row));
  }

  /**
   * Finds the common base version for two content versions
   */
  private async findCommonBaseVersion(
    versionA: ContentVersion, 
    versionB: ContentVersion
  ): Promise<ContentVersion | null> {
    // Simple approach: find the latest version that both versions could have been based on
    // In a more sophisticated system, this would trace the version graph
    
    const result = await this.db.query(
      `SELECT * FROM content_versions 
       WHERE content_id = $1 
       AND created_at < $2 AND created_at < $3
       ORDER BY created_at DESC 
       LIMIT 1`,
      [
        versionA.contentId,
        versionA.createdAt.toISOString(),
        versionB.createdAt.toISOString()
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToContentVersion(result.rows[0]);
  }

  /**
   * Analyzes two versions for conflicts
   */
  private async analyzeVersionConflict(
    baseVersion: ContentVersion,
    versionA: ContentVersion,
    versionB: ContentVersion
  ): Promise<ConflictAnalysisResult> {
    // Check if contents are identical (no conflict)
    if (versionA.contentHash === versionB.contentHash) {
      return {
        hasConflict: false,
        conflictType: 'content_modification',
        severity: 'low',
        complexityScore: 0,
        conflictRegions: [],
        canAutoResolve: true,
        recommendedStrategy: 'last_writer_wins',
        confidence: 1.0
      };
    }

    // Calculate edit distances and analyze changes
    const changesA = await this.calculateTextDiff(baseVersion.content, versionA.content);
    const changesB = await this.calculateTextDiff(baseVersion.content, versionB.content);

    // Check for overlapping modifications
    const conflictRegions = this.findConflictingRegions(changesA, changesB);
    const hasConflict = conflictRegions.length > 0;

    if (!hasConflict) {
      return {
        hasConflict: false,
        conflictType: 'content_modification',
        severity: 'low',
        complexityScore: 0,
        conflictRegions: [],
        canAutoResolve: true,
        recommendedStrategy: 'three_way_merge',
        confidence: 0.9
      };
    }

    // Analyze conflict characteristics
    const severity = this.calculateConflictSeverity(conflictRegions, changesA, changesB);
    const complexityScore = this.calculateComplexityScore(conflictRegions, versionA, versionB);
    const conflictType = this.determineConflictType(versionA, versionB, conflictRegions);
    
    // Determine if auto-resolution is possible
    const { canAutoResolve, recommendedStrategy, confidence } = this.assessAutoResolutionPotential(
      conflictType,
      severity,
      complexityScore,
      conflictRegions
    );

    return {
      hasConflict: true,
      conflictType,
      severity,
      complexityScore,
      conflictRegions,
      canAutoResolve,
      recommendedStrategy,
      confidence
    };
  }

  /**
   * Creates a new conflict detection record
   */
  private async createConflictDetection(
    contentId: string,
    sessionId: string,
    baseVersion: ContentVersion,
    versionA: ContentVersion,
    versionB: ContentVersion,
    analysis: ConflictAnalysisResult
  ): Promise<ConflictDetection> {
    const conflictHash = crypto.createHash('sha256')
      .update(`${contentId}:${versionA.id}:${versionB.id}`)
      .digest('hex')
      .substring(0, 16);

    const involvedUsers = [versionA.userId, versionB.userId];

    const result = await this.db.query(
      `INSERT INTO conflict_detections (
        conflict_type, content_id, session_id,
        base_version_id, version_a_id, version_b_id,
        conflict_hash, severity, complexity_score,
        conflict_regions, involved_users,
        can_auto_resolve, recommended_strategy, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        analysis.conflictType,
        contentId,
        sessionId,
        baseVersion.id,
        versionA.id,
        versionB.id,
        conflictHash,
        analysis.severity,
        analysis.complexityScore,
        JSON.stringify(analysis.conflictRegions),
        JSON.stringify(involvedUsers),
        analysis.canAutoResolve,
        analysis.recommendedStrategy,
        analysis.confidence
      ]
    );

    return this.mapRowToConflict(result.rows[0]);
  }

  /**
   * Checks if a conflict already exists for the given versions
   */
  private async findExistingConflict(
    contentId: string,
    versionAId: string,
    versionBId: string
  ): Promise<ConflictDetection | null> {
    const result = await this.db.query(
      `SELECT * FROM conflict_detections 
       WHERE content_id = $1 
       AND ((version_a_id = $2 AND version_b_id = $3) 
            OR (version_a_id = $3 AND version_b_id = $2))`,
      [contentId, versionAId, versionBId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToConflict(result.rows[0]);
  }

  /**
   * Creates a vector clock for the current operation with proper distributed system support
   * Enhanced: Memory management and performance monitoring
   */
  private async createVectorClock(userId: string, sessionId: string): Promise<VectorClock> {
    const startTime = Date.now();
    
    try {
      // Get the node ID for this instance
      const nodeId = this.getNodeId();
      
      // Memory management: Limit vector clocks retrieved to prevent memory issues
      const maxClocksToRetrieve = 500; // Increased from 100 for better accuracy
      
      // Get the latest vector clock state across all nodes for this user
      const result = await this.db.query(
        `SELECT 
           vector_clock_user_id,
           vector_clock_logical,
           vector_clock_node_id,
           vector_clock_timestamp
         FROM content_versions 
         WHERE vector_clock_session_id = $1 
         ORDER BY vector_clock_timestamp DESC 
         LIMIT $2`,
        [sessionId, maxClocksToRetrieve]
      );
      
      // Memory monitoring: Log warning if we hit the limit
      if (result.rows.length >= maxClocksToRetrieve) {
        logger.warn('Vector clock history limit reached, accuracy may be reduced', {
          sessionId,
          retrievedClocks: result.rows.length,
          limit: maxClocksToRetrieve
        });
        
        MetricsCollector.recordPerformanceMetrics(
          'vector_clock_limit_reached',
          0,
          true,
          { memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
          { sessionId, clockCount: result.rows.length }
        );
      }

      // Build current vector clock state for this session
      const vectorClockState = new Map<string, number>();
      
      // Initialize with current user's clock
      vectorClockState.set(userId, 0);
      
      // Process existing clocks to get the current state
      // Memory optimization: Process in batches for large clock histories
      const batchSize = 100;
      for (let i = 0; i < result.rows.length; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        
        for (const row of batch) {
          const clockUserId = row.vector_clock_user_id;
          const logicalClock = parseInt(row.vector_clock_logical);
          
          // Input validation
          if (isNaN(logicalClock) || logicalClock < 0) {
            logger.warn('Invalid logical clock value detected', {
              clockUserId,
              logicalClock: row.vector_clock_logical,
              sessionId
            });
            continue;
          }
          
          const existingClock = vectorClockState.get(clockUserId) || 0;
          vectorClockState.set(clockUserId, Math.max(existingClock, logicalClock));
        }
        
        // Yield control periodically for large batches
        if (i + batchSize < result.rows.length) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Increment the logical clock for this user
      const currentLogical = vectorClockState.get(userId) || 0;
      const newLogicalClock = currentLogical + 1;
      
      const duration = Date.now() - startTime;
      
      // Performance monitoring
      if (duration > 100) { // Log slow operations
        logger.warn('Slow vector clock creation detected', {
          sessionId,
          userId,
          duration,
          clockCount: result.rows.length,
          uniqueUsers: vectorClockState.size
        });
      }
      
      // Record metrics
      MetricsCollector.recordPerformanceMetrics(
        'vector_clock_creation',
        duration,
        true,
        {
          memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        {
          sessionId,
          clockCount: result.rows.length,
          uniqueUsers: vectorClockState.size,
          newLogicalClock
        }
      );

      return VectorClockSchema.parse({
        userId,
        timestamp: new Date(),
        logicalClock: newLogicalClock,
        sessionId,
        nodeId,
        vectorState: Object.fromEntries(vectorClockState)
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      MetricsCollector.recordError(
        'vector_clock_creation',
        'creation_failure',
        error instanceof Error ? error.message : String(error),
        duration,
        { sessionId, userId }
      );
      
      logger.error('Vector clock creation failed', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        userId,
        duration
      });
      
      // Fallback: Return minimal vector clock
      return VectorClockSchema.parse({
        userId,
        timestamp: new Date(),
        logicalClock: 1,
        sessionId,
        nodeId: this.getNodeId(),
        vectorState: { [userId]: 1 }
      });
    }
  }

  /**
   * Gets the node ID for this service instance
   */
  private getNodeId(): string {
    // Use environment variable first, then generate a consistent ID
    if (process.env.NODE_ID) {
      return process.env.NODE_ID;
    }

    // Generate a consistent node ID based on hostname and process ID
    const crypto = require('crypto');
    const os = require('os');
    const hostname = os.hostname();
    const pid = process.pid;
    const nodeString = `${hostname}-${pid}`;
    return crypto.createHash('sha256').update(nodeString).digest('hex').substring(0, 16);
  }

  /**
   * Compares two vector clocks to determine their relationship
   * Enhanced: Better handling of vector clock states and edge cases
   */
  private compareVectorClocks(clockA: VectorClock, clockB: VectorClock): 'before' | 'after' | 'concurrent' | 'equal' {
    // Input validation
    if (!clockA || !clockB) {
      logger.warn('Invalid vector clock comparison - null clocks', {
        clockA: !!clockA,
        clockB: !!clockB
      });
      return 'concurrent';
    }
    
    // Memory optimization: Early exit for identical clocks
    if (clockA.userId === clockB.userId && 
        clockA.logicalClock === clockB.logicalClock &&
        clockA.sessionId === clockB.sessionId &&
        clockA.nodeId === clockB.nodeId) {
      return 'equal';
    }
    
    // If they're the same user and session, use timestamp and logical clock
    if (clockA.userId === clockB.userId && clockA.sessionId === clockB.sessionId) {
      if (clockA.logicalClock === clockB.logicalClock) {
        return 'equal';
      }
      return clockA.logicalClock < clockB.logicalClock ? 'before' : 'after';
    }
    
    // Enhanced vector state comparison for different users
    const stateA = clockA.vectorState || {};
    const stateB = clockB.vectorState || {};
    
    // If we have vector states, use proper vector clock comparison
    if (Object.keys(stateA).length > 0 || Object.keys(stateB).length > 0) {
      const allUsers = new Set([
        ...Object.keys(stateA),
        ...Object.keys(stateB)
      ]);
      
      // Memory management: Warn about large vector states
      if (allUsers.size > 50) {
        logger.warn('Large vector clock state detected in comparison', {
          uniqueUsers: allUsers.size,
          clockAId: clockA.userId,
          clockBId: clockB.userId,
          sessionId: clockA.sessionId
        });
      }
      
      let aBeforeB = true;
      let bBeforeA = true;
      let hasComparison = false;
      
      for (const userId of allUsers) {
        const clockAValue = stateA[userId] || 0;
        const clockBValue = stateB[userId] || 0;
        
        // Input validation
        if (typeof clockAValue !== 'number' || typeof clockBValue !== 'number' ||
            clockAValue < 0 || clockBValue < 0) {
          logger.warn('Invalid vector clock state value', {
            userId,
            clockAValue,
            clockBValue,
            sessionId: clockA.sessionId
          });
          continue;
        }
        
        hasComparison = true;
        
        if (clockAValue > clockBValue) {
          bBeforeA = false;
        }
        if (clockBValue > clockAValue) {
          aBeforeB = false;
        }
        
        // Early exit optimization
        if (!aBeforeB && !bBeforeA) {
          return 'concurrent';
        }
      }
      
      // Handle edge case where no valid comparisons were made
      if (!hasComparison) {
        logger.warn('No valid vector clock state comparisons', {
          clockAId: clockA.userId,
          clockBId: clockB.userId,
          sessionId: clockA.sessionId
        });
        return 'concurrent';
      }
      
      if (aBeforeB && bBeforeA) return 'equal';
      if (aBeforeB) return 'before';
      if (bBeforeA) return 'after';
      return 'concurrent';
    }

    // Fallback to timestamp comparison for different users without vector states
    const aTimestamp = clockA.timestamp.getTime();
    const bTimestamp = clockB.timestamp.getTime();
    
    // If timestamps are significantly different (>1000ms), use temporal ordering
    if (Math.abs(aTimestamp - bTimestamp) > 1000) {
      return aTimestamp < bTimestamp ? 'before' : 'after';
    }

    // If timestamps are close, they're likely concurrent
    return 'concurrent';
  }

  /**
   * Merges vector clocks when resolving conflicts
   */
  private mergeVectorClocks(clocks: VectorClock[]): VectorClock {
    if (clocks.length === 0) {
      throw new Error('Cannot merge empty vector clock array');
    }

    if (clocks.length === 1) {
      return clocks[0];
    }

    // Find the most recent timestamp
    const latestTimestamp = new Date(Math.max(...clocks.map(c => c.timestamp.getTime())));
    
    // Use the session ID from the first clock (assuming same session)
    const sessionId = clocks[0].sessionId;
    
    // For merged clocks, we create a special user ID to indicate it's a merge
    const mergedUserId = crypto.randomUUID();
    
    // The logical clock should be higher than all constituent clocks
    const maxLogicalClock = Math.max(...clocks.map(c => c.logicalClock));
    
    return VectorClockSchema.parse({
      userId: mergedUserId,
      timestamp: latestTimestamp,
      logicalClock: maxLogicalClock + 1,
      sessionId,
      nodeId: this.getNodeId()
    });
  }

  /**
   * Calculates text differences between two strings
   */
  private async calculateTextDiff(oldText: string, newText: string): Promise<Array<{
    type: 'insert' | 'delete' | 'replace';
    position: number;
    oldLength?: number;
    newLength?: number;
    content?: string;
  }>> {
    // Simplified diff algorithm - in production, you might want to use a more sophisticated library
    const changes: Array<{
      type: 'insert' | 'delete' | 'replace';
      position: number;
      oldLength?: number;
      newLength?: number;
      content?: string;
    }> = [];

    if (oldText === newText) {
      return changes;
    }

    // Simple character-by-character comparison
    const maxLength = Math.max(oldText.length, newText.length);
    let position = 0;
    
    for (let i = 0; i < maxLength; i++) {
      const oldChar = oldText[i];
      const newChar = newText[i];
      
      if (oldChar !== newChar) {
        if (oldChar === undefined) {
          // Insertion at end
          changes.push({
            type: 'insert',
            position: i,
            content: newText.substring(i)
          });
          break;
        } else if (newChar === undefined) {
          // Deletion at end
          changes.push({
            type: 'delete',
            position: i,
            oldLength: oldText.length - i
          });
          break;
        } else {
          // Character replacement
          changes.push({
            type: 'replace',
            position: i,
            oldLength: 1,
            newLength: 1,
            content: newChar
          });
        }
      }
    }

    return changes;
  }

  /**
   * Finds conflicting regions between two sets of changes
   */
  private findConflictingRegions(
    changesA: Array<{ type: string; position: number; oldLength?: number; newLength?: number }>,
    changesB: Array<{ type: string; position: number; oldLength?: number; newLength?: number }>
  ): Array<{
    start: number;
    end: number;
    type: 'overlap' | 'adjacent' | 'dependent' | 'semantic';
    description: string;
  }> {
    const conflictRegions: Array<{
      start: number;
      end: number;
      type: 'overlap' | 'adjacent' | 'dependent' | 'semantic';
      description: string;
    }> = [];

    for (const changeA of changesA) {
      for (const changeB of changesB) {
        const startA = changeA.position;
        const endA = changeA.position + (changeA.oldLength || changeA.newLength || 1);
        const startB = changeB.position;
        const endB = changeB.position + (changeB.oldLength || changeB.newLength || 1);

        // Check for overlap
        if (startA < endB && startB < endA) {
          conflictRegions.push({
            start: Math.min(startA, startB),
            end: Math.max(endA, endB),
            type: 'overlap',
            description: `Overlapping modifications between positions ${startA}-${endA} and ${startB}-${endB}`
          });
        }
      }
    }

    return conflictRegions;
  }

  /**
   * Calculates conflict severity based on analysis
   */
  private calculateConflictSeverity(
    conflictRegions: Array<{ start: number; end: number; type: string }>,
    changesA: Array<{ type: string; position: number }>,
    changesB: Array<{ type: string; position: number }>
  ): 'low' | 'medium' | 'high' | 'critical' {
    const regionCount = conflictRegions.length;
    const totalChanges = changesA.length + changesB.length;

    if (regionCount === 0) return 'low';
    if (regionCount === 1 && totalChanges <= 5) return 'low';
    if (regionCount <= 3 && totalChanges <= 20) return 'medium';
    if (regionCount <= 10 || totalChanges <= 50) return 'high';
    return 'critical';
  }

  /**
   * Calculates complexity score for a conflict
   */
  private calculateComplexityScore(
    conflictRegions: Array<{ start: number; end: number; type: string }>,
    versionA: ContentVersion,
    versionB: ContentVersion
  ): number {
    let complexity = 0;

    // Base complexity from number of conflict regions
    complexity += Math.min(conflictRegions.length * 0.2, 0.6);

    // Content length factor
    const avgContentLength = (versionA.content.length + versionB.content.length) / 2;
    complexity += Math.min(avgContentLength / 10000, 0.3);

    // Content type factor
    const contentTypeComplexity = {
      'search_query': 0.1,
      'filter_definition': 0.2,
      'annotation': 0.15,
      'document': 0.3,
      'structured_data': 0.25
    };
    complexity += contentTypeComplexity[versionA.contentType] || 0.1;

    return Math.min(complexity, 1.0);
  }

  /**
   * Determines the type of conflict based on analysis
   */
  private determineConflictType(
    versionA: ContentVersion,
    versionB: ContentVersion,
    conflictRegions: Array<{ start: number; end: number; type: string }>
  ): ConflictType {
    // Simple heuristics - in practice, this could be much more sophisticated
    if (versionA.contentType === 'search_query') {
      return 'search_query_change';
    }
    if (versionA.contentType === 'filter_definition') {
      return 'filter_modification';
    }
    if (versionA.contentType === 'annotation') {
      return 'annotation_overlap';
    }
    
    // Check if changes seem to be structural vs content
    const hasStructuralChanges = conflictRegions.some(region => region.type === 'structural');
    if (hasStructuralChanges) {
      return 'structural_conflict';
    }

    return 'content_modification';
  }

  /**
   * Assesses whether a conflict can be auto-resolved
   */
  private assessAutoResolutionPotential(
    conflictType: ConflictType,
    severity: 'low' | 'medium' | 'high' | 'critical',
    complexityScore: number,
    conflictRegions: Array<{ start: number; end: number; type: string }>
  ): { canAutoResolve: boolean; recommendedStrategy: MergeStrategy; confidence: number } {
    let canAutoResolve = false;
    let recommendedStrategy: MergeStrategy = 'manual_resolution';
    let confidence = 0.0;

    // Simple rules for auto-resolution assessment
    if (severity === 'low' && complexityScore < 0.3) {
      canAutoResolve = true;
      recommendedStrategy = 'three_way_merge';
      confidence = 0.8;
    } else if (severity === 'medium' && complexityScore < 0.5) {
      if (conflictType === 'search_query_change' || conflictType === 'filter_modification') {
        canAutoResolve = true;
        recommendedStrategy = 'operational_transformation';
        confidence = 0.6;
      }
    } else if (severity === 'low' && conflictRegions.length === 0) {
      canAutoResolve = true;
      recommendedStrategy = 'last_writer_wins';
      confidence = 0.9;
    }

    // Adjust confidence based on conflict characteristics
    if (conflictType === 'annotation_overlap') {
      confidence *= 0.8; // Annotations are trickier to auto-resolve
    }
    if (conflictType === 'semantic_conflict') {
      confidence *= 0.5; // Semantic conflicts need human judgment
    }

    return { canAutoResolve, recommendedStrategy, confidence };
  }

  /**
   * Performs enhanced analysis on a conflict
   */
  private async performEnhancedAnalysis(conflict: ConflictDetection): Promise<{
    confidence: number;
    complexityScore: number;
  }> {
    // Placeholder for enhanced analysis using ML/AI
    // This could include semantic analysis, pattern recognition, etc.
    return {
      confidence: conflict.confidence,
      complexityScore: conflict.complexityScore
    };
  }

  /**
   * Updates conflict analysis data
   */
  private async updateConflictAnalysis(
    conflictId: string,
    analysis: { confidence: number; complexityScore: number }
  ): Promise<void> {
    await this.db.query(
      `UPDATE conflict_detections 
       SET confidence = $1, complexity_score = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [analysis.confidence, analysis.complexityScore, conflictId]
    );
  }

  /**
   * Maps database row to ConflictDetection object
   */
  private mapRowToConflict(row: any): ConflictDetection {
    return ConflictDetectionSchema.parse({
      id: row.id,
      conflictType: row.conflict_type,
      contentId: row.content_id,
      sessionId: row.session_id,
      baseVersion: this.createVersionStubFromRow(row, 'base_'),
      versionA: this.createVersionStubFromRow(row, 'version_a_'),
      versionB: this.createVersionStubFromRow(row, 'version_b_'),
      additionalVersions: JSON.parse(row.additional_version_ids || '[]'),
      detectedAt: new Date(row.detected_at),
      conflictHash: row.conflict_hash,
      severity: row.severity,
      complexityScore: parseFloat(row.complexity_score),
      conflictRegions: JSON.parse(row.conflict_regions || '[]'),
      involvedUsers: JSON.parse(row.involved_users || '[]'),
      canAutoResolve: row.can_auto_resolve,
      recommendedStrategy: row.recommended_strategy,
      confidence: parseFloat(row.confidence),
      status: row.status,
      resolutionDeadline: row.resolution_deadline ? new Date(row.resolution_deadline) : undefined,
      metadata: JSON.parse(row.metadata || '{}')
    });
  }

  /**
   * Maps database row to ContentVersion object
   */
  private mapRowToContentVersion(row: any): ContentVersion {
    return ContentVersionSchema.parse({
      id: row.id,
      contentId: row.content_id,
      content: row.content,
      contentHash: row.content_hash,
      vectorClock: {
        userId: row.vector_clock_user_id,
        timestamp: new Date(row.vector_clock_timestamp),
        logicalClock: parseInt(row.vector_clock_logical),
        sessionId: row.vector_clock_session_id,
        nodeId: row.vector_clock_node_id
      },
      parentVersionId: row.parent_version_id,
      userId: row.user_id,
      sessionId: row.session_id,
      createdAt: new Date(row.created_at),
      contentType: row.content_type,
      isConflictResolution: row.is_conflict_resolution,
      originalConflictId: row.original_conflict_id,
      mergeStrategy: row.merge_strategy
    });
  }

  /**
   * Creates a content version stub from database row data
   */
  private createVersionStubFromRow(row: any, prefix: string): ContentVersion {
    // This would need to be populated with actual version data
    // For now, creating a minimal stub
    return ContentVersionSchema.parse({
      id: row[`${prefix}version_id`] || '',
      contentId: row.content_id,
      content: row[`${prefix}content`] || '',
      contentHash: row[`${prefix}content_hash`] || '',
      vectorClock: {
        userId: '',
        timestamp: new Date(),
        logicalClock: 0,
        sessionId: row.session_id
      },
      userId: '',
      sessionId: row.session_id,
      createdAt: new Date(),
      contentType: 'document',
      isConflictResolution: false
    });
  }
}