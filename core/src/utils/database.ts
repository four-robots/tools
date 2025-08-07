/**
 * Database Utilities - PostgreSQL database abstraction layer
 */

import { Kysely, sql } from 'kysely';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export interface DatabaseConfig {
  type: 'postgresql';
  // PostgreSQL config
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  poolSize?: number;
  ssl?: boolean;
  // Connection health
  connectionTimeout?: number;
  idleTimeout?: number;
  maxRetries?: number;
}

export interface DatabaseHealthCheck {
  isHealthy: boolean;
  latency?: number;
  error?: string;
  timestamp: string;
}

export function createDatabaseConfig(options: Partial<DatabaseConfig> = {}): DatabaseConfig {
  const defaults: DatabaseConfig = {
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    poolSize: 10,
    ssl: false,
    connectionTimeout: 30000,
    idleTimeout: 30000,
    maxRetries: 3
  };
  
  return { ...defaults, ...options };
}

export function createKyselyInstance<T>(config: DatabaseConfig): Kysely<T> {
  if (config.type !== 'postgresql') {
    throw new Error(`Only PostgreSQL is supported. Received: ${config.type}`);
  }
  
  // Use connectionString if available, otherwise use individual fields
  const poolConfig: any = {
    max: config.poolSize || 10,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: config.connectionTimeout || 30000,
    idleTimeoutMillis: config.idleTimeout || 30000
  };

  if (config.connectionString) {
    poolConfig.connectionString = config.connectionString;
  } else {
    poolConfig.host = config.host;
    poolConfig.port = config.port;
    poolConfig.database = config.database;
    poolConfig.user = config.user;
    poolConfig.password = config.password;
  }

  const pool = new Pool(poolConfig);
  
  return new Kysely<T>({
    dialect: new PostgresDialect({ pool })
  });
}

export async function testDatabaseConnection<T>(db: Kysely<T>): Promise<DatabaseHealthCheck> {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  try {
    await sql`SELECT 1`.execute(db);
    const latency = Date.now() - start;
    
    return {
      isHealthy: true,
      latency,
      timestamp
    };
  } catch (error) {
    return {
      isHealthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    };
  }
}

export class DatabaseConnectionManager<T> {
  private db: Kysely<T>;
  private config: DatabaseConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck?: DatabaseHealthCheck;
  private reconnectAttempts = 0;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.db = createKyselyInstance<T>(config);
  }

  get kysely(): Kysely<T> {
    return this.db;
  }

  async initialize(): Promise<void> {
    console.log(`🔌 Initializing ${this.config.type} database connection...`);
    
    // Test initial connection
    const healthCheck = await testDatabaseConnection(this.db);
    this.lastHealthCheck = healthCheck;
    
    if (!healthCheck.isHealthy) {
      throw new Error(`Failed to connect to database: ${healthCheck.error}`);
    }
    
    console.log(`✅ Database connected successfully (${healthCheck.latency}ms latency)`);
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  async healthCheck(): Promise<DatabaseHealthCheck> {
    const result = await testDatabaseConnection(this.db);
    this.lastHealthCheck = result;
    return result;
  }

  getLastHealthCheck(): DatabaseHealthCheck | undefined {
    return this.lastHealthCheck;
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.healthCheck();
        if (!health.isHealthy) {
          console.warn(`⚠️  Database health check failed: ${health.error}`);
          await this.attemptReconnection();
        }
      } catch (error) {
        console.error('❌ Health check error:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= (this.config.maxRetries || 3)) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting database reconnection (${this.reconnectAttempts}/${this.config.maxRetries || 3})...`);
    
    try {
      // Close existing connection
      await this.db.destroy();
      
      // Create new connection
      this.db = createKyselyInstance<T>(this.config);
      
      // Test connection
      const healthCheck = await testDatabaseConnection(this.db);
      
      if (healthCheck.isHealthy) {
        console.log('✅ Database reconnection successful');
        this.reconnectAttempts = 0;
      } else {
        console.error(`❌ Reconnection failed: ${healthCheck.error}`);
      }
    } catch (error) {
      console.error('❌ Reconnection error:', error);
    }
  }

  async close(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    try {
      await this.db.destroy();
      console.log('🔌 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database:', error);
    }
  }

  // Helper method for dialect-specific SQL
  getDialectType(): 'postgresql' {
    return this.config.type;
  }

  // Helper for creating cross-dialect compatible timestamps
  getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  // Helper for cross-dialect JSON operations
  createJsonColumn(value: any): string {
    return JSON.stringify(value);
  }

  parseJsonColumn(value: string): any {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}