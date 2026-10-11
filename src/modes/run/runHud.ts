import type { World } from '../../sim/world';
import { upgradeById } from '../../upgrades/defs';
import type { UpgradeId } from '../../upgrades/types';
import { el } from '../../ui/dom';
import type { RunController } from './runState';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Badge element for an upgrade (two letters on its colour). */
export function upgradeBadge(id: UpgradeId): HTMLElement {
  const u = upgradeById(id);
  return el('span', {
    cls: 'badge',
    text: u.icon,
    attrs: { title: u.name, 'data-upgrade': id },
    style: { background: hex(u.color) },
  });
}

/**
 * Run HUD, a DOM overlay across the top so the bottom stays clear for the thumb: round, score and
 * combo on the first row; shells, barrel state and wind on the second; owned upgrade icons last.
 */
export class RunHud {
  readonly root = el('div', { cls: 'run-hud', attrs: { id: 'run-hud' } });
  private roundEl = el('span', { cls: 'round', attrs: { id: 'hud-round' } });
  private scoreEl = el('span', { cls: 'score', attrs: { id: 'hud-score' } });
  private comboEl = el('span', { cls: 'combo', attrs: { id: 'hud-combo' } });
  private pipsEl = el('span', { cls: 'shell-pips', attrs: { id: 'hud-shells' } });
  private countEl = el('span', { cls: 'shell-count', attrs: { id: 'hud-shell-count' } });
  private barrelsEl = el('span', { cls: 'pips', attrs: { id: 'hud-barrels' } });
  private reloadFill = el('i');
  private reloadEl = el('span', { cls: 'reload' }, [this.reloadFill]);
  private windEl = el('span', { cls: 'chip', attrs: { id: 'hud-wind' } });
  private badgesEl = el('div', { cls: 'badges', attrs: { id: 'hud-badges' } });
  private last = '';

  constructor(parent: HTMLElement) {
    this.windEl.style.display = 'none';
    this.root.append(
      el('div', { cls: 'row' }, [this.roundEl, this.scoreEl, this.comboEl]),
      el('div', { cls: 'row' }, [
        el('span', { cls: 'shells' }, [this.pipsEl, this.countEl]),
        el('span', { cls: 'pips' }, [this.barrelsEl, this.reloadEl]),
        this.windEl,
      ]),
      this.badgesEl,
    );
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.style.display = on ? '' : 'none';
  }

  update(ctl: RunController, world: World | null): void {
    const w = world ?? ctl.world;
    const loaded = w.gun.loaded;
    const rl = w.gun.reloadProgress(w.time);
    const gust = w.cfg.gusts.find((g) => w.time >= g.start - 0.5 && w.time < g.end);
    const windTxt = gust
      ? `${w.time < gust.start ? 'WIND SOON' : 'WIND'} ${gust.ax > 0 ? '>>' : '<<'}`
      : '';
    const key = [
      ctl.round,
      ctl.score,
      ctl.shells,
      ctl.comboNow,
      loaded,
      rl.toFixed(2),
      ctl.owned.join(),
      windTxt,
      ctl.def.shells,
    ].join('|');
    if (key === this.last) return;
    this.last = key;

    this.roundEl.textContent = ctl.def.hud;
    this.roundEl.classList.toggle('boss', ctl.isBoss);
    this.scoreEl.textContent = ctl.score.toLocaleString('en-US');
    this.scoreEl.dataset.score = String(ctl.score);
    this.comboEl.textContent = `x${ctl.comboNow.toFixed(1)}`;
    this.comboEl.classList.toggle('hot', ctl.comboNow >= 2);

    const start = ctl.roundStats[ctl.roundStats.length - 1]?.shellsStart ?? ctl.def.shells;
    this.pipsEl.replaceChildren(
      ...Array.from({ length: Math.max(start, ctl.shells) }, (_, i) =>
        el('i', { cls: i < ctl.shells ? 'shell' : 'shell spent' }),
      ),
    );
    this.countEl.textContent = String(ctl.shells);
    this.countEl.classList.toggle('low', ctl.shells <= 3);
    this.root.dataset.shells = String(ctl.shells);

    const barrels = w.cfg.barrels;
    this.barrelsEl.replaceChildren(
      ...Array.from({ length: barrels }, (_, i) =>
        el('i', { cls: i < loaded ? 'pip' : 'pip empty' }),
      ),
    );
    this.reloadEl.style.visibility = rl < 1 ? 'visible' : 'hidden';
    this.reloadFill.style.width = `${Math.round(rl * 100)}%`;

    this.windEl.style.display = gust ? '' : 'none';
    this.windEl.textContent = windTxt;
    this.badgesEl.replaceChildren(...ctl.owned.map(upgradeBadge));
  }

  destroy(): void {
    this.root.remove();
  }
}
