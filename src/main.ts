import { GameLoop } from './core/loop';
import { DebugOverlay } from './render/debugOverlay';
import { Stage } from './render/stage';
import { createMenuScene } from './scenes/menu';
import { createPlayfieldScene } from './scenes/playfield';
import { SceneRouter, type SceneName } from './scenes/scene';
import { isDevMode, loadDevPanel, onTuningChange, tuning } from './feel/tuning';
import { createControlTestScene } from './modes/controlTest/controlTest';
import { createRunScene } from './modes/run/run';
import { createSandboxScene } from './modes/sandbox/sandbox';
import { createRunLogScene } from './scenes/runLog';
import { debugEnabled } from './debug';
import { timeScale } from './core/timescale';
import { initFeel } from './feel/feelSystem';
import './ui/ui.css';

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('#app missing');

  initFeel();
  // Test-only time dilation for e2e bots (documented in the README); ignored in normal play.
  const speed = Number(new URLSearchParams(location.search).get('simspeed'));
  if (debugEnabled() && speed >= 1 && speed <= 8) timeScale.value = speed;
  const stage = new Stage();
  await stage.init(host);

  const router = new SceneRouter({ stage });
  router.register('menu', createMenuScene);
  router.register('playfield', createPlayfieldScene);
  router.register('sandbox', createSandboxScene);
  router.register('controlTest', createControlTestScene);
  router.register('run', createRunScene);
  router.register('runLog', createRunLogScene);

  const overlay = new DebugOverlay();
  const loop = new GameLoop({
    hz: tuning.simHz,
    update: (dt) => router.update(dt),
    render: (alpha) => {
      router.render(alpha);
      stage.app.renderer.render(stage.app.stage);
      overlay.frame();
    },
  });
  onTuningChange((t) => loop.setHz(t.simHz));
  // We drive rendering from our own loop so sim and render stay in lockstep.
  stage.app.ticker.stop();

  const first = new URLSearchParams(location.search).get('scene');
  const names: SceneName[] = ['playfield', 'sandbox', 'controlTest', 'run', 'runLog'];
  router.go(names.find((n) => n === first) ?? 'menu');
  loop.start();
  document.body.dataset.ready = '1';

  if (isDevMode()) void loadDevPanel();
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
