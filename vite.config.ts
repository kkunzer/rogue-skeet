import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Short git SHA for telemetry; 'dev' when git is unavailable (e.g. a source tarball). */
function buildSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return sha || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves the site under /rogue-skeet/; the dev server uses '/'; preview serves the built output so it matches.
  base: command === 'build' || isPreview ? '/rogue-skeet/' : '/',
  define: { __BUILD_SHA__: JSON.stringify(process.env.BUILD_SHA ?? buildSha()) },
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
