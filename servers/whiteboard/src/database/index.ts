import { Pool, PoolClient } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { Logger } from '../utils/logger.js';

/**
 * Database schema interface for Kysely
 */
export interface Database {
  whiteboards: {
    id: string;
    workspace_id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    canvas_data: any;
    settings: any;
    template_id?: string;
    is_template: boolean;
    visibility: string;
    status: string;
    version: number;
    created_by: string;
    last_modified_by: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
  };
  
  whiteboard_elements: {
    id: string;
    whiteboard_id: string;
    element_type: string;
    element_data: any;
    layer_index: number;
    parent_id?: string;
    locked: boolean;
    visible: boolean;
    style_data: any;
    metadata: any;
    version: number;
    created_by: string;
    last_modified_by: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
  };
  
  whiteboard_sessions: {
    id: string;
    whiteboard_id: string;
    user_id: string;
    session_token: string;
    connection_id?: string;
    cursor_position?: any;
    selection_data?: any;
    viewport_data?: any;
    presence_data: any;
    tools_state: any;
    is_active: boolean;
    permissions: any;
    started_at: string;
    last_activity_at: string;
    ended_at?: string;
  };
  
  whiteboard_permissions: {
    id: string;
    whiteboard_id: string;
    user_id: string;
    role: string;
    permissions: any;
    granted_by: string;
    expires_at?: string;
    created_at: string;
    updated_at: string;
  };
  
  whiteboard_templates: {
    id: string;
    name: string;
    description?: string;
    category: string;
    thumbnail?: string;
    template_data: any;
    default_settings: any;
    tags: string[];
    is_public: boolean;
    workspace_id?: string;
    usage_count: number;
    rating?: number;
    created_by: string;
    created_at: string;
    updated_at: string;
  };
  
  whiteboard_activity_log: {
    id: string;
    whiteboard_id: string;
    user_id: string;
    session_id?: string;
    action: string;
    target_type: string;
    target_id?: string;
    action_data: any;
    old_data?: any;
    new_data?: any;
    operation_id?: string;
    client_metadata: any;
    created_at: string;
  };
  
  whiteboard_comments: {
    id: string;
    whiteboard_id: string;
    element_id?: string;
    parent_id?: string;
    content: string;
    content_type: string;
    position?: any;
    resolved: boolean;
    resolved_by?: string;
    resolved_at?: string;
    mentions: string[];
    attachments: any;
    created_by: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
  };
  
  whiteboard_versions: {
    id: string;
    whiteboard_id: string;
    version_number: number;
    snapshot_data: any;
    changes_summary: any;
    change_type: string;
    created_by: string;
    commit_message?: string;
    is_automatic: boolean;
    created_at: string;
  };
}

/**
 * Database connection wrapper for whiteboard operations
 */
export class DatabaseConnection {
  private pool: Pool | null = null;
  private db: Kysely<Database> | null = null;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('WhiteboardDatabase');
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    try {
      const config = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'mcp_tools',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        this.logger.info('Database connection established successfully');
      } finally {
        client.release();
      }

      // Initialize Kysely
      this.db = new Kysely<Database>({
        dialect: new PostgresDialect({
          pool: this.pool,
        }),
      });

      this.logger.info('Whiteboard database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database', { error });
      throw error;
    }
  }

  /**
   * Get Kysely database instance
   */
  getDb(): Kysely<Database> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Execute raw SQL query
   */
  async query(text: string, params: any[] = []): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }

    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      this.logger.error('Database query error', { error, query: text, params });
      throw error;
    }
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return await this.pool.connect();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    this.logger.info('Database connection closed');
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }

      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.error('Database health check failed', { error });
      return false;
    }
  }
}