#!/usr/bin/env node

import { Pool } from 'pg';
import { createLogger, format, transports } from 'winston';
import { loadConfig, Config } from './config.js';
import { AlertProcessorWorker } from './worker.js';

/**
 * Alert Processor Worker Entry Point
 * 
 * Main entry point for the alert processor background worker.
 * Handles configuration loading, database connection setup,
 * logging configuration, and graceful shutdown.
 */

async function main() {
  console.log('🚀 Starting Alert Processor Worker...');
  
  try {
    // Load configuration
    const config = loadConfig();
    
    // Setup logger
    const logger = createLogger({
      level: config.monitoring.logLevel,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple(),
            format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} [${level}] ${message}${metaStr}`;
            })
          ),
        }),
      ],
    });

    // Log startup configuration (without sensitive data)
    logger.info('Alert Processor Worker starting with configuration', {
      postgres: {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
      },
      worker: config.worker,
      notifications: config.notifications,
      monitoring: config.monitoring,
    });

    // Setup database connection
    const connectionString = config.postgres.connectionString || 
      `postgresql://${config.postgres.user}:${config.postgres.password}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`;
    
    const db = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Test database connection
    logger.info('Testing database connection...');
    try {
      const client = await db.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('✅ Database connection successful');
    } catch (error) {
      logger.error('❌ Database connection failed', { error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }

    // Create and start worker
    const worker = new AlertProcessorWorker(config, db, logger);
    
    // Setup graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      try {
        await worker.stop();
        logger.info('Worker stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: error instanceof Error ? error.message : String(error) });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });

    // Start the worker
    await worker.start();
    
    // Log status
    const status = worker.getStatus();
    logger.info('✅ Alert Processor Worker is running', { status });

    // Keep the process running
    process.on('exit', (code) => {
      logger.info(`Process exiting with code ${code}`);
    });

  } catch (error) {
    console.error('❌ Failed to start Alert Processor Worker:', error);
    process.exit(1);
  }
}

// Handle module execution
const currentFilePath = new URL(import.meta.url).pathname;
const isMainModule = process.argv[1] === currentFilePath || process.argv[1].endsWith('index.js');

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { AlertProcessorWorker, loadConfig };
export type { Config };