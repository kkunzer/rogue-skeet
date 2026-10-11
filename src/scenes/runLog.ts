import { SYNERGIES } from '../upgrades/synergies';
import { upgradeBadge } from '../modes/run/runHud';
import {
  copyRunLog,
  downloadRunLog,
  loadRuns,
  runsToJSON,
  type RunSummary,
} from '../modes/run/runLog';
import { buildGreybox } from '../render/greybox';
import { button, el, uiRoot } from '../ui/dom';
import type { Scene, SceneContext } from './scene';

const when = (iso: string): string => iso.slice(0, 16).replace('T', ' ');

/** Simple list of saved runs with Copy / Download JSON, for the 20-run freshness check. */
export function createRunLogScene({ stage, go }: SceneContext): Scene {
  const greybox = buildGreybox();
  greybox.alpha = 0.25;
  const ui = el('div', {
    attrs: { id: 'runlog-ui' },
    style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
  });
  uiRoot().appendChild(ui);

  const row = (r: RunSummary): HTMLElement =>
    el('div', { cls: 'runlog-row', attrs: { 'data-seed': r.seed } }, [
      el('span', { cls: 'mono', text: `${when(r.timestamp)}  ${r.seed}` }),
      el('span', {
        cls: `res ${r.cleared ? 'win' : 'loss'}`,
        text: r.cleared
          ? 'CLEARED'
          : r.roundReached === 5
            ? 'lost at boss'
            : `lost R${r.roundReached}`,
      }),
      el('span', { cls: 'row', style: { gap: '4px', flex: 'none' } }, [
        ...r.picks.map(upgradeBadge),
        ...r.synergies.map((s) =>
          el('span', { cls: 'chip', text: SYNERGIES.find((x) => x.id === s)?.name ?? s }),
        ),
      ]),
      el('span', {
        cls: 'small',
        text: `${r.score.toLocaleString('en-US')} pts · ${r.scheme} · fresh ${r.freshRating ?? '-'}`,
      }),
    ]);

  const build = (): HTMLElement => {
    const runs = loadRuns();
    const rated = runs.filter((r) => r.freshRating !== null);
    const avg = rated.length
      ? (rated.reduce((s, r) => s + (r.freshRating ?? 0), 0) / rated.length).toFixed(1)
      : '-';
    const wins = runs.filter((r) => r.cleared).length;
    const status = el('div', { cls: 'small', attrs: { id: 'runlog-status' } });
    const text = el('textarea', {
      attrs: { id: 'runlog-json', readonly: true, rows: 5, style: 'display:none' },
    });
    return el('div', { cls: 'screen' }, [
      el('div', { cls: 'card', attrs: { id: 'runlog-card' } }, [
        el('h2', { text: 'Run log' }),
        el('div', {
          cls: 'small',
          attrs: { id: 'runlog-summary' },
          text: `${runs.length} runs · ${wins} cleared · avg fresh ${avg} (${rated.length} rated)`,
        }),
        runs.length
          ? el('div', { cls: 'runlog-list' }, runs.map(row))
          : el('p', { text: 'No runs yet. Finish a run and it shows up here.' }),
        el('div', { cls: 'row' }, [
          button(
            'Copy JSON',
            () => {
              void copyRunLog(runs).then((ok) => {
                status.textContent = ok ? 'Copied.' : 'Copy blocked: JSON shown below.';
                if (!ok) {
                  text.value = runsToJSON(runs);
                  text.style.display = 'block';
                }
              });
            },
            { id: 'btn-runlog-copy', cls: runs.length ? '' : 'ghost' },
          ),
          button(
            'Download',
            () => {
              downloadRunLog(runs);
              status.textContent = 'Downloaded.';
            },
            { id: 'btn-runlog-download', cls: runs.length ? '' : 'ghost' },
          ),
        ]),
        status,
        text,
        button('Back', () => go('menu'), { cls: 'ghost', id: 'btn-runlog-back' }),
      ]),
    ]);
  };

  return {
    mount() {
      stage.world.addChild(greybox);
      ui.appendChild(build());
    },
    unmount() {
      greybox.destroy({ children: true });
      ui.remove();
    },
    update() {},
    render() {},
  };
}
