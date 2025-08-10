import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

let dbPool: Pool | null = null;
let kysely: Kysely<any> | null = null;

export async function getDatabaseConnection(): Promise<Kysely<any>> {
  if (kysely) {
    return kysely;
  }

  if (!dbPool) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://mcp_user:mcp_password@localhost:5432/mcp_tools';
    dbPool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  kysely = new Kysely({
    dialect: new PostgresDialect({
      pool: dbPool,
    }),
  });

  return kysely;
}

export function getPool(): Pool {
  if (!dbPool) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://mcp_user:mcp_password@localhost:5432/mcp_tools';
    dbPool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return dbPool;
}