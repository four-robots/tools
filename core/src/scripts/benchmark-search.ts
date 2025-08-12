#!/usr/bin/env node

/**
 * Search Performance Benchmark CLI Tool
 * 
 * Usage:
 *   npm run benchmark:search -- --scenario light_load
 *   npm run benchmark:search -- --scenario moderate_load --export json
 *   npm run benchmark:search -- --all --export markdown
 */

import { DatabasePool } from '../utils/database-pool';
import { Logger } from '../utils/logger';
import { WhiteboardSearchBenchmark, BENCHMARK_SCENARIOS } from '../services/whiteboard/whiteboard-search-benchmark';
import fs from 'fs';
import path from 'path';

interface CLIOptions {
  scenario?: string;
  all: boolean;
  export?: 'json' | 'csv' | 'markdown';
  output?: string;
  verbose: boolean;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    all: false,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--scenario':
        options.scenario = args[++i];
        break;
      case '--all':
        options.all = true;
        break;
      case '--export':
        options.export = args[++i] as 'json' | 'csv' | 'markdown';
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log(`
🔍 Whiteboard Search Benchmark Tool

Usage:
  npm run benchmark:search -- [options]

Options:
  --scenario <name>     Run specific benchmark scenario
  --all                 Run all benchmark scenarios
  --export <format>     Export results (json, csv, markdown)
  --output <file>       Output file path (default: console)
  --verbose             Show detailed output
  --help, -h            Show this help

Available Scenarios:
${BENCHMARK_SCENARIOS.map(s => `  • ${s.name.padEnd(15)} - ${s.description}`).join('\n')}

Examples:
  npm run benchmark:search -- --scenario light_load
  npm run benchmark:search -- --all --export markdown --output results.md
  npm run benchmark:search -- --scenario heavy_load --verbose
`);
}

/**
 * Setup database connection for benchmarking
 */
async function setupDatabase(): Promise<DatabasePool> {
  const db = new DatabasePool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'mcp_tools',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
  });

  // Test connection
  try {
    const client = await db.getClient();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }

  return db;
}

/**
 * Create benchmark workspace and test data
 */
async function setupBenchmarkData(db: DatabasePool): Promise<void> {
  console.log('🔧 Setting up benchmark data...');
  
  const client = await db.getClient();
  
  try {
    // Create benchmark workspace
    await client.query(`
      INSERT INTO workspaces (id, name, description, created_by, updated_at)
      VALUES ('benchmark-workspace', 'Benchmark Workspace', 'Workspace for performance benchmarking', 'benchmark-user', NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Create benchmark user
    await client.query(`
      INSERT INTO users (id, name, email, created_at, updated_at)
      VALUES ('benchmark-user', 'Benchmark User', 'benchmark@example.com', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    
    // Create sample whiteboards if they don't exist
    const whiteboardCount = await client.query(`
      SELECT COUNT(*) as count FROM whiteboards WHERE workspace_id = 'benchmark-workspace'
    `);
    
    if (parseInt(whiteboardCount.rows[0].count) < 100) {
      console.log('📝 Creating sample whiteboards...');
      
      const sampleTitles = [
        'Design System Components', 'User Interface Mockups', 'System Architecture Diagram',
        'Marketing Campaign Ideas', 'Product Roadmap Planning', 'Team Collaboration Board',
        'Feature Specification Draft', 'User Journey Mapping', 'API Documentation Sketch',
        'Database Schema Design', 'Wireframe Prototypes', 'Brand Guidelines Board'
      ];
      
      const sampleDescriptions = [
        'Comprehensive component library design', 'UI mockups for the new application',
        'High-level system architecture overview', 'Creative brainstorming for marketing',
        'Long-term product development strategy', 'Cross-team collaboration workspace',
        'Detailed feature requirements and specs', 'User experience journey visualization',
        'API endpoints and integration documentation', 'Database structure and relationships',
        'Low-fidelity wireframes and prototypes', 'Brand identity and style guide'
      ];
      
      for (let i = 0; i < 100; i++) {
        const titleIndex = i % sampleTitles.length;
        const descIndex = i % sampleDescriptions.length;
        
        await client.query(`
          INSERT INTO whiteboards (
            id, name, description, workspace_id, created_by, updated_at,
            visibility, status, version, canvas_data, settings
          )
          VALUES (
            $1, $2, $3, 'benchmark-workspace', 'benchmark-user', NOW(),
            'workspace', 'active', 1, '{}', '{}'
          )
          ON CONFLICT (id) DO NOTHING
        `, [
          `benchmark-whiteboard-${i}`,
          `${sampleTitles[titleIndex]} ${i + 1}`,
          `${sampleDescriptions[descIndex]} - Sample ${i + 1}`
        ]);
      }
    }
    
    console.log('✅ Benchmark data setup complete');
    
  } finally {
    client.release();
  }
}

/**
 * Save benchmark results to file
 */
async function saveResults(
  results: any,
  format: 'json' | 'csv' | 'markdown',
  outputPath: string,
  benchmark: WhiteboardSearchBenchmark
): Promise<void> {
  let content: string;
  
  if (typeof results.entries === 'function') {
    // Handle Map of multiple scenarios
    const allResults: any = {};
    for (const [scenarioName, scenarioResults] of results.entries()) {
      allResults[scenarioName] = scenarioResults;
      if (format === 'markdown') {
        content = (content || '') + '\n\n' + benchmark.generateReport(scenarioResults);
      }
    }
    
    if (format === 'json') {
      content = JSON.stringify(allResults, null, 2);
    } else if (format === 'csv') {
      // For multiple scenarios, create a summary CSV
      const rows = ['Scenario,Total_Requests,Success_Rate,Avg_Response_Time,RPS,Cache_Hit_Rate'];
      for (const [name, result] of results.entries()) {
        rows.push([
          name,
          result.overallResults.totalRequests,
          Math.round((result.overallResults.successfulRequests / result.overallResults.totalRequests) * 100),
          Math.round(result.overallResults.averageResponseTime),
          Math.round(result.overallResults.requestsPerSecond),
          Math.round(result.overallResults.cacheHitRate * 100)
        ].join(','));
      }
      content = rows.join('\n');
    }
  } else {
    // Handle single scenario result
    content = await benchmark.exportResults(results, format);
  }
  
  await fs.promises.writeFile(outputPath, content, 'utf8');
  console.log(`📄 Results saved to: ${outputPath}`);
}

/**
 * Main benchmark execution function
 */
async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  if (!options.scenario && !options.all) {
    console.error('❌ Please specify --scenario <name> or --all');
    showHelp();
    process.exit(1);
  }
  
  const logger = new Logger('BenchmarkCLI', options.verbose ? 'debug' : 'info');
  
  try {
    // Setup database
    const db = await setupDatabase();
    await setupBenchmarkData(db);
    
    // Create benchmark instance
    const benchmark = new WhiteboardSearchBenchmark(db, logger);
    
    console.log('🚀 Starting search performance benchmark...\n');
    
    let results: any;
    
    if (options.all) {
      console.log('📊 Running all benchmark scenarios...');
      results = await benchmark.runAllScenarios();
      
      // Display summary
      console.log('\n📋 Benchmark Summary:');
      for (const [scenarioName, scenarioResults] of results.entries()) {
        const overallResults = scenarioResults.overallResults;
        const successRate = Math.round((overallResults.successfulRequests / overallResults.totalRequests) * 100);
        
        console.log(`
  ${scenarioName}:
    • Total Requests: ${overallResults.totalRequests}
    • Success Rate: ${successRate}%
    • Avg Response: ${Math.round(overallResults.averageResponseTime)}ms
    • Requests/sec: ${Math.round(overallResults.requestsPerSecond)}
    • Cache Hit Rate: ${Math.round(overallResults.cacheHitRate * 100)}%
        `.trim());
      }
      
    } else {
      console.log(`📊 Running scenario: ${options.scenario}`);
      results = await benchmark.runScenario(options.scenario!);
      
      // Display results
      const overallResults = results.overallResults;
      const successRate = Math.round((overallResults.successfulRequests / overallResults.totalRequests) * 100);
      
      console.log(`
📋 Benchmark Results - ${options.scenario}:
  • Duration: ${Math.round(results.duration / 1000)}s
  • Total Requests: ${overallResults.totalRequests}
  • Success Rate: ${successRate}%
  • Average Response Time: ${Math.round(overallResults.averageResponseTime)}ms
  • 95th Percentile: ${Math.round(overallResults.p95ResponseTime)}ms
  • 99th Percentile: ${Math.round(overallResults.p99ResponseTime)}ms
  • Requests per Second: ${Math.round(overallResults.requestsPerSecond)}
  • Cache Hit Rate: ${Math.round(overallResults.cacheHitRate * 100)}%
  • Memory Usage: ${Math.round(results.systemMetrics.memoryDelta.heapUsed / 1024 / 1024)}MB
      `.trim());
      
      if (options.verbose) {
        console.log('\n🔍 Detailed Query Results:');
        for (const [queryName, queryResult] of results.queryResults.entries()) {
          console.log(`  ${queryName}: ${Math.round(queryResult.averageResponseTime)}ms avg, ${Math.round(queryResult.requestsPerSecond)} RPS`);
        }
      }
    }
    
    // Export results if requested
    if (options.export) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFileName = options.all 
        ? `search-benchmark-all-${timestamp}`
        : `search-benchmark-${options.scenario}-${timestamp}`;
      
      const extension = options.export === 'json' ? '.json' : 
                      options.export === 'csv' ? '.csv' : '.md';
      
      const outputPath = options.output || `${defaultFileName}${extension}`;
      
      await saveResults(results, options.export, outputPath, benchmark);
    }
    
    console.log('\n✅ Benchmark completed successfully!');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run the CLI tool
if (require.main === module) {
  main().catch(console.error);
}