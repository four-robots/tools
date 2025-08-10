import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: 'dist',
  platform: 'node',
  target: 'es2022',
  external: ['@mcp-tools/core'],
});