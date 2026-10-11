import { GameLoop } from './core/loop';
import { DebugOverlay } from './render/debugOverlay';
import { Stage } from './render/stage';
import { createMenuScene } from './scenes/menu';
import { createPlayfieldScene } from './scenes/playfield';
import { SceneRouter, type SceneName } from './scenes/scene';
import { isDevMode, loadDevPanel, onTuningChange, tuning } from './feel/tuning';
import { createControlTestScene } from './modes/controlTest/controlTest';
import { createSandboxScene } from './modes/sandbox/sandbox';
import './ui/ui.css';

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('#app missing');

  const stage = new Stage();
  await stage.init(host);

  const router = new SceneRouter({ stage });
  router.register('menu', createMenuScene);
  router.register('playfield', createPlayfieldScene);
  router.register('sandbox', createSandboxScene);
  router.register('controlTest', createControlTestScene);

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
  const names: SceneName[] = ['playfield', 'sandbox', 'controlTest'];
  router.go(names.find((n) => n === first) ?? 'menu');
  loop.start();
  document.body.dataset.ready = '1';

  if (isDevMode()) void loadDevPanel();
}

boot().catch((err) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
