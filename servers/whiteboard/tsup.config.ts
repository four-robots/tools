import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Temporarily disabled due to babel parser type issue
  clean: true,
  sourcemap: true,
  splitting: false,
  minify: false,
  target: 'node18',
  external: ['kysely', 'pg', 'ws', 'zod'],
  noExternal: ['@tylercoles/mcp-server', '@tylercoles/mcp-transport-http'],
  esbuildOptions(options) {
    options.banner = {
      js: '#!/usr/bin/env node',
    };
  },
});