#!/usr/bin/env node
const { spawnSync } = require('child_process');

function main() {
  let playwrightCli;
  try {
    playwrightCli = require.resolve('@playwright/test/cli');
  } catch (error) {
    console.warn('[E2E] @playwright/test not installed. Skipping Playwright suite.');
    console.warn('[E2E] Install dev dependency and run `npx playwright install` to enable browser tests.');
    process.exit(0);
  }

  const result = spawnSync('node', [playwrightCli, 'test', '--reporter=line'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP: process.env.PLAYWRIGHT_SKIP ?? '0'
    }
  });

  if (result.error) {
    console.error('[E2E] Failed to run Playwright:', result.error.message);
    process.exit(result.status ?? 1);
  }

  process.exit(result.status ?? 0);
}

main();
