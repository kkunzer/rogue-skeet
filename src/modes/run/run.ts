import { debugEnabled, type RunDebug } from '../../debug';
import { audio, type CueId } from '../../feel/audio';
import { feel } from '../../feel/settings';
import { tuning } from '../../feel/tuning';
import type { SchemeId } from '../../input/scheme';
import type { Scene, SceneContext } from '../../scenes/scene';
import { el, uiRoot } from '../../ui/dom';
import { PlaySession } from '../shared/play';
import { loadPrefs, savePrefs } from '../shared/prefs';
import { rateRun, saveRun, type RunSummary } from './runLog';
import { RunHud } from './runHud';
import {
  bannerEl,
  clearScreen,
  draftScreen,
  introScreen,
  setupScreen,
  summaryScreen,
} from './runScreens';
import { RunController } from './runState';
import { RunDebugView } from './runDebug';

export const randomSeed = (): string => {
  const a = new Uint32Array(1);
  try {
    crypto.getRandomValues(a);
  } catch {
    a[0] = Math.floor(Math.random() * 4294967296);
  }
  return a[0]!.toString(36).padStart(7, '0').slice(0, 7);
};

/** Pace of the auto-advancing cards (shorter under ?test so e2e runs stay quick). */
const pace = (): { intro: number; clear: number; end: number } =>
  debugEnabled() ? { intro: 500, clear: 300, end: 400 } : { intro: 2200, clear: 1700, end: 1100 };

/** Run mode scene: setup, then four rounds with drafts and the boss flurry, then the summary. */
export function createRunScene({ stage, go }: SceneContext): Scene {
  const params = new URLSearchParams(location.search);
  const prefs = loadPrefs();
  const fromQuery = params.get('scheme');
  if (fromQuery === 'tap' || fromQuery === 'drag' || fromQuery === 'flick')
    prefs.scheme = fromQuery;
  tuning.handed = prefs.handed;
  const lockedSeed = params.get('seed');
  let seed = lockedSeed ?? randomSeed();
  let seedLocked = lockedSeed !== null;

  let ctl: RunController | null = null;
  let summary: RunSummary | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let screen: HTMLElement | null = null;
  let dead = false;

  const ui = el('div', {
    attrs: { id: 'run-ui' },
    style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
  });
  uiRoot().appendChild(ui);
  const hud = new RunHud(ui);
  hud.show(false);

  const dbg = new RunDebugView(() => ctl);
  const play = new PlaySession({
    stage,
    scheme: prefs.scheme,
    onIntent: (intent) => void ctl?.fire(intent),
    debug: {
      mode: 'run',
      run: (): RunDebug | null => dbg.snapshot(),
      phase: () => document.body.dataset.phase ?? '',
      cfg: () => ({ ...tuning, ...(ctl?.world.cfg ?? {}) }),
    },
  });
  play.setInputEnabled(false);

  const setPhase = (p: string): void => {
    document.body.dataset.phase = p;
  };
  const later = (ms: number, fn: () => void): void => {
    timers.push(
      setTimeout(() => {
        if (!dead) fn();
      }, ms),
    );
  };
  const clearTimers = (): void => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };
  const show = (node: HTMLElement | null): void => {
    screen?.remove();
    screen = node;
    if (node) ui.appendChild(node);
  };
  const cue = (id: CueId): void => {
    if (feel.juice) audio.cue(id);
  };
  const fieldSetup = (): void => {
    play.field.previewFilter = (c) => ctl?.isPreviewed(c) ?? false;
    play.field.windTelegraph = tuning.windTelegraph;
  };
  fieldSetup();

  const showSetup = (): void => {
    clearTimers();
    ctl?.destroy();
    ctl = null;
    summary = null;
    setPhase('setup');
    hud.show(false);
    play.setInputEnabled(false);
    play.setWorld(null);
    show(
      setupScreen({
        seed,
        seedLocked,
        scheme: prefs.scheme,
        handed: prefs.handed,
        onScheme: (s: SchemeId) => {
          prefs.scheme = s;
          play.setScheme(s);
          savePrefs(prefs);
        },
        onHanded: (h) => {
          prefs.handed = h;
          tuning.handed = h;
          savePrefs(prefs);
        },
        onNewSeed: () => (seed = randomSeed()),
        onStart: () => {
          void audio.unlock();
          startRun();
        },
        onMenu: () => go('menu'),
      }),
    );
  };

  const startRun = (): void => {
    const c = new RunController({ seed, scheme: prefs.scheme, config: tuning });
    ctl = c;
    c.events.on('world', ({ world }) => {
      play.setWorld(world);
      fieldSetup();
    });
    c.events.on('phase', ({ phase }) => onPhase(c, phase));
    c.events.on('shellEmpty', () => cue('shellEmpty'));
    c.events.on('shells', ({ shells, reason }) => {
      if (shells === 0 && reason !== 'start') cue('shellEmpty');
    });
    c.events.on('pick', () => cue('upgrade'));
    c.events.on('synergy', (s) => {
      const b = bannerEl(s);
      ui.appendChild(b);
      cue('synergy');
      b.addEventListener('animationend', () => b.remove());
      setTimeout(() => b.remove(), 2600); // fallback when animations are disabled
    });
    hud.show(true);
    onPhase(c, c.phase);
  };

  const onPhase = (c: RunController, phase: string): void => {
    clearTimers();
    const p = pace();
    switch (phase) {
      case 'intro': {
        setPhase('intro');
        play.setInputEnabled(false);
        play.setWorld(null);
        const go1 = (): void => {
          if (c.phase === 'intro') c.startRound();
        };
        show(introScreen(c.def, c.def.shells + Math.round(tuning.runShellBonus), go1));
        later(p.intro, go1);
        break;
      }
      case 'playing':
        setPhase('playing');
        show(null);
        play.setInputEnabled(true);
        break;
      case 'roundClear': {
        setPhase('roundClear');
        play.setInputEnabled(false);
        cue('roundClear');
        const st = c.roundStats[c.roundStats.length - 1];
        const next = (): void => {
          if (c.phase === 'roundClear') c.openDraft();
        };
        show(
          clearScreen(
            {
              def: c.def,
              shellsLeft: st?.shellsEnd ?? 0,
              shellsStart: st?.shellsStart ?? 0,
              score: st?.score ?? 0,
              hits: st?.hits ?? 0,
              shots: st?.shots ?? 0,
            },
            next,
          ),
        );
        later(p.clear, next);
        break;
      }
      case 'draft':
        setPhase('draft');
        show(draftScreen(c.offers, c.owned, (i) => void c.pick(i)));
        break;
      case 'won':
      case 'lost': {
        setPhase('ending');
        play.setInputEnabled(false);
        if (phase === 'won') {
          cue('roundClear');
          cue('chime');
        } else cue('runOver');
        const run = c.summary(play.scheme.id);
        summary = run;
        saveRun(run);
        later(p.end, () => {
          setPhase('summary');
          hud.show(false);
          show(
            summaryScreen({
              run,
              onRate: (n) => {
                rateRun(run.id, n);
                if (summary) summary.freshRating = n;
              },
              onAgain: () => {
                // straight into the next run with a fresh seed (same scheme and settings)
                seed = randomSeed();
                seedLocked = false;
                clearTimers();
                ctl?.destroy();
                startRun();
              },
              onLog: () => go('runLog'),
              onMenu: () => go('menu'),
            }),
          );
        });
        break;
      }
    }
  };

  const quit = el('button', {
    cls: 'btn ghost run-quit',
    text: 'Menu',
    attrs: { type: 'button', id: 'btn-run-quit' },
  });
  quit.addEventListener('click', () => go('menu'));
  ui.appendChild(quit);

  showSetup();

  return {
    mount() {
      document.body.dataset.mode = 'run';
    },
    unmount() {
      dead = true;
      clearTimers();
      ctl?.destroy();
      play.destroy();
      hud.destroy();
      ui.remove();
      delete document.body.dataset.mode;
      delete document.body.dataset.phase;
    },
    update(dt) {
      ctl?.update(dt);
    },
    render(alpha) {
      play.render(alpha, 1 / tuning.simHz);
      if (ctl) hud.update(ctl, ctl.world);
    },
  };
}
