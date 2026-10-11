import { expect, test, type Page } from '@playwright/test';
import { runBot } from './helpers';

const boot = async (page: Page, query: string): Promise<void> => {
  await page.goto(`./?${query}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20_000 });
};

const watchErrors = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};

test('sandbox with juice on: a lead-point hit spawns particles, triggers audio and haptics, no console errors', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await boot(page, 'scene=sandbox&test&scheme=tap');
  const before = await page.evaluate(() => window.__debug.fx());
  expect(before?.juiceOn).toBe(true);
  expect(before?.shardsSpawned).toBe(0);

  const res = await runBot(page, { stopAtHits: 1, timeoutMs: 90_000 });
  expect(res.timedOut).toBe(false);

  await expect
    .poll(async () => (await page.evaluate(() => window.__debug.fx()))?.shattersSpawned ?? 0)
    .toBeGreaterThanOrEqual(1);
  const fx = await page.evaluate(() => window.__debug.fx());
  expect(fx?.shardsSpawned).toBeGreaterThanOrEqual(6);
  expect(fx?.particlesSpawned).toBeGreaterThan(0);
  expect(fx?.ringsSpawned).toBeGreaterThanOrEqual(1);
  expect(fx?.audio.triggered).toBeGreaterThanOrEqual(3);
  expect(fx?.audio.byCue.gunBody).toBeGreaterThanOrEqual(1);
  expect(
    (fx?.audio.byCue.crack1 ?? 0) + (fx?.audio.byCue.crack2 ?? 0) + (fx?.audio.byCue.crack3 ?? 0),
  ).toBeGreaterThanOrEqual(1);
  expect(fx?.audio.byCue.thunk).toBeGreaterThanOrEqual(1);
  expect(fx?.haptics.triggers).toBeGreaterThanOrEqual(2);
  expect(fx?.hitStops).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('sandbox settings: juice toggle persists and stops the effects', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await boot(page, 'scene=sandbox&test&scheme=tap');
  await page.click('#btn-settings');
  await expect(page.locator('#opt-juice')).toBeChecked();
  await expect(page.locator('#opt-sound')).toBeChecked();
  await expect(page.locator('#opt-haptics')).toBeChecked();
  await page.uncheck('#opt-juice');
  const stored = await page.evaluate(() => localStorage.getItem('rogue-skeet.feel.v1'));
  expect(JSON.parse(stored ?? '{}').juice).toBe(false);
  await page.click('#btn-settings'); // close the panel so it does not cover the field

  const res = await runBot(page, { stopAtHits: 1, timeoutMs: 90_000 });
  expect(res.timedOut).toBe(false);
  const fx = await page.evaluate(() => window.__debug.fx());
  expect(fx?.juiceOn).toBe(false);
  expect(fx?.shardsSpawned).toBe(0);
  expect(fx?.audio.triggered).toBe(0);
  expect(fx?.haptics.triggers).toBe(0);

  // survives a reload (persisted)
  await boot(page, 'scene=sandbox&test&scheme=tap');
  expect((await page.evaluate(() => window.__debug.fx()))?.juiceOn).toBe(false);
  expect(errors).toEqual([]);
});

test('screenshots mid-shatter (set SCREENSHOT_SHATTER=dir)', async ({ page }) => {
  test.skip(!process.env.SCREENSHOT_SHATTER, 'screenshot run only');
  test.setTimeout(180_000);
  const dir = process.env.SCREENSHOT_SHATTER as string;
  await boot(page, 'scene=sandbox&test&scheme=tap');
  // the HUD would sit under the freeze, hide the debug overlay for a cleaner frame
  await page.addStyleTag({ content: '#debug-overlay{display:none!important}' });

  const capture = async (perfect: boolean, file: string): Promise<void> => {
    const base = (await page.evaluate(() => window.__debug.fx()))?.shattersSpawned ?? 0;
    const wantPerfects = (await page.evaluate(() => window.__debug.fx()))?.perfects ?? 0;
    await page.waitForFunction(() => {
      const s = window.__debug.state();
      return !!s && s.gunReady && s.clays.some((c) => c.age > 0.7);
    });
    const aim = await page.evaluate((p) => {
      const c = window.__debug.state()?.clays.find((x) => x.age > 0.7);
      return c ? window.__debug.shootAt(c.id, p ? {} : { offset: { x: 3.8, y: 0 } }) : null;
    }, perfect);
    if (!aim) throw new Error('no aim');
    await page.waitForFunction((b) => (window.__debug.fx()?.shattersSpawned ?? 0) > b, base, {
      polling: 5,
    });
    await page.waitForTimeout(30); // catch the impact a few frames in (flash ring still visible)
    await page.evaluate(() => window.__debug.pauseFx(true));
    const fx = await page.evaluate(() => window.__debug.fx());
    expect(fx?.activeShards).toBeGreaterThan(0);
    if (perfect) expect(fx?.perfects).toBeGreaterThan(wantPerfects);
    const c = await page.evaluate((a) => window.__debug.worldToClient(a.x, a.y), aim);
    const vp = page.viewportSize() ?? { width: 412, height: 915 };
    const w = 240;
    const x = Math.max(0, Math.min(vp.width - w, c.x - w / 2));
    const y = Math.max(0, Math.min(vp.height - w, c.y - w / 2));
    await page.screenshot({ path: `${dir}/${file}`, clip: { x, y, width: w, height: w } });
    await page.evaluate(() => window.__debug.pauseFx(false));
  };
  await capture(false, 'phase2-shatter.png');
  await page.waitForTimeout(1500);
  await capture(true, 'phase2-shatter-perfect.png');
});
