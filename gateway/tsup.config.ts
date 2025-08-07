import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  publicDir: false,
  external: [
    // Mark all node_modules as external
    '@mcp-tools/core',
    '@mcp-tools/core/kanban',
    '@mcp-tools/core/memory',
    '@mcp-tools/core/scraper',
    'pg',
    'ioredis',
    'socket.io'
  ],
  noExternal: [
    // Include specific packages in bundle if needed
  ],
  env: {
    NODE_ENV: 'production'
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});