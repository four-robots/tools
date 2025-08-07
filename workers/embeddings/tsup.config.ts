import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Disable TypeScript declarations for now to avoid path resolution issues  
  sourcemap: true,
  clean: true,
  target: 'node18',
  outDir: 'dist',
  splitting: false,
  external: [
    // External dependencies that should not be bundled
    'nats',
    'winston',
    'openai',
    'dotenv',
    'kysely',
    'pg',
    'p-limit',
    'p-retry',
    'zod',
    'proxy-agent',
    'http',
    'https',
    'url',
    // Node.js built-in modules that cause dynamic require issues
    'tty',
    'util',
    'os',
    'fs',
    'path',
    'child_process',
    'stream',
    'buffer',
    'events',
    'crypto',
    'net',
    'http',
    'https',
    'url',
    // WebSocket and Puppeteer-related modules
    'ws',
    'puppeteer-core',
    'puppeteer',
    // Debug-related modules that use dynamic requires
    'debug',
    '@puppeteer/browsers'
  ],
  esbuildOptions(options) {
    // Ensure proper module resolution for path mappings
    options.resolveExtensions = ['.ts', '.js', '.json'];
  },
});