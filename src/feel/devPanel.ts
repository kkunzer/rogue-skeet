import { Pane } from 'tweakpane';
import { defaultTuning, exportTuningJSON, notifyTuningChanged, tuning } from './tuning';

/** Tweakpane dev panel. Imported dynamically from tuning.ts so it never ships in the main chunk. */
export function createDevPanel(): Pane {
  const pane = new Pane({ title: 'Tuning' });
  const el = pane.element;
  el.style.position = 'fixed';
  el.style.top = '8px';
  el.style.right = '8px';
  el.style.zIndex = '20';
  el.style.maxWidth = '280px';
  el.style.touchAction = 'auto';

  const sim = pane.addFolder({ title: 'Sim' });
  sim.addBinding(tuning, 'simHz', { min: 30, max: 240, step: 1, label: 'sim Hz' });
  sim.addBinding(tuning, 'gravity', { min: 10, max: 90, step: 0.5 });
  sim.addBinding(tuning, 'drag', { min: 0, max: 0.6, step: 0.01 });
  sim.addBinding(tuning, 'clayRadius', { min: 1, max: 5, step: 0.1 });
  const shot = pane.addFolder({ title: 'Shot', expanded: false });
  shot.addBinding(tuning, 'shotBaseTime', { min: 0, max: 0.4, step: 0.005, label: 'base time' });
  shot.addBinding(tuning, 'shotSpeed', { min: 100, max: 1500, step: 5, label: 'speed' });
  shot.addBinding(tuning, 'patternRadius', { min: 1, max: 15, step: 0.1 });
  shot.addBinding(tuning, 'aimAssist', { min: 0, max: 0.5, step: 0.01 });
  shot.addBinding(tuning, 'perfectFrac', { min: 0.05, max: 1, step: 0.01 });
  const gun = pane.addFolder({ title: 'Gun', expanded: false });
  gun.addBinding(tuning, 'barrels', { min: 1, max: 4, step: 1 });
  gun.addBinding(tuning, 'gunCycle', { min: 0.02, max: 0.6, step: 0.01, label: 'cycle s' });
  gun.addBinding(tuning, 'gunReload', { min: 0.1, max: 2, step: 0.05, label: 'reload s' });
  const inp = pane.addFolder({ title: 'Input', expanded: false });
  inp.addBinding(tuning, 'handed', { options: { right: 'right', left: 'left' } });
  inp.addBinding(tuning, 'tapOffsetY', { min: -10, max: 30, step: 0.5, label: 'tap offset Y' });
  inp.addBinding(tuning, 'ghostTrail');
  inp.addBinding(tuning, 'reticleOffsetX', { min: 0, max: 15, step: 0.5 });
  inp.addBinding(tuning, 'reticleOffsetY', { min: 0, max: 35, step: 0.5 });
  inp.addBinding(tuning, 'quickTapMs', { min: 80, max: 500, step: 10 });
  inp.addBinding(tuning, 'dragSlop', { min: 0.5, max: 6, step: 0.1 });
  const flick = pane.addFolder({ title: 'Flick curve', expanded: false });
  flick.addBinding(tuning, 'flickMinSpeed', { min: 10, max: 300, step: 5 });
  flick.addBinding(tuning, 'flickMaxSpeed', { min: 100, max: 1500, step: 10 });
  flick.addBinding(tuning, 'flickDistMin', { min: 5, max: 60, step: 1 });
  flick.addBinding(tuning, 'flickDistMax', { min: 40, max: 160, step: 1 });
  flick.addBinding(tuning, 'flickGamma', { min: 0.4, max: 3, step: 0.05 });
  flick.addBinding(tuning, 'flickWindowMs', { min: 30, max: 250, step: 5 });
  flick.addBinding(tuning, 'flickMinTravel', { min: 0.5, max: 10, step: 0.5 });
  const sb = pane.addFolder({ title: 'Sandbox throws', expanded: false });
  sb.addBinding(tuning, 'doubleChance', { min: 0, max: 1, step: 0.05 });
  sb.addBinding(tuning, 'gapMin', { min: 0.3, max: 4, step: 0.1 });
  sb.addBinding(tuning, 'gapMax', { min: 0.3, max: 6, step: 0.1 });
  for (const k of [
    'highSpeedMin',
    'highSpeedMax',
    'highAngleMin',
    'highAngleMax',
    'lowSpeedMin',
    'lowSpeedMax',
    'lowAngleMin',
    'lowAngleMax',
  ] as const)
    sb.addBinding(tuning, k, { min: 10, max: 120, step: 0.5 });
  const dbg = pane.addFolder({ title: 'Debug' });
  dbg.addBinding(tuning, 'debugOverlay');

  pane.on('change', () => notifyTuningChanged());

  pane
    .addButton({ title: 'Copy JSON' })
    .on('click', () => void navigator.clipboard?.writeText(exportTuningJSON()));
  pane.addButton({ title: 'Download JSON' }).on('click', () => {
    const url = URL.createObjectURL(new Blob([exportTuningJSON()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tuning.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  pane.addButton({ title: 'Reset' }).on('click', () => {
    Object.assign(tuning, defaultTuning);
    pane.refresh();
    notifyTuningChanged();
  });
  return pane;
}
