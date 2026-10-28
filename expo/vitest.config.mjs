import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.mjs'],
    // The real-PDF contract runs with node:test through npm run test:pdf.
    exclude: ['src/features/review/pdf.test.mjs'],
  },
});
