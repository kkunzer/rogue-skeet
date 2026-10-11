import { expect, test } from '@playwright/test';

test('app boots on a touch phone viewport with a canvas and no console errors', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('./');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20_000 });

  const canvas = page.locator('#app canvas');
  await expect(canvas).toHaveCount(1);
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(600);
  await expect(page.locator('#debug-overlay')).toContainText('fps');

  // let a few frames render, then check the page is still error-free
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);

  if (process.env.SCREENSHOT) {
    await page.screenshot({ path: process.env.SCREENSHOT });
  }
  testInfo.annotations.push({ type: 'viewport', description: JSON.stringify(page.viewportSize()) });
});

test('greybox playfield scene renders', async ({ page }) => {
  await page.goto('./?scene=playfield');
  await page.waitForSelector('body[data-scene="playfield"][data-ready="1"]');
  await page.waitForTimeout(300);
  if (process.env.SCREENSHOT_PLAYFIELD)
    await page.screenshot({ path: process.env.SCREENSHOT_PLAYFIELD });
});

test('dev panel only loads with ?dev', async ({ page }) => {
  await page.goto('./?dev');
  await page.waitForSelector('body[data-ready="1"]');
  await expect(page.locator('.tp-rotv')).toBeVisible({ timeout: 10_000 });
});
