import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Use the preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH when the bundled revision is absent. */
function findChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dirs = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort();
  for (const d of dirs.reverse()) {
    const exe = join(root, d, 'chrome-linux', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const executablePath = process.env.CI ? undefined : findChromium();

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173/rogue-skeet/',
    ...devices['Pixel 7'],
    launchOptions: {
      executablePath,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:4173/rogue-skeet/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
