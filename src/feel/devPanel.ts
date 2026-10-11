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
  sim.addBinding(tuning, 'patternRadius', { min: 1, max: 15, step: 0.1 });
  sim.addBinding(tuning, 'aimAssist', { min: 0, max: 0.5, step: 0.01 });
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
