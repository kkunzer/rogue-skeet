import { expect, test, type Page } from '@playwright/test';
import { parseRunLog, validateRunSummary } from '../src/modes/run/runLog';
import { installRunBot, stopRunBot } from './helpers';

const SPEED = 2;

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

const phase = (page: Page): Promise<string> =>
  page.evaluate(() => document.body.dataset.phase ?? '');

test('menu has an enabled Run button and a Run log', async ({ page }) => {
  const errors = watchErrors(page);
  await boot(page, '');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'menu');
  await boot(page, 'scene=run&test');
  await expect(page.locator('#btn-run-start')).toBeVisible();
  await expect(page.locator('#run-seed')).not.toHaveText('');
  await boot(page, 'scene=runLog&test');
  await expect(page.locator('#runlog-summary')).toContainText('0 runs');
  expect(errors).toEqual([]);
});

test('a bot plays a full seeded run to the summary; the run log saves and exports', async ({
  page,
}, testInfo) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  const shots = process.env.SCREENSHOT_PHASE3;
  await boot(page, `scene=run&test&seed=e2e-seed-1&simspeed=${SPEED}`);
  await expect(page.locator('#run-seed')).toHaveText('e2e-seed-1');
  await installRunBot(page, {
    speed: SPEED,
    picks: ['explosive', 'chain', 'curse', 'gravity'],
    draftDelayMs: shots ? 1500 : 0,
  });

  // one watcher: capture each screenshot the first time its condition holds while the bot plays
  const wanted: Record<string, () => Promise<boolean>> = {
    'phase3-round.png': () =>
      page.evaluate(() => {
        const r = window.__debug.run();
        const s = window.__debug.state();
        const types = new Set(s?.clays.map((c) => c.type));
        return (
          !!r &&
          r.round >= 2 &&
          r.round <= 3 &&
          r.phase === 'playing' &&
          types.size >= (r.round === 3 ? 2 : 3)
        );
      }),
    'phase3-draft.png': async () => (await phase(page)) === 'draft',
    'phase3-boss.png': () =>
      page.evaluate(() => {
        const r = window.__debug.run();
        const s = window.__debug.state();
        return !!r && r.round === 4 && r.phase === 'playing' && (s?.clays.length ?? 0) >= 5;
      }),
  };
  if (shots) {
    await page.addStyleTag({ content: '#debug-overlay{display:none!important}' });
    const todo = new Set(Object.keys(wanted));
    const t0 = Date.now();
    while (todo.size && Date.now() - t0 < 300_000 && (await phase(page)) !== 'summary') {
      for (const name of [...todo]) {
        if (await (wanted[name] as () => Promise<boolean>)()) {
          await page.screenshot({ path: `${shots}/${name}` });
          todo.delete(name);
        }
      }
      await page.waitForTimeout(30);
    }
  }

  await page.waitForFunction(() => document.body.dataset.phase === 'summary', undefined, {
    timeout: 360_000,
    polling: 200,
  });
  await stopRunBot(page);
  await expect(page.locator('#run-summary-card')).toBeVisible();
  await expect(page.locator('#run-summary-seed')).toHaveText('e2e-seed-1');
  if (shots) {
    await page.addStyleTag({ content: '#debug-overlay{display:none!important}' });
    await page.screenshot({ path: `${shots}/phase3-summary.png` });
  }

  // real DOM click on the freshness rating, then check what was saved
  await page.click('[data-rating="4"]');
  const stored = await page.evaluate(() => localStorage.getItem('rogue-skeet.runlog.v1'));
  const runs = JSON.parse(stored ?? '[]') as Record<string, unknown>[];
  expect(runs).toHaveLength(1);
  expect(validateRunSummary(runs[0])).toEqual([]);
  expect(runs[0]?.seed).toBe('e2e-seed-1');
  expect(runs[0]?.freshRating).toBe(4);
  expect((runs[0]?.picks as string[]).length).toBeGreaterThanOrEqual(1);
  testInfo.annotations.push({
    type: 'run',
    description: `cleared=${String(runs[0]?.cleared)} score=${String(runs[0]?.score)} round=${String(runs[0]?.roundReached)} picks=${String(runs[0]?.picks)}`,
  });

  // run log scene lists it and exports valid JSON
  await page.click('#btn-run-log');
  await expect(page.locator('#runlog-summary')).toContainText('1 runs');
  await expect(page.locator('.runlog-row')).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-runlog-download'),
  ]);
  const path = await download.path();
  const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
  const parsed = parseRunLog(text);
  expect(parsed).not.toBeNull();
  expect(parsed).toHaveLength(1);
  expect(parsed?.[0]?.seed).toBe('e2e-seed-1');
  expect(errors).toEqual([]);
});

test('a bot that never leads loses the run and still reaches the summary', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await boot(page, `scene=run&test&seed=e2e-seed-2&simspeed=${SPEED}`);
  await installRunBot(page, { speed: SPEED, noLead: true });
  await page.waitForFunction(() => document.body.dataset.phase === 'summary', undefined, {
    timeout: 220_000,
    polling: 200,
  });
  await stopRunBot(page);
  await expect(page.locator('#run-result')).toContainText('Out of shells');
  const run = await page.evaluate(() => window.__debug.run());
  expect(run?.phase).toBe('lost');
  expect(errors).toEqual([]);
});
