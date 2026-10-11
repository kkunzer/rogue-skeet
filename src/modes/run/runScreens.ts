import { SCHEME_IDS, type Handedness, type SchemeId } from '../../input/scheme';
import { SCHEME_LABELS } from '../../input';
import { CLAY_TYPES, type ClayTypeId } from '../../sim/clay';
import { upgradeById } from '../../upgrades/defs';
import { SYNERGIES, type SynergyDef } from '../../upgrades/synergies';
import type { UpgradeId } from '../../upgrades/types';
import { button, el } from '../../ui/dom';
import type { RunSummary } from './runLog';
import type { RoundDef } from './stationData';
import { upgradeBadge } from './runHud';

const screen = (cls: string, card: HTMLElement, id: string): HTMLElement =>
  el('div', { cls: `screen ${cls}`.trim(), attrs: { id } }, [card]);

export interface SetupOptions {
  seed: string;
  seedLocked: boolean;
  scheme: SchemeId;
  handed: Handedness;
  onScheme: (s: SchemeId) => void;
  onHanded: (h: Handedness) => void;
  onNewSeed: () => string;
  onStart: () => void;
  onMenu: () => void;
}

/** Pre-run card: seed, control scheme, handedness. */
export function setupScreen(o: SetupOptions): HTMLElement {
  let scheme = o.scheme;
  let handed = o.handed;
  const seedEl = el('span', { cls: 'mono', text: o.seed, attrs: { id: 'run-seed' } });
  const segScheme = el('div', { cls: 'seg' });
  const segHand = el('div', { cls: 'seg' });
  const refresh = (): void => {
    segScheme.replaceChildren(
      ...SCHEME_IDS.map((id) =>
        button(
          SCHEME_LABELS[id],
          () => {
            scheme = id;
            o.onScheme(id);
            refresh();
          },
          { cls: id === scheme ? 'on' : '', attrs: { 'data-scheme': id } },
        ),
      ),
    );
    segHand.replaceChildren(
      ...(['right', 'left'] as const).map((h) =>
        button(
          h === 'right' ? 'Right-handed' : 'Left-handed',
          () => {
            handed = h;
            o.onHanded(h);
            refresh();
          },
          { cls: handed === h ? 'on' : '', attrs: { 'data-hand': h } },
        ),
      ),
    );
  };
  refresh();
  const newSeed = button(
    'New seed',
    () => {
      seedEl.textContent = o.onNewSeed();
    },
    { cls: 'ghost', id: 'btn-run-newseed' },
  );
  if (o.seedLocked) newSeed.style.display = 'none';
  return screen(
    '',
    el('div', { cls: 'card' }, [
      el('h1', { text: 'Run' }),
      el('p', {
        text: 'Four rounds and a boss flurry. Every shot costs a shell, and so does every clay that gets away. Pick an upgrade after each round.',
      }),
      el('div', { cls: 'row', style: { alignItems: 'center' } }, [
        el('span', { cls: 'small', text: 'Seed' }),
        seedEl,
        newSeed,
      ]),
      el('div', { cls: 'small', text: 'Control scheme' }),
      segScheme,
      el('div', { cls: 'small', text: 'Handedness' }),
      segHand,
      el('div', { cls: 'row' }, [
        button('Menu', o.onMenu, { cls: 'ghost', id: 'btn-run-menu0' }),
        button('Start', o.onStart, { cls: 'primary', id: 'btn-run-start' }),
      ]),
    ]),
    'run-setup',
  );
}

export function introScreen(def: RoundDef, shells: number, onGo: () => void): HTMLElement {
  return screen(
    'top',
    el('div', { cls: 'card center' }, [
      el('div', { cls: 'kicker', text: def.boss ? 'Final throw' : def.hud.replace('/4', ' of 4') }),
      el('div', { cls: 'big', text: def.title, attrs: { id: 'run-intro-title' } }),
      el('p', { text: def.blurb }),
      el('div', { cls: 'small', text: `${shells} shells` }),
      button('Go', onGo, { cls: 'primary', id: 'btn-run-go' }),
    ]),
    'run-intro',
  );
}

export interface ClearInfo {
  def: RoundDef;
  shellsLeft: number;
  shellsStart: number;
  score: number;
  hits: number;
  shots: number;
}

export function clearScreen(i: ClearInfo, onNext: () => void): HTMLElement {
  return screen(
    'top',
    el('div', { cls: 'card center' }, [
      el('div', { cls: 'kicker', text: 'Round clear' }),
      el('div', { cls: 'big', text: `${i.def.title.split(' — ')[0]} cleared` }),
      el('div', { cls: 'stat-grid' }, [
        el('span', { cls: 'k', text: 'Shells left' }),
        el('span', { cls: 'v', text: `${i.shellsLeft} / ${i.shellsStart}` }),
        el('span', { cls: 'k', text: 'Hit rate' }),
        el('span', {
          cls: 'v',
          text: i.shots ? `${i.hits}/${i.shots} (${Math.round((100 * i.hits) / i.shots)}%)` : '-',
        }),
        el('span', { cls: 'k', text: 'Round score' }),
        el('span', { cls: 'v', text: i.score.toLocaleString('en-US') }),
      ]),
      button('Choose an upgrade', onNext, { cls: 'primary', id: 'btn-run-draft' }),
    ]),
    'run-clear',
  );
}

export function draftScreen(
  offers: readonly UpgradeId[],
  owned: readonly UpgradeId[],
  onPick: (i: number) => void,
): HTMLElement {
  const cards = offers.map((id, i) => {
    const u = upgradeById(id);
    const syn = SYNERGIES.find(
      (s) => s.requires.includes(id) && s.requires.every((r) => r === id || owned.includes(r)),
    );
    const b = el(
      'button',
      {
        cls: 'upg-card',
        attrs: { type: 'button', 'data-upgrade': id, 'data-index': i },
      },
      [
        upgradeBadge(id),
        el('div', {}, [
          el('div', { cls: 'cat', text: u.category }),
          el('div', { cls: 'name', text: u.name }),
          el('div', { cls: 'desc', text: u.blurb }),
          u.physics
            ? el('div', { cls: 'desc', text: 'Shows a trajectory preview for 3 throws.' })
            : null,
          syn ? el('div', { cls: 'cat', text: `Synergy: ${syn.name}` }) : null,
        ]),
      ],
    );
    b.addEventListener('click', () => onPick(i));
    return b;
  });
  return screen(
    '',
    el('div', { cls: 'card' }, [
      el('div', { cls: 'kicker', text: 'Draft' }),
      el('h2', { text: 'Pick an upgrade' }),
      el('div', { cls: 'upg-list' }, cards),
    ]),
    'run-draft',
  );
}

export function bannerEl(s: SynergyDef): HTMLElement {
  return el('div', { cls: 'banner', attrs: { id: 'run-banner' } }, [
    s.name,
    el('small', { text: s.blurb }),
  ]);
}

export interface SummaryOptions {
  run: RunSummary;
  onRate: (n: number) => void;
  onAgain: () => void;
  onLog: () => void;
  onMenu: () => void;
}

export function summaryScreen(o: SummaryOptions): HTMLElement {
  const r = o.run;
  const rows: [string, string][] = [
    ['Score', r.score.toLocaleString('en-US')],
    [
      'Reached',
      r.cleared ? 'Boss cleared' : r.roundReached === 5 ? 'Boss' : `Round ${r.roundReached}`,
    ],
    ['Hit rate', r.shots ? `${r.hits}/${r.shots} (${Math.round((100 * r.hits) / r.shots)}%)` : '-'],
    ['Shells left per round', r.shellsLeft.join(' / ') || '-'],
  ];
  const breaks = Object.entries(r.breaksByType).map(([t, n]): [string, string] => [
    CLAY_TYPES[t as ClayTypeId]?.label ?? t,
    String(n),
  ]);
  const stars = el('div', { cls: 'stars' });
  const paint = (sel: number | null): void => {
    stars.replaceChildren(
      ...[1, 2, 3, 4, 5].map((n) =>
        button(
          String(n),
          () => {
            o.onRate(n);
            paint(n);
          },
          { cls: sel === n ? 'on' : 'ghost', attrs: { 'data-rating': n } },
        ),
      ),
    );
  };
  paint(r.freshRating);
  const grid = (list: [string, string][]): HTMLElement =>
    el(
      'div',
      { cls: 'stat-grid' },
      list.flatMap(([k, v]) => [
        el('span', { cls: 'k', text: k }),
        el('span', { cls: 'v', text: v }),
      ]),
    );
  return screen(
    '',
    el('div', { cls: 'card', attrs: { id: 'run-summary-card' } }, [
      el('div', { cls: 'kicker', text: r.cleared ? 'Run complete' : 'Run over' }),
      el('div', {
        cls: 'big',
        text: r.cleared
          ? 'Boss cleared!'
          : r.roundReached === 5
            ? 'Out of shells at the boss'
            : `Out of shells in round ${r.roundReached}`,
        attrs: { id: 'run-result' },
      }),
      grid(rows),
      el('div', { cls: 'small', text: 'Clays broken' }),
      breaks.length ? grid(breaks) : el('div', { cls: 'small', text: 'none' }),
      el('div', { cls: 'small', text: 'Upgrades' }),
      el(
        'div',
        { cls: 'row', style: { alignItems: 'center', flexWrap: 'wrap' } },
        r.picks.length
          ? r.picks.map((p) =>
              el(
                'span',
                { cls: 'row', style: { alignItems: 'center', gap: '6px', flex: 'none' } },
                [upgradeBadge(p), el('span', { cls: 'small', text: upgradeById(p).name })],
              ),
            )
          : [el('span', { cls: 'small', text: 'none' })],
      ),
      r.synergies.length
        ? el('div', {
            cls: 'kicker',
            text: `Synergy: ${r.synergies.map((s) => SYNERGIES.find((x) => x.id === s)?.name ?? s).join(', ')}`,
          })
        : null,
      el('div', { cls: 'small', text: 'Seed' }),
      el('div', { cls: 'mono', text: r.seed, attrs: { id: 'run-summary-seed' } }),
      el('div', {
        cls: 'small',
        text: 'Did this run feel fresh? (1 = same as before, 5 = totally new)',
      }),
      stars,
      el('div', { cls: 'row' }, [
        button('Menu', o.onMenu, { cls: 'ghost', id: 'btn-run-menu' }),
        button('Run log', o.onLog, { cls: 'ghost', id: 'btn-run-log' }),
      ]),
      button('Play again (new seed)', o.onAgain, { cls: 'primary', id: 'btn-run-again' }),
    ]),
    'run-summary',
  );
}
