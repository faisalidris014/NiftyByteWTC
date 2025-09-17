import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const shouldSkip = process.env.PLAYWRIGHT_SKIP === '1';

if (shouldSkip) {
  test.skip(true, 'Playwright browsers not installed in this environment.');
}

test('chat landing page renders', async ({ page }) => {
  const chatPath = path.resolve(__dirname, '../../src/chat.html');
  expect(fs.existsSync(chatPath)).toBe(true);

  await page.goto(`file://${chatPath}`);

  await expect(page.locator('h1')).toContainText('Windows Troubleshooting Companion');
  await expect(page.locator('.quick-action')).toHaveCount(4);
});
