/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  ElectronApplication,
  Page,
  _electron as electron,
  expect,
  test,
} from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const latestBuild = findLatestBuild();
  const { executable: executablePath, main } = parseElectronApp(latestBuild);
  process.env.CI = 'e2e';
  electronApp = await electron.launch({
    args: [main],
    executablePath,
    env: {
      ...process.env,
      CI: 'e2e',
    },
  });

  page = await electronApp.firstWindow();
  page.on('pageerror', (error) => {
    console.error('Page error:', error);
  });
});

test.afterAll(async () => {
  // Disable multi-agent mode to clean up
  await page.evaluate(async () => {
    await window.electron.setting.updateSetting({ multiAgentEnabled: false });
  });
  await electronApp?.close();
});

test('home page renders with operator cards (default mode)', async () => {
  test.setTimeout(30_000);
  await page.waitForLoadState('domcontentloaded');

  // Default mode shows the two operator cards
  const computerOperator = page.locator('text=Computer Operator');
  const browserOperator = page.locator('text=Browser Operator');

  await expect(computerOperator).toBeVisible({ timeout: 10_000 });
  await expect(browserOperator).toBeVisible();
});

test('home page shows brand title', async () => {
  const brand = page.locator('text=heyworkly');
  await expect(brand.first()).toBeVisible();
});

test('multi-agent home renders when enabled', async () => {
  test.setTimeout(30_000);

  // Enable multi-agent mode via renderer's setting bridge
  await page.evaluate(async () => {
    await window.electron.setting.updateSetting({ multiAgentEnabled: true });
  });

  // Reload to pick up the new setting
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // MultiAgentHome should show the textarea and prompt
  const textarea = page.locator(
    'textarea[placeholder="Describe your task..."]',
  );
  await expect(textarea).toBeVisible({ timeout: 10_000 });

  // Should show the "What would you like me to do?" prompt
  const prompt = page.locator('text=What would you like me to do?');
  await expect(prompt).toBeVisible();

  // Should show suggestion chips
  const suggestion = page.locator('text=Search for flights from NYC to London');
  await expect(suggestion).toBeVisible();
});

test('multi-agent home suggestion chips populate input', async () => {
  const suggestion = page.locator('text=Fill out the expense report form');
  await suggestion.click();

  const textarea = page.locator(
    'textarea[placeholder="Describe your task..."]',
  );
  await expect(textarea).toHaveValue('Fill out the expense report form');
});

test('multi-agent home has submit button', async () => {
  const submitButton = page.locator('button[title="Start task"]');
  await expect(submitButton).toBeVisible();
});

test('switching back to default mode restores operator cards', async () => {
  test.setTimeout(30_000);

  await page.evaluate(async () => {
    await window.electron.setting.updateSetting({ multiAgentEnabled: false });
  });

  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const computerOperator = page.locator('text=Computer Operator');
  await expect(computerOperator).toBeVisible({ timeout: 10_000 });

  // Textarea should NOT be present
  const textarea = page.locator(
    'textarea[placeholder="Describe your task..."]',
  );
  await expect(textarea).not.toBeVisible();
});
