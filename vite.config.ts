import { defineConfig } from 'vite';

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site under /rogue-skeet/; the dev server uses '/'; preview serves the built output so it matches.
  base: command === 'build' || isPreview ? '/rogue-skeet/' : '/',
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
