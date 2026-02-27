import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { CollaborationSession } from './session-reconstructor';
import LRU from 'lru-cache';
import crypto from 'crypto';

export interface CachedSessionState {
  sessionId: string;
  state: CollaborationSession;
  version: number; // Event sequence version when cached
  timestamp: Date;
  lastAccessed: Date;
  hitCount: number;
  sizeInBytes: number;
  checksum: string; // For integrity verification
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  hitRate: number;
  averageHitCount: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  memoryPressure: number; // 0-1 scale
  evictionCount: number;
}

export interface CacheConfig {
  maxSize: number; // Maximum number of entries
  maxSizeBytes: number; // Maximum cache size in bytes  
  ttlMs: number; // Time to live in milliseconds
  checkIntegrityOnHit: boolean;
  persistToDisk: boolean;
  diskSyncIntervalMs: number;
  compressionEnabled: boolean;
}

export class SessionReconstructionCache {
  private readonly cache: LRU<string, CachedSessionState>;
  private readonly config: CacheConfig;
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private readonly syncInterval?: NodeJS.Timeout;
  private totalSizeBytes = 0;

  constructor(
    private readonly pool?: Pool,
    config?: Partial<CacheConfig>
  ) {
    this.config = {
      maxSize: 1000, // 1000 sessions max
      maxSizeBytes: 500 * 1024 * 1024, // 500MB max
      ttlMs: 5 * 60 * 1000, // 5 minutes TTL
      checkIntegrityOnHit: true,
      persistToDisk: false,
      diskSyncIntervalMs: 30 * 1000, // 30 seconds
      compressionEnabled: true,
      ...config
    };

    this.cache = new LRU<string, CachedSessionState>({
      max: this.config.maxSize,
      ttl: this.config.ttlMs,
      dispose: (value, key) => {
        this.evictionCount++;
        this.totalSizeBytes -= value.sizeInBytes;
        
        logger.debug('Session cache entry evicted', {
          sessionId: key,
          reason: 'ttl_or_capacity',
          hitCount: value.hitCount,
          age: Date.now() - value.timestamp.getTime()
        });
      },
      updateAgeOnGet: true,
      updateAgeOnHas: false
    });

    // Start disk sync if enabled
    if (this.config.persistToDisk && this.pool) {
      this.syncInterval = setInterval(() => {
        this.syncToDisk();
      }, this.config.diskSyncIntervalMs);
    }

    logger.info('Session reconstruction cache initialized', {
      maxSize: this.config.maxSize,
      maxSizeBytes: this.config.maxSizeBytes,
      ttlMs: this.config.ttlMs,
      persistToDisk: this.config.persistToDisk
    });
  }

  /**
   * Gets a cached session state if available and valid
   */
  getCachedSession(sessionId: string, minVersion?: number): CachedSessionState | null {
    try {
      const cached = this.cache.get(sessionId);
      
      if (!cached) {
        this.missCount++;
        logger.debug('Session cache miss', { sessionId });
        return null;
      }

      // Check if cached version is recent enough
      if (minVersion && cached.version < minVersion) {
        logger.debug('Session cache hit but version too old', {
          sessionId,
          cachedVersion: cached.version,
          requiredVersion: minVersion
        });
        this.cache.delete(sessionId); // Remove stale entry
        this.missCount++;
        return null;
      }

      // Check integrity if enabled
      if (this.config.checkIntegrityOnHit && !this.verifyIntegrity(cached)) {
        logger.warn('Session cache integrity check failed', { sessionId });
        this.cache.delete(sessionId); // Remove corrupted entry
        this.missCount++;
        return null;
      }

      // Update access stats
      cached.lastAccessed = new Date();
      cached.hitCount++;
      this.hitCount++;

      logger.debug('Session cache hit', {
        sessionId,
        version: cached.version,
        age: Date.now() - cached.timestamp.getTime(),
        hitCount: cached.hitCount
      });

      return cached;

    } catch (error) {
      logger.error('Failed to get cached session', {
        sessionId,
        error: error.message
      });
      this.missCount++;
      return null;
    }
  }

  /**
   * Caches a session state
   */
  setCachedSession(sessionId: string, state: CollaborationSession, version: number): void {
    try {
      // Calculate size and checksum
      const sizeInBytes = Buffer.byteLength(JSON.stringify(state), 'utf8');

      // Check if this would exceed memory limits
      if (this.totalSizeBytes + sizeInBytes > this.config.maxSizeBytes) {
        this.evictLeastRecentlyUsed(sizeInBytes);
      }

      const storedState = this.config.compressionEnabled ? this.compressState(state) : state;
      // Compute checksum on the stored (possibly compressed) state so verifyIntegrity matches
      const checksum = crypto.createHash('sha256').update(JSON.stringify(storedState)).digest('hex');

      const cachedState: CachedSessionState = {
        sessionId,
        state: storedState,
        version,
        timestamp: new Date(),
        lastAccessed: new Date(),
        hitCount: 0,
        sizeInBytes,
        checksum
      };

      // Remove old entry size if updating
      const existing = this.cache.get(sessionId);
      if (existing) {
        this.totalSizeBytes -= existing.sizeInBytes;
      }

      this.cache.set(sessionId, cachedState);
      this.totalSizeBytes += sizeInBytes;

      logger.debug('Session cached successfully', {
        sessionId,
        version,
        sizeBytes: sizeInBytes,
        totalCacheSize: this.totalSizeBytes,
        entryCount: this.cache.size
      });

    } catch (error) {
      logger.error('Failed to cache session', {
        sessionId,
        version,
        error: error.message
      });
    }
  }

  /**
   * Invalidates a cached session (e.g., when new events are added)
   */
  invalidateSession(sessionId: string): boolean {
    const existed = this.cache.has(sessionId);
    if (existed) {
      const cached = this.cache.get(sessionId);
      if (cached) {
        this.totalSizeBytes -= cached.sizeInBytes;
      }
      this.cache.delete(sessionId);
      
      logger.debug('Session cache invalidated', { sessionId });
    }
    return existed;
  }

  /**
   * Implements incremental reconstruction from cache
   */
  async reconstructSessionFromCache(
    sessionId: string,
    currentVersion: number,
    newEvents: any[], // Events to apply incrementally
    applyEventsFunction: (baseSession: CollaborationSession, events: any[]) => Promise<CollaborationSession>
  ): Promise<CollaborationSession> {
    try {
      // Try to get cached session
      const cached = this.getCachedSession(sessionId, 0); // Get any cached version
      
      if (cached && cached.version <= currentVersion) {
        logger.debug('Using cached session as base for incremental reconstruction', {
          sessionId,
          cachedVersion: cached.version,
          currentVersion,
          incrementalEvents: newEvents.length
        });

        // Get the base state
        let baseState = this.config.compressionEnabled ? 
          this.decompressState(cached.state) : cached.state;

        // Apply only the new events since cache
        const eventsToApply = newEvents.filter(event => event.sequenceNumber > cached.version);
        
        if (eventsToApply.length === 0) {
          // Cache is fully up to date
          return baseState;
        }

        // Apply incremental events
        const reconstructedState = await applyEventsFunction(baseState, eventsToApply);
        
        // Update cache with new state
        this.setCachedSession(sessionId, reconstructedState, currentVersion);
        
        return reconstructedState;
      } else {
        // No suitable cache, caller should do full reconstruction
        logger.debug('No suitable cache for incremental reconstruction', {
          sessionId,
          cachedVersion: cached?.version,
          currentVersion
        });
        throw new Error('No suitable cache for incremental reconstruction');
      }

    } catch (error) {
      logger.error('Failed incremental reconstruction from cache', {
        sessionId,
        currentVersion,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Preloads frequently accessed sessions
   */
  async preloadFrequentSessions(sessionIds: string[]): Promise<void> {
    if (!this.pool) {
      logger.warn('Cannot preload sessions without database connection');
      return;
    }

    try {
      const client = await this.pool.connect();
      
      // Get session states from persistent cache if available
      const query = `
        SELECT session_id, session_state, version, created_at, hit_count
        FROM session_cache
        WHERE session_id = ANY($1) AND expires_at > NOW()
        ORDER BY hit_count DESC, created_at DESC
      `;
      
      const result = await client.query(query, [sessionIds]);
      client.release();

      for (const row of result.rows) {
        const state = JSON.parse(row.session_state);
        this.setCachedSession(row.session_id, state, row.version);
        
        logger.debug('Preloaded session from persistent cache', {
          sessionId: row.session_id,
          version: row.version,
          hitCount: row.hit_count
        });
      }

      logger.info(`Preloaded ${result.rows.length} sessions from persistent cache`);

    } catch (error) {
      logger.error('Failed to preload frequent sessions', {
        sessionIds: sessionIds.length,
        error: error.message
      });
    }
  }

  /**
   * Gets cache performance statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalHits = this.hitCount;
    const totalRequests = this.hitCount + this.missCount;
    
    return {
      totalEntries: this.cache.size,
      totalSizeBytes: this.totalSizeBytes,
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      averageHitCount: entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.hitCount, 0) / entries.length : 0,
      oldestEntry: entries.length > 0 ? new Date(Math.min(...entries.map(e => e.timestamp.getTime()))) : null,
      newestEntry: entries.length > 0 ? new Date(Math.max(...entries.map(e => e.timestamp.getTime()))) : null,
      memoryPressure: this.totalSizeBytes / this.config.maxSizeBytes,
      evictionCount: this.evictionCount
    };
  }

  /**
   * Clears all cached sessions
   */
  clear(): void {
    this.cache.clear();
    this.totalSizeBytes = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
    
    logger.info('Session cache cleared');
  }

  private verifyIntegrity(cached: CachedSessionState): boolean {
    try {
      const serialized = JSON.stringify(cached.state);
      const checksum = crypto.createHash('sha256').update(serialized).digest('hex');
      return checksum === cached.checksum;
    } catch (error) {
      return false;
    }
  }

  private evictLeastRecentlyUsed(requiredBytes: number): void {
    const entries = Array.from(this.cache.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.value.lastAccessed.getTime() - b.value.lastAccessed.getTime());

    let freedBytes = 0;
    let evictedCount = 0;

    for (const entry of entries) {
      if (freedBytes >= requiredBytes && this.totalSizeBytes < this.config.maxSizeBytes * 0.8) {
        break; // Evicted enough and below 80% capacity
      }

      this.cache.delete(entry.key);
      freedBytes += entry.value.sizeInBytes;
      evictedCount++;
    }

    logger.debug('Evicted sessions for memory pressure', {
      evictedCount,
      freedBytes,
      remainingEntries: this.cache.size,
      remainingSizeBytes: this.totalSizeBytes
    });
  }

  private compressState(state: CollaborationSession): CollaborationSession {
    // Simple compression: remove redundant data and compress JSON
    // In production, you might use a compression library like zlib
    const compressed = {
      ...state,
      // Remove verbose timeline data from cache (can be reconstructed)
      timeline: state.timeline.slice(-10), // Keep only last 10 entries
      // Compress participant activity summaries
      participants: state.participants.map(p => ({
        ...p,
        activitySummary: {
          ...p.activitySummary,
          // Keep only essential metrics
        }
      }))
    };

    return compressed;
  }

  private decompressState(state: CollaborationSession): CollaborationSession {
    // Decompress by filling in any missing data
    return {
      ...state,
      // Could reconstruct full timeline if needed
      timeline: state.timeline || []
    };
  }

  private async syncToDisk(): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      
      // Get entries that haven't been synced recently
      const entries = Array.from(this.cache.entries())
        .filter(([_, cached]) => 
          Date.now() - cached.lastAccessed.getTime() < this.config.diskSyncIntervalMs * 2
        )
        .map(([sessionId, cached]) => ({
          sessionId,
          state: JSON.stringify(cached.state),
          version: cached.version,
          hitCount: cached.hitCount,
          expiresAt: new Date(Date.now() + this.config.ttlMs)
        }));

      if (entries.length === 0) {
        client.release();
        return;
      }

      // Batch insert/update
      const upsertQuery = `
        INSERT INTO session_cache (session_id, session_state, version, hit_count, expires_at, updated_at)
        VALUES ${entries.map((_, i) => 
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5}, NOW())`
        ).join(', ')}
        ON CONFLICT (session_id)
        DO UPDATE SET
          session_state = EXCLUDED.session_state,
          version = EXCLUDED.version,
          hit_count = EXCLUDED.hit_count,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `;

      const params = entries.flatMap(entry => [
        entry.sessionId, entry.state, entry.version, entry.hitCount, entry.expiresAt
      ]);

      await client.query(upsertQuery, params);
      client.release();

      logger.debug('Synced session cache to disk', {
        entriesSynced: entries.length,
        totalCacheSize: this.cache.size
      });

    } catch (error) {
      logger.error('Failed to sync session cache to disk', {
        error: error.message
      });
    }
  }

  async close(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    // Final sync if enabled
    if (this.config.persistToDisk && this.pool) {
      await this.syncToDisk();
    }
    
    this.clear();
    logger.info('Session reconstruction cache closed');
  }
}

// Export singleton instance (configured externally)
export const sessionReconstructionCache = new SessionReconstructionCache();