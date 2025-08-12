import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WhiteboardVersion,
  WhiteboardVersionDelta,
  WhiteboardVersionComparison,
  WhiteboardVersionRollback,
  WhiteboardVersionBranch,
  WhiteboardChangeType,
  WhiteboardWithElements,
  WhiteboardVersionCreateRequest,
  WhiteboardVersionRollbackRequest,
  WhiteboardVersionComparisonRequest,
  WhiteboardVersionFilter,
  PaginatedVersions,
  WhiteboardError,
} from '@shared/types/whiteboard.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { sanitizeInput } from '../../utils/sql-security.js';
import { WhiteboardService } from './whiteboard-service.js';
import { compare as createJsonPatch, applyPatch, Operation } from 'fast-json-patch';

/**
 * Delta compression utilities for efficient version storage
 */
class DeltaCompression {
  /**
   * Create a delta between two whiteboard states
   */
  static createDelta(oldState: any, newState: any): WhiteboardVersionDelta[] {
    const deltas: WhiteboardVersionDelta[] = [];
    let operationOrder = 0;

    // Compare canvas data
    if (JSON.stringify(oldState.canvasData) !== JSON.stringify(newState.canvasData)) {
      deltas.push({
        id: randomUUID(),
        versionId: '', // Will be set by caller
        operationType: 'canvas',
        elementId: null,
        operationOrder: operationOrder++,
        oldData: oldState.canvasData,
        newData: newState.canvasData,
        deltaPatch: this.createJsonPatch(oldState.canvasData, newState.canvasData),
        operationMetadata: {
          changeType: 'canvas_update',
          timestamp: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });
    }

    // Create element maps for comparison
    const oldElements = new Map(oldState.elements?.map((e: any) => [e.id, e]) || []);
    const newElements = new Map(newState.elements?.map((e: any) => [e.id, e]) || []);

    // Find deleted elements
    for (const [elementId, oldElement] of oldElements) {
      if (!newElements.has(elementId)) {
        deltas.push({
          id: randomUUID(),
          versionId: '',
          operationType: 'delete',
          elementId,
          operationOrder: operationOrder++,
          oldData: oldElement,
          newData: null,
          deltaPatch: [{ op: 'remove', path: `/elements/${elementId}` }],
          operationMetadata: {
            changeType: 'element_deleted',
            elementType: oldElement.elementType,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Find new and modified elements
    for (const [elementId, newElement] of newElements) {
      const oldElement = oldElements.get(elementId);
      
      if (!oldElement) {
        // New element
        deltas.push({
          id: randomUUID(),
          versionId: '',
          operationType: 'create',
          elementId,
          operationOrder: operationOrder++,
          oldData: null,
          newData: newElement,
          deltaPatch: [{ op: 'add', path: `/elements/${elementId}`, value: newElement }],
          operationMetadata: {
            changeType: 'element_created',
            elementType: newElement.elementType,
          },
          createdAt: new Date().toISOString(),
        });
      } else if (JSON.stringify(oldElement) !== JSON.stringify(newElement)) {
        // Modified element
        const elementPatch = this.createJsonPatch(oldElement, newElement);
        const changeType = this.detectElementChangeType(oldElement, newElement);
        
        deltas.push({
          id: randomUUID(),
          versionId: '',
          operationType: changeType,
          elementId,
          operationOrder: operationOrder++,
          oldData: oldElement,
          newData: newElement,
          deltaPatch: elementPatch,
          operationMetadata: {
            changeType: `element_${changeType}`,
            elementType: newElement.elementType,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }

    return deltas;
  }

  /**
   * Apply a JSON patch using fast-json-patch for precise state reconstruction
   */
  static applyJsonPatch(state: any, patch: Operation[]): any {
    try {
      const stateCopy = JSON.parse(JSON.stringify(state));
      const result = applyPatch(stateCopy, patch, false, false);
      return result.newDocument;
    } catch (error) {
      throw new Error(`Failed to apply JSON patch: ${error.message}`);
    }
  }

  /**
   * Apply deltas to reconstruct a state using fast-json-patch for efficiency
   */
  static applyDeltas(baseState: any, deltas: WhiteboardVersionDelta[]): any {
    let currentState = JSON.parse(JSON.stringify(baseState)); // Deep copy
    
    // Sort deltas by operation order
    const sortedDeltas = [...deltas].sort((a, b) => a.operationOrder - b.operationOrder);

    for (const delta of sortedDeltas) {
      try {
        currentState = this.applyDelta(currentState, delta);
      } catch (error) {
        throw new Error(`Failed to apply delta operation ${delta.operationType} for element ${delta.elementId}: ${error.message}`);
      }
    }

    return currentState;
  }

  private static applyDelta(state: any, delta: WhiteboardVersionDelta): any {
    // For precise operations, use JSON patch when available
    if (delta.deltaPatch && Array.isArray(delta.deltaPatch)) {
      try {
        return this.applyJsonPatch(state, delta.deltaPatch);
      } catch (error) {
        // Fall back to manual application if JSON patch fails
        console.warn('JSON patch failed, falling back to manual delta application:', error.message);
      }
    }

    // Manual delta application as fallback
    switch (delta.operationType) {
      case 'canvas':
        return {
          ...state,
          canvasData: delta.newData,
        };

      case 'create':
        if (!state.elements) state.elements = [];
        state.elements.push(delta.newData);
        return state;

      case 'delete':
        if (state.elements) {
          state.elements = state.elements.filter((e: any) => e.id !== delta.elementId);
        }
        return state;

      case 'update':
      case 'move':
      case 'style':
        if (state.elements && delta.elementId) {
          const elementIndex = state.elements.findIndex((e: any) => e.id === delta.elementId);
          if (elementIndex >= 0) {
            state.elements[elementIndex] = delta.newData;
          }
        }
        return state;

      default:
        throw new Error(`Unknown delta operation: ${delta.operationType}`);
    }
  }

  private static createJsonPatch(oldValue: any, newValue: any): Operation[] {
    // Use fast-json-patch for efficient delta compression
    try {
      return createJsonPatch(oldValue, newValue);
    } catch (error) {
      // Fallback to simple replacement if patch creation fails
      return [{
        op: 'replace',
        path: '',
        value: newValue,
      }];
    }
  }

  private static detectElementChangeType(oldElement: any, newElement: any): 'update' | 'move' | 'style' {
    // Detect if position changed
    const oldPos = oldElement.elementData?.position;
    const newPos = newElement.elementData?.position;
    if (oldPos && newPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
      return 'move';
    }

    // Detect if style changed
    if (JSON.stringify(oldElement.styleData) !== JSON.stringify(newElement.styleData)) {
      return 'style';
    }

    return 'update';
  }
}

/**
 * Comprehensive whiteboard version history and rollback service
 * Handles version creation, delta compression, rollback operations, and branch management
 */
export class WhiteboardVersionService {
  private logger: Logger;
  private whiteboardService: WhiteboardService;
  
  // Export DeltaCompression for testing
  static DeltaCompression = DeltaCompression;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardVersionService');
    this.whiteboardService = new WhiteboardService(db, logger);
  }

  /**
   * Create a new version snapshot with automatic or manual versioning
   */
  async createVersion(
    whiteboardId: string,
    userId: string,
    request: WhiteboardVersionCreateRequest
  ): Promise<WhiteboardVersion> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Creating whiteboard version', { whiteboardId, userId, request });

      // Get current whiteboard state with elements
      const currentState = await this.whiteboardService.getWhiteboardWithElements(whiteboardId, userId);
      if (!currentState) {
        throw this.createVersionError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      // Check if significant changes warrant a new version
      if (request.changeType === 'auto_save' && !await this.hasSignificantChanges(whiteboardId, currentState)) {
        this.logger.debug('No significant changes detected, skipping auto version', { whiteboardId });
        return await this.getLatestVersion(whiteboardId, userId);
      }

      // Get next version number
      const nextVersionNumber = await this.getNextVersionNumber(whiteboardId);

      // Get parent version for delta calculation
      const parentVersion = await this.getLatestVersion(whiteboardId, userId);
      let deltaData: WhiteboardVersionDelta[] = [];
      let snapshotData: any = null;
      let compressed_data: Buffer | null = null;
      let compression_type: string | null = null;

      // Decide on storage strategy
      const shouldCreateSnapshot = this.shouldCreateSnapshot(request.changeType, nextVersionNumber, request.forceSnapshot);

      if (shouldCreateSnapshot || !parentVersion) {
        // Create full snapshot
        snapshotData = {
          whiteboardData: currentState,
          elements: currentState.elements,
          metadata: {
            createdAt: new Date().toISOString(),
            elementCount: currentState.elements.length,
            canvasSize: currentState.canvasData?.dimensions,
          },
        };

        // Compress large snapshots
        const dataSize = JSON.stringify(snapshotData).length;
        if (dataSize > 50000) { // 50KB threshold
          const compressed = gzipSync(JSON.stringify(snapshotData));
          compressed_data = compressed;
          compression_type = 'gzip';
          snapshotData = null; // Store in compressed form only
        }
      } else if (parentVersion) {
        // Create delta version
        const parentState = await this.reconstructVersionState(parentVersion.id, userId);
        deltaData = DeltaCompression.createDelta(parentState, currentState);
      }

      // Calculate hashes for change detection
      const canvasHash = this.calculateHash(currentState.canvasData);
      const elementsHash = this.calculateHash(currentState.elements);

      // Calculate change statistics
      const changeStats = parentVersion ? 
        await this.calculateChangeStatistics(parentVersion.id, currentState) : 
        { elementsAdded: currentState.elements.length, elementsModified: 0, elementsDeleted: 0 };

      // Create version record
      const versionId = randomUUID();
      const now = new Date().toISOString();

      const version: WhiteboardVersion = {
        id: versionId,
        whiteboardId,
        versionNumber: nextVersionNumber,
        parentVersionId: parentVersion?.id,
        versionType: shouldCreateSnapshot ? 'snapshot' : 'delta',
        changeType: request.changeType,
        commitMessage: request.commitMessage,
        isAutomatic: request.changeType === 'auto_save',
        createdBy: userId,
        branchName: request.branchName || 'main',
        mergeSourceId: request.mergeSourceId,
        isMilestone: request.isMilestone || false,
        tags: request.tags || [],
        snapshotData,
        deltaData: deltaData.length > 0 ? deltaData : null,
        compressedData: compressed_data,
        compressionType: compression_type,
        dataSize: compressed_data ? JSON.stringify(snapshotData || deltaData).length : null,
        compressedSize: compressed_data?.length || null,
        elementCount: currentState.elements.length,
        canvasHash,
        elementsHash,
        totalChanges: deltaData.length,
        elementsAdded: changeStats.elementsAdded,
        elementsModified: changeStats.elementsModified,
        elementsDeleted: changeStats.elementsDeleted,
        creationTimeMs: null, // Will be set after creation
        whiteboardVersion: currentState.version,
        metadata: request.metadata || {},
        expiresAt: request.expiresAt,
        createdAt: now,
      };

      // Insert version record
      const query = `
        INSERT INTO whiteboard_versions (
          id, whiteboard_id, version_number, parent_version_id, version_type,
          change_type, commit_message, is_automatic, created_by, branch_name,
          merge_source_id, is_milestone, tags, snapshot_data, compressed_data,
          compression_type, data_size, compressed_size, element_count,
          canvas_hash, elements_hash, total_changes, elements_added,
          elements_modified, elements_deleted, whiteboard_version, metadata,
          expires_at, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
        )
        RETURNING *
      `;

      const result = await this.db.query(query, [
        version.id,
        version.whiteboardId,
        version.versionNumber,
        version.parentVersionId,
        version.versionType,
        version.changeType,
        version.commitMessage,
        version.isAutomatic,
        version.createdBy,
        version.branchName,
        version.mergeSourceId,
        version.isMilestone,
        JSON.stringify(version.tags),
        version.snapshotData ? JSON.stringify(version.snapshotData) : null,
        version.compressedData,
        version.compressionType,
        version.dataSize,
        version.compressedSize,
        version.elementCount,
        version.canvasHash,
        version.elementsHash,
        version.totalChanges,
        version.elementsAdded,
        version.elementsModified,
        version.elementsDeleted,
        version.whiteboardVersion,
        JSON.stringify(version.metadata),
        version.expiresAt,
        version.createdAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create version record');
      }

      // Insert delta operations if any
      if (deltaData.length > 0) {
        await this.insertDeltaOperations(versionId, deltaData);
      }

      const creationTime = Date.now() - startTime;
      
      // Update creation time
      await this.db.query(
        'UPDATE whiteboard_versions SET creation_time_ms = $1 WHERE id = $2',
        [creationTime, versionId]
      );

      // Update branch head if needed
      await this.updateBranchHead(whiteboardId, version.branchName, versionId);

      this.logger.info('Version created successfully', {
        whiteboardId,
        versionId,
        versionNumber: nextVersionNumber,
        versionType: version.versionType,
        totalChanges: version.totalChanges,
        creationTime,
      });

      return this.mapDatabaseRowToVersion(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create version', { error, whiteboardId, userId, request });
      throw error;
    }
  }

  /**
   * Get version history for a whiteboard with filtering and pagination
   */
  async getVersionHistory(
    whiteboardId: string,
    userId: string,
    filters?: WhiteboardVersionFilter,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedVersions> {
    try {
      // Check access permissions
      const whiteboard = await this.whiteboardService.getWhiteboard(whiteboardId, userId);
      if (!whiteboard) {
        throw this.createVersionError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      const conditions: string[] = ['wv.whiteboard_id = $1'];
      const values: any[] = [whiteboardId];
      let paramIndex = 2;

      // Apply filters
      if (filters?.branchName) {
        conditions.push(`wv.branch_name = $${paramIndex++}`);
        values.push(filters.branchName);
      }

      if (filters?.changeType && filters.changeType.length > 0) {
        conditions.push(`wv.change_type = ANY($${paramIndex++})`);
        values.push(filters.changeType);
      }

      if (filters?.createdBy) {
        conditions.push(`wv.created_by = $${paramIndex++}`);
        values.push(filters.createdBy);
      }

      if (filters?.isMilestone !== undefined) {
        conditions.push(`wv.is_milestone = $${paramIndex++}`);
        values.push(filters.isMilestone);
      }

      if (filters?.dateFrom) {
        conditions.push(`wv.created_at >= $${paramIndex++}`);
        values.push(filters.dateFrom);
      }

      if (filters?.dateTo) {
        conditions.push(`wv.created_at <= $${paramIndex++}`);
        values.push(filters.dateTo);
      }

      const whereClause = conditions.join(' AND ');

      // Get versions
      const query = `
        SELECT wv.*, u.username as creator_username
        FROM whiteboard_versions wv
        LEFT JOIN users u ON wv.created_by = u.id
        WHERE ${whereClause}
        ORDER BY wv.version_number DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      values.push(limit, offset);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_versions wv
        WHERE ${whereClause}
      `;

      const countValues = values.slice(0, -2); // Remove limit and offset

      const [versionsResult, countResult] = await Promise.all([
        this.db.query(query, values),
        this.db.query(countQuery, countValues)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const versions = versionsResult.rows.map(row => this.mapDatabaseRowToVersion(row));

      return {
        items: versions,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get version history', { error, whiteboardId, userId, filters });
      throw error;
    }
  }

  /**
   * Rollback whiteboard to a specific version
   */
  async rollbackToVersion(
    whiteboardId: string,
    userId: string,
    request: WhiteboardVersionRollbackRequest
  ): Promise<WhiteboardVersionRollback> {
    const startTime = Date.now();
    const rollbackId = randomUUID();

    try {
      this.logger.info('Starting rollback operation', { whiteboardId, userId, request, rollbackId });

      // Validate permissions
      const whiteboard = await this.whiteboardService.getWhiteboard(whiteboardId, userId);
      if (!whiteboard) {
        throw this.createVersionError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      // Get target version
      const targetVersion = await this.getVersionById(request.targetVersionId, userId);
      if (!targetVersion || targetVersion.whiteboardId !== whiteboardId) {
        throw this.createVersionError('VERSION_NOT_FOUND', 'Target version not found');
      }

      // Get current version for backup
      const currentVersion = await this.getLatestVersion(whiteboardId, userId);
      if (!currentVersion) {
        throw this.createVersionError('NO_CURRENT_VERSION', 'No current version found');
      }

      // Create backup version before rollback
      const backupVersion = await this.createVersion(whiteboardId, userId, {
        changeType: 'rollback',
        commitMessage: `Backup before rollback to version ${targetVersion.versionNumber}`,
        isAutomatic: true,
      });

      // Reconstruct target state
      const targetState = await this.reconstructVersionState(targetVersion.id, userId);

      // Check for conflicts if there are active sessions
      const conflicts = await this.detectRollbackConflicts(whiteboardId, targetState);

      // Create rollback record
      const rollback: WhiteboardVersionRollback = {
        id: rollbackId,
        whiteboardId,
        sourceVersionId: currentVersion.id,
        targetVersionId: request.targetVersionId,
        rollbackType: request.rollbackType || 'full',
        status: conflicts.length > 0 ? 'conflict' : 'processing',
        conflictResolution: request.conflictResolution,
        conflictsData: conflicts,
        rollbackOperations: [],
        completedOperations: 0,
        totalOperations: 0,
        backupVersionId: backupVersion.id,
        userId,
        errorMessage: null,
        processingTimeMs: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
      };

      // Insert rollback record
      const insertQuery = `
        INSERT INTO whiteboard_version_rollbacks (
          id, whiteboard_id, source_version_id, target_version_id, rollback_type,
          status, conflict_resolution, conflicts_data, rollback_operations,
          completed_operations, total_operations, backup_version_id, user_id,
          started_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        rollback.id,
        rollback.whiteboardId,
        rollback.sourceVersionId,
        rollback.targetVersionId,
        rollback.rollbackType,
        rollback.status,
        rollback.conflictResolution,
        JSON.stringify(rollback.conflictsData),
        JSON.stringify(rollback.rollbackOperations),
        rollback.completedOperations,
        rollback.totalOperations,
        rollback.backupVersionId,
        rollback.userId,
        rollback.startedAt,
        rollback.createdAt,
      ]);

      // Handle conflicts or proceed with rollback
      if (conflicts.length > 0) {
        this.logger.warn('Rollback conflicts detected', { rollbackId, conflicts: conflicts.length });
        
        if (request.conflictResolution === 'cancel') {
          await this.updateRollbackStatus(rollbackId, 'cancelled', 'Cancelled due to conflicts');
          return this.mapDatabaseRowToRollback(result.rows[0]);
        }
        
        if (!request.conflictResolution || request.conflictResolution === 'manual') {
          // Return for manual conflict resolution
          return this.mapDatabaseRowToRollback(result.rows[0]);
        }
      }

      // Perform the rollback within a transaction for atomicity
      await this.db.executeTransaction(async (trx) => {
        await this.executeRollbackWithTransaction(trx, rollbackId, whiteboardId, targetState, rollback.rollbackType);
      });

      const processingTime = Date.now() - startTime;
      await this.updateRollbackStatus(rollbackId, 'completed', null, processingTime);

      this.logger.info('Rollback completed successfully', {
        rollbackId,
        whiteboardId,
        targetVersionNumber: targetVersion.versionNumber,
        processingTime,
      });

      return this.getRollbackById(rollbackId);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      await this.updateRollbackStatus(rollbackId, 'failed', error.message, processingTime);
      
      this.logger.error('Rollback failed', { error, rollbackId, whiteboardId, userId, request });
      throw error;
    }
  }

  /**
   * Compare two versions and generate diff
   */
  async compareVersions(
    whiteboardId: string,
    userId: string,
    request: WhiteboardVersionComparisonRequest
  ): Promise<WhiteboardVersionComparison> {
    const startTime = Date.now();
    
    try {
      // Check if comparison already exists in cache
      const existingComparison = await this.getCachedComparison(
        request.versionAId, 
        request.versionBId, 
        request.comparisonType || 'full'
      );

      if (existingComparison && existingComparison.expiresAt && new Date(existingComparison.expiresAt) > new Date()) {
        this.logger.debug('Using cached comparison', { 
          comparisonId: existingComparison.id,
          versionA: request.versionAId,
          versionB: request.versionBId 
        });
        return existingComparison;
      }

      // Reconstruct both version states
      const [stateA, stateB] = await Promise.all([
        this.reconstructVersionState(request.versionAId, userId),
        this.reconstructVersionState(request.versionBId, userId)
      ]);

      // Generate detailed diff
      const detailedDiff = this.generateDetailedDiff(stateA, stateB, request.comparisonType || 'full');
      
      // Calculate similarity score
      const similarityScore = this.calculateSimilarityScore(stateA, stateB);

      // Create diff summary
      const diffSummary = this.createDiffSummary(detailedDiff);

      const processingTime = Date.now() - startTime;

      // Create comparison record
      const comparisonId = randomUUID();
      const comparison: WhiteboardVersionComparison = {
        id: comparisonId,
        whiteboardId,
        versionAId: request.versionAId,
        versionBId: request.versionBId,
        comparisonType: request.comparisonType || 'full',
        diffSummary,
        detailedDiff,
        diffSize: JSON.stringify(detailedDiff).length,
        similarityScore,
        processingTimeMs: processingTime,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      };

      // Store comparison in cache
      await this.cacheComparison(comparison);

      this.logger.info('Version comparison completed', {
        comparisonId,
        versionA: request.versionAId,
        versionB: request.versionBId,
        similarityScore,
        processingTime,
      });

      return comparison;
    } catch (error) {
      this.logger.error('Failed to compare versions', { error, whiteboardId, userId, request });
      throw error;
    }
  }

  // Private helper methods

  private async getNextVersionNumber(whiteboardId: string): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM whiteboard_versions
      WHERE whiteboard_id = $1
    `;

    const result = await this.db.query(query, [whiteboardId]);
    return parseInt(result.rows[0]?.next_version || '1');
  }

  private async getLatestVersion(whiteboardId: string, userId: string): Promise<WhiteboardVersion | null> {
    const query = `
      SELECT * FROM whiteboard_versions
      WHERE whiteboard_id = $1
      ORDER BY version_number DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [whiteboardId]);
    return result.rows.length > 0 ? this.mapDatabaseRowToVersion(result.rows[0]) : null;
  }

  private async hasSignificantChanges(whiteboardId: string, currentState: WhiteboardWithElements): Promise<boolean> {
    const latestVersion = await this.getLatestVersion(whiteboardId, '');
    if (!latestVersion) return true;

    // Simple change detection based on element count and canvas hash
    const currentHash = this.calculateHash(currentState.elements);
    return latestVersion.elementsHash !== currentHash || 
           Math.abs(latestVersion.elementCount - currentState.elements.length) > 2;
  }

  private shouldCreateSnapshot(
    changeType: WhiteboardChangeType, 
    versionNumber: number, 
    forceSnapshot?: boolean
  ): boolean {
    if (forceSnapshot) return true;
    
    // Create snapshots for major versions, milestones, or every 10 versions
    return changeType === 'major' || 
           changeType === 'template' || 
           versionNumber % 10 === 0;
  }

  private calculateHash(data: any): string {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  private async calculateChangeStatistics(parentVersionId: string, currentState: any): Promise<{
    elementsAdded: number;
    elementsModified: number;
    elementsDeleted: number;
  }> {
    // This would compare with parent version state
    // Simplified implementation
    return {
      elementsAdded: 0,
      elementsModified: 0,
      elementsDeleted: 0,
    };
  }

  private async insertDeltaOperations(versionId: string, deltas: WhiteboardVersionDelta[]): Promise<void> {
    if (deltas.length === 0) return;

    const query = `
      INSERT INTO whiteboard_version_deltas (
        id, version_id, operation_type, element_id, operation_order,
        old_data, new_data, delta_patch, operation_metadata, created_at
      )
      VALUES ${deltas.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(', ')}
    `;

    const values = deltas.flatMap(delta => [
      delta.id,
      versionId, // Set the version ID
      delta.operationType,
      delta.elementId,
      delta.operationOrder,
      delta.oldData ? JSON.stringify(delta.oldData) : null,
      delta.newData ? JSON.stringify(delta.newData) : null,
      JSON.stringify(delta.deltaPatch),
      JSON.stringify(delta.operationMetadata),
      delta.createdAt,
    ]);

    await this.db.query(query, values);
  }

  private async updateBranchHead(whiteboardId: string, branchName: string, versionId: string): Promise<void> {
    // Update or create branch record
    const upsertQuery = `
      INSERT INTO whiteboard_version_branches (id, whiteboard_id, branch_name, head_version_id, created_by, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (whiteboard_id, branch_name)
      DO UPDATE SET head_version_id = $3, updated_at = CURRENT_TIMESTAMP
    `;

    await this.db.query(upsertQuery, [whiteboardId, branchName, versionId, 'system']);
  }

  private async reconstructVersionState(versionId: string, userId: string): Promise<any> {
    const version = await this.getVersionById(versionId, userId);
    if (!version) {
      throw this.createVersionError('VERSION_NOT_FOUND', 'Version not found');
    }

    if (version.versionType === 'snapshot') {
      // Return snapshot data directly
      if (version.compressedData) {
        const decompressed = gunzipSync(version.compressedData);
        return JSON.parse(decompressed.toString());
      }
      return version.snapshotData;
    }

    // Reconstruct from deltas
    const parentState = version.parentVersionId ? 
      await this.reconstructVersionState(version.parentVersionId, userId) : 
      { elements: [], canvasData: {} };

    if (version.deltaData) {
      return DeltaCompression.applyDeltas(parentState, version.deltaData);
    }

    return parentState;
  }

  private async getVersionById(versionId: string, userId: string): Promise<WhiteboardVersion | null> {
    const query = `
      SELECT wv.* FROM whiteboard_versions wv
      JOIN whiteboards w ON wv.whiteboard_id = w.id
      WHERE wv.id = $1 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [versionId]);
    return result.rows.length > 0 ? this.mapDatabaseRowToVersion(result.rows[0]) : null;
  }

  private async detectRollbackConflicts(whiteboardId: string, targetState: any): Promise<any[]> {
    // Check for active sessions that might conflict with rollback
    const activeSessionsQuery = `
      SELECT COUNT(*) as active_count
      FROM whiteboard_sessions
      WHERE whiteboard_id = $1 AND is_active = true
    `;

    const result = await this.db.query(activeSessionsQuery, [whiteboardId]);
    const activeSessions = parseInt(result.rows[0]?.active_count || '0');

    const conflicts = [];
    if (activeSessions > 1) {
      conflicts.push({
        type: 'active_sessions',
        description: `${activeSessions} active sessions may be affected by rollback`,
        severity: 'warning',
      });
    }

    return conflicts;
  }

  private async executeRollbackWithTransaction(
    trx: any, // Kysely transaction instance
    rollbackId: string, 
    whiteboardId: string, 
    targetState: any, 
    rollbackType: string
  ): Promise<void> {
    // Update whiteboard to target state
    await trx
      .updateTable('whiteboards')
      .set({
        canvas_data: JSON.stringify(targetState.canvasData),
        version: trx.raw('version + 1'),
        updated_at: new Date(),
        last_modified_by: 'rollback_system'
      })
      .where('id', '=', whiteboardId)
      .execute();

    // Update elements if needed
    if (rollbackType === 'full' || rollbackType === 'elements_only') {
      // Clear existing elements
      await trx
        .updateTable('whiteboard_elements')
        .set({ deleted_at: new Date() })
        .where('whiteboard_id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .execute();

      // Restore target elements
      if (targetState.elements && targetState.elements.length > 0) {
        const elementsToInsert = targetState.elements.map((element: any) => ({
          id: element.id,
          whiteboard_id: whiteboardId,
          element_type: element.elementType,
          element_data: JSON.stringify(element.elementData),
          layer_index: element.layerIndex,
          parent_id: element.parentId,
          locked: element.locked || false,
          visible: element.visible !== false,
          style_data: JSON.stringify(element.styleData || {}),
          metadata: JSON.stringify(element.metadata || {}),
          version: 1,
          created_by: 'rollback_system',
          last_modified_by: 'rollback_system',
          created_at: new Date(),
          updated_at: new Date(),
        }));

        await trx
          .insertInto('whiteboard_elements')
          .values(elementsToInsert)
          .execute();
      }
    }
  }

  private async updateRollbackStatus(
    rollbackId: string, 
    status: string, 
    errorMessage?: string, 
    processingTime?: number
  ): Promise<void> {
    const updates: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values: any[] = [rollbackId, status];
    let paramIndex = 3;

    if (errorMessage) {
      updates.push(`error_message = $${paramIndex++}`);
      values.push(errorMessage);
    }

    if (processingTime) {
      updates.push(`processing_time_ms = $${paramIndex++}`);
      values.push(processingTime);
    }

    if (status === 'completed' || status === 'failed') {
      updates.push(`completed_at = CURRENT_TIMESTAMP`);
    }

    const query = `
      UPDATE whiteboard_version_rollbacks
      SET ${updates.join(', ')}
      WHERE id = $1
    `;

    await this.db.query(query, values);
  }

  private async getRollbackById(rollbackId: string): Promise<WhiteboardVersionRollback> {
    const query = 'SELECT * FROM whiteboard_version_rollbacks WHERE id = $1';
    const result = await this.db.query(query, [rollbackId]);
    
    if (result.rows.length === 0) {
      throw this.createVersionError('ROLLBACK_NOT_FOUND', 'Rollback not found');
    }

    return this.mapDatabaseRowToRollback(result.rows[0]);
  }

  private async getCachedComparison(
    versionAId: string, 
    versionBId: string, 
    comparisonType: string
  ): Promise<WhiteboardVersionComparison | null> {
    const query = `
      SELECT * FROM whiteboard_version_comparisons
      WHERE version_a_id = $1 AND version_b_id = $2 AND comparison_type = $3
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [versionAId, versionBId, comparisonType]);
    return result.rows.length > 0 ? this.mapDatabaseRowToComparison(result.rows[0]) : null;
  }

  private async cacheComparison(comparison: WhiteboardVersionComparison): Promise<void> {
    const query = `
      INSERT INTO whiteboard_version_comparisons (
        id, whiteboard_id, version_a_id, version_b_id, comparison_type,
        diff_summary, detailed_diff, diff_size, similarity_score,
        processing_time_ms, created_by, created_at, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;

    await this.db.query(query, [
      comparison.id,
      comparison.whiteboardId,
      comparison.versionAId,
      comparison.versionBId,
      comparison.comparisonType,
      JSON.stringify(comparison.diffSummary),
      JSON.stringify(comparison.detailedDiff),
      comparison.diffSize,
      comparison.similarityScore,
      comparison.processingTimeMs,
      comparison.createdBy,
      comparison.createdAt,
      comparison.expiresAt,
    ]);
  }

  private generateDetailedDiff(stateA: any, stateB: any, comparisonType: string): any {
    // Simplified diff generation
    // In production, use a sophisticated diff library
    return {
      canvasChanges: JSON.stringify(stateA.canvasData) !== JSON.stringify(stateB.canvasData),
      elementChanges: this.compareElements(stateA.elements || [], stateB.elements || []),
    };
  }

  private compareElements(elementsA: any[], elementsB: any[]): any {
    const mapA = new Map(elementsA.map(e => [e.id, e]));
    const mapB = new Map(elementsB.map(e => [e.id, e]));

    const added = [];
    const removed = [];
    const modified = [];

    for (const [id, elementB] of mapB) {
      if (!mapA.has(id)) {
        added.push(elementB);
      } else if (JSON.stringify(mapA.get(id)) !== JSON.stringify(elementB)) {
        modified.push({ id, old: mapA.get(id), new: elementB });
      }
    }

    for (const [id, elementA] of mapA) {
      if (!mapB.has(id)) {
        removed.push(elementA);
      }
    }

    return { added, removed, modified };
  }

  private calculateSimilarityScore(stateA: any, stateB: any): number {
    // Simple similarity calculation
    const elementsA = stateA.elements || [];
    const elementsB = stateB.elements || [];
    
    if (elementsA.length === 0 && elementsB.length === 0) return 1.0;
    if (elementsA.length === 0 || elementsB.length === 0) return 0.0;

    const commonElements = elementsA.filter((a: any) => 
      elementsB.some((b: any) => a.id === b.id)
    ).length;

    return commonElements / Math.max(elementsA.length, elementsB.length);
  }

  private createDiffSummary(detailedDiff: any): any {
    return {
      hasCanvasChanges: detailedDiff.canvasChanges,
      elementsAdded: detailedDiff.elementChanges?.added?.length || 0,
      elementsRemoved: detailedDiff.elementChanges?.removed?.length || 0,
      elementsModified: detailedDiff.elementChanges?.modified?.length || 0,
    };
  }

  private mapDatabaseRowToVersion(row: any): WhiteboardVersion {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      versionNumber: parseInt(row.version_number),
      parentVersionId: row.parent_version_id,
      versionType: row.version_type,
      changeType: row.change_type,
      commitMessage: row.commit_message,
      isAutomatic: row.is_automatic,
      createdBy: row.created_by,
      branchName: row.branch_name,
      mergeSourceId: row.merge_source_id,
      isMilestone: row.is_milestone,
      tags: this.safeJsonParse(row.tags, []),
      snapshotData: this.safeJsonParse(row.snapshot_data),
      deltaData: this.safeJsonParse(row.delta_data),
      compressedData: row.compressed_data,
      compressionType: row.compression_type,
      dataSize: row.data_size,
      compressedSize: row.compressed_size,
      elementCount: parseInt(row.element_count) || 0,
      canvasHash: row.canvas_hash,
      elementsHash: row.elements_hash,
      totalChanges: parseInt(row.total_changes) || 0,
      elementsAdded: parseInt(row.elements_added) || 0,
      elementsModified: parseInt(row.elements_modified) || 0,
      elementsDeleted: parseInt(row.elements_deleted) || 0,
      creationTimeMs: row.creation_time_ms,
      whiteboardVersion: parseInt(row.whiteboard_version) || 1,
      metadata: this.safeJsonParse(row.metadata, {}),
      expiresAt: row.expires_at?.toISOString(),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    };
  }

  private mapDatabaseRowToRollback(row: any): WhiteboardVersionRollback {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      sourceVersionId: row.source_version_id,
      targetVersionId: row.target_version_id,
      rollbackType: row.rollback_type,
      status: row.status,
      conflictResolution: row.conflict_resolution,
      conflictsData: this.safeJsonParse(row.conflicts_data, []),
      rollbackOperations: this.safeJsonParse(row.rollback_operations, []),
      completedOperations: parseInt(row.completed_operations) || 0,
      totalOperations: parseInt(row.total_operations) || 0,
      backupVersionId: row.backup_version_id,
      userId: row.user_id,
      errorMessage: row.error_message,
      processingTimeMs: row.processing_time_ms,
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    };
  }

  private mapDatabaseRowToComparison(row: any): WhiteboardVersionComparison {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      versionAId: row.version_a_id,
      versionBId: row.version_b_id,
      comparisonType: row.comparison_type,
      diffSummary: this.safeJsonParse(row.diff_summary, {}),
      detailedDiff: this.safeJsonParse(row.detailed_diff, {}),
      diffSize: parseInt(row.diff_size) || 0,
      similarityScore: parseFloat(row.similarity_score) || 0,
      processingTimeMs: parseInt(row.processing_time_ms) || 0,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      expiresAt: row.expires_at?.toISOString(),
    };
  }

  private safeJsonParse(field: any, defaultValue: any = null): any {
    if (!field) return defaultValue;
    
    try {
      return typeof field === 'string' ? JSON.parse(field) : field;
    } catch (error) {
      this.logger.warn('Failed to parse JSON field', { field, error });
      return defaultValue;
    }
  }

  private createVersionError(code: string, message: string, details?: any): WhiteboardError {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
  }

  /**
   * Calculate storage efficiency metrics for delta compression
   */
  calculateStorageEfficiency(oldState: any, newState: any): {
    baseStateSize: number;
    deltaSize: number;
    snapshotSize: number;
    compressionRatio: number;
    storageOverhead: number;
    meetsSLARequirement: boolean;
  } {
    const deltas = DeltaCompression.createDelta(oldState, newState);
    
    const baseStateSize = JSON.stringify(oldState).length;
    const deltaSize = JSON.stringify(deltas).length;
    const snapshotSize = JSON.stringify(newState).length;
    
    const compressionRatio = deltaSize / snapshotSize;
    const storageOverhead = deltaSize / baseStateSize;
    const meetsSLARequirement = storageOverhead < 0.1; // <10% overhead requirement
    
    return {
      baseStateSize,
      deltaSize,
      snapshotSize,
      compressionRatio,
      storageOverhead,
      meetsSLARequirement,
    };
  }
}