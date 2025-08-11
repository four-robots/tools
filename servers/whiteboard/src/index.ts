#!/usr/bin/env node

import { MCPServer, LogLevel } from '@tylercoles/mcp-server';
import { HttpTransport } from '@tylercoles/mcp-transport-http';
import { DatabaseConnection } from './database/index.js';
import { WhiteboardTools } from './tools/index.js';
import { Logger } from './utils/logger.js';

const logger = new Logger('WhiteboardMCPServer');

// Configuration
const config = {
  port: parseInt(process.env.PORT || '8195'),
  host: process.env.HOST || '0.0.0.0',
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'mcp_tools',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
  },
};

async function createWhiteboardServer() {
  // Initialize database connection
  logger.info('Initializing whiteboard database...');
  const db = new DatabaseConnection();
  await db.initialize();
  logger.info('Whiteboard database initialized');

  // Initialize whiteboard tools
  logger.info('Initializing whiteboard tools...');
  const whiteboardTools = new WhiteboardTools(db, logger);
  logger.info('Whiteboard tools initialized');

  // Create MCP server with logging configuration
  const server = new MCPServer({
    name: 'whiteboard-server',
    version: '1.0.0',
    capabilities: {
      logging: {
        supportedLevels: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
        supportsStructuredLogs: true,
        supportsLoggerNamespaces: true
      }
    },
    logging: {
      level: LogLevel.Info,
      structured: false,
      includeTimestamp: true,
      includeSource: false,
      maxMessageLength: 8192
    }
  });

  // Register all whiteboard tools
  await whiteboardTools.registerTools(server);

  // Register resources
  server.registerResource('all-whiteboards', 'whiteboard://whiteboards', {
    title: 'All Whiteboards',
    description: 'List of all whiteboards',
    mimeType: 'application/json',
  }, async () => {
    // TODO: Implement listing all whiteboards
    return {
      contents: [{
        uri: 'whiteboard://whiteboards',
        mimeType: 'application/json',
        text: JSON.stringify({ whiteboards: [] }, null, 2),
      }]
    };
  });

  server.registerResourceTemplate('whiteboard-details', 'whiteboard://whiteboard/{whiteboard_id}', {
    title: 'Whiteboard Details',
    description: 'Detailed information about a specific whiteboard',
    mimeType: 'application/json',
  }, async (uri: URL) => {
    return whiteboardTools.handleResource(uri.toString());
  });

  // Setup HTTP transport
  const httpTransport = new HttpTransport({
    port: config.port,
    host: config.host,
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
    },
  });

  server.useTransport(httpTransport);

  // Start server
  await server.start();

  // Setup graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down server...');
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, db, whiteboardTools };
}

async function main() {
  try {
    logger.info('Starting Whiteboard MCP Server...', {
      port: config.port,
      host: config.host,
      version: '1.0.0'
    });

    const { server, db, whiteboardTools } = await createWhiteboardServer();

    logger.info('Whiteboard MCP Server is running!', {
      httpEndpoint: `http://${config.host}:${config.port}/mcp`,
      healthEndpoint: `http://${config.host}:${config.port}/health`
    });

    console.log('\n🚀 Whiteboard MCP Server Started Successfully!');
    console.log(`📊 Database: PostgreSQL`);
    console.log(`🌐 HTTP Server: http://${config.host}:${config.port}`);
    console.log('\n📚 Available endpoints:');
    console.log(`   • MCP HTTP: http://${config.host}:${config.port}/mcp`);
    console.log(`   • Health: http://${config.host}:${config.port}/health`);
    console.log('\n🛠️  Available tools:');
    console.log('   • Whiteboard management: create_whiteboard, get_whiteboard, update_whiteboard, delete_whiteboard, list_whiteboards');
    console.log('   • Element management: add_element, update_element, delete_element');
    console.log('\n📚 Available resources:');
    console.log('   • whiteboard://whiteboards - List all whiteboards');
    console.log('   • whiteboard://whiteboard/{id} - Detailed whiteboard data');

  } catch (error) {
    logger.error('Failed to start Whiteboard MCP Server', { error });
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };