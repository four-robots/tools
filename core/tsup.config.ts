import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/services/kanban/index.ts',
    'src/services/memory/index.ts',
    'src/services/memory-processing/index.ts',
    'src/services/wiki/index.ts',
    'src/services/scraper/index.ts',
    'src/shared/types/index.ts'
  ],
  format: ['esm'],
  target: 'node18',
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  dts: false, // Temporarily disabled to fix Docker build
  external: [
    // External dependencies should not be bundled
    'pg',
    'kysely',
    'marked',
    'gray-matter',
    'slugify',
    'nats',
    'uuid',
    'zod',
    'glob'
  ]
});