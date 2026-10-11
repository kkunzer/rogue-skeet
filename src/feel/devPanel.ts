import { Pane } from 'tweakpane';
import { feel, saveFeel } from './settings';
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
  const up = pane.addFolder({ title: 'Run and upgrades', expanded: false });
  up.addBinding(tuning, 'runShellBonus', { min: -6, max: 12, step: 1, label: 'shell bonus' });
  up.addBinding(tuning, 'runGapMul', { min: 0.4, max: 2, step: 0.05, label: 'throw gap x' });
  up.addBinding(tuning, 'explosiveRadius', { min: 3, max: 30, step: 0.5 });
  up.addBinding(tuning, 'chainRadius', { min: 3, max: 40, step: 0.5 });
  up.addBinding(tuning, 'chainLinks', { min: 1, max: 6, step: 1 });
  up.addBinding(tuning, 'synergyChainBonus', { min: 0, max: 1, step: 0.05 });
  up.addBinding(tuning, 'slugRadiusMul', { min: 0.1, max: 1, step: 0.05 });
  up.addBinding(tuning, 'slugTimeMul', { min: 0.2, max: 1, step: 0.05 });
  up.addBinding(tuning, 'slugScoreMul', { min: 1, max: 4, step: 0.1 });
  up.addBinding(tuning, 'curseRadiusMul', { min: 0.2, max: 1, step: 0.05 });
  up.addBinding(tuning, 'curseScoreMul', { min: 1, max: 5, step: 0.1 });
  up.addBinding(tuning, 'windAccelMin', { min: 1, max: 40, step: 0.5 });
  up.addBinding(tuning, 'windAccelMax', { min: 1, max: 40, step: 0.5 });
  up.addBinding(tuning, 'windGustMin', { min: 0.3, max: 4, step: 0.1 });
  up.addBinding(tuning, 'windGustMax', { min: 0.3, max: 5, step: 0.1 });
  up.addBinding(tuning, 'windGapMin', { min: 0.2, max: 5, step: 0.1 });
  up.addBinding(tuning, 'windGapMax', { min: 0.2, max: 8, step: 0.1 });
  up.addBinding(tuning, 'windTelegraph', { min: 0.2, max: 1.5, step: 0.05 });
  up.addBinding(tuning, 'gravityMul', { min: 1, max: 2.5, step: 0.05 });
  const jf = pane.addFolder({ title: 'Juice: shatter', expanded: false });
  jf.addBinding(feel, 'juice', { label: 'juice on' });
  jf.addBinding(tuning, 'shardCountMin', { min: 3, max: 16, step: 1 });
  jf.addBinding(tuning, 'shardCountMax', { min: 3, max: 16, step: 1 });
  jf.addBinding(tuning, 'shardCountPerfect', { min: 3, max: 20, step: 1 });
  jf.addBinding(tuning, 'shardImpulse', { min: 0, max: 100, step: 1 });
  jf.addBinding(tuning, 'shardExplode', { min: 0, max: 60, step: 1 });
  jf.addBinding(tuning, 'shardJitter', { min: 0, max: 1, step: 0.01 });
  jf.addBinding(tuning, 'shardSpin', { min: 0, max: 40, step: 0.5 });
  jf.addBinding(tuning, 'shardGravityScale', { min: 0, max: 2, step: 0.05 });
  jf.addBinding(tuning, 'debrisDesatMs', { min: 50, max: 800, step: 10 });
  jf.addBinding(tuning, 'debrisFadeStartMs', { min: 0, max: 800, step: 10 });
  jf.addBinding(tuning, 'debrisLifeMs', { min: 100, max: 1500, step: 10 });
  jf.addBinding(tuning, 'dustCount', { min: 0, max: 20, step: 1 });
  jf.addBinding(tuning, 'dustLifeMs', { min: 100, max: 1000, step: 10 });
  jf.addBinding(tuning, 'sparkCountPerfect', { min: 0, max: 30, step: 1 });
  jf.addBinding(tuning, 'flashRadiusMul', { min: 1, max: 5, step: 0.1 });
  jf.addBinding(tuning, 'flashLifeMs', { min: 50, max: 600, step: 10 });
  jf.addBinding(tuning, 'flashPerfectMul', { min: 1, max: 3, step: 0.05 });
  jf.addBinding(tuning, 'missPuff');
  const jm = pane.addFolder({ title: 'Juice: shake / hit-stop', expanded: false });
  jm.addBinding(tuning, 'shakeAmp', { min: 0, max: 3, step: 0.05 });
  jm.addBinding(tuning, 'shakeAmpPerfect', { min: 0, max: 4, step: 0.05 });
  jm.addBinding(tuning, 'shakeDecay', { min: 2, max: 50, step: 0.5 });
  jm.addBinding(tuning, 'hitStopMinMs', { min: 0, max: 120, step: 1 });
  jm.addBinding(tuning, 'hitStopMaxMs', { min: 0, max: 120, step: 1 });
  const ja = pane.addFolder({ title: 'Juice: audio / haptics', expanded: false });
  ja.addBinding(feel, 'volume', { min: 0, max: 1, step: 0.01, label: 'master volume' });
  ja.addBinding(feel, 'sound', { label: 'sound on' });
  ja.addBinding(tuning, 'pitchVar', { min: 0, max: 0.3, step: 0.005 });
  ja.addBinding(tuning, 'gainVar', { min: 0, max: 0.5, step: 0.005 });
  ja.addBinding(tuning, 'comboStepSemitones', { min: 0, max: 5, step: 0.5 });
  ja.addBinding(tuning, 'comboMaxSteps', { min: 0, max: 16, step: 1 });
  ja.addBinding(feel, 'haptics', { label: 'haptics on' });
  ja.addBinding(tuning, 'hapticShotMs', { min: 1, max: 60, step: 1 });
  ja.addBinding(tuning, 'hapticHitMs', { min: 1, max: 60, step: 1 });
  ja.addBinding(tuning, 'hapticPerfectMs', { min: 1, max: 80, step: 1 });
  ja.addBinding(tuning, 'hapticPerfectTailMs', { min: 1, max: 80, step: 1 });
  const dbg = pane.addFolder({ title: 'Debug' });
  dbg.addBinding(tuning, 'debugOverlay');

  pane.on('change', () => {
    saveFeel();
    notifyTuningChanged();
  });

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
