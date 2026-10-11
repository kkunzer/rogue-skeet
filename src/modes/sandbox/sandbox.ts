import { SCHEME_IDS, type SchemeId } from '../../input/scheme';
import { SCHEME_LABELS } from '../../input';
import { tuning, notifyTuningChanged } from '../../feel/tuning';
import { ThrowDirector } from '../../sim/director';
import { sandboxThrows, type LaunchRange, type SandboxThrowOptions } from '../../sim/throws';
import { World } from '../../sim/world';
import type { Scene, SceneContext } from '../../scenes/scene';
import { button, el, safeGet, safeSet, uiRoot } from '../../ui/dom';
import { Hud } from '../shared/hud';
import { PlaySession } from '../shared/play';

const KEY = 'rogue-skeet.sandbox.v1';

/** Throw options read live from tuning, so the dev panel changes apply to the next throw. */
function liveThrowOptions(): SandboxThrowOptions {
  const range = (a: number, b: number, c: number, d: number): LaunchRange => ({
    speed: [a, Math.max(a, b)],
    angle: [c, Math.max(c, d)],
  });
  return {
    get ranges() {
      return {
        high: range(
          tuning.highSpeedMin,
          tuning.highSpeedMax,
          tuning.highAngleMin,
          tuning.highAngleMax,
        ),
        low: range(tuning.lowSpeedMin, tuning.lowSpeedMax, tuning.lowAngleMin, tuning.lowAngleMax),
      };
    },
    get doubleChance() {
      return tuning.doubleChance;
    },
    get gap() {
      return [tuning.gapMin, Math.max(tuning.gapMin, tuning.gapMax)] as [number, number];
    },
  };
}

/** Free play: endless throws, any control scheme, live settings. */
export function createSandboxScene({ stage, go }: SceneContext): Scene {
  let world = new World(tuning);
  let director = new ThrowDirector(world, sandboxThrows(Date.now(), liveThrowOptions()), 1);
  let schemeId: SchemeId = 'tap';
  try {
    const saved = JSON.parse(safeGet(KEY) ?? '{}') as {
      scheme?: SchemeId;
      handed?: 'right' | 'left';
    };
    if (saved.scheme && SCHEME_IDS.includes(saved.scheme)) schemeId = saved.scheme;
    if (saved.handed) tuning.handed = saved.handed;
  } catch {
    /* ignore corrupt saved settings */
  }
  const fromQuery = new URLSearchParams(location.search).get('scheme');
  if (fromQuery && (SCHEME_IDS as readonly string[]).includes(fromQuery))
    schemeId = fromQuery as SchemeId;

  const play = new PlaySession({
    stage,
    scheme: schemeId,
    onIntent: (intent) => void world.fire(intent),
    debug: { mode: 'sandbox' },
  });
  play.setWorld(world);
  const wire = (): void => void director.events.on('throwStart', () => play.scheme.reset());
  wire();
  const hud = new Hud();
  const root = el('div', {
    cls: 'sandbox-ui',
    style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
  });
  uiRoot().appendChild(root);
  let panel: HTMLElement | null = null;

  const persist = (): void =>
    safeSet(KEY, JSON.stringify({ scheme: schemeId, handed: tuning.handed }));

  const restart = (): void => {
    world = new World(tuning);
    director = new ThrowDirector(world, sandboxThrows(Date.now(), liveThrowOptions()), 1);
    play.setWorld(world);
    wire();
  };

  const buildPanel = (): HTMLElement => {
    const segScheme = el('div', { cls: 'seg' });
    const segHand = el('div', { cls: 'seg' });
    const refresh = (): void => {
      segScheme.replaceChildren(
        ...SCHEME_IDS.map((id) =>
          button(
            SCHEME_LABELS[id],
            () => {
              schemeId = id;
              play.setScheme(id);
              persist();
              refresh();
            },
            { cls: id === schemeId ? 'on' : '', attrs: { 'data-scheme': id } },
          ),
        ),
      );
      segHand.replaceChildren(
        ...(['right', 'left'] as const).map((h) =>
          button(
            h === 'right' ? 'Right-handed' : 'Left-handed',
            () => {
              tuning.handed = h;
              persist();
              notifyTuningChanged();
              refresh();
            },
            { cls: tuning.handed === h ? 'on' : '', attrs: { 'data-hand': h } },
          ),
        ),
      );
    };
    refresh();

    const slider = (
      label: string,
      min: number,
      max: number,
      step: number,
      get: () => number,
      set: (v: number) => void,
      fmt: (v: number) => string,
    ): HTMLElement => {
      const out = el('span', { cls: 'small', text: fmt(get()) });
      const input = el('input', { attrs: { type: 'range', min, max, step, value: get() } });
      input.addEventListener('input', () => {
        set(Number(input.value));
        out.textContent = fmt(get());
        notifyTuningChanged();
      });
      return el('label', {}, [
        el('span', { text: label }),
        el('div', { cls: 'range-row' }, [input, out]),
      ]);
    };

    const ghost = el('input', {
      attrs: { type: 'checkbox', id: 'opt-ghost', checked: tuning.ghostTrail },
    });
    ghost.addEventListener('change', () => (tuning.ghostTrail = ghost.checked));

    return el('div', { cls: 'card panel', attrs: { id: 'sandbox-panel' } }, [
      el('h2', { text: 'Sandbox' }),
      el('div', { cls: 'small', text: 'Control scheme' }),
      segScheme,
      el('div', { cls: 'small', text: 'Handedness' }),
      segHand,
      slider(
        'Aim assist',
        0,
        0.5,
        0.01,
        () => tuning.aimAssist,
        (v) => (tuning.aimAssist = v),
        (v) => `+${Math.round(v * 100)}%`,
      ),
      slider(
        'Tap offset (above finger)',
        -10,
        30,
        0.5,
        () => tuning.tapOffsetY,
        (v) => (tuning.tapOffsetY = v),
        (v) => `${v.toFixed(1)}`,
      ),
      el('label', { attrs: { style: 'flex-direction:row;align-items:center;gap:10px' } }, [
        ghost,
        el('span', { text: 'Ghost trail on clays (tap)' }),
      ]),
      el('div', { cls: 'row' }, [
        button('Reset', () => restart(), { cls: 'ghost', id: 'btn-reset' }),
        button('Menu', () => go('menu'), { cls: 'ghost', id: 'btn-menu' }),
      ]),
    ]);
  };

  const gear = button(
    'Settings',
    () => {
      if (panel) {
        panel.remove();
        panel = null;
      } else {
        panel = buildPanel();
        root.appendChild(panel);
      }
    },
    { cls: 'gear', id: 'btn-settings' },
  );
  root.appendChild(gear);

  return {
    mount() {
      document.body.dataset.mode = 'sandbox';
    },
    unmount() {
      play.destroy();
      hud.destroy();
      root.remove();
      delete document.body.dataset.mode;
    },
    update() {
      director.update();
      world.step(1 / tuning.simHz);
    },
    render(alpha) {
      play.render(alpha, 1 / tuning.simHz);
      hud.update(world, `Sandbox · ${SCHEME_LABELS[schemeId]}`);
    },
  };
}
