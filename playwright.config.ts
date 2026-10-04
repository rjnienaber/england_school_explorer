// End-to-end tests: a real browser against the built site (dist/), served by scripts/serve.ts.
// Run `npm run build` first (CI runs `npm run build:release`), then `npm run test:e2e`.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

if (!existsSync(join(import.meta.dirname, 'dist/data/core.json'))) {
  throw new Error('The end-to-end tests run against the built site. Run `npm run build` first.');
}

/**
 * A free port, found once. The config is loaded again in every worker, so the answer is passed on in the environment
 * (set it yourself, E2E_PORT=8081, to use a fixed port).
 */
function freePort(): string {
  const script = "const s=require('node:net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})";
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).trim();
}
process.env.E2E_PORT ??= freePort();
const port = process.env.E2E_PORT;

export default defineConfig({
  testDir: 'e2e',
  // The page loads a few MB of data and the comparison runs a simulation, so allow a generous 30 s per test
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    // The panel is 400 px wide on the left of the map, so use a desktop window with room to spare
    viewport: { width: 1280, height: 800 },
    // Tests that care about dark mode or a phone say so themselves
    colorScheme: 'light',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning scripts/serve.ts',
    env: { PORT: port },
    url: `http://localhost:${port}/data/manifest.json`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
