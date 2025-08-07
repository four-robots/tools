#!/usr/bin/env node

/**
 * Memory Graph MCP Server
 * 
 * A Model Context Protocol server for long-term knowledge persistence and relationship mapping.
 * Based on the @tylercoles/mcp-server framework.
 */

import { MCPServer } from '@tylercoles/mcp-server';
import { HttpTransport } from '@tylercoles/mcp-transport-http';
import { MemoryService, MemoryDatabaseManager, VectorEngine } from '@mcp-tools/core/memory';
import { z } from 'zod';
import { 
  storeMemoryTool,
  retrieveMemoryTool,
  searchMemoriesTool,
  createConnectionTool,
  getRelatedTool,
  mergeMemoriesTool,
  getMemoryStatsTool,
  createConceptTool
} from './tools/index.js';

// Environment configuration (PostgreSQL only)
const config = {
  database: {
    type: 'postgresql' as const,
    connectionString: process.env.DATABASE_URL,
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT) : undefined,
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  },
  natsUrl: process.env.NATS_URL || 'nats://localhost:4222',
  server: {
    name: 'memory-graph-mcp-server',
    version: '1.0.0',
    port: parseInt(process.env.PORT || '8195')
  }
};

async function main() {
  try {
    // Initialize database and vector engine
    console.log('Initializing memory service...');
    const database = new MemoryDatabaseManager(config.database);
    const vectorEngine = new VectorEngine();
    const memoryService = new MemoryService(database, vectorEngine);

    // Create MCP server
    const server = new MCPServer({
      name: config.server.name,
      version: config.server.version
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });

    // Register tools with new ToolModule format
    console.log('Registering MCP tools...');
    
    server.registerTool({
      name: 'store_memory',
      config: {
        description: 'Store a new memory in the graph with automatic relationship detection',
        inputSchema: z.object({
          content: z.string().describe('The memory content to store'),
          context: z.object({
            source: z.string().optional(),
            timestamp: z.string().optional(),
            location: z.string().optional(),
            participants: z.array(z.string()).optional(),
            tags: z.array(z.string()).optional(),
            userId: z.string().optional(),
            projectName: z.string().optional(),
            memoryTopic: z.string().optional(),
            memoryType: z.string().optional()
          }).passthrough().describe('Context information for the memory'),
          concepts: z.array(z.string()).optional().describe('Explicit concepts to associate with this memory'),
          importance: z.number().min(1).max(5).optional().describe('Importance level (1=low, 5=critical)')
        })
      },
      handler: async (args) => await storeMemoryTool(memoryService, args)
    });

    server.registerTool({
      name: 'retrieve_memory',
      config: {
        description: 'Retrieve memories based on query and context filters',
        inputSchema: z.object({
          query: z.string().optional().describe('Search query for memory content'),
          concepts: z.array(z.string()).optional(),
          dateRange: z.object({
            from: z.string(),
            to: z.string()
          }).optional(),
          context: z.object({}).passthrough().optional(),
          userId: z.string().optional(),
          projectName: z.string().optional(),
          similarityThreshold: z.number().min(0).max(1).optional(),
          limit: z.number().min(1).max(100).optional()
        })
      },
      handler: async (args) => await retrieveMemoryTool(memoryService, args)
    });

    server.registerTool({
      name: 'search_memories',
      config: {
        description: 'Perform semantic search across all memories',
        inputSchema: z.object({
          query: z.string().describe('Search query'),
          contextFilters: z.object({}).passthrough().optional(),
          conceptFilters: z.array(z.string()).optional(),
          includeRelated: z.boolean().optional(),
          maxDepth: z.number().min(1).max(5).optional(),
          userId: z.string().optional(),
          projectName: z.string().optional(),
          similarityThreshold: z.number().min(0).max(1).optional(),
          limit: z.number().min(1).max(100).optional()
        })
      },
      handler: async (args) => await searchMemoriesTool(memoryService, args)
    });

    server.registerTool({
      name: 'create_connection',
      config: {
        description: 'Create an explicit relationship between two memories',
        inputSchema: z.object({
          sourceId: z.string(),
          targetId: z.string(),
          relationshipType: z.enum(['semantic_similarity', 'causal', 'temporal', 'conceptual', 'custom']),
          strength: z.number().min(0).max(1).optional(),
          metadata: z.object({}).passthrough().optional(),
          bidirectional: z.boolean().optional()
        })
      },
      handler: async (args) => await createConnectionTool(memoryService, args)
    });

    server.registerTool({
      name: 'get_related',
      config: {
        description: 'Find memories related to a specific memory through the relationship graph',
        inputSchema: z.object({
          memoryId: z.string(),
          relationshipTypes: z.array(z.string()).optional(),
          maxDepth: z.number().min(1).max(5).optional(),
          minStrength: z.number().min(0).max(1).optional()
        })
      },
      handler: async (args) => await getRelatedTool(memoryService, args)
    });

    server.registerTool({
      name: 'merge_memories',
      config: {
        description: 'Merge multiple memories into one, combining their content and relationships',
        inputSchema: z.object({
          primaryMemoryId: z.string(),
          secondaryMemoryIds: z.array(z.string()),
          strategy: z.enum(['combine_content', 'preserve_primary', 'create_summary'])
        })
      },
      handler: async (args) => await mergeMemoriesTool(memoryService, args)
    });

    server.registerTool({
      name: 'get_memory_stats',
      config: {
        description: 'Get statistics and insights about the memory graph',
        inputSchema: z.object({
          userId: z.string().optional(),
          projectName: z.string().optional(),
          dateRange: z.object({
            from: z.string(),
            to: z.string()
          }).optional()
        })
      },
      handler: async (args) => await getMemoryStatsTool(memoryService, args)
    });

    server.registerTool({
      name: 'create_concept',
      config: {
        description: 'Create or update a concept in the knowledge graph',
        inputSchema: z.object({
          name: z.string(),
          description: z.string().optional(),
          type: z.enum(['entity', 'topic', 'skill', 'project', 'person', 'custom']),
          relatedMemoryIds: z.array(z.string()).optional()
        })
      },
      handler: async (args) => await createConceptTool(memoryService, args)
    });

    // Register resources
    server.registerResourceTemplate('memory-by-id', 'memory://memory/{id}', {
      title: 'Memory by ID',
      description: 'Access a specific memory by its ID',
      mimeType: 'application/json'
    }, async (uri) => {
      const uriString = typeof uri === 'string' ? uri : uri.toString();
      const match = uriString.match(/memory:\/\/memory\/(.+)/);
      if (!match) {
        throw new Error('Invalid memory URI format');
      }

      const memoryId = match[1];
      const memoryRecord = await database.getMemory(memoryId);
      if (!memoryRecord) {
        throw new Error('Memory not found');
      }
      
      const concepts = await database.getMemoryConcepts(memoryId);
      const memory = memoryService['convertToMemoryNode'](memoryRecord, concepts.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description || undefined,
        type: c.type,
        confidence: c.confidence,
        extractedAt: c.extracted_at
      })));
      
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(memory, null, 2)
        }]
      };
    });

    server.registerResourceTemplate('memory-search', 'memory://search/{query}', {
      title: 'Memory Search',
      description: 'Search memories by query',
      mimeType: 'application/json'
    }, async (uri) => {
      const uriString = typeof uri === 'string' ? uri : uri.toString();
      const match = uriString.match(/memory:\/\/search\/(.+)/);
      if (!match) {
        throw new Error('Invalid search URI format');
      }

      const query = decodeURIComponent(match[1]);
      const results = await memoryService.searchMemories({ query });
      
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(results, null, 2)
        }]
      };
    });

    server.registerResource('memory-stats', 'memory://stats', {
      title: 'Memory Statistics',
      description: 'Get memory graph statistics',
      mimeType: 'application/json'
    }, async () => {
      const stats = await memoryService.getMemoryStats();
      
      return {
        contents: [{
          uri: 'memory://stats',
          mimeType: 'application/json',
          text: JSON.stringify(stats, null, 2)
        }]
      };
    });

    // Register prompts
    server.registerPrompt('analyze_memory_patterns', {
      title: 'Analyze Memory Patterns',
      description: 'Analyze patterns in stored memories to identify insights and relationships',
      argsSchema: z.object({
        user_id: z.string().optional().describe('User ID to analyze memories for'),
        time_range: z.string().optional().describe('Time range for analysis (e.g., "last_week", "last_month")')
      })
    }, async (args) => {
      const stats = await memoryService.getMemoryStats();
      const prompt = `You are a memory pattern analyst. Analyze the following memory statistics and provide insights:

Memory Statistics:
- Total Memories: ${stats.totalMemories}
- Total Relationships: ${stats.totalRelationships}
- Total Concepts: ${stats.totalConcepts}
- Average Importance: ${stats.averageImportance}/5

${args?.user_id ? `Focus on patterns for user: ${args.user_id}` : 'Analyze patterns across all users'}
${args?.time_range ? `Time range: ${args.time_range}` : 'Consider all available data'}

Provide insights on:
1. Memory clustering and relationship patterns
2. Concept distribution and importance trends
3. User behavior patterns (if applicable)
4. Recommendations for memory organization
`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: prompt
            }
          }
        ]
      };
    });

    server.registerPrompt('memory_summary', {
      title: 'Memory Summary',
      description: 'Generate a summary of memories related to a specific topic or concept',
      argsSchema: z.object({
        topic: z.string().describe('Topic or concept to summarize memories for'),
        depth: z.number().optional().describe('Analysis depth (1-5, where 5 is most detailed)')
      })
    }, async (args) => {
      if (!args?.topic) {
        throw new Error('Topic argument is required for memory summary');
      }
      
      const searchResults = await memoryService.searchMemories({
        query: args.topic,
        limit: 20
      });
      
      const memoriesText = searchResults.memories.map(m => 
        `Memory ID: ${m.id}\nContent: ${m.content}\nConcepts: ${m.concepts.map(c => c.name).join(', ')}\nCreated: ${m.createdAt}\n`
      ).join('\n---\n\n');
      
      const depth = args?.depth || 3;
      const prompt = `You are a memory summarizer. Create a comprehensive summary of memories related to "${args.topic}".

Analysis Depth: ${depth}/5 (${depth <= 2 ? 'Brief' : depth <= 3 ? 'Moderate' : 'Detailed'})

Related Memories:
${memoriesText}

Please provide:
1. Key themes and patterns across these memories
2. Important concepts and their relationships
3. Timeline of developments (if applicable)
4. Insights and actionable takeaways
5. Connections to other potential topics

Format as a well-structured summary with clear sections.`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: prompt
            }
          }
        ]
      };
    });

    // Start server
    const transport = new HttpTransport({
        port: config.server.port,
        host: '0.0.0.0', // Bind to all interfaces for Docker compatibility
        cors: {
            origin: ['http://localhost:3000', 'http://localhost:5173'],
            credentials: true,
        },
    });
    
    server.useTransport(transport);
    await server.start();
    
    console.log(`✅ Memory Graph MCP Server started on port ${config.server.port}`);
    console.log('📚 Available resources:');
    console.log('   • memory://memory/{id} - Specific memory details');
    console.log('   • memory://search/{query} - Search results');
    console.log('   • memory://stats - Memory statistics');
    console.log('📋 Available prompts:');
    console.log('   • analyze_memory_patterns - Analyze memory patterns');
    console.log('   • memory_summary - Generate topic summaries');
    console.log('Server ready to handle MCP requests');

  } catch (error) {
    console.error('Failed to start Memory Graph MCP Server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Memory Graph MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down Memory Graph MCP Server...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}