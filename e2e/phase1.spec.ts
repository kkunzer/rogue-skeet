import { expect, test } from '@playwright/test';
import { validateResult, type ControlTestResult } from '../src/telemetry/schema';
import { runBot } from './helpers';

const boot = async (page: import('@playwright/test').Page, query: string): Promise<void> => {
  await page.goto(`./?${query}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20_000 });
};

test('menu enables Sandbox and Control Test buttons', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page, '');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
  expect(errors).toEqual([]);
});

for (const scheme of ['tap', 'drag', 'flick'] as const) {
  test(`sandbox (${scheme}): a bot firing real pointer events at lead points breaks clays`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page, `scene=sandbox&test&scheme=${scheme}`);
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'sandbox');
    await expect(page.locator('#hud-scheme')).toContainText('Sandbox');

    const res = await runBot(page, { stopAtHits: 3, timeoutMs: 90_000 });
    expect(res.timedOut).toBe(false);
    expect(res.hits).toBeGreaterThanOrEqual(3);
    // the HUD hit counter increments
    const hudHits = Number(await page.locator('#hud').getAttribute('data-hits'));
    expect(hudHits).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#hud-hits')).toContainText('Hits');

    if (scheme === 'tap' && process.env.SCREENSHOT_SANDBOX) {
      // catch a clay mid-flight with a shot on its way
      await page.waitForFunction(() => {
        const s = window.__debug.state();
        return !!s && s.gunReady && s.clays.some((c) => c.age > 0.6);
      });
      await page.evaluate(() => {
        const s = window.__debug.state();
        const c = s?.clays.find((x) => x.age > 0.6);
        if (c) window.__debug.shootAt(c.id);
      });
      await page.waitForTimeout(60);
      await page.screenshot({ path: process.env.SCREENSHOT_SANDBOX });
    }
    expect(errors).toEqual([]);
  });
}

test('sandbox: a real touch tap fires a shot (Playwright touchscreen)', async ({ page }) => {
  await boot(page, 'scene=sandbox&test');
  // let the sim and input clock get going (SwiftShader is slow to settle after boot)
  await page.waitForFunction(() => (window.__debug.state()?.time ?? 0) > 1.5);
  const box = await page.locator('#app canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.35);
  await expect
    .poll(async () => Number(await page.locator('#hud').getAttribute('data-shots')))
    .toBeGreaterThanOrEqual(1);
});

test('sandbox settings panel switches scheme and handedness', async ({ page }) => {
  await boot(page, 'scene=sandbox&test');
  await page.click('#btn-settings');
  await page.click('[data-scheme="drag"]');
  await expect(page.locator('#hud-scheme')).toContainText('Drag');
  await page.click('[data-hand="left"]');
  await expect(page.locator('[data-hand="left"]')).toHaveClass(/on/);
});

test('control test: a bot completes a full 20-throw attempt and the exported JSON validates', async ({
  page,
}) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page, 'scene=controlTest&test&attempts=1&schemes=tap');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'setup');

  await page.fill('#tester-id', 'e2e-bot');
  await page.click('#btn-start');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'intro');
  await page.click('#btn-attempt-start');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');

  // throws 2 and 6 are led badly on purpose, so the "Why did you miss?" prompt appears
  const res = await runBot(page, { stopAtPhase: 'rating', missThrows: [2, 6], timeoutMs: 300_000 });
  expect(res.timedOut).toBe(false);
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'rating');
  await page.click('#rate-4');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'results');
  await expect(page.locator('#results')).toContainText('All done');

  const json = await page.locator('#result-json').inputValue();
  const result = JSON.parse(json) as ControlTestResult;
  expect(validateResult(result)).toEqual([]);
  expect(result.complete).toBe(true);
  expect(result.tester.id).toBe('e2e-bot');
  expect(result.schemes).toHaveLength(1);
  const att = result.schemes[0]?.attempts[0];
  expect(att?.throws).toHaveLength(20);
  expect(att?.clays).toBe(24);
  expect(att?.broken).toBeGreaterThanOrEqual(21);
  expect(att?.broken).toBeLessThanOrEqual(23);
  expect(result.schemes[0]?.feelRating).toBe(4);
  const asked = att?.throws.filter((t) => t.reported !== null) ?? [];
  expect(asked.length).toBeGreaterThanOrEqual(2);
  expect(result.settings.aimAssist).toBe(0);
  expect(result.version).toBe(2);
  expect(result.juice).toMatchObject({ juice: true, sound: true, haptics: true });
  expect(result.device.userAgent).toContain('Chrome');

  // autosaved: the saved-sessions list on the setup screen offers this run
  expect(
    await page.evaluate(() => localStorage.getItem('rogue-skeet.controlTest.sessions.v1')),
  ).toContain('e2e-bot');

  if (process.env.SCREENSHOT_RESULTS)
    await page.screenshot({ path: process.env.SCREENSHOT_RESULTS });
  expect(errors).toEqual([]);
});
