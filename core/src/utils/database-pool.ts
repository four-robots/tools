import { Pool, PoolConfig } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

/**
 * Database Connection Pool Manager
 * 
 * Manages PostgreSQL connection pools with optimized settings for performance
 * and resource efficiency. Provides connection pool monitoring and health checks.
 */

interface DatabaseConnectionPoolConfig extends PoolConfig {
  // Custom configuration options
  healthCheckInterval?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
}

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxConnections: number;
  isHealthy: boolean;
  lastHealthCheck: Date;
}

/**
 * Enhanced connection pool with monitoring and health checks
 */
export class DatabaseConnectionPool {
  private pool: Pool;
  private config: DatabaseConnectionPoolConfig;
  private healthCheckInterval: NodeJS.Timer | null = null;
  private stats: PoolStats;

  constructor(config: DatabaseConnectionPoolConfig = {}) {
    // Optimized default configuration for saved search workloads
    this.config = {
      // Connection limits
      max: 20, // Maximum connections in pool
      min: 2,  // Minimum connections to maintain
      
      // Timeout settings
      connectionTimeoutMillis: 5000, // 5 seconds to establish connection
      idleTimeoutMillis: 30000, // 30 seconds idle timeout
      acquireTimeoutMillis: 10000, // 10 seconds to acquire connection from pool
      
      // Query timeout
      statement_timeout: 30000, // 30 seconds for queries
      query_timeout: 25000, // 25 seconds query timeout (shorter than statement)
      
      // Health check settings
      healthCheckInterval: 60000, // 1 minute health checks
      
      // Connection validation
      application_name: 'mcp-tools-saved-search',
      
      // Performance optimizations
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
      
      // Override with provided config
      ...config,
    };

    // Initialize connection pool
    this.pool = new Pool(this.config);
    
    // Initialize stats
    this.stats = {
      totalConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      maxConnections: this.config.max || 10,
      isHealthy: true,
      lastHealthCheck: new Date(),
    };

    // Set up event listeners
    this.setupEventListeners();
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get a Kysely database instance using this connection pool
   */
  getKyselyDatabase(): Kysely<any> {
    return new Kysely({
      dialect: new PostgresDialect({
        pool: this.pool,
      }),
    });
  }

  /**
   * Get the raw PostgreSQL pool (use sparingly)
   */
  getRawPool(): Pool {
    return this.pool;
  }

  /**
   * Get current pool statistics
   */
  getPoolStats(): PoolStats {
    return {
      ...this.stats,
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
    };
  }

  /**
   * Perform a health check on the connection pool
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT 1 as health_check');
        const isHealthy = result.rows[0]?.health_check === 1;
        
        this.stats.isHealthy = isHealthy;
        this.stats.lastHealthCheck = new Date();
        
        return isHealthy;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Database pool health check failed:', error);
      this.stats.isHealthy = false;
      this.stats.lastHealthCheck = new Date();
      return false;
    }
  }

  /**
   * Get detailed connection pool metrics for monitoring
   */
  async getDetailedMetrics(): Promise<{
    pool: PoolStats;
    performance: {
      averageAcquireTime: number;
      averageQueryTime: number;
      errorRate: number;
    };
    database: {
      activeConnections: number;
      maxConnections: number;
      connectionUtilization: number;
    };
  }> {
    const poolStats = this.getPoolStats();
    
    try {
      const client = await this.pool.connect();
      try {
        // Get database-level connection info
        const dbStatsQuery = `
          SELECT 
            count(*) as active_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
          FROM pg_stat_activity 
          WHERE datname = current_database() 
          AND state = 'active'
        `;
        
        const dbResult = await client.query(dbStatsQuery);
        const dbStats = dbResult.rows[0];
        
        return {
          pool: poolStats,
          performance: {
            averageAcquireTime: 0, // Would need to track this over time
            averageQueryTime: 0,   // Would need to track this over time
            errorRate: 0,          // Would need to track this over time
          },
          database: {
            activeConnections: parseInt(dbStats.active_connections),
            maxConnections: parseInt(dbStats.max_connections),
            connectionUtilization: poolStats.totalConnections / poolStats.maxConnections,
          },
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Failed to get detailed pool metrics:', error);
      return {
        pool: poolStats,
        performance: {
          averageAcquireTime: -1,
          averageQueryTime: -1,
          errorRate: -1,
        },
        database: {
          activeConnections: -1,
          maxConnections: -1,
          connectionUtilization: -1,
        },
      };
    }
  }

  /**
   * Close all connections and clean up
   */
  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    await this.pool.end();
    console.log('Database connection pool closed');
  }

  /**
   * Execute a query with automatic retry logic
   */
  async executeWithRetry<T>(
    queryFn: (db: Kysely<any>) => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    const db = this.getKyselyDatabase();
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await queryFn(db);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Query attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Query failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Execute a transaction with retry logic
   */
  async executeTransaction<T>(
    transactionFn: (db: Kysely<any>) => Promise<T>,
    maxRetries: number = 2
  ): Promise<T> {
    return this.executeWithRetry(
      async (db) => {
        return db.transaction().execute(transactionFn);
      },
      maxRetries
    );
  }

  // Private methods

  private setupEventListeners(): void {
    this.pool.on('connect', (client) => {
      console.log('Database pool: New client connected');
    });

    this.pool.on('acquire', (client) => {
      console.debug('Database pool: Client acquired from pool');
    });

    this.pool.on('remove', (client) => {
      console.log('Database pool: Client removed from pool');
    });

    this.pool.on('error', (error, client) => {
      console.error('Database pool error:', error);
      this.stats.isHealthy = false;
    });
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckInterval || 60000;
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.healthCheck();
        
        // Log stats periodically
        const stats = this.getPoolStats();
        console.debug('Database pool stats:', stats);
        
        // Warn if pool utilization is high
        const utilization = stats.totalConnections / stats.maxConnections;
        if (utilization > 0.8) {
          console.warn(`High database pool utilization: ${Math.round(utilization * 100)}%`);
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, interval);
  }
}

/**
 * Singleton instance for application-wide use
 */
let globalPool: DatabaseConnectionPool | null = null;

/**
 * Get or create the global database pool
 */
export function getGlobalDatabaseConnectionPool(config?: DatabaseConnectionPoolConfig): DatabaseConnectionPool {
  if (!globalPool) {
    globalPool = new DatabaseConnectionPool(config);
  }
  return globalPool;
}

/**
 * Close the global database pool
 */
export async function closeGlobalDatabaseConnectionPool(): Promise<void> {
  if (globalPool) {
    await globalPool.close();
    globalPool = null;
  }
}

/**
 * Create a new isolated database pool (for testing or special use cases)
 */
export function createDatabaseConnectionPool(config?: DatabaseConnectionPoolConfig): DatabaseConnectionPool {
  return new DatabaseConnectionPool(config);
}

/**
 * Alias for DatabaseConnectionPool for backwards compatibility
 */
export { DatabaseConnectionPool as DatabasePool };