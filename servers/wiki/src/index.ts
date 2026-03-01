#!/usr/bin/env node

import { MCPServer, LogLevel } from '@tylercoles/mcp-server';
import { HttpTransport } from '@tylercoles/mcp-transport-http';
import { WikiDatabase, DatabaseConfig } from './database/index.js';
import { registerTools } from './tools/index.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration (PostgreSQL only)
const config = {
  port: parseInt(process.env.PORT || '8196'),
  host: process.env.HOST || '0.0.0.0', // Bind to all interfaces for Docker compatibility
  database: {
    type: 'postgres' as const,
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  } as DatabaseConfig,
};

async function createWikiServer() {
  // Initialize database
  console.log('🔧 Initializing database...');
  const db = new WikiDatabase(config.database);
  await db.initialize();
  console.log('✅ Database initialized');

  // Create MCP server with logging configuration
  const server = new MCPServer({
    name: 'wiki',
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

  // Register tools
  registerTools(server, db);

  // Add resources for wiki data access
  server.registerResource('all-pages', 'wiki://pages', {
    title: 'All Pages',
    description: 'List of all wiki pages',
    mimeType: 'application/json',
  }, async () => {
    const pages = await db.getPages();
    return {
      contents: [{
        uri: 'wiki://pages',
        mimeType: 'application/json',
        text: JSON.stringify(pages, null, 2),
      }]
    };
  });

  server.registerResourceTemplate('page-details', 'wiki://page/{page_id}', {
    title: 'Page Details',
    description: 'Detailed information about a specific page',
    mimeType: 'application/json',
  }, async (uri: any) => {
    const uriString = typeof uri === 'string' ? uri : uri.toString();
    const match = uriString.match(/wiki:\/\/page\/([a-f0-9-]+)/i);
    if (!match) {
      throw new Error('Invalid page URI format');
    }

    const pageId = match[1];
    const page = await db.getPageById(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }

    const [categories, tags, comments] = await Promise.all([
      db.getPageCategories(pageId),
      db.getPageTags(pageId),
      db.getPageComments(pageId),
    ]);

    const pageData = {
      page,
      categories,
      tags,
      comments,
    };

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(pageData, null, 2),
      }]
    };
  });

  server.registerResourceTemplate('page-by-slug', 'wiki://slug/{slug}', {
    title: 'Page by Slug',
    description: 'Page information by slug',
    mimeType: 'application/json',
  }, async (uri: any) => {
    const uriString = typeof uri === 'string' ? uri : uri.toString();
    const match = uriString.match(/wiki:\/\/slug\/(.+)/);
    if (!match) {
      throw new Error('Invalid slug URI format');
    }

    let slug: string;
    try {
      slug = decodeURIComponent(match[1]);
    } catch {
      throw new Error('Invalid slug URI: malformed percent-encoding');
    }
    const page = await db.getPageBySlug(slug);
    if (!page) {
      throw new Error(`Page with slug "${slug}" not found`);
    }

    const [categories, tags, comments] = await Promise.all([
      db.getPageCategories(page.id!),
      db.getPageTags(page.id!),
      db.getPageComments(page.id!),
    ]);

    const pageData = {
      page,
      categories,
      tags,
      comments,
    };

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(pageData, null, 2),
      }]
    };
  });

  server.registerResource('categories', 'wiki://categories', {
    title: 'All Categories',
    description: 'List of all wiki categories',
    mimeType: 'application/json',
  }, async () => {
    const categories = await db.getCategories();
    return {
      contents: [{
        uri: 'wiki://categories',
        mimeType: 'application/json',
        text: JSON.stringify(categories, null, 2),
      }]
    };
  });

  server.registerResource('tags', 'wiki://tags', {
    title: 'All Tags',
    description: 'List of all wiki tags',
    mimeType: 'application/json',
  }, async () => {
    const tags = await db.getTags();
    return {
      contents: [{
        uri: 'wiki://tags',
        mimeType: 'application/json',
        text: JSON.stringify(tags, null, 2),
      }]
    };
  });

  server.registerResource('wiki-stats', 'wiki://stats', {
    title: 'Wiki Statistics',
    description: 'Statistics and analytics for the wiki',
    mimeType: 'application/json',
  }, async () => {
    const stats = await db.getStats();
    return {
      contents: [{
        uri: 'wiki://stats',
        mimeType: 'application/json',
        text: JSON.stringify({
          ...stats,
          generated_at: new Date().toISOString(),
        }, null, 2),
      }]
    };
  });

  server.registerResourceTemplate('search-results', 'wiki://search/{query}', {
    title: 'Search Results',
    description: 'Pages matching a search query',
    mimeType: 'application/json',
  }, async (uri: any) => {
    const uriString = typeof uri === 'string' ? uri : uri.toString();
    const match = uriString.match(/wiki:\/\/search\/(.+)/);
    if (!match) {
      throw new Error('Invalid search URI format');
    }

    let query: string;
    try {
      query = decodeURIComponent(match[1]);
    } catch {
      throw new Error('Invalid search URI: malformed percent-encoding');
    }
    const pages = await db.searchPages(query);

    const searchResults = {
      query,
      total_results: pages.length,
      pages,
      generated_at: new Date().toISOString(),
    };

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(searchResults, null, 2),
      }]
    };
  });

  // Add prompts for common workflows
  server.registerPrompt('create_knowledge_base', {
    title: 'Create Knowledge Base',
    description: 'Create a structured knowledge base with categories and initial pages',
    argsSchema: z.object({
      topic: z.string().describe('Main topic or subject of the knowledge base'),
      categories: z.array(z.string()).optional().describe('List of categories to create'),
    }),
  }, (args: any) => {
    const { topic, categories = [] } = args;
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please create a knowledge base for "${topic}". ${categories.length > 0 ? `Create categories for: ${categories.join(', ')}.` : ''} Create an index page with overview and navigation, then create initial pages for key concepts. Use appropriate linking between related pages.`,
          },
        },
      ],
    };
  });

  server.registerPrompt('wiki_maintenance', {
    title: 'Wiki Maintenance Report',
    description: 'Generate a maintenance report for the wiki',
    argsSchema: z.object({}),
  }, (args: any) => {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a wiki maintenance report including:
1. Statistics overview (total pages, categories, tags)
2. Pages that might need updates (old or incomplete)
3. Orphaned pages (no incoming links)
4. Categories or tags that are unused
5. Recommendations for improving wiki organization

Use the wiki tools to gather this information and provide actionable insights.`,
          },
        },
      ],
    };
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

  // Start the server
  await server.start();

  // Setup graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down server...');
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, db };
}

async function main() {
  try {
    console.log('🚀 Starting Wiki MCP Server...');
    console.log(`📊 Database: ${config.database.type}`);
    console.log(`🌐 HTTP Server: http://${config.host}:${config.port}`);

    const { server, db } = await createWikiServer();

    console.log('✅ Wiki MCP Server is running!');
    console.log('\n📚 Available endpoints:');
    console.log(`   • MCP HTTP: http://${config.host}:${config.port}/mcp`);
    console.log(`   • Health: http://${config.host}:${config.port}/health`);
    console.log('\n🛠️  Available tools:');
    console.log('   • Page management: get_pages, get_page, create_page, update_page, delete_page');
    console.log('   • Navigation: get_navigation');
    console.log('   • Categories: get_categories, create_category');
    console.log('   • Tags: get_tags, create_tag');
    console.log('   • Comments: get_page_comments, add_comment, delete_comment');
    console.log('   • Search: search_pages, get_wiki_stats');
    console.log('\n📋 Available prompts:');
    console.log('   • create_knowledge_base - Set up structured knowledge base');
    console.log('   • wiki_maintenance - Generate maintenance reports');
    console.log('\n📚 Available resources:');
    console.log('   • wiki://pages - List all pages');
    console.log('   • wiki://page/{id} - Detailed page data');
    console.log('   • wiki://slug/{slug} - Page by slug');
    console.log('   • wiki://categories - All categories');
    console.log('   • wiki://tags - All tags');
    console.log('   • wiki://stats - Wiki statistics');
    console.log('   • wiki://search/{query} - Search results');

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();