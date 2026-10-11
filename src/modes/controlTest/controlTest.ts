import { SCHEME_LABELS, createScheme } from '../../input';
import type { Handedness, SchemeId } from '../../input/scheme';
import { defaultTuning, notifyTuningChanged, tuning } from '../../feel/tuning';
import type { Scene, SceneContext } from '../../scenes/scene';
import { copyJSON, canShare, downloadJSON, resultToJSON, shareJSON } from '../../telemetry/export';
import {
  REPORTED_REASONS,
  type ControlTestResult,
  type ReportedReason,
} from '../../telemetry/schema';
import { loadSessions } from '../../telemetry/storage';
import { button, el, safeGet, safeSet, uiRoot } from '../../ui/dom';
import { buildFeelControls } from '../../ui/feelControls';
import { Hud } from '../shared/hud';
import { PlaySession } from '../shared/play';
import { AttemptRunner } from './attempt';
import { parseTestParams } from './plan';
import { ControlTestSession } from './session';

const ID_KEY = 'rogue-skeet.testerId';

type Phase = 'setup' | 'intro' | 'playing' | 'asking' | 'between' | 'rating' | 'results';

const REASON_LABEL: Record<ReportedReason, string> = {
  ahead: 'Ahead',
  behind: 'Behind',
  high: 'High',
  low: 'Low',
  unsure: 'Not sure',
};

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** The 20-throw control test: setup, per-scheme instruction cards, attempts, miss prompts, ratings, results. */
export function createControlTestScene({ stage, go }: SceneContext): Scene {
  const params = parseTestParams(location.search);
  const ui = el('div', {
    attrs: { id: 'ct-ui' },
    style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
  });
  uiRoot().appendChild(ui);
  const hud = new Hud();
  hud.root.style.display = 'none';

  let session: ControlTestSession | null = null;
  let runner: AttemptRunner | null = null;
  let phase: Phase = 'setup';
  let screen: HTMLElement | null = null;

  const play = new PlaySession({
    stage,
    scheme: 'tap',
    onIntent: (intent) => void runner?.fire(intent),
    debug: { mode: 'controlTest', result: () => session?.result ?? null, phase: () => phase },
  });
  play.setInputEnabled(false);

  const setPhase = (p: Phase): void => {
    phase = p;
    document.body.dataset.phase = p;
  };

  const show = (node: HTMLElement | null): void => {
    screen?.remove();
    screen = node;
    if (node) ui.appendChild(node);
  };

  // ---- screens -------------------------------------------------------------------------

  const showSetup = (): void => {
    setPhase('setup');
    hud.root.style.display = 'none';
    play.setInputEnabled(false);
    const idInput = el('input', {
      attrs: {
        type: 'text',
        id: 'tester-id',
        placeholder: 'e.g. kyle, or initials',
        autocomplete: 'off',
        value: safeGet(ID_KEY) ?? '',
      },
    });
    let handed: Handedness = 'right';
    const segHand = el('div', { cls: 'seg' });
    const refreshHand = (): void => {
      segHand.replaceChildren(
        ...(['right', 'left'] as const).map((h) =>
          button(
            h === 'right' ? 'Right-handed' : 'Left-handed',
            () => {
              handed = h;
              refreshHand();
            },
            { cls: handed === h ? 'on' : '', attrs: { 'data-hand': h } },
          ),
        ),
      );
    };
    refreshHand();

    const assist = el('input', {
      attrs: { type: 'range', min: 0, max: 0.5, step: 0.01, value: 0, id: 'opt-assist' },
    });
    const assistOut = el('span', { cls: 'small', text: '+0%' });
    assist.addEventListener(
      'input',
      () => (assistOut.textContent = `+${Math.round(Number(assist.value) * 100)}%`),
    );
    const offset = el('input', {
      attrs: { type: 'range', min: -10, max: 30, step: 0.5, value: 0, id: 'opt-offset' },
    });
    const offsetOut = el('span', { cls: 'small', text: '0' });
    offset.addEventListener('input', () => (offsetOut.textContent = offset.value));
    const ghost = el('input', { attrs: { type: 'checkbox', id: 'opt-ghost' } });

    const start = button(
      'Start',
      () => {
        const id = idInput.value.trim();
        if (!id) {
          idInput.focus();
          return;
        }
        safeSet(ID_KEY, id);
        // Fixed settings for the test; recorded in the results.
        Object.assign(tuning, {
          handed,
          aimAssist: Number(assist.value),
          tapOffsetY: Number(offset.value),
          ghostTrail: ghost.checked,
        });
        notifyTuningChanged();
        session = new ControlTestSession({
          testerId: id,
          handedness: handed,
          attemptsPerScheme: params.attempts,
          onlySchemes: params.schemes,
          settings: Object.fromEntries(
            Object.entries(tuning).filter(([, v]) =>
              ['number', 'string', 'boolean'].includes(typeof v),
            ),
          ) as Record<string, number | string | boolean>,
        });
        showIntro();
      },
      { cls: 'primary', id: 'btn-start' },
    );

    const saved = loadSessions();
    const savedList = saved.length
      ? el('div', { cls: 'row', style: { flexDirection: 'column' } }, [
          el('div', { cls: 'small', text: 'Saved on this device' }),
          ...saved.map((r) =>
            button(
              `${r.tester.id} · ${r.createdAt.slice(0, 16).replace('T', ' ')}${r.complete ? '' : ' (incomplete)'}`,
              () => showResults(r),
              { cls: 'ghost', attrs: { 'data-saved': r.createdAt } },
            ),
          ),
        ])
      : null;

    show(
      el('div', { cls: 'screen' }, [
        el('div', { cls: 'card' }, [
          el('h1', { text: 'Control test' }),
          el('p', {
            text: `Three ways to aim, ${params.attempts} attempts each. Every attempt is the same 20 throws (some doubles). Infinite shells; the gun has two barrels and a short reload.`,
          }),
          el('label', {}, [el('span', { text: 'Tester ID' }), idInput]),
          el('div', { cls: 'small', text: 'Handedness' }),
          segHand,
          el('details', {}, [
            el('summary', {
              cls: 'small',
              text: 'Options (leave at defaults for the standard test)',
            }),
            el('label', {}, [
              el('span', { text: 'Aim assist' }),
              el('div', { cls: 'range-row' }, [assist, assistOut]),
            ]),
            el('label', {}, [
              el('span', { text: 'Tap offset above finger' }),
              el('div', { cls: 'range-row' }, [offset, offsetOut]),
            ]),
            el('label', { attrs: { style: 'flex-direction:row;align-items:center;gap:10px' } }, [
              ghost,
              el('span', { text: 'Ghost trail (tap)' }),
            ]),
          ]),
          buildFeelControls(),
          start,
          savedList,
          button('Back', () => go('menu'), { cls: 'ghost', id: 'btn-menu' }),
        ]),
      ]),
    );
  };

  const showIntro = (): void => {
    if (!session) return;
    setPhase('intro');
    play.setInputEnabled(false);
    const id = session.scheme as SchemeId;
    const info = createScheme(id, { cfg: () => tuning, emit: () => {} });
    show(
      el('div', { cls: 'screen' }, [
        el('div', { cls: 'card' }, [
          el('div', {
            cls: 'small',
            text: `Scheme ${session.schemeIdx + 1} of ${session.order.length}`,
          }),
          el('h1', { text: info.summary, attrs: { id: 'intro-title' } }),
          el('p', { text: info.instructions }),
          el('p', {
            text: `${session.attemptsPerScheme} attempts of 20 throws. If you miss, the game will pause and ask why.`,
          }),
          button('Start attempt 1', () => startAttempt(), {
            cls: 'primary',
            id: 'btn-attempt-start',
          }),
        ]),
      ]),
    );
  };

  const startAttempt = (): void => {
    if (!session) return;
    const id = session.scheme as SchemeId;
    const r = new AttemptRunner(tuning, session.attemptsDone + 1);
    runner = r;
    play.setScheme(id);
    play.setWorld(r.world);
    r.events.on('throwStart', () => play.scheme.reset());
    r.events.on('asking', () => showPrompt());
    r.events.on('done', () => finishAttempt());
    show(null);
    play.setInputEnabled(true);
    hud.root.style.display = '';
    setPhase('playing');
  };

  const showPrompt = (): void => {
    if (!runner) return;
    setPhase('asking');
    play.setInputEnabled(false);
    const r = runner;
    show(
      el('div', { cls: 'screen clear' }, [
        el('div', { cls: 'card', attrs: { id: 'miss-prompt' } }, [
          el('h2', { text: 'Why did you miss?' }),
          el('p', { text: 'Where did your shot go compared with the clay?' }),
          el('div', { cls: 'row' }, [
            ...REPORTED_REASONS.map((reason) =>
              button(
                REASON_LABEL[reason],
                () => {
                  r.answer(reason);
                  session?.save();
                  show(null);
                  play.setInputEnabled(true);
                  setPhase('playing');
                },
                { attrs: { 'data-reason': reason }, cls: reason === 'unsure' ? 'ghost' : '' },
              ),
            ),
          ]),
        ]),
      ]),
    );
  };

  const finishAttempt = (): void => {
    if (!session || !runner) return;
    const rec = runner.record();
    session.addAttempt(rec);
    runner = null;
    play.setInputEnabled(false);
    hud.root.style.display = 'none';
    const id = session.scheme as SchemeId;
    if (session.schemeFinished) {
      showRating(id);
    } else {
      setPhase('between');
      show(
        el('div', { cls: 'screen' }, [
          el('div', { cls: 'card' }, [
            el('h2', { text: `Attempt ${rec.attempt} of ${session.attemptsPerScheme} done` }),
            el('p', {
              text: `You broke ${rec.broken} of ${rec.clays} clays (${pct(rec.hitRate)}).`,
            }),
            button(`Start attempt ${rec.attempt + 1}`, () => startAttempt(), {
              cls: 'primary',
              id: 'btn-attempt-start',
            }),
          ]),
        ]),
      );
    }
  };

  const showRating = (id: SchemeId): void => {
    setPhase('rating');
    const labels = ['Awful', 'Poor', 'OK', 'Good', 'Great'];
    show(
      el('div', { cls: 'screen' }, [
        el('div', { cls: 'card' }, [
          el('h2', { text: `How did "${SCHEME_LABELS[id]}" feel?` }),
          el('p', { text: '1 = awful, 5 = great. Judge the controls, not your score.' }),
          el(
            'div',
            { cls: 'row' },
            labels.map((l, i) =>
              button(
                String(i + 1),
                () => {
                  session?.setFeel(i + 1);
                  session?.nextScheme();
                  if (session?.finished) showResults(session.result);
                  else showIntro();
                },
                { id: `rate-${i + 1}`, attrs: { title: l } },
              ),
            ),
          ),
          el('div', { cls: 'row small' }, [
            el('span', { text: labels[0] }),
            el('span', { text: labels[4], style: { textAlign: 'right' } }),
          ]),
        ]),
      ]),
    );
  };

  const showResults = (r: ControlTestResult): void => {
    setPhase('results');
    play.setInputEnabled(false);
    hud.root.style.display = 'none';
    const status = el('div', { cls: 'small', attrs: { id: 'export-status' } });
    const rows = r.schemes.map((s) =>
      el('tr', {}, [
        el('td', { text: SCHEME_LABELS[s.scheme] }),
        el('td', { text: s.attempts.map((a) => pct(a.hitRate)).join(' → ') || '-' }),
        el('td', { text: s.feelRating === null ? '-' : String(s.feelRating) }),
      ]),
    );
    const json = el('textarea', { attrs: { id: 'result-json', readonly: true } });
    json.value = resultToJSON(r, true);
    const buttons = [
      button(
        'Copy JSON',
        () =>
          void copyJSON(r).then(
            (ok) =>
              (status.textContent = ok
                ? 'Copied to clipboard.'
                : 'Copy failed: use Download or select the text below.'),
          ),
        { id: 'btn-copy' },
      ),
      canShare(r)
        ? button(
            'Share',
            () =>
              void shareJSON(r).then(
                (ok) => (status.textContent = ok ? 'Shared.' : 'Share cancelled.'),
              ),
            { id: 'btn-share' },
          )
        : null,
      button(
        'Download',
        () => {
          downloadJSON(r);
          status.textContent = 'Downloaded.';
        },
        { id: 'btn-download' },
      ),
    ];
    show(
      el('div', { cls: 'screen' }, [
        el('div', { cls: 'card', attrs: { id: 'results' } }, [
          el('h2', { text: r.complete ? 'All done, thank you!' : 'Results (incomplete)' }),
          el('p', {
            text: `Tester ${r.tester.id}. Please send the JSON to whoever is running the test.`,
          }),
          el('table', { cls: 'res' }, [
            el('tr', {}, [
              el('th', { text: 'Scheme' }),
              el('th', { text: 'Hit rate by attempt' }),
              el('th', { text: 'Feel' }),
            ]),
            ...rows,
          ]),
          el('div', { cls: 'row' }, buttons),
          status,
          el('details', {}, [el('summary', { cls: 'small', text: 'Show JSON' }), json]),
          button('Back to menu', () => go('menu'), { cls: 'ghost', id: 'btn-menu' }),
        ]),
      ]),
    );
  };

  showSetup();

  return {
    mount() {
      document.body.dataset.mode = 'controlTest';
      // The test always starts from stock sim values (dev-panel edits aside, those are intentional).
      tuning.handed = defaultTuning.handed;
    },
    unmount() {
      play.destroy();
      hud.destroy();
      ui.remove();
      delete document.body.dataset.mode;
      delete document.body.dataset.phase;
    },
    update(dt) {
      runner?.update(dt);
    },
    render(alpha) {
      play.render(alpha, 1 / tuning.simHz);
      if (runner && session) {
        hud.update(
          runner.world,
          SCHEME_LABELS[session.scheme as SchemeId],
          `Attempt ${runner.attemptNo}/${session.attemptsPerScheme} · Throw ${Math.min(runner.throwNumber, runner.total)}/${runner.total}`,
          `Clays ${runner.world.stats.hits} / ${runner.world.stats.launched}`,
        );
      }
    },
  };
}
